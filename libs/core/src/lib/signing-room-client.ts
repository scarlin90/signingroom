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
  private _encryptionKey: string | null = null;

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
    this.relay.events.on('ROLE_UPDATE').subscribe(async (e) => {
        const newRole = e.payload;
        
        // Announce Role Claimed if transitioning from guest to admin
        if (this._role === 'guest' && newRole === 'admin') {
            await this.logParticipantAction(
                'Role Claimed Coordinator', 
                `Session ID: ${this._sessionId} upgraded`,
                'Coordinator'
            );
        }
        
        this._role = newRole;
    });
  }

  public get userContext(): string {
      if (this._role === 'admin') return 'Coordinator';
      return `Guest (${this._sessionId || 'Unknown'})`;
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

    this._encryptionKey = payload.localData.encryptionKey;

    const res = await fetch(`${this.apiUrl}/api/room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload.httpPayload)
    });

    if (!res.ok) throw new Error(`Failed to create room: ${await res.text()}`);

    // Wait for the WS Handshake
    const connectionPromise = new Promise<void>((resolve) => {
        const sub = this.relay.events.on('ROOM_CONNECTED').subscribe(() => {
            sub.unsubscribe();
            resolve();
        });
    });

    // Wait for Role Escalation
    const rolePromise = new Promise<void>((resolve) => {
        const sub = this.relay.events.on('ROLE_UPDATE').subscribe(() => {
            sub.unsubscribe();
            resolve();
        });
    });

    const wsUrl = this.apiUrl.replace(/^http/, 'ws');
    this.store.init(payload.localData.roomId, this.protocolVersion);
    await this.relay.joinRoom(wsUrl, payload.localData.roomId, payload.localData.encryptionKey, this.protocolVersion);

    await connectionPromise;
    this.relay.claimCoordinator(payload.httpPayload.adminToken);
    await rolePromise;

    await this.logParticipantAction('User Joined', `Session: ${this._sessionId}`);

    return {
      roomId: payload.localData.roomId,
      encryptionKey: payload.localData.encryptionKey,
      adminSecret: payload.localData.adminSecret,
      encryptedAdminToken: payload.httpPayload.adminToken
    };
  }

  public async joinRoom(roomId: string, encryptionKey: string) {
    this._encryptionKey = encryptionKey;
    const connectionPromise = new Promise<void>((resolve) => {
        const sub = this.relay.events.on('ROOM_CONNECTED').subscribe(() => {
            sub.unsubscribe();
            resolve();
        });
    });

    const wsUrl = this.apiUrl.replace(/^http/, 'ws');
    this.store.init(roomId, this.protocolVersion);
    await this.relay.joinRoom(wsUrl, roomId, encryptionKey, this.protocolVersion);
    
    await connectionPromise;
    
    // Wait a tiny tick to ensure the worker's SESSION_CONNECTED payload was processed
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await this.logParticipantAction('User Joined', `Session: ${this._sessionId}`);
  }

  /** Update the room name (e.g., "Q1 Settlement") */
  public async setRoomName(name: string) {
    const confirmation = this.waitForEvent('ROOM_RENAMED_DECRYPTED');
    await this.relay.renameRoom(name, this.userContext);
    await confirmation;
  }

  public async toggleLock(isLocked: boolean) {
    const confirmation = this.waitForEvent('LOCK_UPDATED');
    await this.relay.toggleLock(isLocked, this.userContext);
    await confirmation;
  }

  public async uploadSignature(psbtBase64: string, fingerprint: string) {
    const confirmation = this.waitForEvent('NEW_PARTIAL_DECRYPTED');
    await this.relay.uploadSignature(psbtBase64, fingerprint, this.userContext);
    await confirmation;
  }

  // --- IDENTITY & LABELLING ---

  public async logParticipantAction(action: string, detail: string, overrideRole?: string) {
      const roleContext = overrideRole || (this._role === 'admin' ? 'Coordinator' : `Guest (${this._sessionId})`);
      
      const blob = await this.relay.createSecureLogBlob(action, detail, roleContext);
      this.relay.send('LOG_ACTION', { encryptedLogBlob: blob });
  }
  
  /** Updates the display name for the current participant session */
  public async setDisplayName(name: string) {
    const confirmation = this.waitForEvent('PARTICIPANTS_DECRYPTED');
    await this.relay.setDisplayName(name);
    await this.logParticipantAction('Participant Identified', `Identified as '${name}'`);
    await confirmation;
  }

/** Labels a specific hardware device/fingerprint (e.g., "Alice's Coldcard") */
public async setSignerLabel(fingerprint: string, label: string) {
    const confirmation = this.waitForEvent('LABELS_DECRYPTED');
    await this.relay.updateSignerLabel(fingerprint, label, this.userContext);
    await confirmation;
  }

  /** * Destroys the room on the server and ejects all participants.
   * Only the Coordinator can execute this.
   */
  public async closeRoom() {
      const confirmation = this.waitForEvent('ROOM_CLOSED');
      
      this.relay.closeRoom();
      
      await confirmation;
  }

  // --- AUDIT & COMPLIANCE ---
  public getAuditLogCsv(): string {
    const state = this.getRoomState();
    if (!state) return '';
    return RoomAuditor.getAuditLogCsvData(state);
  }

  // --- GOVERNANCE & SECURITY ---

  /** Coordinator: Restrict transactions to specific addresses */
  public async addWhitelistAddress(address: string) {
    const state = this.getRoomState();
    const currentList = state?.whitelist || [];
    if (currentList.includes(address)) return;
    
    const newList = [...currentList, address];
    const shortAddr = address.length > 10 ? `...${address.slice(-5)}` : address;
    
    const confirmation = this.waitForEvent('WHITELIST_DECRYPTED');
    await this.relay.updateWhitelist(newList, `Added ${shortAddr} to whitelist`, this.userContext);
    await confirmation;
  }

  public async updateWhitelistBatch(addresses: string[], remove: boolean = false) {
    const state = this.getRoomState();
    const currentList = state?.whitelist || [];
    let newList: string[] = [];

    if (remove) {
        newList = currentList.filter(a => !addresses.includes(a));
    } else {
        newList = Array.from(new Set([...currentList, ...addresses])); 
    }

    const actionWord = remove ? 'Removed' : 'Verified';
    const detail = `${actionWord} ${addresses.length} batch address(es)`;
    
    const confirmation = this.waitForEvent('WHITELIST_DECRYPTED');
    await this.relay.updateWhitelist(newList, detail, this.userContext);
    await confirmation;
  }

  // --- FINALIZATION ---

  /**
   * Finalizes the PSBT, updates local state, and automatically broadcasts 
   * the finalized transaction to the room so all participants sync.
   * Guarantees the forensic audit log is sealed before resolving.
   */
  public async finalizeTransaction(): Promise<{ hex: string, txId: string } | null> {
    const state = this.getRoomState();
    if (!state) return null;

    // Calculate locally
    const result = PsbtUtils.finalizeTx(state.psbt);
    
    if (result) {
        // Update local state immediately for snappy UI
        this.store.update(s => ({ ...s!, finalTxHex: result.hex, finalTxId: result.txId }));
        
        //  Wait for the server to confirm the Log Entry has been appended
        const confirmation = this.waitForState(s => 
            s.auditLog.some(log => log.event === 'Tx Finalized')
        );
        
        // Broadcast to network
        await this.relay.broadcastFinalization(result.hex, result.txId, this.userContext);
        
        // Block until the log is confirmed
        await confirmation;
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

  // --- PSBT & THRESHOLD TRACKING ---

  /**
   * Returns the current progress of the signing ceremony.
   * Extracts the total hardware signers from the PSBT script and compares to received signatures.
   */
  public getSignatureProgress(): { totalSigners: number, signaturesReceived: number } {
    const state = this.getRoomState();
    if (!state || !state.psbt) return { totalSigners: 0, signaturesReceived: 0 };
    
    // Use PsbtUtils to extract the total number of physical keys in the quorum
    const analysis = PsbtUtils.analyze(state.psbt);
    
    return {
        totalSigners: analysis?.signerCount || 0,
        signaturesReceived: state.signatures.length
    };
  }

  /**
   * Dynamically evaluates if the aggregated PSBT has met the required script threshold (e.g. 2-of-2, 3-of-5).
   */
  public isThresholdMet(): boolean {
    const state = this.getRoomState();
    if (!state || !state.psbt) return false;
    
    // If PsbtUtils can successfully extract a final hex without throwing an error, 
    // it mathematically guarantees the signature threshold has been met!
    return PsbtUtils.finalizeTx(state.psbt) !== null;
  }

  /**
   * Calculates how many signatures are still required to finalize the transaction.
   * @param threshold The mathematical threshold of the script (e.g., 3 for a 3-of-5).
   * @returns The number of remaining signatures needed (minimum 0).
   */
  public getSignaturesRemaining(threshold: number): number {
    const state = this.getRoomState();
    if (!state) return threshold;
    
    const remaining = threshold - state.signatures.length;
    return Math.max(0, remaining);
  }

  // --- TRANSACTION PARSING (DX HELPERS) ---

  /** Returns full parsed transaction details (Inputs, Outputs, Fees) */
  public getTransactionDetails() {
    const state = this.getRoomState();
    if (!state || !state.psbt) return null;
    
    // The facade automatically knows the network from the room state!
    return PsbtUtils.parseTxDetails(state.psbt, state.network); 
  }

  public getOutputs() {
    return this.getTransactionDetails()?.outputs || [];
  }

  public getInputs() {
    return this.getTransactionDetails()?.inputsList || [];
  }

  public getNetworkFee(): number {
    return this.getTransactionDetails()?.fee || 0;
  }

  // --- SIGNER & HARDWARE (DX HELPERS) ---

  /** * Returns a list of all required hardware fingerprints for this transaction,
   * and a boolean indicating if their signature has been provided yet.
   */
  public getSignersStatus() {
    const state = this.getRoomState();
    if (!state || !state.psbt) return [];
    
    return PsbtUtils.extractSigners(state.psbt);
  }

  /**
   * Utility for integrators: Pass a newly signed PSBT file to this method
   * to extract the hardware fingerprint *before* uploading it to the room.
   */
  public extractFingerprintFromSignature(signedPsbtBase64: string): string | null {
    return PsbtUtils.getFingerprintFromPsbt(signedPsbtBase64);
  }

  /** Helper to wait for a specific server response event before resolving */
  private waitForEvent(eventType: any): Promise<void> {
    return new Promise((resolve) => {
        const sub = this.relay.events.on(eventType).subscribe(() => {
            sub.unsubscribe();
            resolve();
        });
    });
  }

  // --- STATE SYNCHRONIZATION HELPERS ---

  /**
   * Pauses execution until the RoomState satisfies a provided condition.
   * Excellent for UI transitions and integration testing.
   * * @param condition A function that evaluates the current RoomState
   * @param timeoutMs Max time to wait before rejecting (default 10s)
   */
  public waitForState(condition: (state: RoomState) => boolean, timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
        // 1. Check if the condition is already met
        const currentState = this.getRoomState();
        if (currentState && condition(currentState)) {
            return resolve();
        }

        // 2. Set a timeout so it doesn't hang forever
        const timer = setTimeout(() => {
            sub.unsubscribe();
            reject(new Error('waitForState condition timed out'));
        }, timeoutMs);

        // 3. Listen to the reactive state stream
        const sub = this.onStateChange().subscribe(() => {
            const state = this.getRoomState();
            if (state && condition(state)) {
                clearTimeout(timer);
                sub.unsubscribe();
                resolve();
            }
        });
    });
  }

  /** * Generates a sharing link for the room.
   * @param appBaseUrl The base URL of your web UI (e.g., 'http://localhost:4200' or 'https://myapp.com')
   * @param includeKey Whether to include the decryption key in the URL hash (default: false)
   */
  public getRoomLink(appBaseUrl: string, includeKey: boolean = false): string | null {
      const state = this.getRoomState();
      if (!state || !state.roomId) return null;
      
      let link = `${appBaseUrl.replace(/\/$/, '')}/room/${state.roomId}`;
      if (includeKey && this._encryptionKey) {
          // Angular expects the hash format: #key=...
          link += `#${encodeURIComponent(this._encryptionKey)}`;
      }
      return link;
  }

  /**
     * Validates the forensic integrity of the room.
     * @param expectedAnchor The forensic anchor broadcasted at finalization.
     */
    public async verifyIntegrity(expectedAnchor: string): Promise<{ anchor: string, isValid: boolean }> {
        const state = this.getRoomState();
        if (!state) throw new Error("No room state available to verify.");
        
        return await RoomAuditor.verifyRoomIntegrity(state, expectedAnchor);
    }

    /**
   * Helper to derive the room's forensic anchor from the current state.
   */
  public async getForensicAnchor(): Promise<string> {
      const state = this.getRoomState();
      if (!state || !state.finalTxHex || !state.auditLog) {
          throw new Error("Cannot generate anchor: Room not finalized.");
      }
      return await RoomAuditor.calculateForensicAnchor(state.auditLog, state.finalTxHex);
  }

  public async getIntegrityReport() {
        const state = this.getRoomState();
        if (!state) throw new Error("No state");
        return await RoomAuditor.getIntegrityReport(state);
    }

    /**
   * Promotes the current session to Coordinator role using the admin secret.
   * This is used for session recovery after re-joining a room.
   */
  public async claimCoordinator(adminSecret: string): Promise<void> {
      if (this.store.getState() === null) {
          throw new Error("Must join room before claiming coordinator role.");
      }

      // Send the AUTH message
      this.relay.send('AUTH', { token: adminSecret });

      // wait for the state role to update
      await this.waitForState(state => {
          if (!this._sessionId || !state.participants) return false;
          return state.participants[this._sessionId]?.role === 'admin';
      }, 15000);
  }
}