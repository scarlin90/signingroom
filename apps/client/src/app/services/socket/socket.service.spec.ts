import { TestBed } from '@angular/core/testing';
import { SocketService } from './socket.service';
import { Subject } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { PsbtUtils, SigningRoomClient } from '@signing-room/sdk';

const mockSubjects: Record<string, Subject<any>> = {};

const mockStore = {
  getState: vi.fn(() => null),
  update: vi.fn((updater: any) => {
    const dummyState = { signatures: [] };
    updater(dummyState);
  }),
};

vi.mock('@signing-room/sdk', () => {
  return {
    PROTOCOL_VERSION: '1.0.0',
    PsbtUtils: {
      finalizeTx: vi.fn(),
      merge: vi.fn((a, b) => 'merged-psbt'),
      getThreshold: vi.fn(() => 2),
    },
    SigningRoomClient: vi.fn(function () {
      return {
        relay: {
          events: {
            on: vi.fn((evtName: string) => {
              if (!mockSubjects[evtName]) mockSubjects[evtName] = new Subject();
              return mockSubjects[evtName];
            }),
          },
          claimCoordinator: vi.fn(),
        },
        store: mockStore,
        onStateChange: vi.fn(() => new Subject()),
        getRoomState: vi.fn(() => ({
          roomId: 'room-123',
          network: 'bitcoin',
          psbt: 'tx1',
          signatures: [],
        })),
        getSignersStatus: vi.fn(() => [{ fingerprint: 'fp1', signed: true }]),
        getTxDetails: vi.fn(() => ({ amount: 50000 })),
        getThreshold: vi.fn(() => 2),
        createRoom: vi.fn().mockResolvedValue({ roomId: 'new-room' }),
        joinRoom: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
        extractFingerprintFromSignature: vi.fn(() => 'fp-extracted'),
        uploadSignature: vi.fn(),
        closeRoom: vi.fn(),
        logParticipantAction: vi.fn(),
        setRoomName: vi.fn(),
        setSignerLabel: vi.fn(),
        setDisplayName: vi.fn(),
        updateWhitelistBatch: vi.fn(),
        toggleLock: vi.fn(),
        finalizeTransaction: vi.fn(),
        getAuditLogCsv: vi.fn(() => 'csv-data'),
        getSettlementCsvData: vi.fn(() => 'settlement-data'),
        getAuditLogPdf: vi.fn().mockResolvedValue({}),
        getRoomLink: vi.fn(() => 'https://app.com/room#key'),
        claimCoordinator: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

describe('SocketService', () => {
  let service: SocketService;

  // Storage Spies
  let setSessionSpy: Mock;
  let getSessionSpy: Mock;
  let removeSessionSpy: Mock;
  let setLocalSpy: Mock;
  let getLocalSpy: Mock;
  let removeLocalSpy: Mock;

  // Safe isolated storage mocker for JSDOM
  const createMockStorage = () => {
    let store: Record<string, string> = {};
    return {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value.toString();
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
    };
  };

  beforeEach(() => {
    vi.useFakeTimers();

    Object.keys(mockSubjects).forEach((k) => delete mockSubjects[k]);

    // Construct safe globally-stubbed storage units to avoid JSDOM undefined errors
    const mockLocalStorage = createMockStorage();
    const mockSessionStorage = createMockStorage();

    vi.stubGlobal('localStorage', mockLocalStorage);
    vi.stubGlobal('sessionStorage', mockSessionStorage);

    setSessionSpy = mockSessionStorage.setItem;
    getSessionSpy = mockSessionStorage.getItem;
    removeSessionSpy = mockSessionStorage.removeItem;

    setLocalSpy = mockLocalStorage.setItem;
    getLocalSpy = mockLocalStorage.getItem;
    removeLocalSpy = mockLocalStorage.removeItem;

    TestBed.configureTestingModule({
      providers: [SocketService],
    });

    service = TestBed.inject(SocketService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Initialization and Event Wiring', () => {
    it('should initialize with disconnected state and proper SDK bindings', () => {
      expect(service.status()).toBe('disconnected');
      expect(service.sdk).toBeDefined();
      expect(SigningRoomClient).toHaveBeenCalled();
    });

    it('should update status when ROOM_CONNECTED fires', () => {
      mockSubjects['ROOM_CONNECTED'].next({});
      expect(service.status()).toBe('connected');
    });

    it('should update roomState automatically when STATE_CHANGED fires', () => {
      mockSubjects['STATE_CHANGED'].next({ payload: { roomId: 'new-id' } });
      expect(service.roomState()?.roomId).toBe('new-id');
    });
  });

  describe('Connection Management', () => {
    it('should orchestrate room connection and handle stored admin tokens natively', async () => {
      getSessionSpy.mockImplementation((key) => {
        if (key === 'admin_token_room-test') return 'super-secret-token';
        return null;
      });
      getLocalSpy.mockImplementation((key) => {
        if (key === 'display_name_room-test') return 'Alice';
        return null;
      });

      // Because mockStore.getState() is null, this will instantly resolve without the 50ms delay
      await service.connect('room-test', 'room-key');

      expect(service.status()).toBe('connected');
      expect(service.sdk.joinRoom).toHaveBeenCalledWith('room-test', 'room-key');
      expect(service.sdk.claimCoordinator).toHaveBeenCalledWith('super-secret-token');
      expect(service.sdk.setDisplayName).toHaveBeenCalledWith('Alice');
    });

    it('should reject connection safely if key is completely missing', async () => {
      await service.connect('room-123', null);
      expect(service.status()).toBe('error');
      expect(service.sdk.joinRoom).not.toHaveBeenCalled();
    });

    it('should attempt automatic reconnection after 3 seconds upon ROOM_DISCONNECTED', async () => {
      service.setRoomKey('active-key');
      service.roomState.set({ roomId: 'room-123' } as any);

      mockSubjects['ROOM_CONNECTED'].next({});
      expect(service.status()).toBe('connected');

      mockSubjects['ROOM_DISCONNECTED'].next({});
      expect(service.status()).toBe('disconnected');

      await vi.advanceTimersByTimeAsync(3100);

      expect(service.sdk.joinRoom).toHaveBeenCalledWith('room-123', 'active-key');
    });
  });

  describe('Protocol Error Pipelines', () => {
    it('should lock out user and disconnect upon locked protocol error', () => {
      mockSubjects['PROTOCOL_ERROR'].next({ payload: { type: 'locked' } });
      expect(service.isLockedOut()).toBe(true);
      expect(service.sdk.disconnect).toHaveBeenCalled();
    });

    it('should mark room not found and disconnect upon not_found protocol error', () => {
      mockSubjects['PROTOCOL_ERROR'].next({ payload: { type: 'not_found' } });
      expect(service.roomNotFound()).toBe(true);
      expect(service.sdk.disconnect).toHaveBeenCalled();
    });

    it('should trip decryption error flags and wipe local key caches upon DECRYPTION_ERROR', () => {
      service.setRoomKey('bad-key');
      mockSubjects['DECRYPTION_ERROR'].next({ payload: 'Invalid key' });
      expect(service.decryptionError()).toBe('Invalid key');
      expect(service.getRoomKey()).toBeNull();
      expect(service.sdk.disconnect).toHaveBeenCalled();
    });

    it('should increment tracking variables and push to security channel on access_denied', () => {
      let alertCount = 0;
      service.securityAlert$.subscribe((alert) => (alertCount = alert.count));

      mockSubjects['PROTOCOL_ERROR'].next({ payload: { type: 'access_denied' } });

      expect(service.decryptionError()).toBe('Invalid decryption key. Access denied.');
      expect(service.getRoomKey()).toBeNull();
      expect(alertCount).toBe(1);

      mockSubjects['PROTOCOL_ERROR'].next({ payload: { type: 'access_denied' } });
      expect(alertCount).toBe(2);
    });
  });

  describe('Event Integrations & SDK Reconciliations', () => {
    it('should capture incoming signatures and trigger PSBT merges inside store.update()', () => {
      const signatureEvent = { decryptedPsbt: 'sig1', fingerprint: 'fp123', sessionId: 'sess-a' };

      let observedFingerprint = '';
      service.networkSignatureReceived$.subscribe(
        (data) => (observedFingerprint = data.fingerprint),
      );

      mockSubjects['NEW_PARTIAL_DECRYPTED'].next({ payload: signatureEvent });

      expect(mockStore.update).toHaveBeenCalled();
      expect(PsbtUtils.merge).toHaveBeenCalled();
      expect(observedFingerprint).toBe('fp123');
    });

    it('should map role changes efficiently to the Role signal and announce initial coordinator joins', () => {
      mockSubjects['ROLE_UPDATE'].next({ payload: 'admin' });
      expect(service.role()).toBe('admin');
      expect(service.isCoordinator()).toBe(true);
    });

    it('should gracefully clean up local storage scopes dynamically when the room closes entirely', () => {
      service.roomState.set({ roomId: 'room-123' } as any);

      mockSubjects['ROOM_CLOSED'].next({});

      expect(service.isClosed()).toBe(true);
      expect(service.sdk.disconnect).toHaveBeenCalled();

      expect(removeSessionSpy).toHaveBeenCalledWith('admin_token_room-123');
      expect(removeLocalSpy).toHaveBeenCalledWith('display_name_room-123');
    });
  });

  describe('Outbound Actions', () => {
    it('should extract fingerprints reliably before executing signature uploads', async () => {
      await service.uploadSignature('psbt_base64_data');
      expect(service.sdk.extractFingerprintFromSignature).toHaveBeenCalledWith('psbt_base64_data');
      expect(service.sdk.uploadSignature).toHaveBeenCalledWith('psbt_base64_data', 'fp-extracted');
    });

    it('should throw error if signature upload fails fingerprint extraction', async () => {
      // @ts-ignore
      service.sdk.extractFingerprintFromSignature.mockReturnValueOnce(null);
      await expect(service.uploadSignature('bad_psbt')).rejects.toThrow(
        'Could not extract fingerprint',
      );
    });

    it('should close room safely and destroy browser session footprints manually', async () => {
      service.roomState.set({ roomId: 'room-123' } as any);
      await service.closeRoom();

      expect(service.sdk.closeRoom).toHaveBeenCalled();
      expect(removeSessionSpy).toHaveBeenCalledWith('admin_token_room-123');
    });

    it('should map personal display name state updates to local persistence blocks securely', async () => {
      service.roomState.set({ roomId: 'room-123' } as any);
      await service.setDisplayName('Bob');

      expect(setLocalSpy).toHaveBeenCalledWith('display_name_room-123', 'Bob');
      expect(service.sdk.setDisplayName).toHaveBeenCalledWith('Bob');
    });

    it('should proxy address book operations strictly to localStorage domains', () => {
      service.saveToAddressBook('fp999', 'Coldcard');
      expect(setLocalSpy).toHaveBeenCalledWith('addr_book_fp999', 'Coldcard');

      service.removeFromAddressBook('fp999');
      expect(removeLocalSpy).toHaveBeenCalledWith('addr_book_fp999');
    });
  });

  describe('Computed State & Data Getters', () => {
    it('should reflect accurate network status using computed threshold values', () => {
      expect(service.signerCount()).toBe(1);
      expect(service.signerThreshold()).toBe(2);
      expect(service.isReadyToBroadcast()).toBe(false);

      // @ts-ignore
      service.sdk.getThreshold.mockReturnValueOnce(1);

      // Bump reference dependency to trigger computed signal update
      service.roomState.set({ ...service.roomState()! });
      expect(service.isReadyToBroadcast()).toBe(true);
    });

    it('should block getFinalTxHex operations cleanly if role is entirely guest-based', () => {
      service.role.set('guest');
      expect(service.getFinalTxHex()).toBeNull();

      service.role.set('admin');
      service.roomState.set({ psbt: 'valid-psbt' } as any);

      // @ts-ignore
      PsbtUtils.finalizeTx.mockReturnValueOnce({ hex: 'final-hex-abc' });
      expect(service.getFinalTxHex()).toBe('final-hex-abc');
    });
  });
});
