/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Injectable, Inject, PLATFORM_ID, signal, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  SigningRoomClient,
  RoomState,
  PsbtUtils,
  RelayClient,
  RoomStateStore,
  EncryptionEngine,
  AuditLogOptions,
} from '@signing-room/sdk';
import { SDKClientFactoryService } from '../sdk-client-factory/sdk-client-factory.service';
import { Subject } from 'rxjs';

export const PROTOCOL_VERSION = '1.1.0';

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
    this.registerEventlisteners();
  }

  registerEventlisteners() {
    this.sdk.onStateChange().subscribe((state) => {
      this.roomState.set(this.sdk.getRoomState());
    });

    this.relay.events.on('ROOM_CONNECTED').subscribe(() => {
      this.status.set('connected');
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
            this.connect(this.roomState()?.roomId || '', this.getRoomKey());
          }
        }, 3000);
      }
    });

    this.relay.events.on('LABELS_DECRYPTED').subscribe((e) => {
      this.store.update((s) => (s ? { ...s, signerLabels: e.payload } : null));
    });

    // ---> ADDED: Listen for the new Address Labels event to satisfy the tests
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

      if (!this.hasAnnouncedJoin && this.currentSessionId() && !hasAdminToken) {
        this.hasAnnouncedJoin = true;
      }

      if (this.isCoordinator() && !this.hasSyncedLocalAddressBook) {
        this.hasSyncedLocalAddressBook = true;
        setTimeout(() => {
          this.checkAndApplyLocalLabels();
          this.checkAndApplyLocalAddressLabels();
        }, 50);
      }
    });

    this.relay.events.on('NEW_PARTIAL_DECRYPTED').subscribe((event) => {
      const { decryptedPsbt, fingerprint, sessionId } = event.payload;

      this.store.update((current) => {
        if (!current) return null;
        return {
          ...current,
          psbt: this.mergePsbts(current.psbt, decryptedPsbt),
          signatures: [...current.signatures, decryptedPsbt],
        };
      });

      if (fingerprint && sessionId) {
        this.networkSignatureReceived$.next({ fingerprint, sessionId });
      }
    });

    this.relay.events.on('ROLE_UPDATE').subscribe((e) => {
      const newRole = e.payload;
      this.role.set(newRole);

      if (!this.hasAnnouncedJoin && newRole === 'admin') {
        this.hasAnnouncedJoin = true;
      }

      if (newRole === 'admin' && !this.hasSyncedLocalAddressBook) {
        this.hasSyncedLocalAddressBook = true;
        setTimeout(() => {
          this.checkAndApplyLocalLabels();
          this.checkAndApplyLocalAddressLabels();
        }, 50);
      }
    });
  }

  setRoomKey(key: string | null) {
    this.encryptionKey = key;
  }

  getRoomKey(): string | null {
    return this.encryptionKey;
  }

  async connect(roomId: string, key: string | null) {
    if (this.status() === 'connecting') return;

    this.reset();
    this.status.set('connecting');

    try {
      if (!key) throw new Error('Decryption key required');

      if (this.sdk.store.getState() !== null) {
        this.sdk.disconnect();
        await new Promise((r) => setTimeout(r, 50));
      }

      await this.sdk.joinRoom(roomId, key);

      if (this.isBrowser) {
        const secureToken = sessionStorage.getItem(`admin_token_${roomId}`);

        if (secureToken) {
          try {
            const decryptedToken = await this.encryptionEngine.decrypt(secureToken, key);
            if (decryptedToken) {
              await this.sdk.claimCoordinator(decryptedToken);
            }
          } catch (decryptError) {
            console.warn('Failed to decrypt local admin token. Proceeding as guest.');
            sessionStorage.removeItem(`admin_token_${roomId}`);
          }
        }

        const savedName = localStorage.getItem(`display_name_${roomId}`);
        if (savedName) {
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
  ) {
    return await this.sdk.createRoom(psbtBase64, network, roomName);
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

  public getRoomLink(appBaseUrl: string, includeKey: boolean = false): string {
    return this.sdk.getRoomLink(appBaseUrl, includeKey);
  }

  async logAction(action: string, detail: string) {
    console.log('=== logAction CALLED ===', action, detail);
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

  getLocalLabel(fingerprint: string): string | null {
    return localStorage.getItem(`addr_book_${fingerprint}`);
  }

  saveToAddressBook(fingerprint: string, label: string) {
    localStorage.setItem(`addr_book_${fingerprint}`, label);
  }

  removeFromAddressBook(fingerprint: string) {
    localStorage.removeItem(`addr_book_${fingerprint}`);
  }

  public async updateSignerLabel(fingerprint: string, label: string) {
    const state = this.sdk.getRoomState();
    if (state) localStorage.setItem(`signer_label_${state.roomId}_${fingerprint}`, label);

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
    const state = this.sdk.getRoomState();
    if (state) localStorage.setItem(`address_label_${state.roomId}_${address}`, label);
    // @ts-ignore - Ignore type error if SDK definition isn't fully synced locally
    await this.sdk.setAddressLabel(address, label);
  }

  getLocalAddressLabel(address: string): string | null {
    return localStorage.getItem(`addr_book_address_${address}`);
  }

  saveAddressToBook(address: string, label: string) {
    localStorage.setItem(`addr_book_address_${address}`, label);
  }

  removeAddressFromBook(address: string) {
    localStorage.removeItem(`addr_book_address_${address}`);
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

  // ---

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

    this.hasSyncedLocalAddressBook = false;
  }

  private clearLocalRoomData(roomId: string) {
    localStorage.removeItem(`display_name_${roomId}`);
    sessionStorage.removeItem(`admin_token_${roomId}`);
  }

  public roomState = signal<RoomState | null>(null);
  public status = signal<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  public role = signal<'guest' | 'admin'>('guest');
  public currentSessionId = signal<string | null>(null);
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

  public isReadyToBroadcast = computed(() => this.signerCount() >= this.signerThreshold());
}
