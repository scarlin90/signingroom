import { RoomEventBus } from '../events/room-event-bus';
import { EncryptionEngine } from '../crypto/encryption-engine';
import { PsbtUtils } from '../bitcoin/psbt-utils';
import { Transaction } from '@scure/btc-signer';
import { hex } from '@scure/base';

export class RelayClient {
  private ws: WebSocket | null = null;
  public events = new RoomEventBus();

  private encryptionKey: string | null = null;
  public blindFingerprintMap = new Map<string, string>();

  constructor(private crypto: EncryptionEngine) {}

  public setKey(key: string | null) {
      this.encryptionKey = key;
  }

  public connect(url: string): void {
    this.disconnect(true);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => this.events.dispatch('ROOM_CONNECTED');
    this.ws.onclose = (e) => this.events.dispatch('ROOM_DISCONNECTED', { code: e.code, reason: e.reason });
    this.ws.onerror = (e) => this.events.dispatch('ERROR', e);

    this.ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        await this.routeMessage(msg);
      } catch (e) {
        console.error('RelayClient: Message parse error', e);
      }
    };
  }

  /**
   * Automatically computes the BIP-compliant Blind Pass and establishes the WebSocket connection.
   */
  public async joinRoom(wsBaseUrl: string, roomId: string, key: string, version: string) {
    this.setKey(key);
    const roomPass = key ? await this.crypto.blindData(roomId, key) : '';
    const url = `${wsBaseUrl}/api/room/${roomId}/websocket?v=${version}&pass=${roomPass}`;
    this.connect(url);
  }

  public disconnect(clearListeners = false): void {
    if (this.ws) {
      if (clearListeners) {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.onopen = null;
      }
      this.ws.close();
      this.ws = null;
    }
  }

  public send(type: string, payload: any = {}): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...payload }));
    }
  }

  private async routeMessage(msg: any) {
    if (!this.encryptionKey && (msg.encryptedPsbt || msg.type === 'NEW_PARTIAL_DATA')) {
        this.events.dispatch('DECRYPTION_ERROR', "Decryption Key Missing");
        return;
    }

    switch (msg.type) {
        case 'SESSION_CONNECTED':
            this.events.dispatch('SESSION_CONNECTED', msg.sessionId);
            break;
        case 'STATE_SYNC':
            const syncData = await this.processStateSync(msg);
            if (syncData) this.events.dispatch('STATE_SYNC_DECRYPTED', syncData);
            break;
        case 'NEW_PARTIAL_DATA':
            const partialData = await this.processNewPartial(msg);
            if (partialData) this.events.dispatch('NEW_PARTIAL_DECRYPTED', partialData);
            break;
        case 'LABELS_UPDATED':
            this.events.dispatch('LABELS_DECRYPTED', await this.decryptLabels(msg.signerLabels));
            break;
        case 'ROOM_RENAMED':
            if (msg.encryptedName && this.encryptionKey) {
                try {
                    const roomName = await this.crypto.decrypt(msg.encryptedName, this.encryptionKey);
                    this.events.dispatch('ROOM_RENAMED_DECRYPTED', roomName);
                } catch (e) { console.error("Relay: Failed to decrypt room name", e); }
            }
            break;
        case 'LOG_UPDATE':
            this.events.dispatch('LOG_UPDATE_DECRYPTED', await this.decryptAuditLog(msg.auditLog || []));
            break;
        case 'CONNECTIONS_UPDATE':
            this.events.dispatch('CONNECTIONS_DECRYPTED', {
                count: msg.count,
                sessions: await this.decryptSessions(msg.sessions)
            });
            break;
        case 'ROLE_UPDATE':
            this.events.dispatch('ROLE_UPDATE', msg.role);
            break;
        case 'ROOM_CLOSED':
            this.events.dispatch('ROOM_CLOSED');
            break;
        case 'WHITELIST_UPDATED':
            if (msg.encryptedWhitelist && this.encryptionKey) {
                try {
                    const decW = await this.crypto.decrypt(msg.encryptedWhitelist, this.encryptionKey);
                    this.events.dispatch('WHITELIST_DECRYPTED', JSON.parse(decW));
                } catch (e) { console.error("Relay: Failed to decrypt whitelist", e); }
            }
            break;
        case 'PARTICIPANTS_UPDATE':
            this.events.dispatch('PARTICIPANTS_DECRYPTED', await this.decryptParticipants(msg.participants));
            break;
        case 'LOCK_UPDATED':
            this.events.dispatch('LOCK_UPDATED', msg);
            break;
        case 'TX_FINALIZED_BROADCAST':
            if (msg.encryptedFinalTxHex && msg.encryptedFinalTxId && this.encryptionKey) {
                try {
                    const finalTxHex = await this.crypto.decrypt(msg.encryptedFinalTxHex, this.encryptionKey);
                    const finalTxId = await this.crypto.decrypt(msg.encryptedFinalTxId, this.encryptionKey);
                    this.events.dispatch('TX_FINALIZED_DECRYPTED', { finalTxHex, finalTxId });
                } catch (e) { console.error("Relay: Failed to decrypt final tx", e); }
            }
            break;
        case 'ERROR_LOCKED':
            this.events.dispatch('PROTOCOL_ERROR', { type: 'locked' });
            break;
        case 'ERROR_NOT_FOUND':
            this.events.dispatch('PROTOCOL_ERROR', { type: 'not_found' });
            break;
        case 'ERROR_VERSION_MISMATCH':
            this.events.dispatch('PROTOCOL_ERROR', { type: 'version_mismatch', roomVersion: msg.roomVersion });
            break;
        default:
            this.events.dispatch('RAW_MESSAGE', msg);
    }
  }

  private async processStateSync(msg: any) {
    let masterPsbt = "";
    try {
        masterPsbt = msg.encryptedPsbt ? await this.crypto.decrypt(msg.encryptedPsbt, this.encryptionKey!) : (msg.psbt || ""); 
    } catch (e) {
        this.events.dispatch('DECRYPTION_ERROR', 'Invalid decryption key provided.');
        return null;
    }

    masterPsbt = PsbtUtils.normalize(masterPsbt);
    const decryptedHistory: string[] = [];

    if (msg.signatures?.length) {
        for (const sig of msg.signatures) {
            try {
                const encTarget = sig?.encryptedData || sig;
                const dec = await this.crypto.decrypt(encTarget, this.encryptionKey!);
                decryptedHistory.push(PsbtUtils.normalize(dec)); 
            } catch (e) {
                if (typeof sig === 'string') decryptedHistory.push(PsbtUtils.normalize(sig));
            }
        }
    }
    
    let mergedPsbt = masterPsbt;
    for (const sigData of decryptedHistory) {
        mergedPsbt = PsbtUtils.merge(mergedPsbt, sigData);
    }

    if (mergedPsbt) {
        await this.registerAllFingerprints(mergedPsbt);
    }

    // Process Logs & Labels
    const decryptedLabels = await this.decryptLabels(msg.signerLabels || {});
    const decryptedLog = await this.decryptAuditLog(msg.auditLog || []);
    
    // Process Participants
    const decryptedParticipants = await this.decryptParticipants(msg.participants || {});

    // Process Whitelist
    let decryptedWhitelist: string[] = [];
    if (msg.whitelist && typeof msg.whitelist === 'string') {
        try {
            const decW = await this.crypto.decrypt(msg.whitelist, this.encryptionKey!);
            decryptedWhitelist = JSON.parse(decW);
        } catch(e) { console.error("Relay: Failed to decrypt whitelist in sync"); }
    } else if (Array.isArray(msg.whitelist)) {
        decryptedWhitelist = msg.whitelist;
    }

    // Process Room Name
    let decryptedRoomName = 'Untitled Room';
    if (msg.roomName && this.encryptionKey) {
        if (msg.roomName.length >= 40) {
            try {
                decryptedRoomName = await this.crypto.decrypt(msg.roomName, this.encryptionKey);
            } catch (e) {
                decryptedRoomName = msg.roomName; 
            }
        } else {
            decryptedRoomName = msg.roomName;
        }
    }

    // Process Final Transaction Data
    let finalTxHex = msg.finalTxHex; 
    let finalTxId = msg.finalTxId;  
    if (msg.encryptedFinalTxHex && msg.encryptedFinalTxId && this.encryptionKey) {
        try {
            finalTxHex = await this.crypto.decrypt(msg.encryptedFinalTxHex, this.encryptionKey);
            finalTxId = await this.crypto.decrypt(msg.encryptedFinalTxId, this.encryptionKey);
        } catch (e) {
            console.error("Relay: Failed to decrypt final TX data in sync", e);
        }
    }

    return {
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
    };
  }

  private async processNewPartial(msg: any) {
    if (!msg.data?.encryptedData) return null;
    const decrypted = await this.crypto.decrypt(msg.data.encryptedData, this.encryptionKey!);
    const realFingerprint = this.blindFingerprintMap.get(msg.fingerprint) || msg.fingerprint;

    return {
        decryptedPsbt: PsbtUtils.normalize(decrypted),
        fingerprint: realFingerprint,
        sessionId: msg.sessionId
    };
  }

  private async registerAllFingerprints(psbtData: string) {
    if (!this.encryptionKey) return;
    try {
        const bytes = PsbtUtils.decode(psbtData);
        const tx = Transaction.fromPSBT(bytes);
        for (let i = 0; i < tx.inputsLength; i++) {
            const input = tx.getInput(i);
            if (input.bip32Derivation) {
                for (const [, meta] of input.bip32Derivation) {
                    const fp = meta.fingerprint.toString(16).padStart(8, '0');
                    const blinded = await this.crypto.blindData(fp, this.encryptionKey);
                    this.blindFingerprintMap.set(blinded, fp);
                    this.blindFingerprintMap.set(fp, fp);
                }
            }
        }
    } catch (e) { console.error("Relay: Failed to parse fingerprints"); }
  }

  private async decryptAuditLog(logs: any[]): Promise<any[]> {
      if (!this.encryptionKey || !logs || !Array.isArray(logs)) return [];
      const decryptedLog = [];
      
      for (const item of logs) {
          if (!item) continue;
          const encryptedBlob = typeof item === 'string' ? item : item.encryptedLogBlob;
          
          if (encryptedBlob) {
              try {
                  const dec = await this.crypto.decrypt(encryptedBlob, this.encryptionKey);
                  const entry = JSON.parse(dec);
                  if (entry) decryptedLog.push(entry);
              } catch (e) {
                  decryptedLog.push({ timestamp: 0, event: 'Encrypted Data (Decryption Failed)', user: 'Unknown' });
              }
          } else if (item.event && item.user) {
              decryptedLog.push(item);
          }
      }
      return decryptedLog.filter(e => e !== null).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  private async decryptLabels(encryptedLabels: Record<string, string>): Promise<Record<string, string>> {
      const decryptedLabels: Record<string, string> = {};
      if (!encryptedLabels || !this.encryptionKey) return decryptedLabels;

      for (const [blindedFp, encryptedLabel] of Object.entries(encryptedLabels)) {
          const realFp = this.blindFingerprintMap.get(blindedFp) || blindedFp;
          try {
              decryptedLabels[realFp] = encryptedLabel.length >= 40 
                  ? await this.crypto.decrypt(encryptedLabel, this.encryptionKey) 
                  : encryptedLabel;
          } catch (e) { decryptedLabels[realFp] = encryptedLabel; }
      }
      return decryptedLabels;
  }

  private async decryptSessions(sessions: any[]) {
      if (!sessions || !this.encryptionKey) return [];
      return await Promise.all(sessions.map(async (s: any) => {
          let plainName = undefined;
          if (s.encryptedDisplayName) {
              try { plainName = await this.crypto.decrypt(s.encryptedDisplayName, this.encryptionKey!); } 
              catch (e) { plainName = 'Decrypt Error'; }
          }
          return { id: s.id, role: s.role, displayName: plainName };
      }));
  }

  private async decryptParticipants(participants: any) {
      const decParts: Record<string, any> = {};
      if (!participants || !this.encryptionKey) return decParts;
      for (const [sid, pData] of Object.entries(participants)) {
          let plainName = undefined;
          const typedP = pData as any;
          if (typedP.encryptedDisplayName) {
              try { plainName = await this.crypto.decrypt(typedP.encryptedDisplayName, this.encryptionKey); } 
              catch(e) {}
          }
          decParts[sid] = { ...typedP, displayName: plainName };
      }
      return decParts;
  }

  // --- OUTBOUND PROTOCOL ACTIONS ---

  private async createSecureLogBlob(event: string, detail: string, user: string): Promise<string> {
    if (!this.encryptionKey) return '';
    const logEntry = { timestamp: Date.now(), event, detail, user };
    return await this.crypto.encrypt(JSON.stringify(logEntry), this.encryptionKey);
  }

  public async logAction(event: string, detail: string, user: string) {
    const encryptedLogBlob = await this.createSecureLogBlob(event, detail, user);
    this.send('LOG_ACTION', { encryptedLogBlob });
  }

  public async uploadSignature(partialPsbtBase64: string, fingerprint: string, user: string) {
    if (!this.encryptionKey) return;
    const blindedFingerprint = await this.crypto.blindData(fingerprint, this.encryptionKey);
    const encryptedData = await this.crypto.encrypt(partialPsbtBase64, this.encryptionKey);
    const encryptedLogBlob = await this.createSecureLogBlob('Signature Uploaded', `Signer: ${fingerprint}`, user);
    
    // Cache locally so we don't have to wait for server roundtrip
    this.blindFingerprintMap.set(blindedFingerprint, fingerprint);
    this.blindFingerprintMap.set(fingerprint, fingerprint);

    this.send('UPLOAD_PARTIAL', { 
        fingerprint: blindedFingerprint,
        data: { encryptedData }, 
        encryptedLogBlob 
    });
  }

  public claimCoordinator(secureToken: string) {
    if (secureToken) this.send('AUTH', { token: secureToken.trim() });
  }

  public closeRoom() {
    this.send('CLOSE_ROOM');
  }

  public async gracefullyDisconnect(sessionId: string | null) {
    if (sessionId && this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
            const encryptedLogBlob = await this.createSecureLogBlob('User Left', `Session ID: ${sessionId}`, 'Guest');
            this.send('LOG_ACTION', { encryptedLogBlob });
        } catch (e) { console.error("Failed to send disconnect log"); }
    }
    setTimeout(() => this.disconnect(), 50);
  }

  public async renameRoom(newName: string, user: string) {
    if (!this.encryptionKey) return;
    const encryptedName = await this.crypto.encrypt(newName, this.encryptionKey);
    const encryptedLogBlob = await this.createSecureLogBlob('Room Renamed', `Renamed: ${newName}`, user);
    this.send('RENAME_ROOM', { encryptedName, encryptedLogBlob });
  }

  public async updateSignerLabel(fingerprint: string, label: string, user: string) {
    if (!this.encryptionKey) return;
    const safeLabel = label || '';
    const blindedFingerprint = await this.crypto.blindData(fingerprint, this.encryptionKey);
    const encryptedLabel = await this.crypto.encrypt(safeLabel, this.encryptionKey);
    const encryptedLogBlob = await this.createSecureLogBlob('Label Updated', `${safeLabel} (${fingerprint})`, user);
    
    this.blindFingerprintMap.set(blindedFingerprint, fingerprint);
    this.send('UPDATE_LABEL', { fingerprint: blindedFingerprint, label: encryptedLabel, encryptedLogBlob });
  }

  public async setDisplayName(name: string) {
    if (!this.encryptionKey) return;
    const safeName = name.trim().substring(0, 64);
    if (safeName) {
        const encryptedDisplayName = await this.crypto.encrypt(safeName, this.encryptionKey);
        this.send('SET_DISPLAY_NAME', { encryptedDisplayName });
    } else {
        this.send('SET_DISPLAY_NAME', { encryptedDisplayName: null });
    }
  }

  public async updateWhitelist(newList: string[], actionDetail: string, user: string) {
    if (!this.encryptionKey) return;
    const encryptedWhitelist = await this.crypto.encrypt(JSON.stringify(newList), this.encryptionKey);
    const encryptedLogBlob = await this.createSecureLogBlob('Whitelist Updated', actionDetail, user);
    this.send('UPDATE_WHITELIST', { encryptedWhitelist, encryptedLogBlob });
  }

  public async toggleLock(isLocked: boolean, user: string) {
    if (!this.encryptionKey) return;
    const actionDetail = isLocked ? 'Coordinator locked the room' : 'Coordinator unlocked the room';
    const encryptedLogBlob = await this.createSecureLogBlob('Room Locked', actionDetail, user);
    this.send('TOGGLE_LOCK', { isLocked, encryptedLogBlob });
  }

  public async broadcastFinalization(finalTxHex: string, finalTxId: string, user: string) {
    if (!this.encryptionKey) return;
    const encryptedFinalTxHex = await this.crypto.encrypt(finalTxHex, this.encryptionKey);
    const encryptedFinalTxId = await this.crypto.encrypt(finalTxId, this.encryptionKey);
    const encryptedLogBlob = await this.createSecureLogBlob('Tx Finalized', 'Signatures merged successfully', user);
    this.send('TX_FINALIZED', { encryptedFinalTxHex, encryptedFinalTxId, encryptedLogBlob });
  }
}