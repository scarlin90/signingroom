import { EncryptionEngine } from './crypto/encryption-engine';
import { RelayClient } from './relay/relay-client';
import { RoomStateStore, RoomState } from './relay/room-state-store';
import { RoomFactory, RoomCreationPayload } from './relay/room-factory';
import { RoleConstraints, RoomEvent, RoomEventType } from './types/client-events';
import { AuditLogOptions, RoomAuditor } from './bitcoin/room-auditor';
import { PsbtUtils, TxDetails } from './bitcoin/psbt-utils';
import { Observable, firstValueFrom } from 'rxjs';
import { jsPDF } from 'jspdf';
import { LicenseEngine, STATELESS_RESEARCH_PUBKEY } from './licensing/verifier';
import { VerifiedLicense, LicenseAuditReport } from './licensing/types';
import { LicenseCodec, base64UrlToBytes } from './licensing/codec';

/**
 * Configuration schema for initializing the SigningRoom SDK client.
 */
export interface SigningRoomConfig {
  /** The base URL of the SigningRoom signaling API. */
  apiUrl: string;
  /** Optional version tag to ensure compatibility with backend protocol updates. */
  protocolVersion?: string;
  /** Optional signed Ed25519 binary license token. If omitted or invalid, defaults to Community Edition. */
  licenseToken?: string;

  host?: string;
}

/**
 * The primary entry point for the SigningRoom SDK.
 * Facilitates room orchestration, cryptographic key management, relay coordination,
 * automated state synchronization, and tamper-evident license enforcement.
 */
export class SigningRoomClient {
  public readonly engine: EncryptionEngine;
  public readonly relay: RelayClient;
  public readonly store: RoomStateStore;

  private apiUrl: string;
  private protocolVersion: string;
  private licenseToken?: string;
  private host?: string;
  private _license: VerifiedLicense | null = null;
  private _sessionId: string | null = null;
  private _role: 'admin' | 'guest' = 'guest';
  private _encryptionKey: string | null = null;
  private _roleToken: string | null = null;
  private _constraints: RoleConstraints | null = null;

  /**
   * Initializes a new SigningRoom client.
   * @param config - The API configuration, license token, and optional protocol versioning.
   */
  constructor(config: SigningRoomConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.protocolVersion = config.protocolVersion || '2.0.0';
    this.licenseToken = config.licenseToken;
    this.host = config.host;

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
   * Explicitly resolves and cryptographically validates the license token against the active domain.
   * Called during application bootstrap or lazily executed before room creation/joining.
   */
  public async init(): Promise<VerifiedLicense> {
    return await this.ensureLicense();
  }

  /**
   * Internal lazy resolver to guarantee verified licensing state before any network operation.
   */
  private async ensureLicense(): Promise<VerifiedLicense> {
    if (this._license) {
      return this._license;
    }

    const host =
      this.host ??
      (typeof window !== 'undefined' ? window.location.host : 'localhost');

    this._license = await LicenseEngine.resolve(this.licenseToken, host);
    return this._license;
  }

  /**
   * Retrieves the active license status. Falls back to room-level server-attested tier
   * if connecting as a guest without a local license token.
   */
  public get license(): VerifiedLicense | null {
    if (this._license && this._license.tier !== 'COMMUNITY') {
      return this._license;
    }

    const state = this.getRoomState();
    if (state && (state as any).tier) {
      const roomTier = (state as any).tier;
      return {
        tier: roomTier,
        isValid: roomTier !== 'COMMUNITY',
        payload: {
          tier: roomTier,
          licensee: (state as any).licensee || 'Signing Room Community Edition',
          domain: '*',
          issuedAt: 0,
          expiresAt: 0,
          features: {
            whiteLabel: roomTier !== 'COMMUNITY',
            auditWatermarkRemoved: roomTier !== 'COMMUNITY',
          },
        },
        rawToken: '',
      };
    }

    return this._license;
  }

  public setLicenseToken(token: string) {
    this.licenseToken = token;
    this._license = null;
  }

  /**
   * Retrieves the current role token actively authenticating this session.
   */
  public get currentRoleToken(): string | null {
    return this._roleToken;
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
   * @param eventType - The specific event type to listen to (e.g., 'SIGNATURE_RECEIVED')
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
   * Passes the optional signed Ed25519 license token to the server for edge attestation.
   * @param psbtBase64 - The initial, unsigned PSBT string.
   * @param network - The target Bitcoin network (mainnet, testnet, or signet).
   * @param roomName - The display name for the room.
   * @returns The room's access credentials and the default role token.
   */
  public async createRoom(
    psbtBase64: string,
    network: 'bitcoin' | 'testnet' | 'signet',
    roomName = 'Untitled Room',
  ) {
    await this.ensureLicense();

    const payload = await RoomFactory.prepareCreationPayload(
      this.engine, psbtBase64, network, roomName, this.protocolVersion,
    );

    this._encryptionKey = payload.localData.encryptionKey;
    const httpBody: any = { 
      ...payload.httpPayload,
    };

    const tokenToSend = this.licenseToken || this._license?.rawToken;
    if (tokenToSend && tokenToSend.startsWith('srl_')) {
      httpBody.licenseToken = tokenToSend;
    }

    const roleToken = crypto.randomUUID().replace(/-/g, '');
    const constraints: RoleConstraints = {
      tokenId: roleToken.substring(0, 8),
      canUploadSignature: true,
      canExportPsbt: true,
      canExportAudit: true,
      canViewDetails: true,
      canViewSigners: true,
      canShareSession: true,
    };

    const policyBlob = await this.engine.encrypt(JSON.stringify(constraints), this._encryptionKey);
    const tokenHash = await this.engine.sha256(roleToken);

    httpBody.roleTokens = {
      [tokenHash]: { canUpload: true, policyBlob },
    };

    const res = await fetch(`${this.apiUrl}/api/room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(httpBody),
    });

    if (!res.ok) throw new Error(`Failed to create room: ${await res.text()}`);

    return { payload, defaultRoleToken: roleToken };
  }

  /**
   * Orchestrates the creation of a new collaborative cryptographic room and joins as coordinator.
   * @param psbtBase64 - The initial, unsigned PSBT string.
   * @param network - The target Bitcoin network (mainnet, testnet, or signet).
   * @param roomName - The display name for the room.
   * @returns The room's access credentials including the admin secret and default role token.
   */
  public async createRoomAndJoin(
    psbtBase64: string,
    network: 'bitcoin' | 'testnet' | 'signet',
    roomName = 'Untitled Room',
  ) {
    await this.ensureLicense();
    const { payload, defaultRoleToken } = await this.createRoom(psbtBase64, network, roomName);

    const connectionEvent = firstValueFrom(this.relay.events.on('ROOM_CONNECTED'));
    const sessionEvent = firstValueFrom(this.relay.events.on('SESSION_CONNECTED'));
    const stateSyncEvent = firstValueFrom(this.relay.events.on('STATE_SYNC_DECRYPTED'));

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
    await stateSyncEvent;

    this._roleToken = defaultRoleToken;
    this._constraints = {
      canUploadSignature: true,
      canExportPsbt: true,
      canExportAudit: true,
      canViewDetails: true,
      canViewSigners: true,
      canShareSession: true,
    };

    const detailText = 'Allowed: Sign, PSBT, Audit, TxDetails, Signers, Share';
    await this.logParticipantAction('User Joined', detailText);

    const roleEvent = firstValueFrom(this.relay.events.on('ROLE_UPDATE'));
    this.relay.claimCoordinator(payload.httpPayload.adminToken);
    await roleEvent;

    return {
      roomId: payload.localData.roomId,
      encryptionKey: payload.localData.encryptionKey,
      adminSecret: payload.localData.adminSecret,
      encryptedAdminToken: payload.httpPayload.adminToken,
      defaultRoleToken,
    };
  }

  /**
   * Connects to an existing collaborative room and authenticates the session.
   * @param roomId - The public ID of the room.
   * @param encryptionKeyOrFragment - The base encryption key, OR a full URL fragment (e.g., '#key:role').
   * @param explicitRoleToken - (Optional) The specific role token. Use this for clean programmatic integration.
   */
  public async joinRoom(
    roomId: string,
    encryptionKeyOrFragment: string,
    explicitRoleToken?: string,
  ) {
    await this.ensureLicense();

    let fbek = encryptionKeyOrFragment;
    let roleToken = explicitRoleToken || null;

    if (!explicitRoleToken && encryptionKeyOrFragment.includes(':')) {
      const parsed = this.parseFragment(encryptionKeyOrFragment);
      fbek = parsed.fbek;
      roleToken = parsed.roleToken;
    } else {
      fbek = decodeURIComponent(fbek.replace(/^#/, '')).replace(/ /g, '+');
      if (roleToken) {
        roleToken = decodeURIComponent(roleToken).replace(/ /g, '+');
      }
    }

    this._encryptionKey = fbek;
    this._roleToken = roleToken;

    const connectionEvent = firstValueFrom(this.relay.events.on('ROOM_CONNECTED'));
    const sessionEvent = firstValueFrom(this.relay.events.on('SESSION_CONNECTED'));
    const stateSyncEvent = firstValueFrom(this.relay.events.on('STATE_SYNC_DECRYPTED'));

    const wsUrl = this.apiUrl.replace(/^http/, 'ws');
    this.store.init(roomId, this.protocolVersion);

    const isReconnecting = this._sessionId !== null;
    await this.relay.joinRoom(
      wsUrl, 
      roomId, 
      this._encryptionKey, 
      this.protocolVersion, 
      this._sessionId
    );

    await connectionEvent;
    await sessionEvent;
    await stateSyncEvent;

    let detailText = '';

    if (this._roleToken) {
      const constraintPromise = firstValueFrom(this.relay.events.on('CONSTRAINT_UPDATE' as any));
      
      this.relay.send('AUTH_ROLE', { token: this._roleToken });

      try {
        const cUpdate = await Promise.race([
          constraintPromise,
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Auth Timeout')), 5000))
        ]);

        const policyBlob = cUpdate.payload?.policyBlob || (typeof cUpdate.payload === 'string' ? cUpdate.payload : null);

        if (policyBlob) {
          const decryptedRole = await this.engine.decrypt(policyBlob, this._encryptionKey);
          const constraints: RoleConstraints = JSON.parse(decryptedRole);
          this._constraints = constraints;

          const allowed = [];
          if (constraints.canUploadSignature) allowed.push('Sign');
          if (constraints.canExportPsbt) allowed.push('PSBT');
          if (constraints.canExportAudit) allowed.push('Audit');
          if (constraints.canViewDetails) allowed.push('TxDetails');
          if (constraints.canViewSigners) allowed.push('Signers');
          if (constraints.canShareSession) allowed.push('Share');

          detailText = `Allowed: ${allowed.length > 0 ? allowed.join(', ') : 'None (Blind Read-Only)'}`;
        } 
      } catch (e) {
        console.error('[SDK] Failed to authenticate role token during join', e);
        detailText = 'Allowed: Unknown (Error/Revoked)';
      }
    } else {
      detailText = 'Legacy Guest Access';
    }

    const logAction = isReconnecting ? 'Session Reconnected' : 'User Joined';
    await this.logParticipantAction(logAction, detailText);
  }

  /**
   * Manually restores a session ID (useful for recovering identity across hard page reloads).
   * Must be called prior to joinRoom().
   * @param sessionId - The 4-character session ID to restore.
   */
  public restoreSessionId(sessionId: string) {
    this._sessionId = sessionId;
  }

  /**
   * Updates the display name of the room.
   * @param name - The new room name.
   */
  public async setRoomName(name: string) {
    const confirmation = this.waitForEvent('ROOM_RENAMED_DECRYPTED');
    await this.relay.renameRoom(name, this.userContext);
    await confirmation;
  }

  /**
   * Toggles the room's locked status to restrict participant access.
   * @param isLocked - Boolean toggle for room lock.
   */
  public async toggleLock(isLocked: boolean) {
    const confirmation = this.waitForEvent('LOCK_UPDATED');
    await this.relay.toggleLock(isLocked, this.userContext);
    await confirmation;
  }

  /**
   * Uploads a partial signature to the room for the specified hardware wallet.
   * @param psbtBase64 - The partial PSBT payload.
   * @param fingerprint - The hardware device's master key fingerprint.
   */
  public async uploadSignature(psbtBase64: string, fingerprint: string) {
    const confirmation = this.waitForEvent('NEW_PARTIAL_DECRYPTED');
    await this.relay.uploadSignature(psbtBase64, fingerprint, this.userContext);
    await confirmation;
  }

  /**
   * Records a secure audit trail event for the current room state.
   * @param action - Human-readable label of the action.
   * @param detail - Supplementary information about the action.
   * @param overrideRole - Optional role override for audit reporting.
   */
  public async logParticipantAction(action: string, detail: string, overrideRole?: string) {
    const roleContext = overrideRole || this.userContext;

    const blob = await this.relay.createSecureLogBlob(action, detail, roleContext);
    this.relay.send('LOG_ACTION', { encryptedLogBlob: blob });
  }

  /**
   * Updates the display name for the current participant session.
   * @param name - The new display name.
   */
  public async setDisplayName(name: string) {
    const confirmation = this.waitForEvent('PARTICIPANTS_DECRYPTED');
    await this.relay.setDisplayName(name);
    await this.logParticipantAction('Participant Identified', `Identified as '${name}'`);
    await confirmation;
  }

  /**
   * Assigns a human-readable label to a UTXO address.
   * @param address - The raw Bitcoin address.
   * @param label - The label to apply.
   */
  public async setAddressLabel(address: string, label: string) {
    const confirmation = this.waitForEvent('ADDRESS_LABELS_DECRYPTED');
    await this.relay.updateAddressLabel(address, label, this.userContext);
    await confirmation;
  }

  /**
   * Assigns a human-readable label to a hardware device fingerprint.
   * @param fingerprint - The master key fingerprint.
   * @param label - The label to apply.
   */
  public async setSignerLabel(fingerprint: string, label: string) {
    const confirmation = this.waitForEvent('LABELS_DECRYPTED');
    await this.relay.updateSignerLabel(fingerprint, label, this.userContext);
    await confirmation;
  }

  /**
   * Closes the room session, ejecting all participants and wiping temporary relay state.
   * Only the Coordinator can execute this.
   */
  public async closeRoom() {
    const confirmation = this.waitForEvent('ROOM_CLOSED');
    this.relay.closeRoom();
    await confirmation;
  }

  /**
   * Generates a CSV-formatted export of the current audit trail.
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

  public async getAuditLogPdf(options?: AuditLogOptions): Promise<{ doc: any; filename: string }> {
    const state = this.getRoomState();
    const tx = this.getTxDetails(state);
    const signers = this.getSignersStatus(state);
    const finalHex = this.getFinalTransactionHex();

    if (!state) throw new Error('No state available for audit report.');

    return await RoomAuditor.generateAuditPdf(
      new jsPDF(), 
      state, 
      tx, 
      signers, 
      finalHex, 
      {
        ...options,
        license: this.license,
      }
    );
  }

  /**
   * Updates the whitelist allowlist. Handles both single addresses and batches,
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

  /**
   * Returns the finalized transaction hex if the threshold has been reached.
   */
  public getFinalTransactionHex(): string | null {
    const state = this.store.getState();
    return state?.finalTxHex || null;
  }

  /**
   * Gracefully closes the connection to the relay server.
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

  /**
   * Returns full parsed transaction details (Inputs, Outputs, Fees).
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

  /**
   * Returns a list of all required hardware fingerprints for this transaction,
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

  /**
   * Internal helper to wait for a specific server response event before resolving.
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

  /**
   * Extracts the FBEK and optional role token from a URL hash.
   */
  public parseFragment(hash: string): { fbek: string; roleToken: string | null } {
    const cleanHash = hash.replace(/^#/, '');
    if (!cleanHash.includes(':')) {
      return {
        fbek: decodeURIComponent(cleanHash).replace(/ /g, '+'),
        roleToken: null,
      };
    }
    const [fbek, roleToken] = cleanHash.split(':');
    return {
      fbek: decodeURIComponent(fbek).replace(/ /g, '+'),
      roleToken: decodeURIComponent(roleToken).replace(/ /g, '+'),
    };
  }

  /**
   * Generates a sharing link for the room.
   * @param appBaseUrl The base URL of your web UI.
   * @param includeKey Whether to include the decryption key in the URL hash.
   * @param customRoleToken Optional restricted capability token.
   */
  public getRoomLink(
    appBaseUrl: string,
    includeKey: boolean = false,
    customRoleToken?: string,
  ): string {
    const state = this.getRoomState();
    if (!state || !state.roomId) return '';

    let link = `${appBaseUrl.replace(/\/$/, '')}/room/${state.roomId}`;
    if (includeKey && this._encryptionKey) {
      link += `#${encodeURIComponent(this._encryptionKey)}`;
      if (customRoleToken) {
        link += `:${encodeURIComponent(customRoleToken)}`;
      }
    }
    return link;
  }

  /**
   * Returns the current enforced constraints on this session.
   */
  public getConstraints(): RoleConstraints | null {
    return this._constraints;
  }

  /**
   * Generates a restricted, cryptographically secure role link and registers it with the relay.
   * @param flags The granular feature flags governing access.
   * @returns The raw encrypted base64 token to be appended to the URL fragment.
   */
  public async generateAndRegisterRole(flags: {
    canUploadSignature: boolean;
    canExportPsbt: boolean;
    canExportAudit: boolean;
    canViewDetails: boolean;
    canViewSigners: boolean;
    canShareSession: boolean;
  }): Promise<string> {
    if (!this._encryptionKey) throw new Error('Encryption key required to generate role links.');

    const roleToken = crypto.randomUUID().replace(/-/g, '');
    const tokenId = roleToken.substring(0, 8);
    const payload: RoleConstraints = { tokenId, ...flags };
    
    const policyBlob = await this.engine.encrypt(JSON.stringify(payload), this._encryptionKey);
    const tokenHash = await this.engine.sha256(roleToken);

    const confirmation = new Promise<void>((resolve, reject) => {
      const sub1 = this.relay.events.on('ROLE_REGISTERED_SUCCESS' as any).subscribe(() => {
        cleanup();
        resolve();
      });

      const sub2 = this.relay.events.on('ERROR').subscribe((e) => {
        cleanup();
        reject(new Error(e.payload?.message || 'Unauthorized'));
      });

      const cleanup = () => {
        sub1.unsubscribe();
        sub2.unsubscribe();
      };
    });

    this.relay.send('REGISTER_ROLE', { 
      tokenHash, 
      canUpload: flags.canUploadSignature,
      policyBlob 
    });

    await confirmation;

    const allowed = [];
    if (flags.canUploadSignature) allowed.push('Sign');
    if (flags.canExportPsbt) allowed.push('PSBT');
    if (flags.canExportAudit) allowed.push('Audit');
    if (flags.canViewDetails) allowed.push('TxDetails');
    if (flags.canViewSigners) allowed.push('Signers');
    if (flags.canShareSession) allowed.push('Share');

    const detailText =
      allowed.length > 0 ? `Allowed: ${allowed.join(', ')}` : 'Allowed: None (Blind Read-Only)';

    await this.logParticipantAction('Role Link Generated', detailText);

    return roleToken;
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

  /**
   * Validates the forensic integrity of a signing ceremony completely offline.
   * Allows independent auditors to verify the cryptographic seal using only
   * the exported artifacts (CSV and Hex), without joining the live room session.
   * 
   * @param auditLogCsv - The complete exported CSV audit log string.
   * @param finalTxHex - The finalized transaction hex.
   * @param expectedAnchor - The expected SHA-256 anchor to verify against.
   */
  public static async verifyOfflineIntegrity(
    auditLogCsv: string,
    finalTxHex: string,
    expectedAnchor: string,
  ): Promise<{ anchor: string; isValid: boolean }> {
    return await RoomAuditor.verifyOfflineIntegrity(auditLogCsv, finalTxHex, expectedAnchor);
  }

  /**
   * Helper utility to extract an embedded license token from a CSV audit log.
   * @param auditLogCsv - The CSV string exported from a room.
   */
  public static extractLicenseTokenFromCsv(auditLogCsv: string): string | null {
    return RoomAuditor.extractLicenseTokenFromCsv(auditLogCsv);
  }

  /**
   * Cryptographically verifies an audit trail's license token offline.
   * Enables auditors to independently assert licensing validity and institutional provenance.
   * 
   * @param token - The raw 'srl_...' token string extracted from the audit record header.
   * @param ceremonyTimestamp - Optional timestamp of the ceremony to verify validity at time of signing.
   */
  public static async verifyAuditLicense(
    token: string, 
    ceremonyTimestamp?: number
  ): Promise<LicenseAuditReport> {
    if (!token || !token.startsWith('srl_')) {
      return {
        isValid: false,
        tier: 'COMMUNITY',
        licensee: 'Uncertified Community Deployment',
        domain: '*',
        issuedAt: null,
        expiresAt: null,
        isExpired: false,
        tamperEvidentError: 'Missing or malformed license token.',
      };
    }

    const unpacked = LicenseCodec.unpack(token);
    if (!unpacked) {
      return {
        isValid: false,
        tier: 'COMMUNITY',
        licensee: 'Invalid Token',
        domain: '*',
        issuedAt: null,
        expiresAt: null,
        isExpired: false,
        tamperEvidentError: 'Token binary structure corrupted.',
      };
    }

    const isChecksumValid = await LicenseCodec.verifyChecksum(unpacked.checksum, unpacked.payloadBytes);
    if (!isChecksumValid) {
      return {
        isValid: false,
        tier: 'COMMUNITY',
        licensee: unpacked.payload.licensee,
        domain: unpacked.payload.domain,
        issuedAt: new Date(unpacked.payload.issuedAt),
        expiresAt: unpacked.payload.expiresAt ? new Date(unpacked.payload.expiresAt) : null,
        isExpired: false,
        tamperEvidentError: 'Checksum mismatch: Token payload has been modified.',
      };
    }

    // Verify Ed25519 signature against Stateless Research public key
    const cryptoApi = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
    const keyBytes = base64UrlToBytes(STATELESS_RESEARCH_PUBKEY);
    const pubKey = await cryptoApi.subtle.importKey(
      'spki',
      keyBytes,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );

    const isSignatureValid = await cryptoApi.subtle.verify(
      'Ed25519',
      pubKey,
      unpacked.signature,
      unpacked.payloadBytes,
    );

    if (!isSignatureValid) {
      return {
        isValid: false,
        tier: 'COMMUNITY',
        licensee: unpacked.payload.licensee,
        domain: unpacked.payload.domain,
        issuedAt: new Date(unpacked.payload.issuedAt),
        expiresAt: unpacked.payload.expiresAt ? new Date(unpacked.payload.expiresAt) : null,
        isExpired: false,
        tamperEvidentError: 'Cryptographic signature invalid. Not minted by Stateless Research Ltd.',
      };
    }

    const checkTime = ceremonyTimestamp || Date.now();
    const isExpired = unpacked.payload.expiresAt !== 0 && checkTime > unpacked.payload.expiresAt;

    return {
      isValid: !isExpired,
      tier: unpacked.payload.tier,
      licensee: unpacked.payload.licensee,
      domain: unpacked.payload.domain,
      issuedAt: new Date(unpacked.payload.issuedAt),
      expiresAt: unpacked.payload.expiresAt ? new Date(unpacked.payload.expiresAt) : null,
      isExpired,
      tamperEvidentError: isExpired ? `Token was expired at execution time (${new Date(checkTime).toISOString()}).` : undefined,
    };
  }

  /**
   * Convenience method to extract and cryptographically verify the license 
   * directly from a raw CSV audit log string in a single step.
   * 
   * @param auditLogCsv - The raw CSV string exported from a room.
   * @param ceremonyTimestamp - Optional timestamp to verify validity at time of signing.
   */
  public static async verifyLicenseFromCsv(
    auditLogCsv: string, 
    ceremonyTimestamp?: number
  ): Promise<LicenseAuditReport> {
    const token = this.extractLicenseTokenFromCsv(auditLogCsv);
    
    if (!token) {
      return {
        isValid: false,
        tier: 'COMMUNITY',
        licensee: 'Uncertified Community Deployment',
        domain: '*',
        issuedAt: null,
        expiresAt: null,
        isExpired: false,
        tamperEvidentError: 'No License-Token header found in the provided CSV.',
      };
    }

    return await this.verifyAuditLicense(token, ceremonyTimestamp);
  }

  /**
   * Synchronously decodes a license token to inspect its contents 
   * without performing cryptographic signature validation.
   * 
   * @param token - The raw 'srl_...' token string.
   */
  public static inspectLicenseToken(token: string): Partial<LicenseAuditReport> | null {
    if (!token || !token.startsWith('srl_')) return null;

    const unpacked = LicenseCodec.unpack(token);
    if (!unpacked) return null;

    return {
      tier: unpacked.payload.tier,
      licensee: unpacked.payload.licensee,
      domain: unpacked.payload.domain,
      issuedAt: new Date(unpacked.payload.issuedAt),
      expiresAt: unpacked.payload.expiresAt ? new Date(unpacked.payload.expiresAt) : null,
      isExpired: unpacked.payload.expiresAt !== 0 && Date.now() > unpacked.payload.expiresAt,
    };
  }
}