import { EncryptionEngine } from './crypto/encryption-engine';
import { RelayClient } from './relay/relay-client';
import { RoomStateStore, RoomState } from './relay/room-state-store';
import { RoomFactory } from './relay/room-factory';
import { RoomEventBus, RoomEvent } from './events/room-event-bus';
import { RoomAuditor } from './bitcoin/room-auditor';
import { PsbtUtils } from './bitcoin/psbt-utils';
import { Observable } from 'rxjs';

export interface SigningRoomConfig {
  apiUrl: string;
  protocolVersion?: string;
}

export class SigningRoomClient {
  public readonly engine: EncryptionEngine;
  public readonly relay: RelayClient;
  public readonly store: RoomStateStore;
  
  private apiUrl: string;
  private protocolVersion: string;
  private _sessionId: string | null = null;
  private _role = 'guest';

  constructor(config: SigningRoomConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.protocolVersion = config.protocolVersion || '1.0.0';
    
    this.engine = new EncryptionEngine();
    this.relay = new RelayClient(this.engine);
    this.store = new RoomStateStore(this.relay.events);

    // Listen for the session ID assignment from the relay
    this.relay.events.on('SESSION_CONNECTED').subscribe(e => {
        this._sessionId = e.payload;
    });
    
    // Listen for role elevation (admin/guest)
    this.relay.events.on('ROLE_UPDATE').subscribe(e => {
        this._role = e.payload;
    });
  }

  public get userContext(): string {
      return this._role === 'admin' ? 'Coordinator' : `Guest (${this._sessionId || 'Unknown'})`;
  }

  public onStateChange(): Observable<RoomEvent> {
    return this.relay.events.on('STATE_CHANGED');
  }

  // --- STATE ACCESS ---
  public getRoomState(): RoomState | null {
    return this.store.getState();
  }

  // --- ROOM LIFECYCLE ---
  public async createRoom(psbtBase64: string, network: 'bitcoin' | 'testnet' | 'signet', roomName = 'Untitled Room') {
    const payload = await RoomFactory.prepareCreationPayload(
      this.engine, psbtBase64, network, roomName, this.protocolVersion
    );

    const res = await fetch(`${this.apiUrl}/api/room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload.httpPayload)
    });

    if (!res.ok) throw new Error(`Failed to create room: ${await res.text()}`);

    // Create a promise that resolves when the ROOM_CONNECTED event fires
    const connectionPromise = new Promise<void>((resolve) => {
        const sub = this.relay.events.on('ROOM_CONNECTED').subscribe(() => {
            sub.unsubscribe(); 
            resolve();
        });
    });

    const wsUrl = this.apiUrl.replace(/^http/, 'ws');
    this.store.init(payload.localData.roomId, this.protocolVersion);
    await this.relay.joinRoom(wsUrl, payload.localData.roomId, payload.localData.encryptionKey, this.protocolVersion);

    // Wait for the websocket to confirm connection
    await connectionPromise;

    // NOW it is safe to send the auth token
    this.relay.claimCoordinator(payload.httpPayload.adminToken);

    return {
      roomId: payload.localData.roomId,
      encryptionKey: payload.localData.encryptionKey,
      adminSecret: payload.localData.adminSecret
    };
  }

  public async joinRoom(roomId: string, encryptionKey: string) {
    const wsUrl = this.apiUrl.replace(/^http/, 'ws');
    this.store.init(roomId, this.protocolVersion);
    await this.relay.joinRoom(wsUrl, roomId, encryptionKey, this.protocolVersion);
  }

  /** Update the room name (e.g., "Q1 Settlement") */
  public async setRoomName(name: string) {
    await this.relay.renameRoom(name, this.userContext);
  }

  public async toggleLock(isLocked: boolean) {
    await this.relay.toggleLock(isLocked, this.userContext);
  }

  public async uploadSignature(psbtBase64: string, fingerprint: string) {
    await this.relay.uploadSignature(psbtBase64, fingerprint, this.userContext);
  }

  // --- IDENTITY & LABELLING ---

  public async logParticipantAction(action: string, detail: string) {
      const blob = await this.relay.createSecureLogBlob(action, detail, this.userContext);
      this.relay['send']('LOG_ACTION', { encryptedLogBlob: blob });
  }
  
  /** Updates the display name for the current participant session */
  public async setDisplayName(name: string) {
    await this.relay.setDisplayName(name);
    await this.logParticipantAction('Participant Identified', `Identified as '${name}'`);
  }

/** Labels a specific hardware device/fingerprint (e.g., "Alice's Coldcard") */
public async setSignerLabel(fingerprint: string, label: string) {
    await this.relay.updateSignerLabel(fingerprint, label, this.userContext);
}

  /** Coordinator: Close the room and securely destroy session */
  public async closeRoom(userDisplayName = 'Coordinator') {
    const blob = await this.relay.createSecureLogBlob('Room Closed', 'Manual teardown initiated', userDisplayName);
    this.relay['send']('CLOSE_ROOM', { encryptedLogBlob: blob });
  }

  // --- AUDIT & COMPLIANCE ---
  public getAuditLogCsv(): string {
    const state = this.getRoomState();
    if (!state) return '';
    return RoomAuditor.getAuditLogCsvData(state);
  }

  // --- GOVERNANCE & SECURITY ---

  /** Coordinator: Restrict transactions to specific addresses */
  public async updateWhitelist(addresses: string[], detail: string) {
    await this.relay.updateWhitelist(addresses, detail, this.userContext);
  }

  // --- FINALIZATION ---

  /**
   * Finalizes the PSBT and returns the broadcast-ready hex.
   * This should be called by the Coordinator once the threshold is met.
   */
  public finalizeTransaction(): { hex: string, txId: string } | null {
    const state = this.store.getState();
    if (!state) return null;

    // Use your existing PsbtUtils logic
    const result = PsbtUtils.finalizeTx(state.psbt);
    
    if (result) {
        this.store.update(s => ({ ...s!, finalTxHex: result.hex, finalTxId: result.txId }));
    }
    
    return result;
  }

  /** Returns the finalized transaction hex if the threshold has been reached */
  public getFinalTransactionHex(): string | null {
    const state = this.store.getState();
    return state?.finalTxHex || null;
  }

  public disconnect() {
    this.relay.gracefullyDisconnect(null);
  }
}