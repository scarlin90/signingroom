/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http'; 
import { Transaction, NETWORK, TEST_NETWORK } from '@scure/btc-signer';
import { base64, hex, bech32, bech32m } from '@scure/base';
import { environment } from '../../../environments/environment';
import { EncryptionService } from '../encryption/encryption.service';

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------

export const PROTOCOL_VERSION = '1.0.0';

// -------------------------------------------------------------------------
// Interfaces
// -------------------------------------------------------------------------

export interface AuditEntry {
  timestamp: number;
  event: string;
  detail?: string;
  encryptedDetail?: string;
  user: string;
}

export interface RoomState {
  protocolVersion: string;
  roomId: string;
  roomName: string;
  network: 'bitcoin' | 'testnet' | 'signet';
  
  // Transaction Data
  psbt: string; 
  signatures: string[]; 
  finalTxHex?: string;
  finalTxId?: string;
  
  // Metadata
  connectedCount: number;
  createdAt: number;
  expiresAt: number;
  isLocked: boolean;
  
  // Governance
  auditLog: AuditEntry[];
  signerLabels: Record<string, string>; 
  whitelist: string[];
  participants?: Record<string, { id: string; role: string; encryptedDisplayName?: string; displayName?: string }>;
}

export interface SignerStatus {
  fingerprint: string;
  signed: boolean;
}

export interface TxDetails {
  amount: number;
  fee: number;
  vBytes: number;
  feeRate: number;
  inputs: number;
  inputsList: { address: string; amount: number; txId: string; vout: number }[];
  outputs: { address: string; amount: number; isChange: boolean }[];
}

type DerivationEntry = [Uint8Array, { fingerprint: number; path: number[] }];

@Injectable({ providedIn: 'root' })
export class SocketService {
  private ws: WebSocket | null = null;
  private encryptionKey: string | null = null; 
  private fallbackVersion: string | null = null;
  private blindFingerprintMap: Map<string, string> = new Map();
  private hasAnnouncedJoin = false;

  // -------------------------------------------------------------------------
  // Signals
  // -------------------------------------------------------------------------
  
  // Connection Status
  public status = signal<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  public role = signal<'guest' | 'admin'>('guest');
  public currentSessionId = signal<string | null>(null);
  public activeSessions = signal<{id: string, role: string, displayName?: string}[]>([]);
  
  // Room Data
  public roomState = signal<RoomState | null>(null);
  
  // Error Flags
  public isRoomFull = signal(false);
  public isClosed = signal(false);
  public isLockedOut = signal(false);
  public roomNotFound = signal(false);
  public decryptionError = signal<string | null>(null);

  // -------------------------------------------------------------------------
  // Computed State
  // -------------------------------------------------------------------------

  public isCoordinator = computed(() => this.role() === 'admin');

  public signers = computed(() => {
    const state = this.roomState();
    if (!state?.psbt) return [];
    return this.extractSigners(state.psbt);
  });

  public signerCount = computed(() => {
    return this.signers().filter(signer => signer.signed).length;
  });

  public isReadyToBroadcast = computed(() => {
    const s = this.signers();
    return s.length > 0 && s.every(signer => signer.signed);
  });

  public txDetails = computed<TxDetails | null>(() => {
    const state = this.roomState();
    if (!state?.psbt) return null;
    return this.parseTxDetails(state.psbt);
  });

  constructor(
    private http: HttpClient,
    private encryption: EncryptionService
  ) {}

  // -------------------------------------------------------------------------
  // Security Handoff
  // -------------------------------------------------------------------------

  setRoomKey(key: string | null) {
    this.encryptionKey = key;
  }

  getRoomKey(): string | null {
    return this.encryptionKey;
  }

  // -------------------------------------------------------------------------
  // Connection Management
  // -------------------------------------------------------------------------

  async connect(roomId: string, key: string | null, targetVersion?: string) { 
    this.reset();
    this.encryptionKey = key; 

    const versionToUse = targetVersion || PROTOCOL_VERSION;
    
    this.roomState.set(this.getInitialState(roomId, versionToUse));

    if (this.ws) this.disconnect(false);
    this.status.set('connecting');

    let roomPass = '';
    if (key) {
        roomPass = await this.encryption.blindData(roomId, key);
    }

    const apiBase = environment.apiUrl; 
    const wsBase = apiBase.replace(/^http/, 'ws');
    const url = `${wsBase}/api/room/${roomId}/websocket?v=${versionToUse}&pass=${roomPass}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = async () => {
        this.status.set('connected');
        const secureToken = sessionStorage.getItem(`admin_token_${roomId}`);
        if (secureToken) {
            this.send('AUTH', { token: secureToken });
        }

        if (typeof localStorage !== 'undefined' && this.encryptionKey) {
            const savedName = localStorage.getItem(`display_name_${roomId}`);
            if (savedName) {
                const encryptedDisplayName = await this.encryption.encrypt(savedName, this.encryptionKey);
                this.send('SET_DISPLAY_NAME', { encryptedDisplayName });
            }
        }
    };

    this.ws.onmessage = (event) => this.handleMessage(JSON.parse(event.data));
    
    this.ws.onclose = (event) => {
      this.status.set('disconnected');
      this.role.set('guest');

      if (event.code === 4026) {
          console.warn(`Protocol mismatch. Downgrading connection...`);
          const target = this.fallbackVersion || '1.0.0';
          this.fallbackVersion = null;
          this.connect(roomId, this.encryptionKey, target);
          return;
      }
      
      if (event.code === 4001) {
          this.isRoomFull.set(true);
          return; 
      }

      if (event.code === 1006 && !this.hasAnnouncedJoin) {
          console.warn("Connection rejected by server. Invalid room pass.");
          this.decryptionError.set('Invalid decryption key. Access denied.');
          this.setRoomKey(null);
          return;
      }

      if (!this.isClosed()) {
          setTimeout(() => {
            if (this.status() === 'disconnected') this.connect(roomId, this.encryptionKey);
          }, 3000);
      }
    };

    this.ws.onerror = (e) => {
      console.error('WS Error', e);
      this.status.set('error');
    };
  }

  disconnect(clearState = true) {
    if (this.ws) { 
        this.ws.onclose = null; 
        this.ws.close(); 
        this.ws = null; 
    }
    this.status.set('disconnected');
    this.fallbackVersion = null;
    if (clearState) this.reset();
  }

  // -------------------------------------------------------------------------
  // Public Actions
  // -------------------------------------------------------------------------

  async uploadSignature(partialPsbtBase64: string) {
      if (!this.encryptionKey) return;

      const currentRoom = this.roomState();
      const detectedFingerprint = this.getFingerprintFromPsbt(partialPsbtBase64);
      
      let blindedFingerprint: string | undefined;

      if (detectedFingerprint) {
        const alreadySigned = this.signers().find(s => s.fingerprint === detectedFingerprint)?.signed;
        if (alreadySigned) {
            console.warn(`Signature for ${detectedFingerprint} has already been applied.`);
            return;
        }

        blindedFingerprint = await this.encryption.blindData(detectedFingerprint, this.encryptionKey);
        
        this.blindFingerprintMap.set(blindedFingerprint, detectedFingerprint);
        this.blindFingerprintMap.set(detectedFingerprint, detectedFingerprint);

        if (detectedFingerprint && typeof localStorage !== 'undefined' && currentRoom) {
          const savedLabel = this.getLocalLabel(detectedFingerprint);
          const currentSessionName = localStorage.getItem(`display_name_${currentRoom.roomId}`);
          
          if (savedLabel && !currentSessionName) {
              await this.setDisplayName(savedLabel);
          }
        }
      }  
      
      let payloadToSend = partialPsbtBase64;

      if (currentRoom?.psbt) {
          try {
              payloadToSend = this.mergePsbts(currentRoom.psbt, partialPsbtBase64);
          } catch (e) { console.error("Client-side merge failed", e); }
      }

      const encryptedData = await this.encryption.encrypt(payloadToSend, this.encryptionKey);
      
      const role = this.isCoordinator() ? 'Coordinator' : `Guest (${this.currentSessionId() || 'Unknown'})`;
      const encryptedLogBlob = await this.createSecureLogBlob(
          'Signature Uploaded',
          `Signer: ${detectedFingerprint || 'Unknown'}`,
          role
      );

      this.send('UPLOAD_PARTIAL', { 
          data: { encryptedData },
          fingerprint: blindedFingerprint,
          encryptedLogBlob 
      });
  }

  async claimCoordinator(secureToken: string) { 
    if (secureToken) {
        this.send('AUTH', { token: secureToken.trim() });
    }
}

  closeRoom() { 
    this.send('CLOSE_ROOM'); 
  }

  async logAction(action: string, detail: string) {
      const encryptedLogBlob = await this.createSecureLogBlob(
          action, 
          detail, 
          this.isCoordinator() ? 'Coordinator' : `Guest (${this.currentSessionId() || 'Unknown'})`
      );
      
      this.send('LOG_ACTION', { encryptedLogBlob });
  }

async renameRoom(newName: string) {
    const key = this.getRoomKey();
    if (!key) return;

    const encryptedName = await this.encryption.encrypt(newName, key);

    const encryptedLogBlob = await this.createSecureLogBlob(
        'Room Renamed', 
        `Renamed: ${newName}`, 
        'Coordinator'
    );
    this.send('RENAME_ROOM', { 
        encryptedName,
        encryptedLogBlob 
    });
}

async updateSignerLabel(fingerprint: string, label: string) {
    const safeLabel = label || '';
    const currentLabel = this.roomState()?.signerLabels?.[fingerprint] || '';
    
    if (currentLabel === safeLabel) return; 

    const key = this.getRoomKey();
    if (!key) return;

    const blindedFingerprint = await this.encryption.blindData(fingerprint, key);
    this.blindFingerprintMap.set(blindedFingerprint, fingerprint);
    this.blindFingerprintMap.set(fingerprint, fingerprint); // Fallback

    const encryptedLabel = await this.encryption.encrypt(safeLabel, key);
    
    const encryptedLogBlob = await this.createSecureLogBlob(
        'Label Updated',
        `${safeLabel} (${fingerprint})`,
        'Coordinator'
    );

    this.send('UPDATE_LABEL', { 
        fingerprint: blindedFingerprint, 
        label: encryptedLabel,
        encryptedLogBlob 
    });
  }

  async setDisplayName(name: string) {
      const key = this.getRoomKey();
      const roomId = this.roomState()?.roomId;
      if (!key || !roomId) return;

      const safeName = name.trim().substring(0, 64);
      
      if (typeof localStorage !== 'undefined') {
          if (safeName) {
              localStorage.setItem(`display_name_${roomId}`, safeName); // Scoped to Room!
          } else {
              localStorage.removeItem(`display_name_${roomId}`);
          }
      }
      
      if (safeName) {
          const encryptedDisplayName = await this.encryption.encrypt(safeName, key);
          this.send('SET_DISPLAY_NAME', { encryptedDisplayName });
      } else {
          this.send('SET_DISPLAY_NAME', { encryptedDisplayName: null });
      }
  }

  async updateWhitelist(address: string, remove: boolean) {
    const key = this.getRoomKey();
    if (!key) return;

    const currentList = this.roomState()?.whitelist || [];
    let newList = [];
    
    if (remove) {
        newList = currentList.filter(a => a !== address);
    } else {
        if (!currentList.includes(address)) {
            newList = [...currentList, address];
        } else {
            newList = [...currentList];
        }
    }

    const encryptedWhitelist = await this.encryption.encrypt(JSON.stringify(newList), key);
    
    const shortAddr = address.length > 5 ? address.slice(-5) : address;
    const actionWord = remove ? 'Removed' : 'Added';
    const logText = `${actionWord} ...${shortAddr} to whitelist`;
    
    const encryptedLogBlob = await this.createSecureLogBlob(
        'Whitelist Updated',
        logText,
        'Coordinator'
    );

    this.send('UPDATE_WHITELIST', { 
        encryptedWhitelist,
        encryptedLogBlob 
    });
  }

  toggleLock(locked: boolean) {
      this.send('TOGGLE_LOCK', { locked });
  }

  async updateWhitelistBatch(addresses: string[], remove: boolean) {
        const key = this.getRoomKey();
        if (!key) return;

        const currentList = this.roomState()?.whitelist || [];
        let newList: string[] = [];

        if (remove) {
            newList = currentList.filter(a => !addresses.includes(a));
        } else {
            const combined = [...currentList, ...addresses];
            newList = Array.from(new Set(combined)); 
        }

        const encryptedWhitelist = await this.encryption.encrypt(JSON.stringify(newList), key);
        
        const actionWord = remove ? 'Removed' : 'Verified';
        const logText = `${actionWord} ${addresses.length} batch address(es)`;
        
        const encryptedLogBlob = await this.createSecureLogBlob(
            'Whitelist Updated',
            logText,
            'Coordinator'
        );

        this.send('UPDATE_WHITELIST', { 
            encryptedWhitelist,
            encryptedLogBlob 
        });
    }

    async broadcastFinalization(finalTxHex: string, finalTxId: string) {
      const key = this.getRoomKey();
      if (!key) return;

      const encryptedFinalTxHex = await this.encryption.encrypt(finalTxHex, key);
      const encryptedFinalTxId = await this.encryption.encrypt(finalTxId, key);

      const encryptedLogBlob = await this.createSecureLogBlob(
          'Tx Finalized',
          'Signatures merged successfully',
          'Coordinator'
      );
      
      this.send('TX_FINALIZED', {
          encryptedFinalTxHex,
          encryptedFinalTxId,
          encryptedLogBlob
      });
  }

  // -------------------------------------------------------------------------
  // PSBT & Crypto Logic
  // -------------------------------------------------------------------------

  getFinalTxHex(): string | null {
    if (this.role() !== 'admin') return null;
    const state = this.roomState();
    if (!state?.psbt) return null;
    try {
        const tx = Transaction.fromPSBT(base64.decode(state.psbt));
        tx.finalize(); 
        return hex.encode(tx.extract());
    } catch (e) { return null; }
  }

  getFinalTxId(): string | null {
    if (this.role() !== 'admin') return null;
    const state = this.roomState();
    if (!state?.psbt) return null;
    try {
        const tx = Transaction.fromPSBT(base64.decode(state.psbt));
        tx.finalize(); 
        return tx.id; 
    } catch (e) { return null; }
  }

  mergePsbts(base: string, next: string): string {
    try {
        const baseBytes = this.decodePsbt(base);
        const nextBytes = this.decodePsbt(next);
        const txBase = Transaction.fromPSBT(baseBytes);
        const txNext = Transaction.fromPSBT(nextBytes);
        txBase.combine(txNext);
        return base64.encode(txBase.toPSBT());
    } catch (e) {
        console.error("[Merge Failed]", e);
        return base;
    }
  }

  getThreshold(psbtBase64: string): number {
    try {
        const tx = Transaction.fromPSBT(base64.decode(psbtBase64));
        const input = tx.getInput(0);
        const script = input.witnessScript || input.redeemScript;
        if (!script || script.length === 0) return 0;

        const firstOp = script[0];
        if (firstOp >= 0x51 && firstOp <= 0x60) {
            return firstOp - 0x50; 
        }
        return 0;
    } catch (e) { return 0; }
  }

  private async registerAllFingerprints(psbtData: string) {
    const key = this.getRoomKey();
    if (!key) return;

    try {
        const bytes = this.decodePsbt(psbtData);
        const tx = Transaction.fromPSBT(bytes);
        
        for (let i = 0; i < tx.inputsLength; i++) {
            const input = tx.getInput(i);
            if (input.bip32Derivation) {
                for (const [, meta] of input.bip32Derivation) {
                    const fp = meta.fingerprint.toString(16).padStart(8, '0');
                    const blinded = await this.encryption.blindData(fp, key);
                    this.blindFingerprintMap.set(blinded, fp);
                    this.blindFingerprintMap.set(fp, fp); // Fallback
                }
            }
        }
    } catch (e) {
        console.error("Failed to parse fingerprints for blind map");
    }
  }

  // -------------------------------------------------------------------------
  // Address Book Logic
  // -------------------------------------------------------------------------

  getLocalLabel(fingerprint: string): string | null {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(`addr_book_${fingerprint}`) : null;
  }

  saveToAddressBook(fingerprint: string, label: string) {
      if (typeof localStorage !== 'undefined') localStorage.setItem(`addr_book_${fingerprint}`, label);
  }

  removeFromAddressBook(fingerprint: string) {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(`addr_book_${fingerprint}`);
  }

  checkAndApplyLocalLabels() {
    if (!this.isCoordinator()) return; 
    const state = this.roomState();
    if (!state) return;

    const currentLabels = state.signerLabels || {};
    const signers = this.signers();

    signers.forEach(signer => {
        if (currentLabels[signer.fingerprint] === undefined) {
            const savedName = this.getLocalLabel(signer.fingerprint);
            if (savedName) this.updateSignerLabel(signer.fingerprint, savedName);
        }
    });
}

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private send(type: string, payload: any = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...payload }));
    }
  }

  private reset() {
    this.hasAnnouncedJoin = false;
    this.roomState.set(null);
    this.role.set('guest');
    this.isClosed.set(false); 
    
    this.decryptionError.set(null);
    this.isLockedOut.set(false);
    this.isRoomFull.set(false);
    this.roomNotFound.set(false);
  }

  private getInitialState(roomId: string, version: string): RoomState {
      return {
        roomId, psbt: '', 
        signatures: [], 
        connectedCount: 0, 
        createdAt: Date.now(),
        expiresAt: Date.now() + 1200000, 
        auditLog: [], signerLabels: {}, 
        roomName: 'Signing Room', 
        whitelist: [], 
        participants: {},
        isLocked: false, network: 'bitcoin',
        protocolVersion: version
      };
  }

  private async handleMessage(msg: any) {
    if (!this.encryptionKey && (msg.encryptedPsbt || msg.type === 'NEW_PARTIAL_DATA')) {
         this.decryptionError.set("Decryption Key Missing"); 
         return; 
     }

    try {
        switch (msg.type) {
            case 'SESSION_CONNECTED':
                this.currentSessionId.set(msg.sessionId);
                break;
            case 'STATE_SYNC':
                await this.handleStateSync(msg);
                break;
            case 'NEW_PARTIAL_DATA':
                await this.handleNewPartial(msg);
                break;
            case 'LABELS_UPDATED':
                {
                const decryptedLabels: Record<string, string> = {};
                const key = this.getRoomKey();
                
                if (key && msg.signerLabels) {
                    for (const [blindedFp, encryptedLabel] of Object.entries(msg.signerLabels)) {
                        try {
                            const realFp = this.blindFingerprintMap.get(blindedFp) || blindedFp;
                            const plainLabel = await this.encryption.decrypt(encryptedLabel as string, key);
                            decryptedLabels[realFp] = plainLabel;
                        } catch (e) {
                            console.error("Failed to decrypt label for", blindedFp);
                        }
                    }
                }
                this.roomState.update(s => s ? { ...s, signerLabels: decryptedLabels } : null);
                break;
            }
            case 'ROOM_RENAMED':
                 if (msg.encryptedName && this.encryptionKey) {
                    try {
                        const decName = await this.encryption.decrypt(msg.encryptedName, this.encryptionKey);
                        this.roomState.update(s => s ? { ...s, roomName: decName } : null);
                    } catch (e) {
                        console.error("Failed to decrypt renamed room", e);
                    }
                }
                break;
            case 'LOG_UPDATE':
                try {
                    const decryptedLog = await this.decryptAuditLog(msg.auditLog || []);
                    this.roomState.update(s => s ? { ...s, auditLog: decryptedLog } : null);
                } catch (e) {
                    console.error("Failed to decrypt audit log update", e);
                }
                break;
            case 'CONNECTIONS_UPDATE':
                this.roomState.update(s => s ? { ...s, connectedCount: msg.count } : null);
                if (msg.sessions && this.encryptionKey) {
                    const decryptedSessions = await Promise.all(msg.sessions.map(async (s: any) => {
                        let plainName = undefined;
                        if (s.encryptedDisplayName) {
                            try {
                                plainName = await this.encryption.decrypt(s.encryptedDisplayName, this.encryptionKey!);
                            } catch (e) {
                                plainName = 'Decrypt Error';
                            }
                        }
                        return { id: s.id, role: s.role, displayName: plainName };
                    }));
                    this.activeSessions.set(decryptedSessions);
                }
                break;
            case 'ROLE_UPDATE':
                {
                    const previousRole = this.role();
                    console.log(`[Test Debug] Processing ROLE_UPDATE. Previous: ${previousRole}, New: ${msg.role}, Announced: ${this.hasAnnouncedJoin}`);
                    
                    this.role.set(msg.role); 
        
                    if (!this.hasAnnouncedJoin && msg.role === 'admin') {
                        console.log('[Test Debug] Logic Path: Initial Admin Join');
                        this.hasAnnouncedJoin = true;
                        this.createSecureLogBlob('User Joined', `Session: ${this.currentSessionId()}`, 'Coordinator')
                            .then(blob => this.send('LOG_ACTION', { encryptedLogBlob: blob }));
                            
                    } else if (this.hasAnnouncedJoin && previousRole === 'guest' && msg.role === 'admin') {
                        console.log('[Test Debug] Logic Path: Role Claimed Upgrade');
                        this.createSecureLogBlob('Role Claimed Coordinator', `Session ID: ${this.currentSessionId()} upgraded`, 'Coordinator')
                            .then(blob => this.send('LOG_ACTION', { encryptedLogBlob: blob }));
                    } else {
                        console.log('[Test Debug] Logic Path: No log action taken');
                    }
                }
                break;
            case 'ROOM_CLOSED':
                {
                    this.isClosed.set(true);
                    const roomToClear = this.roomState()?.roomId;
                    if (roomToClear) {
                        this.clearLocalRoomData(roomToClear);
                    }
                    this.disconnect(false);
                }
                break;
            case 'WHITELIST_UPDATED': 
                {
                    const key = this.getRoomKey();
                    if (key && msg.encryptedWhitelist) {
                        try {
                            const decW = await this.encryption.decrypt(msg.encryptedWhitelist, key);
                            const newWhitelist = JSON.parse(decW);
                            this.roomState.update(s => s ? { ...s, whitelist: newWhitelist } : null);
                        } catch (e) {
                            console.error("Failed to decrypt updated whitelist", e);
                        }
                    }
                }
                break;
            case 'PARTICIPANTS_UPDATE':
                if (msg.participants && this.encryptionKey) {
                    const decParts: Record<string, any> = {};
                    for (const [sid, pData] of Object.entries(msg.participants)) {
                        let plainName = undefined;
                        const typedP = pData as any;
                        if (typedP.encryptedDisplayName) {
                            try { plainName = await this.encryption.decrypt(typedP.encryptedDisplayName, this.encryptionKey); } catch(e) {}
                        }
                        decParts[sid] = { ...typedP, displayName: plainName };
                    }
                    this.roomState.update(s => s ? { ...s, participants: decParts } : null);
                }
                break;
            case 'LOCK_UPDATED':
                this.roomState.update(s => s ? { ...s, isLocked: msg.isLocked } : null);
                break;
            case 'TX_FINALIZED_BROADCAST':
                if (msg.encryptedFinalTxHex && msg.encryptedFinalTxId && this.encryptionKey) {
                    try {
                        const decHex = await this.encryption.decrypt(msg.encryptedFinalTxHex, this.encryptionKey);
                        const decId = await this.encryption.decrypt(msg.encryptedFinalTxId, this.encryptionKey);
                        
                        this.roomState.update(s => s ? { ...s, finalTxHex: decHex, finalTxId: decId } : null);
                    } catch (e) {
                        console.error("Failed to decrypt final tx data", e);
                    }
                }
                break;
            case 'ERROR_LOCKED':
                this.isLockedOut.set(true);
                this.disconnect(false);
                break;
            case 'ERROR_NOT_FOUND':
                this.roomNotFound.set(true);
                this.disconnect(false);
                break;
            case 'ERROR_VERSION_MISMATCH':
                this.fallbackVersion = msg.roomVersion;
                break;
        }
    } catch (e) {
        console.error("Message Handler Error", e);
    }
  }

  private async handleStateSync(msg: any) {
    let masterPsbt = "";
    try {
        if (msg.encryptedPsbt) {
            masterPsbt = await this.encryption.decrypt(msg.encryptedPsbt, this.encryptionKey!);
        } else {
            masterPsbt = msg.psbt || ""; 
        }
    } catch (e) {
        console.error("State Sync Decryption Error:", e);
        this.decryptionError.set('Invalid decryption key provided.');
        this.setRoomKey('');
        this.disconnect(false);
        return;
    }
    masterPsbt = this.normalizePsbt(masterPsbt);

    const decryptedHistory: string[] = [];
    if (msg.signatures?.length) {
        for (const sig of msg.signatures) {
            try {
                if (sig?.encryptedData) {
                    const dec = await this.encryption.decrypt(sig.encryptedData, this.encryptionKey!);
                    decryptedHistory.push(this.normalizePsbt(dec)); 
                } else if (typeof sig === 'string') {
                    const dec = await this.encryption.decrypt(sig, this.encryptionKey!);
                    decryptedHistory.push(this.normalizePsbt(dec));
                }
            } catch (e) {
                if (typeof sig === 'string') {
                    decryptedHistory.push(this.normalizePsbt(sig));
                }
            }
        }
    }
    
    let mergedPsbt = masterPsbt;
    for (const sigData of decryptedHistory) {
        mergedPsbt = this.mergePsbts(mergedPsbt, sigData);
    }

    if (mergedPsbt) {
        await this.registerAllFingerprints(mergedPsbt);
    }

    const decryptedLabels: Record<string, string> = {};
    if (msg.signerLabels && this.encryptionKey) {
        for (const [blindedFp, encryptedLabel] of Object.entries(msg.signerLabels)) {
            const labelStr = encryptedLabel as string;
            const realFp = this.blindFingerprintMap.get(blindedFp) || blindedFp;
            
            if (labelStr.length >= 40) {
                try {
                    decryptedLabels[realFp] = await this.encryption.decrypt(labelStr, this.encryptionKey);
                } catch (e) {
                    decryptedLabels[realFp] = labelStr;
                }
            } else {
                decryptedLabels[realFp] = labelStr;
            }
        }
    }

    const decryptedLog = await this.decryptAuditLog(msg.auditLog || []);

    let decryptedWhitelist: string[] = [];
    if (msg.whitelist && typeof msg.whitelist === 'string') {
        try {
            const decW = await this.encryption.decrypt(msg.whitelist, this.encryptionKey!);
            decryptedWhitelist = JSON.parse(decW);
        } catch(e) { console.error("Failed to decrypt whitelist"); }
    } else if (Array.isArray(msg.whitelist)) {
        decryptedWhitelist = msg.whitelist;
    }

    let decryptedRoomName = 'Untitled Room';
    if (msg.roomName && this.encryptionKey) {
        if (msg.roomName.length >= 40) {
            try {
                decryptedRoomName = await this.encryption.decrypt(msg.roomName, this.encryptionKey);
            } catch (e) {
                decryptedRoomName = msg.roomName; 
            }
        } else {
            decryptedRoomName = msg.roomName;
        }
    }

    let finalTxHex = msg.finalTxHex; 
    let finalTxId = msg.finalTxId;  
    
    if (msg.encryptedFinalTxHex && msg.encryptedFinalTxId && this.encryptionKey) {
        try {
            finalTxHex = await this.encryption.decrypt(msg.encryptedFinalTxHex, this.encryptionKey);
            finalTxId = await this.encryption.decrypt(msg.encryptedFinalTxId, this.encryptionKey);
        } catch (e) {
            console.error("Failed to decrypt final TX data in sync", e);
        }
    }

    const hasAdminToken = !!sessionStorage.getItem(`admin_token_${msg.roomId}`);

    let decryptedParticipants: Record<string, any> = {};
    if (msg.participants && this.encryptionKey) {
        for (const [sid, pData] of Object.entries(msg.participants)) {
            let plainName = undefined;
            const typedP = pData as any;
            if (typedP.encryptedDisplayName) {
                try { plainName = await this.encryption.decrypt(typedP.encryptedDisplayName, this.encryptionKey); } catch(e) {}
            }
            decryptedParticipants[sid] = { ...typedP, displayName: plainName };
        }
    } else {
        decryptedParticipants = msg.participants || {};
    }

    if (!this.hasAnnouncedJoin && this.currentSessionId && !hasAdminToken) {
        this.hasAnnouncedJoin = true;
        this.createSecureLogBlob('User Joined', `Session: ${this.currentSessionId()}`, 'Guest')
            .then(blob => this.send('LOG_ACTION', { encryptedLogBlob: blob }));
    }

    this.roomState.set({
        ...this.getInitialState(msg.roomId, msg.protocolVersion || PROTOCOL_VERSION),
        ...msg,
        psbt: mergedPsbt,
        signatures: decryptedHistory,
        signerLabels: Object.keys(decryptedLabels).length > 0 ? decryptedLabels : msg.signerLabels,
        auditLog: decryptedLog,
        whitelist: decryptedWhitelist,
        participants: Object.keys(decryptedParticipants).length > 0 ? decryptedParticipants : msg.participants || {},
        roomName: decryptedRoomName,
        finalTxHex: finalTxHex, 
        finalTxId: finalTxId
    });
  }

  private async handleNewPartial(msg: any) {
    if (!msg.data?.encryptedData) return;
    
    const decrypted = await this.encryption.decrypt(msg.data.encryptedData, this.encryptionKey!);
    
    let realFingerprint = msg.fingerprint;
    if (msg.fingerprint) {
        realFingerprint = this.blindFingerprintMap.get(msg.fingerprint) || msg.fingerprint;
    }

    this.roomState.update(current => {
        if (!current) return null;
        return {
            ...current,
            psbt: this.mergePsbts(current.psbt, this.normalizePsbt(decrypted)),
            signatures: [...current.signatures, decrypted]
        };
    });
    
    console.log(`Successfully merged new signature from signer: ${realFingerprint}`);
  }

  private decodePsbt(raw: string): Uint8Array {
    const clean = raw.replace(/\s/g, '');
    return /^[0-9a-fA-F]+$/.test(clean) ? hex.decode(clean) : base64.decode(clean);
  }

  private normalizePsbt(input: string): string {
      const clean = input.trim();
      if (/^[0-9a-fA-F]+$/.test(clean) && clean.toLowerCase().startsWith('70736274')) {
          try { return base64.encode(hex.decode(clean)); } catch (e) { return input; }
      }
      return clean;
  }

  private parseTxDetails(psbtBase64: string): TxDetails | null {
    try {
      const tx = Transaction.fromPSBT(base64.decode(psbtBase64));
      let inputsList = [];
      let outputs = [];
      let totalInput = 0;
      let totalOutput = 0;

      for (let i = 0; i < tx.inputsLength; i++) {
        const input = tx.getInput(i);
        let amount = 0;
        let address = "Legacy/Unknown";
        
        if (input.witnessUtxo) {
            amount = Number(input.witnessUtxo.amount);
            totalInput += amount;
            address = this.formatScriptAddress(input.witnessUtxo.script);
        } else if (input.nonWitnessUtxo) {
            address = "Legacy Input";
        }

        let txId = "????";
        let vout = 0;
        try {
            // @ts-ignore
            const rawInput = tx.unsignedTx.inputs[i]; 
            if (rawInput?.txid) {
                txId = hex.encode(rawInput.txid).slice(0, 8) + "...";
                vout = rawInput.index;
            }
        } catch(e) {}

        inputsList.push({ address, amount, txId, vout });
      }

      for (let i = 0; i < tx.outputsLength; i++) {
        const output = tx.getOutput(i);
        const amount = Number(output.amount);
        totalOutput += amount;
        
        const address = this.formatScriptAddress(output.script || new Uint8Array([]));
        let isChange = false;
        
            if (output.bip32Derivation) {
                for (const [, meta] of output.bip32Derivation as any[]) {
                    if (meta?.path?.length >= 2 && meta.path[meta.path.length - 2] === 1) {
                        isChange = true;
                        break; 
                    }
                }
            }
            outputs.push({ address, amount, isChange });
        }

        outputs.sort((a, b) => Number(b.isChange) - Number(a.isChange));

        const fee = totalInput > 0 ? Math.max(0, totalInput - totalOutput) : 0;
        let vBytes = 0;
        try { vBytes = (tx as any).vsize; } catch (e) { 
            vBytes = 10 + (tx.inputsLength * 100) + (tx.outputsLength * 31); 
        }
      
        const feeRate = vBytes > 0 ? Number((fee / vBytes).toFixed(2)) : 0;

        return { amount: totalOutput, fee, vBytes, feeRate, inputs: tx.inputsLength, inputsList, outputs };
    } catch (e) {
      console.error("Failed to parse PSBT", e);
      return null;
    }
  }

  private extractSigners(psbtBase64: string): SignerStatus[] {
    try {
        const tx = Transaction.fromPSBT(base64.decode(psbtBase64));
        const signersMap = new Map<string, boolean>();

        for (let i = 0; i < tx.inputsLength; i++) {
            const input = tx.getInput(i);
            const derivations = input.bip32Derivation as unknown as DerivationEntry[];
            
            if (derivations) {
                for (const [pubkey, meta] of derivations) {
                    if (!meta?.fingerprint) continue;
                    const fpHex = meta.fingerprint.toString(16).padStart(8, '0');
                    let isSigned = false;

                    // Check Partial Sigs
                    if (input.partialSig) {
                        isSigned = input.partialSig.some(p => this.areKeysEqual(p[0], pubkey));
                    }
                    // Check Taproot Sigs
                    if (!isSigned && input.tapScriptSig) {
                        isSigned = input.tapScriptSig.some(p => this.areKeysEqual(p[0].pubKey, pubkey));
                    }

                    if (isSigned || !signersMap.has(fpHex)) {
                         const current = signersMap.get(fpHex) || false;
                         signersMap.set(fpHex, current || isSigned);
                    }
                }
            }
        }
        return Array.from(signersMap.entries()).map(([fp, signed]) => ({ fingerprint: fp, signed }));
    } catch (e) { return []; }
  }

  private getFingerprintFromPsbt(psbtData: string): string | null {
    try {
        const bytes = this.decodePsbt(psbtData);
        const tx = Transaction.fromPSBT(bytes);
        
        for (let i = 0; i < tx.inputsLength; i++) {
        const input = tx.getInput(i);
        
        if (input.partialSig && input.partialSig.length > 0) {
            const pubkeySigned = input.partialSig[0][0];
            
            if (input.bip32Derivation) {
                for (const [pubkey, meta] of input.bip32Derivation) {
                    if (hex.encode(pubkey) === hex.encode(pubkeySigned)) {
                    return meta.fingerprint.toString(16).padStart(8, '0');
                    }
                }
            }
        }
        }
        return null;
    } catch (e) {
        return null;
    }
}

  private formatScriptAddress(script: Uint8Array): string {
    try {
        if (!script || script.length === 0) return 'Unknown';
        const s = hex.encode(script);

        // Map network human-readable prefix ('tb' for testnet/signet, 'bc' for mainnet)
        const currentNetwork = this.roomState()?.network || 'bitcoin';
        const hrp = (currentNetwork === 'testnet' || currentNetwork === 'signet') ? 'tb' : 'bc';

        // Handle P2WPKH (22 bytes) or P2WSH (34 bytes) -> Witness Version 0 (Bech32)
        if ((s.startsWith('0014') && script.length === 22) || (s.startsWith('0020') && script.length === 34)) {
            const dataBytes = script.slice(2); 
            const words = bech32.toWords(dataBytes); 
            words.unshift(0); // Insert witness version 0 at the beginning
            return bech32.encode(hrp, words); 
        }

        // Handle P2TR (34 bytes) -> Witness Version 1 (Bech32m)
        if (s.startsWith('5120') && script.length === 34) {
            const dataBytes = script.slice(2);
            const words = bech32m.toWords(dataBytes);
            words.unshift(1); 
            return bech32m.encode(hrp, words);
        }

        return s;

    } catch (e) {
        const s = hex.encode(script);
        if (s.startsWith('0014') || s.startsWith('0020') || s.startsWith('5120')) {
            return s.slice(4);
        }
        return s;
    }
}

  private areKeysEqual(k1: Uint8Array, k2: Uint8Array): boolean {
    if (hex.encode(k1) === hex.encode(k2)) return true;
    try {
        const getX = (k: Uint8Array) => k.length === 33 ? k.slice(1) : k.length === 65 ? k.slice(1, 33) : k;
        return hex.encode(getX(k1)) === hex.encode(getX(k2));
    } catch (e) { return false; }
  }

  private async decryptAuditLog(logs: any[]): Promise<any[]> {
      const key = this.getRoomKey();
      if (!key || !logs || !Array.isArray(logs)) return [];
      
      const decryptedLog = [];
      
      for (const item of logs) {
          if (!item) continue;
          
          const encryptedBlob = typeof item === 'string' ? item : item.encryptedLogBlob;
          
          if (encryptedBlob) {
              try {
                  const dec = await this.encryption.decrypt(encryptedBlob, key);
                  const entry = JSON.parse(dec);
                  if (entry) decryptedLog.push(entry);
              } catch (e) {
                  decryptedLog.push({ timestamp: 0, event: 'Encrypted Data (Decryption Failed)', user: 'Unknown' });
              }
          } else if (item.event && item.user) {
              decryptedLog.push(item);
          }
      }
      
      return decryptedLog
          .filter(entry => entry !== null && typeof entry === 'object')
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  private async createSecureLogBlob(event: string, detail: string, user: string): Promise<string> {
      const key = this.getRoomKey();
      if (!key) return '';
      
      const logEntry = {
          timestamp: Date.now(),
          event: event,
          detail: detail,
          user: user
      };
      
      return await this.encryption.encrypt(JSON.stringify(logEntry), key);
  }

  async gracefullyDisconnect() {
      if (this.currentSessionId && this.status() === 'connected') {
          try {
              const encryptedLogBlob = await this.createSecureLogBlob(
                  'User Left', 
                  `Session ID: ${this.currentSessionId()}`, 
                  'Guest'
              );
              this.send('LOG_ACTION', { encryptedLogBlob });
          } catch (e) {
              console.error("Failed to send disconnect log");
          }
      }
      
      setTimeout(() => {
          this.disconnect();
      }, 50);
  }

  /**
   * Wipes all room-specific identity data from localStorage.
   */
  private clearLocalRoomData(roomId: string) {
      if (typeof localStorage === 'undefined') return;

      localStorage.removeItem(`display_name_${roomId}`);

      sessionStorage.removeItem(`admin_token_${roomId}`);

      console.log(`[Privacy] Local identity data for room ${roomId} has been purged.`);
  }
}