import { EncryptionEngine } from './crypto/encryption-engine';
import { RelayClient } from './relay/relay-client';
import { RoomStateStore, RoomState } from './relay/room-state-store';
import { RoomFactory, RoomCreationPayload } from './relay/room-factory';
import { RoomEvent, RoomEventType } from './events/room-event-bus';
import { RoomAuditor } from './bitcoin/room-auditor';
import { PsbtUtils, TxDetails } from './bitcoin/psbt-utils';
import { Observable, firstValueFrom } from 'rxjs';
import { jsPDF } from 'jspdf';

/**
 * Configuration schema for initializing the SigningRoom SDK client.
 */
export interface SigningRoomConfig {
  /** The base URL of the SigningRoom signaling API. */
  apiUrl: string;
  /** Optional version tag to ensure compatibility with backend protocol updates. */
  protocolVersion?: string;
}

/**
 * The primary entry point for the SigningRoom SDK.
 * Facilitates room orchestration, cryptographic key management, relay coordination,
 * and automated state synchronization across the collaborative lifecycle.
 */
export class SigningRoomClient {
  public readonly engine: EncryptionEngine;
  public readonly relay: RelayClient;
  public readonly store: RoomStateStore;

  private apiUrl: string;
  private protocolVersion: string;
  private _sessionId: string | null = null;
  private _role: 'admin' | 'guest' = 'guest';
  private _encryptionKey: string | null = null;

  /**
   * Initializes a new SigningRoom client.
   * @param config - The API configuration and optional protocol versioning.
   */
  constructor(config: SigningRoomConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.protocolVersion = config.protocolVersion || '1.0.0';

    this.engine = new EncryptionEngine();
    this.relay = new RelayClient(this.engine);
    this.store = new RoomStateStore(this.relay.events);

    this.relay.events.on('SESSION_CONNECTED').subscribe((e) => {
      this._sessionId = e.payload;
    });

    this.relay.events.on('ROLE_UPDATE').subscribe(async (e) => {
      const newRole = e.payload;
      if (this._role === 'guest' && newRole === 'admin') {
        await this.logParticipantAction(
          'Role Claimed Coordinator',
          `Session ID: ${this._sessionId} upgraded`,
          'Coordinator',
        );
      }
      this._role = newRole;
    });

    this.relay.events.on('NEW_PARTIAL_DECRYPTED').subscribe((e) => {
      const progress = this.getSignatureProgress();
      const threshold = this.getThreshold(this.getRoomState());

      this.relay.events.dispatch('SIGNATURE_RECEIVED', {
        fingerprint: e.payload?.fingerprint,
        signaturesReceived: progress.signaturesReceived,
        totalSigners: progress.totalSigners,
      });

      if (this.isThresholdMet()) {
        this.relay.events.dispatch('THRESHOLD_MET', {
          signaturesReceived: progress.signaturesReceived,
          threshold: threshold,
        });
      }
    });
  }

  /**
   * Returns a human-readable identifier for the current user's session and role.
   */
  public get userContext(): string {
    return this._role === 'admin' ? 'Coordinator' : `Guest (${this._sessionId || 'Unknown'})`;
  }

  /**
   * Provides an observable stream of room state changes for UI reactivity.
   */
  public onStateChange(): Observable<RoomEvent> {
    return this.relay.events.on('STATE_CHANGED');
  }

  /**
   * Subscribes to specific room events triggered by network operations.
   * * @param eventType - The specific event type to listen to (e.g., 'SIGNATURE_RECEIVED')
   * @returns An RxJS Observable yielding the target events.
   */
  public onEvent(eventType: RoomEventType): Observable<RoomEvent> {
    return this.relay.events.on(eventType);
  }

  /**
   * Retrieves the current, synchronized state of the room.
   */
  public getRoomState(): RoomState | null {
    return this.store.getState();
  }

  /**
   * Orchestrates the creation of a new collaborative cryptographic room.
   * @param psbtBase64 - The initial, unsigned PSBT string.
   * @param network - The target Bitcoin network (mainnet, testnet, or signet).
   * @param roomName - The display name for the room.
   * @returns The room's access credentials including the admin secret.
   */
  public async createRoom(
    psbtBase64: string,
    network: 'bitcoin' | 'testnet' | 'signet',
    roomName = 'Untitled Room',
  ) {
    const payload = await RoomFactory.prepareCreationPayload(
      this.engine,
      psbtBase64,
      network,
      roomName,
      this.protocolVersion,
    );

    this._encryptionKey = payload.localData.encryptionKey;

    const res = await fetch(`${this.apiUrl}/api/room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload.httpPayload),
    });

    if (!res.ok) throw new Error(`Failed to create room: ${await res.text()}`);

    return payload;
  }

  /**
   * Orchestrates the creation of a new collaborative cryptographic room and joins as coordinator.
   * @param psbtBase64 - The initial, unsigned PSBT string.
   * @param network - The target Bitcoin network (mainnet, testnet, or signet).
   * @param roomName - The display name for the room.
   * @returns The room's access credentials including the admin secret.
   */
  public async createRoomAndJoin(
    psbtBase64: string,
    network: 'bitcoin' | 'testnet' | 'signet',
    roomName = 'Untitled Room',
  ) {
    const payload: RoomCreationPayload = await this.createRoom(psbtBase64, network, roomName);

    const connectionEvent = firstValueFrom(this.relay.events.on('ROOM_CONNECTED'));
    const sessionEvent = firstValueFrom(this.relay.events.on('SESSION_CONNECTED'));

    const wsUrl = this.apiUrl.replace(/^http/, 'ws');
    this.store.init(payload.localData.roomId, this.protocolVersion);
    await this.relay.joinRoom(
      wsUrl,
      payload.localData.roomId,
      payload.localData.encryptionKey,
      this.protocolVersion,
    );

    await connectionEvent;
    await sessionEvent;

    await this.logParticipantAction('User Joined', `Session: ${this._sessionId}`);

    const roleEvent = firstValueFrom(this.relay.events.on('ROLE_UPDATE'));
    this.relay.claimCoordinator(payload.httpPayload.adminToken);
    await roleEvent;

    return {
      roomId: payload.localData.roomId,
      encryptionKey: payload.localData.encryptionKey,
      adminSecret: payload.localData.adminSecret,
      encryptedAdminToken: payload.httpPayload.adminToken,
    };
  }

  /**
   * Joins an existing room using its unique ID and encryption key.
   * @param roomId - Unique identifier for the room.
   * @param encryptionKey - The shared secret key for the room.
   */
  public async joinRoom(roomId: string, encryptionKey: string) {
    this._encryptionKey = encryptionKey;

    // Listen for BOTH events
    const connectionEvent = firstValueFrom(this.relay.events.on('ROOM_CONNECTED'));
    const sessionEvent = firstValueFrom(this.relay.events.on('SESSION_CONNECTED'));

    const wsUrl = this.apiUrl.replace(/^http/, 'ws');
    this.store.init(roomId, this.protocolVersion);

    await this.relay.joinRoom(wsUrl, roomId, encryptionKey, this.protocolVersion);

    // Await both events
    await connectionEvent;
    await sessionEvent;

    await this.logParticipantAction('User Joined', `Session: ${this._sessionId}`);
  }

  /** * Updates the display name of the room.
   * @param name - The new room name.
   */
  public async setRoomName(name: string) {
    const confirmation = this.waitForEvent('ROOM_RENAMED_DECRYPTED');
    await this.relay.renameRoom(name, this.userContext);
    await confirmation;
  }

  /** * Toggles the room's locked status to restrict participant access.
   * @param isLocked - Boolean toggle for room lock.
   */
  public async toggleLock(isLocked: boolean) {
    const confirmation = this.waitForEvent('LOCK_UPDATED');
    await this.relay.toggleLock(isLocked, this.userContext);
    await confirmation;
  }

  /** * Uploads a partial signature to the room for the specified hardware wallet.
   * @param psbtBase64 - The partial PSBT payload.
   * @param fingerprint - The hardware device's master key fingerprint.
   */
  public async uploadSignature(psbtBase64: string, fingerprint: string) {
    const confirmation = this.waitForEvent('NEW_PARTIAL_DECRYPTED');
    await this.relay.uploadSignature(psbtBase64, fingerprint, this.userContext);
    await confirmation;
  }

  /** * Records a secure audit trail event for the current room state.
   * @param action - Human-readable label of the action.
   * @param detail - Supplementary information about the action.
   * @param overrideRole - Optional role override for audit reporting.
   */
  public async logParticipantAction(action: string, detail: string, overrideRole?: string) {
    const roleContext = overrideRole || this.userContext;

    const blob = await this.relay.createSecureLogBlob(action, detail, roleContext);
    this.relay.send('LOG_ACTION', { encryptedLogBlob: blob });
  }

  /** * Updates the display name for the current participant session.
   * @param name - The new display name.
   */
  public async setDisplayName(name: string) {
    const confirmation = this.waitForEvent('PARTICIPANTS_DECRYPTED');
    await this.relay.setDisplayName(name);
    await this.logParticipantAction('Participant Identified', `Identified as '${name}'`);
    await confirmation;
  }

  /** * Assigns a human-readable label to a hardware device fingerprint.
   * @param fingerprint - The master key fingerprint.
   * @param label - The label to apply.
   */
  public async setSignerLabel(fingerprint: string, label: string) {
    const confirmation = this.waitForEvent('LABELS_DECRYPTED');
    await this.relay.updateSignerLabel(fingerprint, label, this.userContext);
    await confirmation;
  }

  /** * Closes the room session, ejecting all participants and wiping temporary relay state.
   * Only the Coordinator can execute this.
   */
  public async closeRoom() {
    const confirmation = this.waitForEvent('ROOM_CLOSED');
    this.relay.closeRoom();
    await confirmation;
  }

  /** * Generates a CSV-formatted export of the current audit trail.
   * @returns A CSV string containing the room's event history.
   */
  public getAuditLogCsv(): string {
    const state = this.getRoomState();
    if (!state) return '';
    return RoomAuditor.getAuditLogCsvData(state);
  }

  public getSettlementCsvData(): string {
    const state = this.getRoomState();
    const tx = this.getTxDetails(state);
    const signers = this.getSignersStatus(state);

    if (!state || !tx) return '';

    return RoomAuditor.getSettlementCsvData(state, tx, signers);
  }

  public async getAuditLogPdf(): Promise<{ doc: any; filename: string }> {
    const state = this.getRoomState();
    const tx = this.getTxDetails(state);
    const signers = this.getSignersStatus(state);
    const finalHex = this.getFinalTransactionHex();

    if (!state) throw new Error('No state available for audit report.');

    return await RoomAuditor.generateAuditPdf(new jsPDF(), state, tx, signers, finalHex);
  }

  /** * Updates the whitelist allowlist. Handles both single addresses and batches,
   * automatically formatting the audit log appropriately.
   * @param addresses - Array of addresses to add or remove.
   * @param remove - Toggle to either add (false) or remove (true) addresses.
   */
  public async updateWhitelist(addresses: string[], remove: boolean = false) {
    if (!addresses || addresses.length === 0) return;

    const state = this.getRoomState();
    const currentList = state?.whitelist || [];
    let newList: string[] = [];

    if (remove) {
      newList = currentList.filter((a) => !addresses.includes(a));
    } else {
      newList = Array.from(new Set([...currentList, ...addresses]));
    }

    // Prevent unnecessary network calls if the list didn't actually change
    if (currentList.length === newList.length) return;

    let detail = '';
    if (addresses.length === 1) {
      const address = addresses[0];
      const shortAddr = address.length > 5 ? address.slice(-5) : address;
      const actionWord = remove ? 'Removed' : 'Added';
      detail = `${actionWord} ...${shortAddr} to whitelist`;
    } else {
      const actionWord = remove ? 'Removed' : 'Verified';
      detail = `${actionWord} ${addresses.length} batch address(es)`;
    }

    const confirmation = this.waitForEvent('WHITELIST_DECRYPTED');
    await this.relay.updateWhitelist(newList, detail, this.userContext);
    await confirmation;
  }

  /**
   * Finalizes the PSBT, updates local state, and automatically broadcasts
   * the finalized transaction to the room so all participants sync.
   * Guarantees the forensic audit log is sealed before resolving.
   * @returns A Promise resolving to the finalized hex and transaction ID, or null if the PSBT is invalid.
   */
  public async finalizeTransaction(): Promise<{ hex: string; txId: string } | null> {
    const state = this.getRoomState();
    if (!state) return null;

    const result = PsbtUtils.finalizeTx(state.psbt);

    if (result) {
      this.store.update((s) => ({ ...s!, finalTxHex: result.hex, finalTxId: result.txId }));

      const confirmation = this.waitForState((s) =>
        s.auditLog.some((log) => log.event === 'Tx Finalized'),
      );

      await this.relay.broadcastFinalization(result.hex, result.txId, this.userContext);
      await confirmation;
    }

    return result;
  }

  /** * Returns the finalized transaction hex if the threshold has been reached.
   */
  public getFinalTransactionHex(): string | null {
    const state = this.store.getState();
    return state?.finalTxHex || null;
  }

  /** * Gracefully closes the connection to the relay server.
   */
  public disconnect() {
    this.relay.gracefullyDisconnect(null);
  }

  /**
   * Returns the current progress of the signing ceremony.
   * Extracts the total hardware signers from the PSBT script and compares to received signatures.
   * @returns Signature progress metrics.
   */
  public getSignatureProgress(): { totalSigners: number; signaturesReceived: number } {
    const state = this.getRoomState();
    if (!state || !state.psbt) return { totalSigners: 0, signaturesReceived: 0 };

    const analysis = PsbtUtils.analyze(state.psbt);

    return {
      totalSigners: analysis?.signerCount || 0,
      signaturesReceived: state.signatures.length,
    };
  }

  /**
   * Dynamically evaluates if the aggregated PSBT has met the required script threshold.
   * @returns True if the transaction can be finalized.
   */
  public isThresholdMet(): boolean {
    const state = this.getRoomState();
    if (!state || !state.psbt) return false;
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

  /** * Returns full parsed transaction details (Inputs, Outputs, Fees).
   */
  public getTransactionDetails() {
    const state = this.getRoomState();
    if (!state || !state.psbt) return null;
    return PsbtUtils.parseTxDetails(state.psbt, state.network);
  }

  /** Returns the list of outputs for the current PSBT. */
  public getOutputs() {
    return this.getTransactionDetails()?.outputs || [];
  }

  /** Returns the list of inputs for the current PSBT. */
  public getInputs() {
    return this.getTransactionDetails()?.inputsList || [];
  }

  /** Returns the calculated network fee for the current transaction in satoshis. */
  public getNetworkFee(): number {
    return this.getTransactionDetails()?.fee || 0;
  }

  /** * Returns a list of all required hardware fingerprints for this transaction,
   * and a boolean indicating if their signature has been provided yet.
   */
  public getSignersStatus(state: RoomState | null): any[] {
    if (!state || !state.psbt) return [];
    return PsbtUtils.extractSigners(state.psbt);
  }

  public getTxDetails(state: RoomState | null): TxDetails | null {
    return state?.psbt ? PsbtUtils.parseTxDetails(state.psbt, state.network) : null;
  }

  public getThreshold(state: RoomState | null): number {
    if (!state?.psbt) return 0;
    const threshold = PsbtUtils.getThreshold(state.psbt);
    return threshold > 0 ? threshold : this.getSignersStatus(state).length;
  }

  /**
   * Extracts the hardware fingerprint from a signed PSBT before uploading it to the room.
   * @param signedPsbtBase64 - The signed PSBT payload.
   */
  public extractFingerprintFromSignature(signedPsbtBase64: string): string | null {
    return PsbtUtils.getFingerprintFromPsbt(signedPsbtBase64);
  }

  /** * Internal helper to wait for a specific server response event before resolving.
   * @param eventType - The event key to listen for.
   */
  private waitForEvent(eventType: any): Promise<void> {
    return new Promise((resolve) => {
      const sub = this.relay.events.on(eventType).subscribe(() => {
        sub.unsubscribe();
        resolve();
      });
    });
  }

  /**
   * Pauses execution until the RoomState satisfies a provided condition.
   * Excellent for UI transitions and integration testing.
   * @param condition A function that evaluates the current RoomState.
   * @param timeoutMs Max time to wait before rejecting (default 10s).
   */
  public waitForState(condition: (state: RoomState) => boolean, timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const currentState = this.getRoomState();
      if (currentState && condition(currentState)) return resolve();

      const timer = setTimeout(() => {
        sub.unsubscribe();
        reject(new Error('waitForState condition timed out'));
      }, timeoutMs);

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
   * @param appBaseUrl The base URL of your web UI.
   * @param includeKey Whether to include the decryption key in the URL hash.
   */
  public getRoomLink(appBaseUrl: string, includeKey: boolean = false): string {
    const state = this.getRoomState();
    if (!state || !state.roomId) return '';

    let link = `${appBaseUrl.replace(/\/$/, '')}/room/${state.roomId}`;
    if (includeKey && this._encryptionKey) {
      link += `#${encodeURIComponent(this._encryptionKey)}`;
    }
    return link;
  }

  /**
   * Validates the forensic integrity of the room.
   * @param expectedAnchor The forensic anchor broadcasted at finalization.
   */
  public async verifyIntegrity(
    expectedAnchor: string,
  ): Promise<{ anchor: string; isValid: boolean }> {
    const state = this.getRoomState();
    if (!state) throw new Error('No room state available to verify.');
    return await RoomAuditor.verifyRoomIntegrity(state, expectedAnchor);
  }

  /**
   * Helper to derive the room's forensic anchor from the current state.
   */
  public async getForensicAnchor(): Promise<string> {
    const state = this.getRoomState();
    if (!state || !state.finalTxHex || !state.auditLog) {
      throw new Error('Cannot generate anchor: Room not finalized.');
    }
    return await RoomAuditor.calculateForensicAnchor(state.auditLog, state.finalTxHex);
  }

  /**
   * Retrieves a full cryptographic integrity report for the current room state.
   */
  public async getIntegrityReport() {
    const state = this.getRoomState();
    if (!state) throw new Error('No state');
    return await RoomAuditor.getIntegrityReport(state);
  }

  /**
   * Promotes the current session to Coordinator role using the admin secret.
   * This is used for session recovery after re-joining a room.
   */
  public async claimCoordinator(adminSecret: string): Promise<void> {
    if (this.store.getState() === null) {
      throw new Error('Must join room before claiming coordinator role.');
    }
    this.relay.send('AUTH', { token: adminSecret });

    await this.waitForState((state) => {
      if (!this._sessionId || !state.participants) return false;
      return state.participants[this._sessionId]?.role === 'admin';
    }, 15000);
  }

  public async parsePsbtFile(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Logic currently in your RoomComponent
    const isBinary =
      bytes[0] === 0x70 &&
      bytes[1] === 0x73 &&
      bytes[2] === 0x62 &&
      bytes[3] === 0x74 &&
      bytes[4] === 0xff;

    const content = isBinary
      ? Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      : new TextDecoder().decode(bytes).trim();

    if (content.startsWith('010000') || content.startsWith('020000')) {
      throw new Error('This looks like a Raw Transaction. Please export as PSBT from your wallet.');
    }

    return content;
  }

  public getErrorCategory(
    code: number,
  ): 'ROOM_FULL' | 'AUTH_FAILED' | 'PROTOCOL_MISMATCH' | 'UNKNOWN' {
    if (code === 4026) return 'PROTOCOL_MISMATCH';
    if (code === 4001) return 'ROOM_FULL';
    if (code === 1006) return 'AUTH_FAILED';
    return 'UNKNOWN';
  }
}
