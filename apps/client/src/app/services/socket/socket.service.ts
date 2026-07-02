/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http'; 
import { Transaction, NETWORK, TEST_NETWORK, Address } from '@scure/btc-signer';
import { base64, hex, bech32, bech32m } from '@scure/base';
import { environment } from '../../../environments/environment';
import { EncryptionService } from '../encryption/encryption.service';
import { Subject } from 'rxjs';
import { RelayClient, EncryptionEngine, PsbtUtils, RoomStateStore, TxDetails, RoomState } from '@signing-room/core';

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------

export const PROTOCOL_VERSION = '1.0.0';

type DerivationEntry = [Uint8Array, { fingerprint: number; path: number[] }];

@Injectable({ providedIn: 'root' })
export class SocketService {

  public roomState = signal<RoomState | null>(null);
  private store: RoomStateStore;
  private engine: EncryptionEngine;
  private relay: RelayClient;

  private ws: WebSocket | null = null;
  private encryptionKey: string | null = null; 
  private fallbackVersion: string | null = null;
  private blindFingerprintMap: Map<string, string> = new Map();
  private hasAnnouncedJoin = false;
  public securityAlert$ = new Subject<{type: 'access_denied', count: number}>();
  private failedKeyAttempts = 0;

  // -------------------------------------------------------------------------
  // Signals
  // -------------------------------------------------------------------------
  
  // Connection Status
  public status = signal<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  public role = signal<'guest' | 'admin'>('guest');
  public currentSessionId = signal<string | null>(null);
  public activeSessions = signal<{id: string, role: string, displayName?: string}[]>([]);
  public networkSignatureReceived$ = new Subject<{fingerprint: string, sessionId: string}>();
  
  
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
    return PsbtUtils.extractSigners(state.psbt);
  });

  public signerCount = computed(() => {
    return this.signers().filter(signer => signer.signed).length;
  });

  public signerThreshold = computed(() => {
      const state = this.roomState();
      if (!state?.psbt) return 0;
      
      const threshold = PsbtUtils.getThreshold(state.psbt);
      
      return threshold > 0 ? threshold : this.signers().length;
  });

  public isReadyToBroadcast = computed(() => {
      return this.signerCount() >= this.signerThreshold();
  });

  public txDetails = computed<TxDetails | null>(() => {
    const state = this.roomState();
    if (!state?.psbt) return null;
    return PsbtUtils.parseTxDetails(state.psbt, state.network);
  });

  constructor(
    private http: HttpClient,
    private encryption: EncryptionService
  ) {

    this.engine = this.encryption.getEngine();
    this.relay = new RelayClient(this.engine);
    this.store = new RoomStateStore(this.relay.events);

    this.relay.events.on('ROOM_CONNECTED').subscribe(() => {
        this.status.set('connected');
    });

    this.relay.events.on('DECRYPTION_ERROR').subscribe((e) => {
        this.decryptionError.set(e.payload);
        this.setRoomKey(null);
        this.disconnect(false);
    });

    this.relay.events.on('STATE_CHANGED').subscribe((e) => {
        this.roomState.set(e.payload); 
    });

    this.relay.events.on('STATE_SYNC_DECRYPTED').subscribe((event) => {
        const syncData = event.payload;
        const hasAdminToken = !!sessionStorage.getItem(`admin_token_${syncData.roomId}`);
        
        if (!this.hasAnnouncedJoin && this.currentSessionId() && !hasAdminToken) {
            this.hasAnnouncedJoin = true;
            this.relay.logAction('User Joined', `Session: ${this.currentSessionId()}`, 'Guest');
        }
    });

    this.relay.events.on('NEW_PARTIAL_DECRYPTED').subscribe((event) => {
        const { decryptedPsbt, fingerprint, sessionId } = event.payload;

        this.store.update(current => {
            if (!current) return null;
            return {
                ...current,
                psbt: this.mergePsbts(current.psbt, decryptedPsbt),
                signatures: [...current.signatures, decryptedPsbt]
            };
        });

        if (fingerprint && sessionId) {
            this.networkSignatureReceived$.next({ fingerprint, sessionId });
        }
        
        console.log(`Successfully merged new signature from signer: ${fingerprint}`);
    });

    this.relay.events.on('SESSION_CONNECTED').subscribe(e => this.currentSessionId.set(e.payload));
    
    this.relay.events.on('LABELS_DECRYPTED').subscribe(e => {
        this.store.update(s => s ? { ...s, signerLabels: e.payload } : null);
    });

    this.relay.events.on('ROOM_RENAMED_DECRYPTED').subscribe(e => {
        this.store.update(s => s ? { ...s, roomName: e.payload } : null);
    });

    this.relay.events.on('LOG_UPDATE_DECRYPTED').subscribe(e => {
        this.store.update(s => s ? { ...s, auditLog: e.payload } : null);
    });

    this.relay.events.on('CONNECTIONS_DECRYPTED').subscribe(e => {
        this.store.update(s => s ? { ...s, connectedCount: e.payload.count } : null);
        this.activeSessions.set(e.payload.sessions);
    });

    this.relay.events.on('WHITELIST_DECRYPTED').subscribe(e => {
        this.store.update(s => s ? { ...s, whitelist: e.payload } : null);
    });

    this.relay.events.on('PARTICIPANTS_DECRYPTED').subscribe(e => {
        this.store.update(s => s ? { ...s, participants: e.payload } : null);
    });

    this.relay.events.on('LOCK_UPDATED').subscribe((e) => {
        // Handle both full payload and empty payload cases
        const payload = e.payload || {};
        const isLocked = payload.isLocked !== undefined ? payload.isLocked : true;
        
        console.log('🔒 LOCK_UPDATED received → isLocked =', isLocked);
        
        this.store.update(s => s ? { ...s, isLocked } : null);
    });

    this.relay.events.on('TOGGLE_LOCK').subscribe((e) => {
        const isLocked = e.payload?.isLocked !== undefined ? e.payload.isLocked : true;
        this.store.update(s => s ? { ...s, isLocked } : null);
    });

    this.relay.events.on('TX_FINALIZED_DECRYPTED').subscribe(e => {
        this.store.update(s => s ? { ...s, finalTxHex: e.payload.finalTxHex, finalTxId: e.payload.finalTxId } : null);
    });

    this.relay.events.on('ROOM_CLOSED').subscribe(() => {
        this.isClosed.set(true);
        const roomToClear = this.roomState()?.roomId;
        if (roomToClear) this.clearLocalRoomData(roomToClear);
        this.disconnect(false);
    });

    this.relay.events.on('PROTOCOL_ERROR').subscribe(e => {
        const errorType = e.payload.type;
        if (errorType === 'locked') {
            this.isLockedOut.set(true);
            this.disconnect(false);
        } else if (errorType === 'not_found') {
            this.roomNotFound.set(true);
            this.disconnect(false);
        } else if (errorType === 'version_mismatch') {
            this.fallbackVersion = e.payload.roomVersion;
        }
    });

    this.relay.events.on('ROLE_UPDATE').subscribe(e => {
        const previousRole = this.role();
        const newRole = e.payload;
        this.role.set(newRole); 

        if (!this.hasAnnouncedJoin && newRole === 'admin') {
            this.hasAnnouncedJoin = true;
            this.relay.logAction('User Joined', `Session: ${this.currentSessionId()}`, 'Coordinator');
        } else if (this.hasAnnouncedJoin && previousRole === 'guest' && newRole === 'admin') {
            this.relay.logAction('Role Claimed Coordinator', `Session ID: ${this.currentSessionId()} upgraded`, 'Coordinator');
        }
    });

  }

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
    this.store.init(roomId, versionToUse);
    this.roomState.set(this.store.getState());
    this.status.set('connecting');

    const apiBase = environment.apiUrl; 
    const wsBase = apiBase.replace(/^http/, 'ws');
    
    await this.relay.joinRoom(wsBase, roomId, key || '', versionToUse);

    this.relay.events.on('ROOM_CONNECTED').subscribe(async () => {
        this.status.set('connected');
        const secureToken = sessionStorage.getItem(`admin_token_${roomId}`);
        if (secureToken) this.relay.send('AUTH', { token: secureToken });

        if (typeof localStorage !== 'undefined' && this.encryptionKey) {
            const savedName = localStorage.getItem(`display_name_${roomId}`);
            if (savedName) {
                const encryptedDisplayName = await this.engine.encrypt(savedName, this.encryptionKey);
                this.relay.send('SET_DISPLAY_NAME', { encryptedDisplayName });
            }
        }
    });

    this.relay.events.on('ROOM_DISCONNECTED').subscribe((event) => {
        const { code } = event.payload;
        this.status.set('disconnected');
        this.role.set('guest');

        const roomId = this.roomState()?.roomId;
        if (!roomId) return;

        if (code === 4026) {
            console.warn(`Protocol mismatch. Downgrading connection...`);
            const target = this.fallbackVersion || '1.0.0';
            this.fallbackVersion = null;
            this.connect(roomId, this.encryptionKey, target);
            return;
        }
        
        if (code === 4001) {
            this.isRoomFull.set(true);
            return; 
        }

        if (code === 1006 && !this.hasAnnouncedJoin) {
            this.decryptionError.set('Invalid decryption key. Access denied.');
            this.setRoomKey(null);
            this.failedKeyAttempts++;
            this.securityAlert$.next({ type: 'access_denied', count: this.failedKeyAttempts });
            return;
        }

        if (!this.isClosed()) {
            setTimeout(() => {
                if (this.status() === 'disconnected') this.connect(roomId, this.encryptionKey);
            }, 3000);
        }
    });

    this.relay.events.on('ERROR').subscribe((event) => {
        console.error('WS Error:', event.payload);
        this.status.set('error');
    });
  }

  disconnect(clearState = true) {
    this.relay.disconnect(true);
    this.status.set('disconnected');
    this.fallbackVersion = null;
    if (clearState) this.reset();
  }


  private getUserContext(): string {
      return this.isCoordinator() ? 'Coordinator' : `Guest (${this.currentSessionId() || 'Unknown'})`;
  }

  // -------------------------------------------------------------------------
  // Public Actions
  // -------------------------------------------------------------------------

    async uploadSignature(partialPsbtBase64: string) {
        const currentRoom = this.roomState();
        const detectedFingerprint = PsbtUtils.getFingerprintFromPsbt(partialPsbtBase64);
        if (!detectedFingerprint) return;

        const alreadySigned = this.signers().find(s => s.fingerprint === detectedFingerprint)?.signed;
        if (alreadySigned) {
            console.warn(`Signature for ${detectedFingerprint} has already been applied.`);
            return;
        }

        if (typeof localStorage !== 'undefined' && currentRoom) {
            const savedLabel = this.getLocalLabel(detectedFingerprint);
            const currentSessionName = localStorage.getItem(`display_name_${currentRoom.roomId}`);
            if (savedLabel && !currentSessionName) {
                await this.setDisplayName(savedLabel);
            }
        }

        let payloadToSend = partialPsbtBase64;
        if (currentRoom?.psbt) {
            payloadToSend = this.mergePsbts(currentRoom.psbt, partialPsbtBase64);
        }

        await this.relay.uploadSignature(payloadToSend, detectedFingerprint, this.getUserContext());
    }

    async claimCoordinator(secureToken: string) { 
        this.relay.claimCoordinator(secureToken);
    }

    closeRoom() { 
        this.relay.closeRoom(); 
    }

    async logAction(action: string, detail: string) {
        await this.relay.logAction(action, detail, this.getUserContext());
    }

    async renameRoom(newName: string) {
        await this.relay.renameRoom(newName, this.getUserContext());
    }

    async updateSignerLabel(fingerprint: string, label: string) {
        const currentLabel = this.roomState()?.signerLabels?.[fingerprint] || '';
        if (currentLabel === (label || '')) return; 
        await this.relay.updateSignerLabel(fingerprint, label, this.getUserContext());
    }

    async setDisplayName(name: string) {
        const roomId = this.roomState()?.roomId;
        if (!roomId) return;
        const safeName = name.trim().substring(0, 64);
        
        if (typeof localStorage !== 'undefined') {
            if (safeName) localStorage.setItem(`display_name_${roomId}`, safeName);
            else localStorage.removeItem(`display_name_${roomId}`);
        }
        await this.relay.setDisplayName(safeName);
    }

    async updateWhitelist(address: string, remove: boolean) {
        const currentList = this.roomState()?.whitelist || [];
        const newList = remove ? currentList.filter(a => a !== address) : 
                        (currentList.includes(address) ? [...currentList] : [...currentList, address]);
        
        const shortAddr = address.length > 5 ? address.slice(-5) : address;
        const actionWord = remove ? 'Removed' : 'Added';
        
        await this.relay.updateWhitelist(newList, `${actionWord} ...${shortAddr} to whitelist`, this.getUserContext());
    }

    async toggleLock(locked: boolean) {
        await this.relay.toggleLock(locked, this.getUserContext());
    }

    async updateWhitelistBatch(addresses: string[], remove: boolean) {
        const currentList = this.roomState()?.whitelist || [];
        let newList: string[] = [];

        if (remove) {
            newList = currentList.filter(a => !addresses.includes(a));
        } else {
            newList = Array.from(new Set([...currentList, ...addresses])); 
        }

        const actionWord = remove ? 'Removed' : 'Verified';
        await this.relay.updateWhitelist(newList, `${actionWord} ${addresses.length} batch address(es)`, this.getUserContext());
    }

    async broadcastFinalization(finalTxHex: string, finalTxId: string) {
        await this.relay.broadcastFinalization(finalTxHex, finalTxId, this.getUserContext());
    }

  // -------------------------------------------------------------------------
  // PSBT & Crypto Logic
  // -------------------------------------------------------------------------

  getFinalTxHex(): string | null {
    if (this.role() !== 'admin') return null;
    const state = this.roomState();
    if (!state?.psbt) return null;
    return PsbtUtils.finalizeTx(state.psbt)?.hex || null;
  }

  getFinalTxId(): string | null {
    if (this.role() !== 'admin') return null;
    const state = this.roomState();
    if (!state?.psbt) return null;
    return PsbtUtils.finalizeTx(state.psbt)?.txId || null;
  }

  mergePsbts(base: string, next: string): string {
    return PsbtUtils.merge(base, next);
  }

  getThreshold(psbtBase64: string): number {
    return PsbtUtils.getThreshold(psbtBase64);
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
    this.relay.send(type, payload);
  }

  private reset() {
    this.hasAnnouncedJoin = false;
    this.store.set(null);
    this.roomState.set(null);
    this.role.set('guest');
    this.isClosed.set(false); 
    
    this.decryptionError.set(null);
    this.isLockedOut.set(false);
    this.isRoomFull.set(false);
    this.roomNotFound.set(false);
  }

  async gracefullyDisconnect() {
      await this.relay.gracefullyDisconnect(this.currentSessionId());
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