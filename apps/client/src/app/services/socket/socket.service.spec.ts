import { TestBed } from '@angular/core/testing';
import { SocketService } from './socket.service';
import { SDKClientFactoryService } from '../sdk-client-factory/sdk-client-factory.service';
import { EncryptionEngine, PsbtUtils } from '@signing-room/sdk';
import { Subject } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('SocketService', () => {
  let service: SocketService;
  let sdkFactoryMock: { create: any };

  let roomConnectedSubject: Subject<void>;
  let sessionConnectedSubject: Subject<any>;
  let labelsDecryptedSubject: Subject<any>;
  let roomRenamedDecryptedSubject: Subject<any>;
  let logUpdateDecryptedSubject: Subject<any>;
  let connectionsDecryptedSubject: Subject<any>;
  let whitelistDecryptedSubject: Subject<any>;
  let participantsDecryptedSubject: Subject<any>;
  let lockUpdatedSubject: Subject<any>;
  let toggleLockSubject: Subject<any>;
  let txFinalizedDecryptedSubject: Subject<any>;
  let roomClosedSubject: Subject<any>;
  let protocolErrorSubject: Subject<any>;
  let roleUpdateSubject: Subject<any>;
  let decryptionErrorSubject: Subject<any>;
  let stateChangedSubject: Subject<any>;
  let stateSyncDecryptedSubject: Subject<any>;
  let newPartialDecryptedSubject: Subject<any>;
  let roomDisconnectedSubject: Subject<any>;
  let sdkStateChangeSubject: Subject<any>;

  beforeEach(() => {
    globalThis.localStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    } as any;

    globalThis.sessionStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    } as any;

    roomConnectedSubject = new Subject<void>();
    sessionConnectedSubject = new Subject<any>();
    labelsDecryptedSubject = new Subject<any>();
    roomRenamedDecryptedSubject = new Subject<any>();
    logUpdateDecryptedSubject = new Subject<any>();
    connectionsDecryptedSubject = new Subject<any>();
    whitelistDecryptedSubject = new Subject<any>();
    participantsDecryptedSubject = new Subject<any>();
    lockUpdatedSubject = new Subject<any>();
    toggleLockSubject = new Subject<any>();
    txFinalizedDecryptedSubject = new Subject<any>();
    roomClosedSubject = new Subject<any>();
    protocolErrorSubject = new Subject<any>();
    lockUpdatedSubject = new Subject<any>();
    toggleLockSubject = new Subject<any>();
    txFinalizedDecryptedSubject = new Subject<any>();
    roomClosedSubject = new Subject<any>();
    protocolErrorSubject = new Subject<any>();
    roleUpdateSubject = new Subject<any>();
    decryptionErrorSubject = new Subject<any>();
    stateChangedSubject = new Subject<any>();
    stateSyncDecryptedSubject = new Subject<any>();
    newPartialDecryptedSubject = new Subject<any>();
    roomDisconnectedSubject = new Subject<any>();
    sdkStateChangeSubject = new Subject<any>();

    sdkFactoryMock = {
      create: vi.fn().mockReturnValue({
        logParticipantAction: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
        closeRoom: vi.fn().mockResolvedValue(undefined),
        createRoom: vi.fn().mockResolvedValue(undefined),
        setRoomName: vi.fn().mockResolvedValue(undefined),
        toggleLock: vi.fn().mockResolvedValue(undefined),
        updateWhitelist: vi.fn().mockResolvedValue(undefined),
        claimCoordinator: vi.fn().mockResolvedValue(undefined),
        getRoomLink: vi.fn(),
        getAuditLogCsv: vi.fn(),
        getSettlementCsvData: vi.fn(),
        getAuditLogPdf: vi.fn().mockResolvedValue(undefined),
        getRoomState: vi.fn(),
        onStateChange: vi.fn().mockReturnValue(sdkStateChangeSubject.asObservable()),
        setSignerLabel: vi.fn().mockResolvedValue(undefined),
        getSignersStatus: vi.fn().mockReturnValue([]),
        finalizeTransaction: vi.fn().mockResolvedValue(undefined),
        setDisplayName: vi.fn().mockResolvedValue(undefined),
        extractFingerprintFromSignature: vi.fn(),
        uploadSignature: vi.fn().mockResolvedValue(undefined),
        joinRoom: vi.fn().mockResolvedValue(undefined),
        store: { getState: vi.fn().mockReturnValue(null), update: vi.fn() },
        engine: {
          decrypt: vi.fn().mockResolvedValue('decrypted_admin_token'),
        },
        relay: {
          events: {
            on: vi.fn().mockImplementation((eventName: string) => {
              if (eventName === 'ROOM_CONNECTED') return roomConnectedSubject.asObservable();
              if (eventName === 'SESSION_CONNECTED') return sessionConnectedSubject.asObservable();
              if (eventName === 'ROOM_DISCONNECTED') return roomDisconnectedSubject.asObservable();
              if (eventName === 'LABELS_DECRYPTED') return labelsDecryptedSubject.asObservable();
              if (eventName === 'ROOM_RENAMED_DECRYPTED')
                return roomRenamedDecryptedSubject.asObservable();
              if (eventName === 'LOG_UPDATE_DECRYPTED')
                return logUpdateDecryptedSubject.asObservable();
              if (eventName === 'CONNECTIONS_DECRYPTED')
                return connectionsDecryptedSubject.asObservable();
              if (eventName === 'WHITELIST_DECRYPTED')
                return whitelistDecryptedSubject.asObservable();
              if (eventName === 'PARTICIPANTS_DECRYPTED')
                return participantsDecryptedSubject.asObservable();
              if (eventName === 'LOCK_UPDATED') return lockUpdatedSubject.asObservable();
              if (eventName === 'TOGGLE_LOCK') return toggleLockSubject.asObservable();
              if (eventName === 'TX_FINALIZED_DECRYPTED')
                return txFinalizedDecryptedSubject.asObservable();
              if (eventName === 'ROOM_CLOSED') return roomClosedSubject.asObservable();
              if (eventName === 'PROTOCOL_ERROR') return protocolErrorSubject.asObservable();
              if (eventName === 'ROLE_UPDATE') return roleUpdateSubject.asObservable();
              if (eventName === 'DECRYPTION_ERROR') return decryptionErrorSubject.asObservable();
              if (eventName === 'STATE_CHANGED') return stateChangedSubject.asObservable();
              if (eventName === 'STATE_SYNC_DECRYPTED')
                return stateSyncDecryptedSubject.asObservable();
              if (eventName === 'NEW_PARTIAL_DECRYPTED')
                return newPartialDecryptedSubject.asObservable();

              return new Subject().asObservable();
            }),
          },
        },
      } as any),
    };

    TestBed.configureTestingModule({
      providers: [SocketService, { provide: SDKClientFactoryService, useValue: sdkFactoryMock }],
    });

    service = TestBed.inject(SocketService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create the SDK client via factory', () => {
    expect(sdkFactoryMock.create).toHaveBeenCalled();
    expect(service.sdk).toBeDefined();
  });

  it('should be browser-aware', () => {
    expect(typeof service.isBrowser).toBe('boolean');
  });

  describe('Event Listeners (registerEventlisteners)', () => {
    it('should set status to "connected" when ROOM_CONNECTED is emitted', () => {
      const statusSpy = vi.spyOn(service.status, 'set');

      roomConnectedSubject.next();

      expect(statusSpy).toHaveBeenCalledWith('connected');
      expect(statusSpy).toHaveBeenCalledTimes(1);
    });

    it('should set currentSessionId when SESSION_CONNECTED is emitted', () => {
      const setSpy = vi.spyOn(service.currentSessionId, 'set');

      sessionConnectedSubject.next({ payload: 'session_abc123' });

      expect(setSpy).toHaveBeenCalledWith('session_abc123');
    });

    it('should update store with signerLabels when LABELS_DECRYPTED is emitted', () => {
      const updateSpy = vi.spyOn(service['store'], 'update');
      const mockPayload = { '1234abcd': 'Alice' };

      labelsDecryptedSubject.next({ payload: mockPayload });

      expect(updateSpy).toHaveBeenCalledTimes(1);

      // Extract the callback passed to this.store.update
      const updateCallback = updateSpy.mock.calls[0][0];

      // Assert behavior when state is null
      expect(updateCallback(null)).toBeNull();

      // Assert behavior when state exists
      const existingState = { roomId: 'room_1' } as any;
      expect(updateCallback(existingState)).toEqual({
        roomId: 'room_1',
        signerLabels: mockPayload,
      });
    });

    it('should update store with roomName when ROOM_RENAMED_DECRYPTED is emitted', () => {
      const updateSpy = vi.spyOn(service['store'], 'update');

      roomRenamedDecryptedSubject.next({ payload: 'New Vault Name' });

      expect(updateSpy).toHaveBeenCalledTimes(1);
      const updateCallback = updateSpy.mock.calls[0][0];

      expect(updateCallback(null)).toBeNull();
      expect(updateCallback({ roomId: 'room_1' } as any)).toEqual({
        roomId: 'room_1',
        roomName: 'New Vault Name',
      });
    });

    it('should update store with auditLog when LOG_UPDATE_DECRYPTED is emitted', () => {
      const updateSpy = vi.spyOn(service['store'], 'update');
      const mockLog = [{ action: 'JOINED', timestamp: 123 }];

      logUpdateDecryptedSubject.next({ payload: mockLog });

      expect(updateSpy).toHaveBeenCalledTimes(1);
      const updateCallback = updateSpy.mock.calls[0][0];

      expect(updateCallback(null)).toBeNull();
      expect(updateCallback({ roomId: 'room_1' } as any)).toEqual({
        roomId: 'room_1',
        auditLog: mockLog,
      });
    });

    it('should update store connectedCount and activeSessions signal when CONNECTIONS_DECRYPTED is emitted', () => {
      const updateSpy = vi.spyOn(service['store'], 'update');
      const activeSessionsSpy = vi.spyOn(service.activeSessions, 'set');

      const mockPayload = { count: 3, sessions: [{ id: 's1', role: 'admin' }] };

      connectionsDecryptedSubject.next({ payload: mockPayload });

      // 1. Verify the Signal update
      expect(activeSessionsSpy).toHaveBeenCalledWith(mockPayload.sessions);

      // 2. Verify the Store update
      expect(updateSpy).toHaveBeenCalledTimes(1);
      const updateCallback = updateSpy.mock.calls[0][0];

      expect(updateCallback(null)).toBeNull();
      expect(updateCallback({ roomId: 'room_1' } as any)).toEqual({
        roomId: 'room_1',
        connectedCount: mockPayload.count,
      });
    });

    it('should update store with whitelist when WHITELIST_DECRYPTED is emitted', () => {
      const updateSpy = vi.spyOn(service['store'], 'update');
      const mockWhitelist = ['bc1q...', 'bc1p...'];

      whitelistDecryptedSubject.next({ payload: mockWhitelist });

      expect(updateSpy).toHaveBeenCalledTimes(1);
      const updateCallback = updateSpy.mock.calls[0][0];

      expect(updateCallback(null)).toBeNull();
      expect(updateCallback({ roomId: 'room_1' } as any)).toEqual({
        roomId: 'room_1',
        whitelist: mockWhitelist,
      });
    });

    it('should update store with participants when PARTICIPANTS_DECRYPTED is emitted', () => {
      const updateSpy = vi.spyOn(service['store'], 'update');
      const mockParticipants = [{ fingerprint: '1234abcd', hasSigned: true }];

      participantsDecryptedSubject.next({ payload: mockParticipants });

      expect(updateSpy).toHaveBeenCalledTimes(1);
      const updateCallback = updateSpy.mock.calls[0][0];

      expect(updateCallback(null)).toBeNull();
      expect(updateCallback({ roomId: 'room_1' } as any)).toEqual({
        roomId: 'room_1',
        participants: mockParticipants,
      });
    });

    describe('LOCK_UPDATED', () => {
      it('should update store with provided isLocked value', () => {
        const updateSpy = vi.spyOn(service['store'], 'update');

        lockUpdatedSubject.next({ payload: { isLocked: false } });

        const updateCallback = updateSpy.mock.calls[0][0];
        expect(updateCallback(null)).toBeNull();
        expect(updateCallback({ roomId: 'room_1' } as any)).toEqual({
          roomId: 'room_1',
          isLocked: false,
        });
      });

      it('should default isLocked to true if payload is missing or empty', () => {
        const updateSpy = vi.spyOn(service['store'], 'update');

        lockUpdatedSubject.next({});

        const updateCallback = updateSpy.mock.calls[0][0];
        expect(updateCallback({ roomId: 'room_1' } as any)).toEqual({
          roomId: 'room_1',
          isLocked: true,
        });
      });
    });

    describe('TOGGLE_LOCK', () => {
      it('should update store with provided isLocked value', () => {
        const updateSpy = vi.spyOn(service['store'], 'update');

        toggleLockSubject.next({ payload: { isLocked: false } });

        const updateCallback = updateSpy.mock.calls[0][0];
        expect(updateCallback(null)).toBeNull();
        expect(updateCallback({ roomId: 'room_1' } as any)).toEqual({
          roomId: 'room_1',
          isLocked: false,
        });
      });

      it('should default isLocked to true if payload is missing', () => {
        const updateSpy = vi.spyOn(service['store'], 'update');

        toggleLockSubject.next({ payload: {} });

        const updateCallback = updateSpy.mock.calls[0][0];
        expect(updateCallback({ roomId: 'room_1' } as any)).toEqual({
          roomId: 'room_1',
          isLocked: true,
        });
      });
    });

    it('should update store with finalTxHex and finalTxId when TX_FINALIZED_DECRYPTED is emitted', () => {
      const updateSpy = vi.spyOn(service['store'], 'update');
      const mockPayload = { finalTxHex: '0100...', finalTxId: 'abcd...' };

      txFinalizedDecryptedSubject.next({ payload: mockPayload });

      const updateCallback = updateSpy.mock.calls[0][0];
      expect(updateCallback(null)).toBeNull();
      expect(updateCallback({ roomId: 'room_1' } as any)).toEqual({
        roomId: 'room_1',
        finalTxHex: '0100...',
        finalTxId: 'abcd...',
      });
    });

    describe('ROOM_CLOSED', () => {
      it('should set isClosed, disconnect, and clear local room data if room state exists', () => {
        const isClosedSpy = vi.spyOn(service.isClosed, 'set');
        const disconnectSpy = vi.spyOn(service, 'disconnect').mockImplementation(() => {});
        const clearDataSpy = vi
          .spyOn(service as any, 'clearLocalRoomData')
          .mockImplementation(() => {});

        vi.spyOn(service, 'roomState').mockReturnValue({ roomId: 'room_123' } as any);

        roomClosedSubject.next({});

        expect(isClosedSpy).toHaveBeenCalledWith(true);
        expect(clearDataSpy).toHaveBeenCalledWith('room_123');
        expect(disconnectSpy).toHaveBeenCalledTimes(1);
      });

      it('should set isClosed and disconnect, but skip clearing data if room state is null', () => {
        const isClosedSpy = vi.spyOn(service.isClosed, 'set');
        const disconnectSpy = vi.spyOn(service, 'disconnect').mockImplementation(() => {});

        const clearDataSpy = vi
          .spyOn(service as any, 'clearLocalRoomData')
          .mockImplementation(() => {});

        vi.spyOn(service, 'roomState').mockReturnValue(null as any);

        roomClosedSubject.next({});

        expect(isClosedSpy).toHaveBeenCalledWith(true);
        expect(clearDataSpy).not.toHaveBeenCalled();
        expect(disconnectSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('PROTOCOL_ERROR', () => {
      it('should handle "locked" error type', () => {
        const isLockedOutSpy = vi.spyOn(service.isLockedOut, 'set');
        const disconnectSpy = vi.spyOn(service, 'disconnect').mockImplementation(() => {});

        protocolErrorSubject.next({ payload: { type: 'locked' } });

        expect(isLockedOutSpy).toHaveBeenCalledWith(true);
        expect(disconnectSpy).toHaveBeenCalledTimes(1);
      });

      it('should handle "not_found" error type', () => {
        const roomNotFoundSpy = vi.spyOn(service.roomNotFound, 'set');
        const disconnectSpy = vi.spyOn(service, 'disconnect').mockImplementation(() => {});

        protocolErrorSubject.next({ payload: { type: 'not_found' } });

        expect(roomNotFoundSpy).toHaveBeenCalledWith(true);
        expect(disconnectSpy).toHaveBeenCalledTimes(1);
      });

      it('should handle "version_mismatch" error type', () => {
        protocolErrorSubject.next({ payload: { type: 'version_mismatch', roomVersion: '1.2.0' } });

        expect((service as any).fallbackVersion).toBe('1.2.0');
      });

      it('should handle "room_full" error type', () => {
        const isRoomFullSpy = vi.spyOn(service.isRoomFull, 'set');

        protocolErrorSubject.next({ payload: { type: 'room_full' } });

        expect(isRoomFullSpy).toHaveBeenCalledWith(true);
      });

      describe('access_denied error type', () => {
        it('should handle access_denied when user has NOT announced join', () => {
          (service as any).hasAnnouncedJoin = false;
          (service as any).failedKeyAttempts = 0;

          // Create dummy subject if it doesn't exist on the service mock yet
          if (!(service as any).securityAlert$) (service as any).securityAlert$ = new Subject();

          const errorSetSpy = vi.spyOn(service.decryptionError, 'set');
          const setRoomKeySpy = vi.spyOn(service as any, 'setRoomKey').mockImplementation(() => {});
          const securityAlertSpy = vi.spyOn((service as any).securityAlert$, 'next');

          protocolErrorSubject.next({ payload: { type: 'access_denied' } });

          expect(errorSetSpy).toHaveBeenCalledWith('Invalid decryption key. Access denied.');
          expect(setRoomKeySpy).toHaveBeenCalledWith(null);
          expect((service as any).failedKeyAttempts).toBe(1);
          expect(securityAlertSpy).toHaveBeenCalledWith({ type: 'access_denied', count: 1 });
        });

        it('should do nothing for access_denied when user HAS already announced join', () => {
          (service as any).hasAnnouncedJoin = true;
          (service as any).failedKeyAttempts = 0;

          if (!(service as any).securityAlert$) (service as any).securityAlert$ = new Subject();

          const errorSetSpy = vi.spyOn(service.decryptionError, 'set');
          const setRoomKeySpy = vi.spyOn(service as any, 'setRoomKey').mockImplementation(() => {});

          protocolErrorSubject.next({ payload: { type: 'access_denied' } });

          // Should bypass the if block entirely
          expect(errorSetSpy).not.toHaveBeenCalled();
          expect(setRoomKeySpy).not.toHaveBeenCalled();
          expect((service as any).failedKeyAttempts).toBe(0);
        });
      });
    });

    describe('sdk.onStateChange', () => {
      it('should pull fresh state from getRoomState and update the roomState signal', () => {
        const mockFreshState = { roomId: 'fresh_room_123' };

        // Ensure getRoomState returns the fresh state
        const getRoomStateSpy = vi
          .spyOn(service.sdk, 'getRoomState')
          .mockReturnValue(mockFreshState as any);
        const roomStateSetSpy = vi.spyOn(service.roomState, 'set');

        // Emitting an empty/ignored payload since the method ignores it anyway
        sdkStateChangeSubject.next({ some: 'old_event_data' });

        expect(getRoomStateSpy).toHaveBeenCalledTimes(1);
        expect(roomStateSetSpy).toHaveBeenCalledWith(mockFreshState);
      });
    });

    describe('ROOM_DISCONNECTED', () => {
      beforeEach(() => {
        // Enable fake timers for this block so we can fast-forward the 3000ms setTimeout
        vi.useFakeTimers();
      });

      afterEach(() => {
        // Clean up and return to real timers
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
      });

      it('should set status to disconnected and do nothing else if room is closed', () => {
        service.isClosed.set(true);
        const connectSpy = vi.spyOn(service, 'connect').mockResolvedValue();

        roomDisconnectedSubject.next({});

        expect(service.status()).toBe('disconnected');

        // Fast-forward 3 seconds
        vi.advanceTimersByTime(3000);

        expect(connectSpy).not.toHaveBeenCalled();
      });

      it('should not reconnect if there is a terminal error present', () => {
        service.isClosed.set(false);
        // Simulate a terminal error
        service.isLockedOut.set(true);

        const connectSpy = vi.spyOn(service, 'connect').mockResolvedValue();

        roomDisconnectedSubject.next({});
        vi.advanceTimersByTime(3000);

        expect(connectSpy).not.toHaveBeenCalled();
      });

      it('should not reconnect if status has changed away from disconnected during the timeout', () => {
        service.isClosed.set(false);
        service.isLockedOut.set(false);
        service.roomNotFound.set(false);
        service.isRoomFull.set(false);
        service.decryptionError.set(null);

        const connectSpy = vi.spyOn(service, 'connect').mockResolvedValue();

        roomDisconnectedSubject.next({});

        // Advance time partially, simulate someone manually triggering a connection
        vi.advanceTimersByTime(1000);
        service.status.set('connecting');

        // Advance the rest of the way
        vi.advanceTimersByTime(2000);

        expect(connectSpy).not.toHaveBeenCalled();
      });

      it('should trigger connect with roomId and roomKey after 3 seconds if conditions are met', () => {
        service.isClosed.set(false);
        service.isLockedOut.set(false);
        service.roomNotFound.set(false);
        service.isRoomFull.set(false);
        service.decryptionError.set(null);

        service.roomState.set({ roomId: 'auto_reconnect_room' } as any);
        const getRoomKeySpy = vi.spyOn(service as any, 'getRoomKey').mockReturnValue('saved_key');
        const connectSpy = vi.spyOn(service, 'connect').mockResolvedValue();

        roomDisconnectedSubject.next({});
        expect(service.status()).toBe('disconnected');

        vi.advanceTimersByTime(3000);

        expect(getRoomKeySpy).toHaveBeenCalledTimes(1);
        expect(connectSpy).toHaveBeenCalledWith('auto_reconnect_room', 'saved_key');
        expect(connectSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('ROLE_UPDATE', () => {
      it('should set the role and update hasAnnouncedJoin if admin and not yet announced', () => {
        const roleSetSpy = vi.spyOn(service.role, 'set');
        (service as any).hasAnnouncedJoin = false;

        roleUpdateSubject.next({ payload: 'admin' });

        expect(roleSetSpy).toHaveBeenCalledWith('admin');
        expect((service as any).hasAnnouncedJoin).toBe(true);
      });

      it('should set the role but NOT update hasAnnouncedJoin if role is not admin', () => {
        const roleSetSpy = vi.spyOn(service.role, 'set');
        (service as any).hasAnnouncedJoin = false;

        roleUpdateSubject.next({ payload: 'guest' });

        expect(roleSetSpy).toHaveBeenCalledWith('guest');
        expect((service as any).hasAnnouncedJoin).toBe(false);
      });
    });

    describe('DECRYPTION_ERROR', () => {
      it('should set error, clear key, and disconnect if not locked out, full, or not found', () => {
        const errorSetSpy = vi.spyOn(service.decryptionError, 'set');
        const setRoomKeySpy = vi.spyOn(service as any, 'setRoomKey').mockImplementation(() => {});
        const disconnectSpy = vi.spyOn(service, 'disconnect').mockImplementation(() => {});

        service.isLockedOut.set(false);
        service.isRoomFull.set(false);
        service.roomNotFound.set(false);

        decryptionErrorSubject.next({ payload: 'Invalid password' });

        expect(errorSetSpy).toHaveBeenCalledWith('Invalid password');
        expect(setRoomKeySpy).toHaveBeenCalledWith(null);
        expect(disconnectSpy).toHaveBeenCalledTimes(1);
      });

      it('should do nothing if the user is already locked out (or room is full / not found)', () => {
        const errorSetSpy = vi.spyOn(service.decryptionError, 'set');
        const disconnectSpy = vi.spyOn(service, 'disconnect').mockImplementation(() => {});

        service.isLockedOut.set(true);

        decryptionErrorSubject.next({ payload: 'Invalid password' });

        expect(errorSetSpy).not.toHaveBeenCalled();
        expect(disconnectSpy).not.toHaveBeenCalled();
      });
    });

    it('should update roomState signal when STATE_CHANGED is emitted', () => {
      const stateSetSpy = vi.spyOn(service.roomState, 'set');
      const mockState = { roomId: '123' };

      stateChangedSubject.next({ payload: mockState });

      expect(stateSetSpy).toHaveBeenCalledWith(mockState);
    });

    describe('STATE_SYNC_DECRYPTED', () => {
      it('should set hasAnnouncedJoin to true if conditions are met', () => {
        (service as any).hasAnnouncedJoin = false;
        service.currentSessionId.set('session_123');

        vi.spyOn(globalThis.sessionStorage, 'getItem').mockReturnValue(null);

        stateSyncDecryptedSubject.next({ payload: { roomId: 'room_1' } });

        expect((service as any).hasAnnouncedJoin).toBe(true);
      });

      it('should bypass updating hasAnnouncedJoin if an admin token exists', () => {
        (service as any).hasAnnouncedJoin = false;
        service.currentSessionId.set('session_123');

        vi.spyOn(globalThis.sessionStorage, 'getItem').mockReturnValue('secure_token');

        stateSyncDecryptedSubject.next({ payload: { roomId: 'room_1' } });

        expect((service as any).hasAnnouncedJoin).toBe(false);
      });
    });

    describe('NEW_PARTIAL_DECRYPTED', () => {
      it('should update the store by merging psbts and appending signatures', () => {
        const updateSpy = vi.spyOn(service['store'], 'update');
        const mergeSpy = vi.spyOn(service, 'mergePsbts').mockReturnValue('merged_psbt_string');

        const mockPayload = { decryptedPsbt: 'new_psbt', fingerprint: '1234', sessionId: 's1' };

        newPartialDecryptedSubject.next({ payload: mockPayload });

        const updateCallback = updateSpy.mock.calls[0][0];

        expect(updateCallback(null)).toBeNull();

        const existingState = { psbt: 'base_psbt', signatures: ['old_sig'] };
        const newState = updateCallback(existingState as any);

        expect(mergeSpy).toHaveBeenCalledWith('base_psbt', 'new_psbt');
        expect(newState).toEqual({
          psbt: 'merged_psbt_string',
          signatures: ['old_sig', 'new_psbt'],
        });
      });

      it('should emit to networkSignatureReceived$ if fingerprint and sessionId exist', () => {
        const nextSpy = vi.spyOn(service.networkSignatureReceived$, 'next');

        newPartialDecryptedSubject.next({
          payload: { decryptedPsbt: 'psbt', fingerprint: '1234', sessionId: 's1' },
        });

        expect(nextSpy).toHaveBeenCalledWith({ fingerprint: '1234', sessionId: 's1' });
      });

      it('should NOT emit to networkSignatureReceived$ if fingerprint or sessionId are missing', () => {
        const nextSpy = vi.spyOn(service.networkSignatureReceived$, 'next');

        newPartialDecryptedSubject.next({
          payload: { decryptedPsbt: 'psbt', fingerprint: '1234', sessionId: null },
        });

        expect(nextSpy).not.toHaveBeenCalled();
      });
    });
  });

  it('should call sdk disconnect and set status signal to disconnected', () => {
    const disconnectSpy = vi.spyOn(service.sdk, 'disconnect');
    const statusSpy = vi.spyOn(service.status, 'set');

    service.disconnect();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(statusSpy).toHaveBeenCalledWith('disconnected');
  });

  it('should return early if the status is already connecting', async () => {
    service.status.set('connecting');

    const resetSpy = vi.spyOn(service, 'reset');
    const joinRoomSpy = vi.spyOn(service.sdk, 'joinRoom');

    await service.connect('room_123', 'my_key');

    expect(resetSpy).not.toHaveBeenCalled();
    expect(joinRoomSpy).not.toHaveBeenCalled();
  });

  it('should catch an error and set status to error if no key is provided', async () => {
    service.status.set('disconnected');
    const statusSpy = vi.spyOn(service.status, 'set');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await service.connect('room_123', null);

    expect(statusSpy).toHaveBeenCalledWith('connecting');
    expect(statusSpy).toHaveBeenCalledWith('error');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should disconnect and wait if the SDK store state is not null', async () => {
    service.status.set('disconnected');

    vi.spyOn(service.sdk.store, 'getState').mockReturnValue({ existing: 'state' } as any);

    const disconnectSpy = vi.spyOn(service.sdk, 'disconnect');
    const joinRoomSpy = vi.spyOn(service.sdk, 'joinRoom');

    await service.connect('room_123', 'my_key');

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(joinRoomSpy).toHaveBeenCalledWith('room_123', 'my_key');
  });

  it('should skip browser-specific logic if not in a browser environment', async () => {
    service.status.set('disconnected');
    service.isBrowser = false;
    vi.spyOn(service.sdk.store, 'getState').mockReturnValue(null as any); // Reset store state

    const claimCoordinatorSpy = vi.spyOn(service.sdk, 'claimCoordinator');
    const setDisplayNameSpy = vi.spyOn(service.sdk, 'setDisplayName');
    const statusSpy = vi.spyOn(service.status, 'set');

    await service.connect('room_123', 'my_key');

    expect(claimCoordinatorSpy).not.toHaveBeenCalled();
    expect(setDisplayNameSpy).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith('connected');
  });

  it('should claim coordinator and set display name if tokens exist in the browser', async () => {
    service.status.set('disconnected');
    service.isBrowser = true;
    vi.spyOn(service.sdk.store, 'getState').mockReturnValue(null as any);

    vi.spyOn(globalThis.sessionStorage, 'getItem').mockImplementation((key: string) => {
      if (key === 'admin_token_room_123') return 'secure_admin_token';
      return null;
    });

    vi.spyOn(globalThis.localStorage, 'getItem').mockImplementation((key: string) => {
      if (key === 'display_name_room_123') return 'Alice';
      return null;
    });

    const encryptionDecryptSpy = vi.spyOn(service['encryptionEngine'], 'decrypt');
    const claimCoordinatorSpy = vi.spyOn(service.sdk, 'claimCoordinator');
    const setDisplayNameSpy = vi.spyOn(service.sdk, 'setDisplayName');
    const statusSpy = vi.spyOn(service.status, 'set');

    // 2. Act
    await service.connect('room_123', 'my_key');

    // 3. Assert
    expect(encryptionDecryptSpy).toHaveBeenCalledWith('secure_admin_token', 'my_key');
    expect(claimCoordinatorSpy).toHaveBeenCalledWith('decrypted_admin_token'); // Expect the decrypted token
    expect(setDisplayNameSpy).toHaveBeenCalledWith('Alice');
    expect(statusSpy).toHaveBeenCalledWith('connected');
  });

  it('should catch joinRoom failures and set status to error', async () => {
    service.status.set('disconnected');
    vi.spyOn(service.sdk.store, 'getState').mockReturnValue(null as any);

    vi.spyOn(service.sdk, 'joinRoom').mockRejectedValue(new Error('Network failure'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const statusSpy = vi.spyOn(service.status, 'set');

    await service.connect('room_123', 'my_key');

    expect(consoleSpy).toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith('error');
  });

  it('should delegate createRoom to the SDK', async () => {
    const createRoomSpy = vi.spyOn(service.sdk, 'createRoom');
    const psbt = 'Chn...';
    const network = 'signet';
    const roomName = 'my room';

    await service.createRoom(psbt, network, roomName);

    expect(createRoomSpy).toHaveBeenCalledWith(psbt, network, roomName);
    expect(createRoomSpy).toHaveBeenCalledTimes(1);
  });

  it('should delegate renameRoom to the SDK', async () => {
    const renameRoomSpy = vi.spyOn(service.sdk, 'setRoomName');
    const roomName = 'my room';

    await service.renameRoom(roomName);

    expect(renameRoomSpy).toHaveBeenCalledWith(roomName);
    expect(renameRoomSpy).toHaveBeenCalledTimes(1);
  });

  it('should save the name to local storage if room state exists and delegate to SDK', async () => {
    const getRoomStateSpy = vi
      .spyOn(service.sdk, 'getRoomState')
      .mockReturnValue({ roomId: 'room_123' } as any);
    const setItemSpy = vi.spyOn(globalThis.localStorage, 'setItem');

    const setDisplayNameSpy = vi.spyOn(service.sdk, 'setDisplayName').mockResolvedValue(undefined);
    const newName = 'Alice';

    await service.setDisplayName(newName);

    expect(getRoomStateSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith('display_name_room_123', newName);
    expect(setDisplayNameSpy).toHaveBeenCalledWith(newName);
    expect(setDisplayNameSpy).toHaveBeenCalledTimes(1);
  });

  it('should NOT save to local storage if room state is null, but still delegate to SDK', async () => {
    const getRoomStateSpy = vi.spyOn(service.sdk, 'getRoomState').mockReturnValue(null as any);
    const setItemSpy = vi.spyOn(globalThis.localStorage, 'setItem');
    const setDisplayNameSpy = vi.spyOn(service.sdk, 'setDisplayName').mockResolvedValue(undefined);

    const newName = 'Bob';

    await service.setDisplayName(newName);

    expect(getRoomStateSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(setDisplayNameSpy).toHaveBeenCalledWith(newName);
    expect(setDisplayNameSpy).toHaveBeenCalledTimes(1);
  });

  it('should close the room and clear storage when state exists', async () => {
    const closeRoomSpy = vi.spyOn(service.sdk, 'closeRoom').mockResolvedValue(undefined);
    const getRoomStateSpy = vi
      .spyOn(service.sdk, 'getRoomState')
      .mockReturnValue({ roomId: 'room_123' } as any);

    const sessionRemoveSpy = vi.spyOn(globalThis.sessionStorage, 'removeItem');
    const localRemoveSpy = vi.spyOn(globalThis.localStorage, 'removeItem');

    await service.closeRoom();

    expect(closeRoomSpy).toHaveBeenCalledTimes(1);
    expect(getRoomStateSpy).toHaveBeenCalledTimes(1);
    expect(sessionRemoveSpy).toHaveBeenCalledWith('admin_token_room_123');
    expect(localRemoveSpy).toHaveBeenCalledWith('display_name_room_123');
  });

  it('should close the room but NOT clear storage if state is null', async () => {
    const closeRoomSpy = vi.spyOn(service.sdk, 'closeRoom').mockResolvedValue(undefined);
    const getRoomStateSpy = vi.spyOn(service.sdk, 'getRoomState').mockReturnValue(null as any);

    const sessionRemoveSpy = vi.spyOn(globalThis.sessionStorage, 'removeItem');
    const localRemoveSpy = vi.spyOn(globalThis.localStorage, 'removeItem');

    await service.closeRoom();

    expect(closeRoomSpy).toHaveBeenCalledTimes(1);
    expect(getRoomStateSpy).toHaveBeenCalledTimes(1);

    expect(sessionRemoveSpy).not.toHaveBeenCalled();
    expect(localRemoveSpy).not.toHaveBeenCalled();
  });

  it('should delegate toggleLock to the SDK', async () => {
    const toggleLockSpy = vi.spyOn(service.sdk, 'toggleLock');
    const isLocked = true;

    await service.toggleLock(isLocked);

    expect(toggleLockSpy).toHaveBeenCalledWith(isLocked);
    expect(toggleLockSpy).toHaveBeenCalledTimes(1);
  });

  it('should delegate updateWhitelist to the SDK', async () => {
    const updateWhitelistBatchSpy = vi.spyOn(service.sdk, 'updateWhitelist');
    const addresses = ['bc11', 'bc12'];
    const remove = false;

    await service.updateWhitelist(addresses, remove);

    expect(updateWhitelistBatchSpy).toHaveBeenCalledWith(addresses, remove);
    expect(updateWhitelistBatchSpy).toHaveBeenCalledTimes(1);
  });

  it('should delegate claimCoordinator to the SDK', async () => {
    const claimCoordinatorSpy = vi.spyOn(service.sdk, 'claimCoordinator');
    const secureToken = 'my token';

    await service.claimCoordinator(secureToken);

    expect(claimCoordinatorSpy).toHaveBeenCalledWith(secureToken);
    expect(claimCoordinatorSpy).toHaveBeenCalledTimes(1);
  });

  it('should delegate getRoomLink to the SDK', async () => {
    const appBaseUrl = 'mybaseurl';
    const includeKey = false;
    const getRoomLinkSpy = vi.spyOn(service.sdk, 'getRoomLink').mockReturnValue(appBaseUrl);

    const link = service.getRoomLink(appBaseUrl, includeKey);

    expect(link).toBe(appBaseUrl);
    expect(getRoomLinkSpy).toHaveBeenCalledWith(appBaseUrl, includeKey);
    expect(getRoomLinkSpy).toHaveBeenCalledTimes(1);
  });

  it('should delegate logAction to the SDK', async () => {
    const logSpy = vi.spyOn(service.sdk, 'logParticipantAction');

    await service.logAction('Test Action', 'Test Detail');

    expect(logSpy).toHaveBeenCalledWith('Test Action', 'Test Detail');
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('should delegate getAuditLogCsv to the SDK', () => {
    const mockCsvData = 'timestamp,action\n123456,test_action';
    const getAuditLogCsvSpy = vi.spyOn(service.sdk, 'getAuditLogCsv').mockReturnValue(mockCsvData);

    const result = service.getAuditLogCsv();

    expect(result).toBe(mockCsvData);
    expect(getAuditLogCsvSpy).toHaveBeenCalledTimes(1);
  });

  it('should delegate getSettlementCsvData to the SDK', () => {
    const mockSettlementData = 'id,amount\n1,5000';
    const getSettlementCsvDataSpy = vi
      .spyOn(service.sdk, 'getSettlementCsvData')
      .mockReturnValue(mockSettlementData);

    const result = service.getSettlementCsvData();

    expect(result).toBe(mockSettlementData);
    expect(getSettlementCsvDataSpy).toHaveBeenCalledTimes(1);
  });

  it('should delegate getAuditLogPdf to the SDK', async () => {
    const mockPdfBlob = new Blob(['pdf content'], { type: 'application/pdf' }); // Mocking a standard return type
    const getAuditLogPdfSpy = vi
      .spyOn(service.sdk, 'getAuditLogPdf')
      .mockResolvedValue(mockPdfBlob as any);

    const result = await service.getAuditLogPdf();

    expect(result).toBe(mockPdfBlob);
    expect(getAuditLogPdfSpy).toHaveBeenCalledTimes(1);
  });

  it('should reset all state signals to their default values (state assertion)', () => {
    service.role.set('admin');
    service.isClosed.set(true);
    service.decryptionError.set('Invalid key');
    service.isLockedOut.set(true);
    service.isRoomFull.set(true);
    service.roomNotFound.set(true);
    service.activeSessions.set([{ id: '123', role: 'admin' }]);
    service.status.set('connected');

    service.reset();

    expect(service.role()).toBe('guest');
    expect(service.isClosed()).toBe(false);
    expect(service.decryptionError()).toBeNull();
    expect(service.isLockedOut()).toBe(false);
    expect(service.isRoomFull()).toBe(false);
    expect(service.roomNotFound()).toBe(false);
    expect(service.activeSessions()).toEqual([]);
    expect(service.status()).toBe('disconnected');
  });

  it('should initialize error signals with default values and allow updates', () => {
    expect(service.isRoomFull()).toBe(false);
    expect(service.isClosed()).toBe(false);
    expect(service.isLockedOut()).toBe(false);
    expect(service.roomNotFound()).toBe(false);
    expect(service.decryptionError()).toBeNull();

    service.isRoomFull.set(true);
    service.isClosed.set(true);
    service.isLockedOut.set(true);
    service.roomNotFound.set(true);
    service.decryptionError.set('error');
    expect(service.isRoomFull()).toBe(true);
    expect(service.isClosed()).toBe(true);
    expect(service.isLockedOut()).toBe(true);
    expect(service.roomNotFound()).toBe(true);
    expect(service.decryptionError()).toBe('error');
  });

  it('should retrieve a label from local storage based on fingerprint', () => {
    vi.spyOn(globalThis.localStorage, 'getItem').mockReturnValue('My Saved Label');
    const fingerprint = '1234abcd';

    const result = service.getLocalLabel(fingerprint);

    expect(globalThis.localStorage.getItem).toHaveBeenCalledWith(`addr_book_${fingerprint}`);
    expect(result).toBe('My Saved Label');
  });

  it('should save a label to local storage based on fingerprint', () => {
    const setItemSpy = vi.spyOn(globalThis.localStorage, 'setItem');
    const fingerprint = '1234abcd';
    const label = 'Alice';

    service.saveToAddressBook(fingerprint, label);

    expect(setItemSpy).toHaveBeenCalledWith(`addr_book_${fingerprint}`, label);
  });

  it('should remove a label from local storage based on fingerprint', () => {
    const removeItemSpy = vi.spyOn(globalThis.localStorage, 'removeItem');
    const fingerprint = '1234abcd';

    service.removeFromAddressBook(fingerprint);

    expect(removeItemSpy).toHaveBeenCalledWith(`addr_book_${fingerprint}`);
  });

  it('should update signer label in local storage and delegate to the SDK', async () => {
    const setItemSpy = vi.spyOn(globalThis.localStorage, 'setItem');
    const getRoomStateSpy = vi
      .spyOn(service.sdk, 'getRoomState')
      .mockReturnValue({ roomId: 'room_1' } as any);
    const setSignerLabelSpy = vi.spyOn(service.sdk, 'setSignerLabel');

    const fingerprint = '1234abcd';
    const label = 'Bob';

    await service.updateSignerLabel(fingerprint, label);

    expect(getRoomStateSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith(`signer_label_room_1_${fingerprint}`, label);
    expect(setSignerLabelSpy).toHaveBeenCalledWith(fingerprint, label);
    expect(setSignerLabelSpy).toHaveBeenCalledTimes(1);
  });

  it('should not call local storage and delegate to the SDK', async () => {
    const setItemSpy = vi.spyOn(globalThis.localStorage, 'setItem');
    const getRoomStateSpy = vi.spyOn(service.sdk, 'getRoomState').mockReturnValue(undefined as any);
    const setSignerLabelSpy = vi.spyOn(service.sdk, 'setSignerLabel');

    const fingerprint = '1234abcd';
    const label = 'Bob';

    await service.updateSignerLabel(fingerprint, label);

    expect(getRoomStateSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledTimes(0);
    expect(setSignerLabelSpy).toHaveBeenCalledWith(fingerprint, label);
    expect(setSignerLabelSpy).toHaveBeenCalledTimes(1);
  });

  it('should return early if the user is not a coordinator', () => {
    service.role.set('guest');
    const roomStateSpy = vi.spyOn(service, 'roomState');

    service.checkAndApplyLocalLabels();

    // If it returned early, it should never have tried to read roomState
    expect(roomStateSpy).not.toHaveBeenCalled();
  });

  it('should return early if roomState is null', () => {
    service.role.set('admin');
    service.roomState.set(null);
    const signersSpy = vi.spyOn(service, 'signers');

    service.checkAndApplyLocalLabels();

    expect(signersSpy).not.toHaveBeenCalled();
  });

  it('should handle roomState when signerLabels is undefined (fallback to empty object)', () => {
    service.role.set('admin');

    service.roomState.set({ roomId: 'test_room' } as any);

    vi.spyOn(service, 'signers').mockReturnValue([{ fingerprint: 'fp_1' }] as any[]);
    vi.spyOn(service, 'getLocalLabel').mockReturnValue('Charlie');

    const updateSignerLabelSpy = vi
      .spyOn(service, 'updateSignerLabel')
      .mockResolvedValue(undefined);

    service.checkAndApplyLocalLabels();

    // Should successfully fall back to {} and process the label
    expect(updateSignerLabelSpy).toHaveBeenCalledWith('fp_1', 'Charlie');
    expect(updateSignerLabelSpy).toHaveBeenCalledTimes(1);
  });

  it('should process signers correctly based on existing and local labels', () => {
    service.role.set('admin');
    service.roomState.set({ signerLabels: { fp_exists: 'Alice' } } as any);

    vi.spyOn(service, 'signers').mockReturnValue([
      { fingerprint: 'fp_exists' },
      { fingerprint: 'fp_no_local' },
      { fingerprint: 'fp_has_local' },
    ] as any[]);

    const getLocalLabelSpy = vi.spyOn(service, 'getLocalLabel').mockImplementation((fp) => {
      if (fp === 'fp_has_local') return 'Bob';
      return null;
    });

    const updateSignerLabelSpy = vi
      .spyOn(service, 'updateSignerLabel')
      .mockResolvedValue(undefined);

    service.checkAndApplyLocalLabels();

    // Assert 'fp_exists' was skipped entirely because it was already in state
    expect(getLocalLabelSpy).not.toHaveBeenCalledWith('fp_exists');

    // Assert 'fp_no_local' was checked locally, but not updated because no label was returned
    expect(getLocalLabelSpy).toHaveBeenCalledWith('fp_no_local');
    expect(updateSignerLabelSpy).not.toHaveBeenCalledWith('fp_no_local', expect.anything());

    // Assert 'fp_has_local' was checked locally and successfully updated
    expect(getLocalLabelSpy).toHaveBeenCalledWith('fp_has_local');
    expect(updateSignerLabelSpy).toHaveBeenCalledWith('fp_has_local', 'Bob');

    expect(updateSignerLabelSpy).toHaveBeenCalledTimes(1);
  });

  it('should extract the fingerprint and upload the signature', async () => {
    const mockPsbt = 'base64_psbt_string';
    const mockFingerprint = '1234abcd';

    const extractSpy = vi
      .spyOn(service.sdk, 'extractFingerprintFromSignature')
      .mockReturnValue(mockFingerprint);
    const uploadSpy = vi.spyOn(service.sdk, 'uploadSignature').mockResolvedValue(undefined);

    await service.uploadSignature(mockPsbt);

    expect(extractSpy).toHaveBeenCalledWith(mockPsbt);
    expect(uploadSpy).toHaveBeenCalledWith(mockPsbt, mockFingerprint);
    expect(uploadSpy).toHaveBeenCalledTimes(1);
  });

  it('should throw an error if the fingerprint cannot be extracted', async () => {
    const mockPsbt = 'invalid_psbt_string';

    const extractSpy = vi
      .spyOn(service.sdk, 'extractFingerprintFromSignature')
      .mockReturnValue(null as any);
    const uploadSpy = vi.spyOn(service.sdk, 'uploadSignature');

    await expect(service.uploadSignature(mockPsbt)).rejects.toThrow(
      'Could not extract fingerprint from PSBT',
    );

    expect(extractSpy).toHaveBeenCalledWith(mockPsbt);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  describe('getFinalTxHex', () => {
    it('should return null if the user is not an admin', () => {
      service.role.set('guest');

      const result = service.getFinalTxHex();

      expect(result).toBeNull();
    });

    it('should return null if the room state or psbt is missing', () => {
      service.role.set('admin');

      service.roomState.set(null);
      expect(service.getFinalTxHex()).toBeNull();

      service.roomState.set({ roomId: '123' } as any);
      expect(service.getFinalTxHex()).toBeNull();
    });

    it('should return null if PsbtUtils.finalizeTx fails or returns no hex', () => {
      service.role.set('admin');
      service.roomState.set({ psbt: 'valid_psbt_base64' } as any);

      const finalizeSpy = vi.spyOn(PsbtUtils, 'finalizeTx').mockReturnValue(null);

      const result = service.getFinalTxHex();

      expect(result).toBeNull();
      expect(finalizeSpy).toHaveBeenCalledWith('valid_psbt_base64');
    });

    it('should return the finalized hex string if all conditions are met', () => {
      service.role.set('admin');
      service.roomState.set({ psbt: 'valid_psbt_base64' } as any);

      const mockHex = '010000000001...';
      const finalizeSpy = vi
        .spyOn(PsbtUtils, 'finalizeTx')
        .mockReturnValue({ hex: mockHex, txId: 'txid_123' });

      const result = service.getFinalTxHex();

      expect(result).toBe(mockHex);
      expect(finalizeSpy).toHaveBeenCalledWith('valid_psbt_base64');
    });
  });

  describe('getFinalTxId', () => {
    it('should return null if the user is not an admin', () => {
      service.role.set('guest');

      const result = service.getFinalTxId();

      expect(result).toBeNull();
    });

    it('should return null if the room state or psbt is missing', () => {
      service.role.set('admin');
      service.roomState.set(null);

      expect(service.getFinalTxId()).toBeNull();
    });

    it('should return null if PsbtUtils.finalizeTx fails or returns no txId', () => {
      service.role.set('admin');
      service.roomState.set({ psbt: 'valid_psbt_base64' } as any);

      const finalizeSpy = vi
        .spyOn(PsbtUtils, 'finalizeTx')
        .mockReturnValue({ hex: 'some_hex' } as any);

      const result = service.getFinalTxId();

      expect(result).toBeNull();
      expect(finalizeSpy).toHaveBeenCalledWith('valid_psbt_base64');
    });

    it('should return the finalized txId string if all conditions are met', () => {
      service.role.set('admin');
      service.roomState.set({ psbt: 'valid_psbt_base64' } as any);

      const mockTxId = 'abcd1234efgh5678...';
      const finalizeSpy = vi
        .spyOn(PsbtUtils, 'finalizeTx')
        .mockReturnValue({ hex: 'some_hex', txId: mockTxId });

      const result = service.getFinalTxId();

      expect(result).toBe(mockTxId);
      expect(finalizeSpy).toHaveBeenCalledWith('valid_psbt_base64');
    });
  });

  describe('mergePsbts', () => {
    it('should delegate to PsbtUtils.merge and return the result', () => {
      const basePsbt = 'base_psbt_string';
      const nextPsbt = 'next_psbt_string';
      const mergedResult = 'merged_psbt_string';

      const mergeSpy = vi.spyOn(PsbtUtils, 'merge').mockReturnValue(mergedResult);

      const result = service.mergePsbts(basePsbt, nextPsbt);

      expect(result).toBe(mergedResult);
      expect(mergeSpy).toHaveBeenCalledWith(basePsbt, nextPsbt);
    });
  });

  describe('getThreshold', () => {
    it('should delegate to PsbtUtils.getThreshold and return the result', () => {
      const psbtBase64 = 'some_psbt_string';
      const mockThreshold = 3;

      const getThresholdSpy = vi.spyOn(PsbtUtils, 'getThreshold').mockReturnValue(mockThreshold);

      const result = service.getThreshold(psbtBase64);

      expect(result).toBe(mockThreshold);
      expect(getThresholdSpy).toHaveBeenCalledWith(psbtBase64);
    });
  });

  it('should delegate finalizeTransaction to the SDK', async () => {
    const expectedValue = { hex: '00200', txId: '123' };
    const finalizeSpy = vi
      .spyOn(service.sdk, 'finalizeTransaction')
      .mockResolvedValue(expectedValue);

    const result = await service.finalizeTransaction();

    expect(result).toBe(expectedValue);
    expect(finalizeSpy).toHaveBeenCalledTimes(1);
  });
});
