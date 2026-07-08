/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Injectable, signal, computed, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';
import { Subject } from 'rxjs';
import {
  RelayClient,
  PsbtUtils,
  RoomStateStore,
  SigningRoomClient,
  RoomState,
} from '@signing-room/sdk';

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------

export const PROTOCOL_VERSION = '1.0.0';

@Injectable({ providedIn: 'root' })
export class SocketService {
  public sdk: SigningRoomClient;
  public roomState = signal<RoomState | null>(null);
  private store: RoomStateStore;
  private relay: RelayClient;

  private encryptionKey: string | null = null;
  private hasAnnouncedJoin = false;
  public securityAlert$ = new Subject<{ type: 'access_denied'; count: number }>();
  private failedKeyAttempts = 0;

  public isBrowser: boolean;
  private fallbackVersion: string | null = null;

  // -------------------------------------------------------------------------
  // Signals
  // -------------------------------------------------------------------------

  // Connection Status
  public status = signal<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  public role = signal<'guest' | 'admin'>('guest');
  public currentSessionId = signal<string | null>(null);
  public activeSessions = signal<{ id: string; role: string; displayName?: string }[]>([]);
  public networkSignatureReceived$ = new Subject<{ fingerprint: string; sessionId: string }>();

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

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    this.isBrowser = isPlatformBrowser(this.platformId);

    this.sdk = new SigningRoomClient({
      apiUrl: environment.apiUrl,
      protocolVersion: PROTOCOL_VERSION,
    });

    this.relay = this.sdk.relay;
    this.store = this.sdk.store;

    this.sdk.onStateChange().subscribe((state) => {
      // Ignore the event envelope and pull the guaranteed fresh state from the SDK getter
      this.roomState.set(this.sdk.getRoomState());
    });

    this.relay.events.on('ROOM_CONNECTED').subscribe(() => {
      this.status.set('connected');
    });

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
        //this.relay.logAction('User Joined', `Session: ${this.currentSessionId()}`, 'Guest');
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

      console.log(`Successfully merged new signature from signer: ${fingerprint}`);
    });

    this.relay.events
      .on('SESSION_CONNECTED')
      .subscribe((e) => this.currentSessionId.set(e.payload));

    this.relay.events.on('LABELS_DECRYPTED').subscribe((e) => {
      this.store.update((s) => (s ? { ...s, signerLabels: e.payload } : null));
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
      // Handle both full payload and empty payload cases
      const payload = e.payload || {};
      const isLocked = payload.isLocked !== undefined ? payload.isLocked : true;

      console.log('🔒 LOCK_UPDATED received → isLocked =', isLocked);

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
      }
    });

    this.relay.events.on('ROLE_UPDATE').subscribe((e) => {
      const previousRole = this.role();
      const newRole = e.payload;
      this.role.set(newRole);

      if (!this.hasAnnouncedJoin && newRole === 'admin') {
        this.hasAnnouncedJoin = true;
        //this.relay.logAction('User Joined', `Session: ${this.currentSessionId()}`, 'Coordinator');
      } else if (this.hasAnnouncedJoin && previousRole === 'guest' && newRole === 'admin') {
        // this.relay.logAction(
        //   'Role Claimed Coordinator',
        //   `Session ID: ${this.currentSessionId()} upgraded`,
        //   'Coordinator',
        // );
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

  async createRoom(
    psbtBase64: string,
    network: 'bitcoin' | 'testnet' | 'signet',
    roomName: string = 'Untitled Room',
  ) {
    return await this.sdk.createRoom(psbtBase64, network, roomName);
  }

  // -------------------------------------------------------------------------
  // Connection Management
  // -------------------------------------------------------------------------

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
          await this.sdk.claimCoordinator(secureToken);
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

  // -------------------------------------------------------------------------
  // Public Actions
  // -------------------------------------------------------------------------

  public async uploadSignature(psbtBase64: string) {
    // Let the SDK automatically extract the fingerprint before uploading!
    const fingerprint = this.sdk.extractFingerprintFromSignature(psbtBase64);
    if (!fingerprint) throw new Error('Could not extract fingerprint from PSBT');

    await this.sdk.uploadSignature(psbtBase64, fingerprint);
  }

  async claimCoordinator(secureToken: string) {
    this.relay.claimCoordinator(secureToken);
  }

  public async closeRoom() {
    await this.sdk.closeRoom();

    // Clean up browser storage
    if (this.isBrowser) {
      const state = this.sdk.getRoomState();
      if (state) {
        sessionStorage.removeItem(`admin_token_${state.roomId}`);
        localStorage.removeItem(`display_name_${state.roomId}`);
      }
    }
  }

  async logAction(action: string, detail: string) {
    await this.sdk.logParticipantAction(action, detail);
  }

  public async renameRoom(name: string) {
    await this.sdk.setRoomName(name);
  }

  public async updateSignerLabel(fingerprint: string, label: string) {
    if (this.isBrowser) {
      const state = this.sdk.getRoomState();
      if (state) localStorage.setItem(`signer_label_${state.roomId}_${fingerprint}`, label);
    }
    await this.sdk.setSignerLabel(fingerprint, label);
  }

  public async setDisplayName(name: string) {
    if (this.isBrowser) {
      const state = this.sdk.getRoomState();
      if (state) localStorage.setItem(`display_name_${state.roomId}`, name);
    }
    await this.sdk.setDisplayName(name);
  }

  public async updateWhitelist(addresses: string[], remove: boolean = false) {
    await this.sdk.updateWhitelistBatch(addresses, remove);
  }

  public async toggleLock(isLocked: boolean) {
    await this.sdk.toggleLock(isLocked);
  }

  public async finalizeTransaction() {
    // SDK handles the entire calculation, local state update, and network broadcast atomically
    return await this.sdk.finalizeTransaction();
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
    return typeof localStorage !== 'undefined'
      ? localStorage.getItem(`addr_book_${fingerprint}`)
      : null;
  }

  saveToAddressBook(fingerprint: string, label: string) {
    if (typeof localStorage !== 'undefined')
      localStorage.setItem(`addr_book_${fingerprint}`, label);
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

    signers.forEach((signer) => {
      if (currentLabels[signer.fingerprint] === undefined) {
        const savedName = this.getLocalLabel(signer.fingerprint);
        if (savedName) this.updateSignerLabel(signer.fingerprint, savedName);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  public reset() {
    this.hasAnnouncedJoin = false;
    this.role.set('guest');
    this.isClosed.set(false);

    this.decryptionError.set(null);
    this.isLockedOut.set(false);
    this.isRoomFull.set(false);
    this.roomNotFound.set(false);

    //this.store.set(null);
    this.activeSessions.set([]);
    this.status.set('disconnected');
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

  public getAuditLogCsv(): string {
    return this.sdk.getAuditLogCsv();
  }

  public getSettlementCsvData(): string {
    return this.sdk.getSettlementCsvData();
  }

  public async getAuditLogPdf() {
    return await this.sdk.getAuditLogPdf();
  }

  public getRoomLink(appBaseUrl: string, includeKey: boolean = false): string {
    return this.sdk.getRoomLink(appBaseUrl, includeKey);
  }
}
