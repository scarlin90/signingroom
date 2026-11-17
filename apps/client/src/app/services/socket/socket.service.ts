/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Injectable, Inject, PLATFORM_ID, signal, computed, effect } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  SigningRoomClient,
  RoomState,
  PsbtUtils,
  RelayClient,
  RoomStateStore,
  EncryptionEngine,
  AuditLogOptions,
  RoleConstraints,
} from '@signing-room/sdk';
import { SDKClientFactoryService } from '../sdk-client-factory/sdk-client-factory.service';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SocketService {
  public sdk: SigningRoomClient;
  private store: RoomStateStore;
  private relay: RelayClient;
  private encryptionEngine: EncryptionEngine;

  private hasAnnouncedJoin = false;
  private hasSyncedLocalAddressBook = false;
  public securityAlert$ = new Subject<{ type: 'access_denied'; count: number }>();
  private fallbackVersion: string | null = null;
  private failedKeyAttempts = 0;
  private encryptionKey: string | null = null;
  private readonly ADDRESS_BOOK_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 Day

  public isBrowser: boolean;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private sdkFactory: SDKClientFactoryService,
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);

    this.sdk = this.sdkFactory.create();
    this.relay = this.sdk.relay;
    this.store = this.sdk.store;
    this.encryptionEngine = this.sdk.engine;
    this.purgeExpiredAddressBook();
    this.registerEventlisteners();
  }

  registerEventlisteners() {
    this.sdk.onStateChange().subscribe((state) => {
      this.roomState.set(this.sdk.getRoomState());
    });

    this.relay.events.on('ROOM_CONNECTED').subscribe(() => {
      this.status.set('connected');
    });

    this.relay.events.on('SESSION_CONNECTED').subscribe((e) => {
      this.currentSessionId.set(e.payload);

      const roomId = this.roomState()?.roomId;
      const resumeToken = this.sdk.getResumeToken();
      if (roomId && this.isBrowser) {
        sessionStorage.setItem(`session_id_${roomId}`, e.payload);
        if (resumeToken) {
          sessionStorage.setItem(`resume_token_${roomId}`, resumeToken);
        }
      }
    });

    this.relay.events
      .on('SESSION_CONNECTED')
      .subscribe((e) => this.currentSessionId.set(e.payload));

    this.relay.events.on('ROOM_DISCONNECTED').subscribe((event) => {
      this.status.set('disconnected');

      if (!this.isClosed()) {
        setTimeout(() => {
          const hasTerminalError =
            this.roomNotFound() ||
            this.isLockedOut() ||
            this.isRoomFull() ||
            this.decryptionError() !== null;

          if (this.status() === 'disconnected' && !hasTerminalError) {
            this.connect(this.roomState()?.roomId || '', this.getCurrentFragment());
          }
        }, 3000);
      }
    });

    this.relay.events.on('LABELS_DECRYPTED').subscribe((e) => {
      this.store.update((s) => (s ? { ...s, signerLabels: e.payload } : null));
    });

    this.relay.events.on('ADDRESS_LABELS_DECRYPTED' as any).subscribe((e) => {
      this.store.update((s) => (s ? { ...s, addressLabels: e.payload } : null));
    });

    this.relay.events.on('ROOM_RENAMED_DECRYPTED').subscribe((e) => {
      this.store.update((s) => (s ? { ...s, roomName: e.payload } : null));
    });

    this.relay.events.on('LOG_UPDATE_DECRYPTED').subscribe((e) => {
      this.store.update((s) => (s ? { ...s, auditLog: e.payload } : null));
    });

    this.relay.events.on('CONNECTIONS_DECRYPTED').subscribe((e) => {
      this.store.update((s) => (s ? { ...s, connectedCount: e.payload.count } : null));
      this.activeSessions.set(e.payload.sessions);
    });

    this.relay.events.on('WHITELIST_DECRYPTED').subscribe((e) => {
      this.store.update((s) => (s ? { ...s, whitelist: e.payload } : null));
    });

    this.relay.events.on('PARTICIPANTS_DECRYPTED').subscribe((e) => {
      this.store.update((s) => (s ? { ...s, participants: e.payload } : null));
    });

    this.relay.events.on('LOCK_UPDATED').subscribe((e) => {
      const payload = e.payload || {};
      const isLocked = payload.isLocked !== undefined ? payload.isLocked : true;

      this.store.update((s) => (s ? { ...s, isLocked } : null));
    });

    this.relay.events.on('TOGGLE_LOCK').subscribe((e) => {
      const isLocked = e.payload?.isLocked !== undefined ? e.payload.isLocked : true;
      this.store.update((s) => (s ? { ...s, isLocked } : null));
    });

    this.relay.events.on('TX_FINALIZED_DECRYPTED').subscribe((e) => {
      this.store.update((s) =>
        s ? { ...s, finalTxHex: e.payload.finalTxHex, finalTxId: e.payload.finalTxId } : null,
      );
    });

    this.relay.events.on('ROOM_CLOSED').subscribe(() => {
      this.isClosed.set(true);
      const roomToClear = this.roomState()?.roomId;
      if (roomToClear) this.clearLocalRoomData(roomToClear);
      this.disconnect();
    });

    this.relay.events.on('PROTOCOL_ERROR').subscribe((e) => {
      const errorType = e.payload.type;

      if (errorType === 'locked') {
        this.isLockedOut.set(true);
        this.disconnect();
      } else if (errorType === 'not_found') {
        this.roomNotFound.set(true);
        this.disconnect();
      } else if (errorType === 'version_mismatch') {
        this.fallbackVersion = e.payload.roomVersion;
        // Trigger downgrade connection logic here
      } else if (errorType === 'room_full') {
        this.isRoomFull.set(true);
      } else if (errorType === 'access_denied') {
        if (!this.hasAnnouncedJoin) {
          this.decryptionError.set('Invalid decryption key. Access denied.');
          this.setRoomKey(null);
          this.failedKeyAttempts++;
          this.securityAlert$.next({ type: 'access_denied', count: this.failedKeyAttempts });
        }
      }
    });

    this.relay.events.on('DECRYPTION_ERROR').subscribe((e) => {
      if (!this.isLockedOut() && !this.isRoomFull() && !this.roomNotFound()) {
        this.decryptionError.set(e.payload);
        this.setRoomKey(null);
        this.disconnect();
      }
    });

    this.relay.events.on('STATE_CHANGED').subscribe((e) => {
      this.roomState.set(e.payload);
    });

    this.relay.events.on('STATE_SYNC_DECRYPTED').subscribe((event) => {
      const syncData = event.payload;
      const hasAdminToken = !!sessionStorage.getItem(`admin_token_${syncData.roomId}`);

      if (this.isBrowser && this.currentSessionId()) {
        sessionStorage.setItem(`session_id_${syncData.roomId}`, this.currentSessionId()!);
        const resumeToken = this.sdk.getResumeToken();
        if (resumeToken) {
          sessionStorage.setItem(`resume_token_${syncData.roomId}`, resumeToken);
        }
      }

      if (syncData.strictRoles && !hasAdminToken && !this.sdk.currentRoleToken) {
        this.decryptionError.set('Strict Mode Active: A valid role token is required to enter this room.');
        this.setRoomKey(null);
        this.disconnect();
        return;
      }

      if (!this.hasAnnouncedJoin && this.currentSessionId() && !hasAdminToken) {
        this.hasAnnouncedJoin = true;
      }

      if (syncData.strictRoles && this.role() !== 'admin' && !this.currentConstraints()) {
        this.currentConstraints.set({
          canUploadSignature: false,
          canExportPsbt: false,
          canExportAudit: false,
          canViewDetails: false,
          canViewSigners: false,
          canShareSession: false,
        });
      }

      if (this.isCoordinator() && !this.hasSyncedLocalAddressBook) {
        this.hasSyncedLocalAddressBook = true;
        setTimeout(() => {
          this.checkAndApplyLocalLabels();
          this.checkAndApplyLocalAddressLabels();
        }, 50);
      }
    });

    this.relay.events.on('ROLE_UPDATE').subscribe((e) => {
      const newRole = e.payload;
      this.role.set(newRole);

      if (newRole === 'admin') {
        this.currentConstraints.set(null);
      }

      if (!this.hasAnnouncedJoin && newRole === 'admin') {
        this.hasAnnouncedJoin = true;
      }

      if (newRole === 'admin' && this.ceremonyPhase() === 'AGGREGATING_NONCES') {
        this.aggregateMuSig2Nonces();
      }

      if (newRole === 'admin' && !this.hasSyncedLocalAddressBook) {
        this.hasSyncedLocalAddressBook = true;
        setTimeout(() => {
          this.checkAndApplyLocalLabels();
          this.checkAndApplyLocalAddressLabels();
        }, 50);
      }
    });

    this.relay.events.on('NONCE_THRESHOLD_MET' as any).subscribe(() => {
      if (this.isCoordinator()) {
        this.aggregateMuSig2Nonces();
      }
    });

    this.relay.events.on('NEW_NONCE_DECRYPTED' as any).subscribe((event: any) => {
      const { decryptedPsbt } = event.payload;
      this.store.update((current) => {
        if (!current) return null;
        const existing = current.nonces || [];
        if (existing.includes(decryptedPsbt)) return current;
        return {
          ...current,
          nonces: [...existing, decryptedPsbt],
        };
      });
    });

    this.relay.events.on('AGGREGATE_PSBT_DECRYPTED' as any).subscribe((event: any) => {
      this.store.update((current) => {
        if (!current) return null;
        return {
          ...current,
          psbt: event.payload,
        };
      });
    });
  }

  setRoomKey(key: string | null) {
    this.encryptionKey = key;
  }

  getRoomKey(): string | null {
    return this.encryptionKey;
  }

  /**
   * Reconstructs the complete URL fragment required to access the room with the current role.
   */
  public getCurrentFragment(): string | null {
    const fbek = this.getRoomKey();
    if (!fbek) return null;

    const roleToken = this.sdk.currentRoleToken;
    return roleToken ? `${fbek}:${roleToken}` : fbek;
  }

  async connect(roomId: string, fragment: string | null) {
    if (this.status() === 'connecting') return;

    this.reset();
    this.status.set('connecting');

    try {
      if (!fragment) throw new Error('Decryption key required');

      const { fbek } = this.sdk.parseFragment(fragment);
      this.setRoomKey(fbek);

      if (this.sdk.store.getState() !== null) {
        this.sdk.disconnect();
        await new Promise((r) => setTimeout(r, 50));
      }

      let isReconnecting = false;
      if (this.isBrowser) {
        const savedSessionId = sessionStorage.getItem(`session_id_${roomId}`);
        const savedResumeToken = sessionStorage.getItem(`resume_token_${roomId}`);
        if (savedSessionId && savedResumeToken) {
          this.sdk.restoreSessionId(savedSessionId, savedResumeToken);
          isReconnecting = true;
        }
      }

      await this.sdk.joinRoom(roomId, fragment);

      const activeConstraints = this.sdk.getConstraints();
      if (activeConstraints) {
          this.currentConstraints.set(activeConstraints);
      }

      if (this.isBrowser) {
        const secureToken = sessionStorage.getItem(`admin_token_${roomId}`);

        if (secureToken) {
          try {
            const decryptedToken = await this.encryptionEngine.decrypt(secureToken, fbek);
            if (decryptedToken) {
              await this.sdk.claimCoordinator(decryptedToken);
            }
          } catch (decryptError) {
            console.error('[SERVICE] Decryption failed!', decryptError);
            sessionStorage.removeItem(`admin_token_${roomId}`);
          }
        }

        const savedName = localStorage.getItem(`display_name_${roomId}`);
        if (savedName && !isReconnecting) {
          await this.sdk.setDisplayName(savedName);
        }
      }

      this.status.set('connected');
    } catch (e) {
      console.error('Connection/Upgrade failed:', e);
      this.status.set('error');
    }
  }

  public disconnect() {
    this.sdk.disconnect();
    this.status.set('disconnected');
  }

  async createRoom(
    psbtBase64: string,
    network: 'bitcoin' | 'testnet' | 'signet',
    roomName: string = 'Untitled Room',
    protocol?: string
  ) {
    return await this.sdk.createRoom(psbtBase64, network, roomName, protocol);
  }

  public async renameRoom(name: string) {
    await this.sdk.setRoomName(name);
  }

  public async closeRoom() {
    await this.sdk.closeRoom();

    const state = this.sdk.getRoomState();
    if (state) {
      sessionStorage.removeItem(`admin_token_${state.roomId}`);
      localStorage.removeItem(`display_name_${state.roomId}`);
    }
  }

  public async setDisplayName(name: string) {
    const state = this.sdk.getRoomState();
    if (state) localStorage.setItem(`display_name_${state.roomId}`, name);

    await this.sdk.setDisplayName(name);
  }

  public async toggleLock(isLocked: boolean) {
    await this.sdk.toggleLock(isLocked);
  }

  public async updateWhitelist(addresses: string[], remove: boolean = false) {
    await this.sdk.updateWhitelist(addresses, remove);
  }

  async claimCoordinator(secureToken: string) {
    this.sdk.claimCoordinator(secureToken);
  }

  public getRoomLink(
    appBaseUrl: string,
    includeKey: boolean = false,
    customRoleToken?: string,
  ): string {
    return this.sdk.getRoomLink(appBaseUrl, includeKey, customRoleToken);
  }

  public async generateAndRegisterRole(flags: {
    canUploadSignature: boolean;
    canExportPsbt: boolean;
    canExportAudit: boolean;
    canViewDetails: boolean;
    canViewSigners: boolean;
    canShareSession: boolean;
  }): Promise<string> {
    return await this.sdk.generateAndRegisterRole(flags);
  }

  async logAction(action: string, detail: string) {
    await this.sdk.logParticipantAction(action, detail);
  }

  public getAuditLogCsv(): string {
    return this.sdk.getAuditLogCsv();
  }

  public getSettlementCsvData(): string {
    return this.sdk.getSettlementCsvData();
  }

  public async getAuditLogPdf(options?: AuditLogOptions) {
    return await this.sdk.getAuditLogPdf(options);
  }

  /**
   * Proactively sweeps and deletes any expired localStorage address book entries on app startup,
   * rather than waiting for a specific fingerprint or address to be read again.
   */
  public purgeExpiredAddressBook(): void {
    if (!this.isBrowser) return;
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('addr_book_')) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.expiresAt === 'number' && now > parsed.expiresAt) {
            keysToRemove.push(key);
          }
        } catch {
          // Legacy entry without expiresAt: remove to enforce strict TTL hygiene
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach((k) => localStorage.removeItem(k));
  }

  /**
   * Wipes all saved signer and address labels from both sessionStorage and localStorage.
   */
  public clearAllAddressBookEntries(): void {
    if (!this.isBrowser) return;
    for (const storage of [localStorage, sessionStorage]) {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith('addr_book_')) keys.push(k);
      }
      keys.forEach((k) => storage.removeItem(k));
    }
  }

  private readEntryWithTtl(key: string): { label: string; ttlDays: 0 | 1 | 7 | 30 } | null {
    if (!this.isBrowser) return null;

    // Check ephemeral sessionStorage first (wiped automatically by browser on tab close)
    const sessionVal = sessionStorage.getItem(key);
    if (sessionVal) {
      return { label: sessionVal, ttlDays: 0 };
    }

    // Check TTL-bound localStorage
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'label' in parsed && 'expiresAt' in parsed) {
        if (Date.now() > parsed.expiresAt) {
          localStorage.removeItem(key);
          return null;
        }
        const days = parsed.ttlDays;
        return {
          label: parsed.label,
          ttlDays: days === 1 || days === 7 || days === 30 ? days : 7,
        };
      }
    } catch {
      localStorage.removeItem(key);
    }
    return null;
  }

  private writeWithTtl(key: string, label: string, ttlDays: 0 | 1 | 7 | 30 = 0) {
    if (!this.isBrowser) return;

    if (ttlDays === 0) {
      localStorage.removeItem(key);
      sessionStorage.setItem(key, label);
      return;
    }

    sessionStorage.removeItem(key);
    const payload = JSON.stringify({
      label,
      ttlDays,
      expiresAt: Date.now() + ttlDays * 24 * 60 * 60 * 1000,
    });
    localStorage.setItem(key, payload);
  }

  getLocalLabel(fingerprint: string): string | null {
    return this.readEntryWithTtl(`addr_book_${fingerprint}`)?.label ?? null;
  }

  getLocalLabelTtl(fingerprint: string): 0 | 1 | 7 | 30 {
    return this.readEntryWithTtl(`addr_book_${fingerprint}`)?.ttlDays ?? 0;
  }

  saveToAddressBook(fingerprint: string, label: string, ttlDays: 0 | 1 | 7 | 30 = 0) {
    this.writeWithTtl(`addr_book_${fingerprint}`, label, ttlDays);
  }

  removeFromAddressBook(fingerprint: string) {
    if (!this.isBrowser) return;
    localStorage.removeItem(`addr_book_${fingerprint}`);
    sessionStorage.removeItem(`addr_book_${fingerprint}`);
  }

  public async updateSignerLabel(fingerprint: string, label: string) {
    await this.sdk.setSignerLabel(fingerprint, label);
  }

  checkAndApplyLocalLabels() {
    if (!this.isCoordinator()) return;
    const state = this.roomState();
    if (!state) return;

    const currentLabels = state.signerLabels || {};
    const signers = this.signers();

    signers.forEach((signer) => {
      if (currentLabels[signer.fingerprint] === undefined) {
        const savedName = this.getLocalLabel(signer.fingerprint);
        if (savedName) this.updateSignerLabel(signer.fingerprint, savedName);
      }
    });
  }

  // --- ADDRESS LABEL METHODS ---

  public async updateAddressLabel(address: string, label: string) {
    // @ts-ignore - Ignore type error if SDK definition isn't fully synced locally
    await this.sdk.setAddressLabel(address, label);
  }

  getLocalAddressLabel(address: string): string | null {
    return this.readEntryWithTtl(`addr_book_address_${address}`)?.label ?? null;
  }

  getLocalAddressLabelTtl(address: string): 0 | 1 | 7 | 30 {
    return this.readEntryWithTtl(`addr_book_address_${address}`)?.ttlDays ?? 0;
  }

  saveAddressToBook(address: string, label: string, ttlDays: 0 | 1 | 7 | 30 = 0) {
    this.writeWithTtl(`addr_book_address_${address}`, label, ttlDays);
  }

  removeAddressFromBook(address: string) {
    if (!this.isBrowser) return;
    localStorage.removeItem(`addr_book_address_${address}`);
    sessionStorage.removeItem(`addr_book_address_${address}`);
  }

  checkAndApplyLocalAddressLabels() {
    if (!this.isCoordinator()) return;
    const state = this.roomState();
    if (!state) return;

    const currentLabels = state.addressLabels || {};
    const txDetails = this.txDetails();
    if (!txDetails) return;

    const uniqueAddresses = new Set([
      ...(txDetails.inputsList?.map((i) => i.address) || []),
      ...(txDetails.outputs?.map((o) => o.address) || []),
    ]);

    uniqueAddresses.forEach((address) => {
      if (address && currentLabels[address] === undefined) {
        const savedName = this.getLocalAddressLabel(address);
        if (savedName) this.updateAddressLabel(address, savedName);
      }
    });
  }

  public async uploadSignature(psbtBase64: string) {
    const fingerprint = this.sdk.extractFingerprintFromSignature(psbtBase64);
    if (!fingerprint) throw new Error('Could not extract fingerprint from PSBT');

    await this.sdk.uploadSignature(psbtBase64, fingerprint);
  }

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

  public async finalizeTransaction() {
    return await this.sdk.finalizeTransaction();
  }

  public reset() {
    this.role.set('guest');
    this.isClosed.set(false);

    this.decryptionError.set(null);
    this.isLockedOut.set(false);
    this.isRoomFull.set(false);
    this.roomNotFound.set(false);

    this.activeSessions.set([]);
    this.status.set('disconnected');
    this.currentConstraints.set(null);

    this.hasSyncedLocalAddressBook = false;
  }

  private clearLocalRoomData(roomId: string) {
    localStorage.removeItem(`display_name_${roomId}`);
    sessionStorage.removeItem(`admin_token_${roomId}`);
    sessionStorage.removeItem(`session_id_${roomId}`);
    sessionStorage.removeItem(`resume_token_${roomId}`);
  }

  public roomState = signal<RoomState | null>(null);
  public status = signal<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  public role = signal<'guest' | 'admin'>('guest');
  public currentSessionId = signal<string | null>(null);
  public currentConstraints = signal<RoleConstraints | null>(null);
  public activeSessions = signal<{ id: string; role: string; displayName?: string }[]>([]);
  public networkSignatureReceived$ = new Subject<{ fingerprint: string; sessionId: string }>();

  public isRoomFull = signal(false);
  public isClosed = signal(false);
  public isLockedOut = signal(false);
  public roomNotFound = signal(false);
  public decryptionError = signal<string | null>(null);

  public isCoordinator = computed(() => this.role() === 'admin');

  public signers = computed(() => {
    const state = this.roomState();
    return this.sdk.getSignersStatus(state);
  });

  public txDetails = computed(() => {
    const state = this.roomState();
    return this.sdk.getTxDetails(state);
  });

  public signerThreshold = computed(() => {
    const state = this.roomState();
    return this.sdk.getThreshold(state);
  });

  public signerCount = computed(() => this.signers().filter((signer) => signer.signed).length);
  public nonceCount = computed(() => this.signers().filter((signer) => signer.hasNonce).length);

  public isReadyToBroadcast = computed(() => this.signerCount() >= this.signerThreshold());

  // --- MUSIG2 STATE MACHINE ---

  public ceremonyPhase = computed(() => {
    const state = this.roomState();
    if (!state) return 'GATHERING_SIGNATURES';

    const threshold = this.signerThreshold();
    const sigCount = state.signatures?.length || 0;
    const nonceCount = state.nonces?.length || 0;

    // If we have enough signatures, we are ready to broadcast regardless of protocol
    if (threshold > 0 && sigCount >= threshold) return 'READY_TO_BROADCAST';

    if (state.protocol === 'musig2') {
      // If the signature-ready PSBT hasn't been published yet, we are in Round 1
      if (!state.psbt || state.psbt === '') {
        if (threshold > 0 && nonceCount >= threshold) return 'AGGREGATING_NONCES';
        return 'GATHERING_NONCES';
      }
    }
    
    // Default standard flow (Round 2)
    return 'GATHERING_SIGNATURES';
  });

  public transientPsbt = computed(() => {
    return this.roomState()?.transientPsbt || null;
  });

  public async uploadNonce(psbtBase64: string) {
    // Note: We use the same fingerprint extraction logic, assuming hardware wallets 
    // attach the fingerprint to the BIP 373 nonce fields similarly to partialSigs.
    const fingerprint = this.sdk.extractFingerprintFromSignature(psbtBase64);
    if (!fingerprint) throw new Error('Could not extract fingerprint from PSBT');

    await this.sdk.uploadNonce(psbtBase64, fingerprint);
  }

  /**
   * The Coordinator's automated transition engine.
   * Merges all individual Nonce PSBTs into a single base payload for Round 2.
   */
  public async aggregateMuSig2Nonces() {
    if (!this.isCoordinator()) return;
    
    try {
      const state = this.roomState();
      if (!state || !state.transientPsbt) return;

      await new Promise((resolve) => setTimeout(resolve, 1800));

      // Merge all uploaded nonces into the transient PSBT
      let mergedNoncePsbt = state.transientPsbt;
      for (const noncePsbt of state.nonces) {
        mergedNoncePsbt = PsbtUtils.merge(mergedNoncePsbt, noncePsbt);
      }

      // The merged PSBT now contains all 0x1b fields and becomes the Base PSBT for Round 2
      await this.sdk.publishAggregatePsbt(mergedNoncePsbt);

    } catch (e) {
      console.error('[Coordinator] Failed to merge nonces', e);
      this.decryptionError.set('Failed to merge MuSig2 nonces.');
    }
  }
}
