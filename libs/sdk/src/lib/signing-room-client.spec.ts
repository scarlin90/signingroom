import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SigningRoomClient } from './signing-room-client';
import { RoomFactory } from './relay/room-factory';
import { RoomAuditor } from './bitcoin/room-auditor';
import { PsbtUtils } from './bitcoin/psbt-utils';
import { Subject } from 'rxjs';

vi.mock('./relay/room-factory');
vi.mock('./bitcoin/room-auditor');
vi.mock('./bitcoin/psbt-utils');

describe('SigningRoomClient', () => {
  let client: SigningRoomClient;
  const eventSubject: Subject<any> = new Subject();
  let mockRelay: any;
  let mockStore: any;
  let mockFetch: any;

  const createImmediateSub = (payload: any = {}) => ({
    subscribe: vi.fn().mockImplementation((cb: (e: any) => void) => {
      queueMicrotask(() => cb(payload));
      return { unsubscribe: vi.fn() };
    }),
  });

  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();

    mockFetch = vi.fn();
    global.fetch = mockFetch;

    (RoomFactory.prepareCreationPayload as any) = vi.fn().mockResolvedValue({
      localData: { roomId: 'room-123', encryptionKey: 'enc-key', adminSecret: 'admin-secret' },
      httpPayload: { adminToken: 'encrypted-token' },
    });

    (PsbtUtils.finalizeTx as any) = vi.fn().mockReturnValue({ hex: 'final-hex', txId: 'tx-123' });
    (PsbtUtils.analyze as any) = vi.fn().mockReturnValue({ signerCount: 3 });
    (PsbtUtils.parseTxDetails as any) = vi
      .fn()
      .mockReturnValue({ outputs: [], inputsList: [], fee: 1000 });
    (PsbtUtils.extractSigners as any) = vi.fn().mockReturnValue([]);
    (PsbtUtils.getFingerprintFromPsbt as any) = vi.fn().mockReturnValue('fingerprint-abc');

    (RoomAuditor.getAuditLogCsvData as any) = vi.fn().mockReturnValue('csv-data');
    (RoomAuditor.verifyRoomIntegrity as any) = vi
      .fn()
      .mockResolvedValue({ anchor: 'anchor', isValid: true });
    (RoomAuditor.calculateForensicAnchor as any) = vi.fn().mockResolvedValue('forensic-anchor');
    (RoomAuditor.getIntegrityReport as any) = vi.fn().mockResolvedValue({ report: 'full' });

    client = new SigningRoomClient({ apiUrl: 'https://test.api' });
    vi.spyOn(client.relay.events, 'on').mockReturnValue(eventSubject as any);

    mockRelay = client.relay as any;
    mockStore = client.store as any;

    mockRelay.joinRoom = vi.fn().mockResolvedValue(undefined);
    mockRelay.claimCoordinator = vi.fn();
    mockRelay.renameRoom = vi.fn().mockResolvedValue(undefined);
    mockRelay.toggleLock = vi.fn().mockResolvedValue(undefined);
    mockRelay.uploadSignature = vi.fn().mockResolvedValue(undefined);
    mockRelay.createSecureLogBlob = vi.fn().mockResolvedValue('encrypted-blob');
    mockRelay.send = vi.fn();
    mockRelay.setDisplayName = vi.fn().mockResolvedValue(undefined);
    mockRelay.updateSignerLabel = vi.fn().mockResolvedValue(undefined);
    mockRelay.closeRoom = vi.fn();
    mockRelay.broadcastFinalization = vi.fn().mockResolvedValue(undefined);
    mockRelay.updateWhitelist = vi.fn().mockResolvedValue(undefined);
    mockRelay.gracefullyDisconnect = vi.fn();

    mockRelay.events = {
      on: vi.fn().mockImplementation((eventType: string) => {
        // All relevant events for waitForEvent / waitForState
        return createImmediateSub();
      }),
    };

    mockStore.init = vi.fn();
    mockStore.getState = vi.fn().mockReturnValue(null);
    mockStore.update = vi.fn();
  });

  afterEach(() => vi.clearAllMocks());

  it('should initialize with correct API URL and protocol version', () => {
    const config = { apiUrl: 'https://test.api/', protocolVersion: '2.0.0' };
    const customClient = new SigningRoomClient(config);
    expect((customClient as any).apiUrl).toBe('https://test.api');
    expect((customClient as any).protocolVersion).toBe('2.0.0');
  });

  it('should return the correct user context based on role', () => {
    expect(client.userContext).toContain('Guest');

    (client as any)._role = 'admin';
    expect(client.userContext).toBe('Coordinator');
  });

  it('should provide onStateChange observable', () => {
    const observable = client.onStateChange();
    expect(observable).toBeDefined();
    expect(mockRelay.events.on).toHaveBeenCalledWith('STATE_CHANGED');
  });

  it('should return null when getting state from an uninitialized client', () => {
    expect(client.getRoomState()).toBeNull();
  });

  describe('createRoom', () => {
    it('should successfully create a room', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const result = await client.createRoom('psbt-base64', 'bitcoin', 'Test Room');

      expect(RoomFactory.prepareCreationPayload).toHaveBeenCalled();
      expect(mockStore.init).toHaveBeenCalled();
      expect(mockRelay.joinRoom).toHaveBeenCalled();
      expect(mockRelay.claimCoordinator).toHaveBeenCalled();
      expect(result).toEqual({
        roomId: 'room-123',
        encryptionKey: 'enc-key',
        adminSecret: 'admin-secret',
        encryptedAdminToken: 'encrypted-token',
      });
    });

    it('should throw an error on createRoom when the API request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Server Error',
      });

      await expect(client.createRoom('psbt', 'bitcoin')).rejects.toThrow(
        'Failed to create room: Server Error',
      );
    });
  });

  it('should join an existing room and cleanup subscription', async () => {
    let capturedCallback: () => void;
    const unsubscribeSpy = vi.fn();

    // Mock the subscription behavior
    vi.spyOn(mockRelay.events, 'on').mockImplementation((event) => {
      if (event === 'ROOM_CONNECTED') {
        return {
          subscribe: (cb: () => void) => {
            capturedCallback = cb;
            return { unsubscribe: unsubscribeSpy };
          },
        } as any;
      }
      return { subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) } as any;
    });

    // Trigger joinRoom
    const joinPromise = client.joinRoom('room-123', 'enc-key');

    // Verify encryption key is set immediately
    expect((client as any)._encryptionKey).toBe('enc-key');

    // Manually trigger the event to resolve the internal promise
    capturedCallback!();
    await joinPromise;

    // 5. Assertions
    expect(mockRelay.joinRoom).toHaveBeenCalledWith(
      expect.stringContaining('ws'),
      'room-123',
      'enc-key',
      expect.any(String),
    );
    expect(mockStore.init).toHaveBeenCalled();

    // Verify that the subscription was cleaned up
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('should set room name', async () => {
    await client.setRoomName('New Name');
    expect(mockRelay.renameRoom).toHaveBeenCalledWith('New Name', expect.any(String));
  });

  it('should toggle lock', async () => {
    await client.toggleLock(true);
    expect(mockRelay.toggleLock).toHaveBeenCalledWith(true, expect.any(String));
  });

  it('should upload signature', async () => {
    await client.uploadSignature('psbt', 'fingerprint');
    expect(mockRelay.uploadSignature).toHaveBeenCalledWith(
      'psbt',
      'fingerprint',
      expect.any(String),
    );
  });

  it('should log participant action', async () => {
    await client.logParticipantAction('Test Action', 'Test Detail');
    expect(mockRelay.createSecureLogBlob).toHaveBeenCalled();
    expect(mockRelay.send).toHaveBeenCalledWith('LOG_ACTION', expect.any(Object));
  });

  it('should set display name', async () => {
    await client.setDisplayName('Test User');
    expect(mockRelay.setDisplayName).toHaveBeenCalledWith('Test User');
    expect(mockRelay.createSecureLogBlob).toHaveBeenCalled(); // via logParticipantAction
  });

  it('should set signer label', async () => {
    await client.setSignerLabel('fprint', 'Label');
    expect(mockRelay.updateSignerLabel).toHaveBeenCalled();
  });

  it('should close room', async () => {
    await client.closeRoom();
    expect(mockRelay.closeRoom).toHaveBeenCalled();
  });

  it('should get audit log CSV', () => {
    mockStore.getState.mockReturnValueOnce({} as any);
    const csv = client.getAuditLogCsv();
    expect(csv).toBe('csv-data');
    expect(RoomAuditor.getAuditLogCsvData).toHaveBeenCalled();
  });

  it('should add whitelist address', async () => {
    mockStore.getState.mockReturnValueOnce({ whitelist: [] } as any);
    await client.addWhitelistAddress('bc1q...');
    expect(mockRelay.updateWhitelist).toHaveBeenCalled();
  });

  it('should update whitelist batch', async () => {
    mockStore.getState.mockReturnValueOnce({ whitelist: [] } as any);
    await client.updateWhitelistBatch(['addr1', 'addr2']);
    expect(mockRelay.updateWhitelist).toHaveBeenCalled();
  });

  describe('finalizeTransaction', () => {
    it('should return null if no state', async () => {
      const result = await client.finalizeTransaction();
      expect(result).toBeNull();
    });
  });

  it('should get final transaction hex', () => {
    mockStore.getState.mockReturnValueOnce({ finalTxHex: 'hex123' } as any);
    expect(client.getFinalTransactionHex()).toBe('hex123');
  });

  it('should disconnect', () => {
    const spy = vi.spyOn(mockRelay, 'gracefullyDisconnect');
    client.disconnect();
    expect(spy).toHaveBeenCalledWith(null);
  });

  it('should get signature progress', () => {
    mockStore.getState.mockReturnValueOnce({ psbt: 'psbt', signatures: ['sig1'] } as any);
    const progress = client.getSignatureProgress();
    expect(progress).toEqual({ totalSigners: 3, signaturesReceived: 1 });
  });

  it('should check if threshold met', () => {
    mockStore.getState.mockReturnValueOnce({ psbt: 'psbt' } as any);
    expect(client.isThresholdMet()).toBe(true);
  });

  it('should get signatures remaining', () => {
    mockStore.getState.mockReturnValueOnce({ signatures: ['sig1'] } as any);
    expect(client.getSignaturesRemaining(3)).toBe(2);
  });

  it('should get transaction details', () => {
    mockStore.getState.mockReturnValueOnce({ psbt: 'psbt', network: 'bitcoin' } as any);
    const details = client.getTransactionDetails();
    expect(details).toBeDefined();
  });

  it('should get signers status', () => {
    mockStore.getState.mockReturnValueOnce({ psbt: 'psbt' } as any);
    expect(client.getSignersStatus()).toEqual([]);
  });

  it('should extract fingerprint', () => {
    expect(client.extractFingerprintFromSignature('signed-psbt')).toBe('fingerprint-abc');
  });

  it('should generate room link', () => {
    mockStore.getState.mockReturnValueOnce({ roomId: 'room123' } as any);
    (client as any)._encryptionKey = 'key123';
    const link = client.getRoomLink('https://app.example.com');
    expect(link).toContain('/room/room123');
  });

  it('should verify integrity', async () => {
    mockStore.getState.mockReturnValueOnce({} as any);
    const result = await client.verifyIntegrity('anchor');
    expect(result).toEqual({ anchor: 'anchor', isValid: true });
  });

  it('should get forensic anchor', async () => {
    mockStore.getState.mockReturnValueOnce({ finalTxHex: 'hex', auditLog: [] } as any);
    const anchor = await client.getForensicAnchor();
    expect(anchor).toBe('forensic-anchor');
  });

  it('should get integrity report', async () => {
    mockStore.getState.mockReturnValueOnce({} as any);
    const report = await client.getIntegrityReport();
    expect(report).toEqual({ report: 'full' });
  });

  // Edge cases for branches
  it('should handle empty state in getSignaturesRemaining', () => {
    mockStore.getState.mockReturnValueOnce(null);
    expect(client.getSignaturesRemaining(5)).toBe(5);
  });

  it('should handle no psbt in getSignatureProgress', () => {
    mockStore.getState.mockReturnValueOnce(null);
    expect(client.getSignatureProgress()).toEqual({ totalSigners: 0, signaturesReceived: 0 });
  });

  it('should return empty string for audit log with no state', () => {
    expect(client.getAuditLogCsv()).toBe('');
  });

  it('should skip duplicate whitelist address', async () => {
    mockStore.getState.mockReturnValueOnce({ whitelist: ['bc1q...'] } as any);
    await client.addWhitelistAddress('bc1q...');
    expect(mockRelay.updateWhitelist).not.toHaveBeenCalled();
  });

  it('should throw error when room creation fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, text: async () => 'API Error' });
    await expect(client.createRoom('psbt', 'bitcoin')).rejects.toThrow(
      'Failed to create room: API Error',
    );
  });

  it('should handle duplicate whitelist address and removal', async () => {
    vi.spyOn(client, 'getRoomState').mockReturnValue({ whitelist: ['addr1'] } as any);
    const relaySpy = vi.spyOn(client.relay, 'updateWhitelist');

    await client.addWhitelistAddress('addr1'); // Duplicate
    expect(relaySpy).not.toHaveBeenCalled();

    await client.updateWhitelistBatch(['addr1'], true); // Remove
    expect(relaySpy).toHaveBeenCalledWith([], expect.any(String), expect.any(String));
  });

  it('should return null if state is missing in finalizeTransaction', async () => {
    vi.spyOn(client, 'getRoomState').mockReturnValue(null);
    expect(await client.finalizeTransaction()).toBeNull();
  });

  it('should return default progress when state is missing', () => {
    vi.spyOn(client, 'getRoomState').mockReturnValue(null);
    expect(client.getSignatureProgress()).toEqual({ totalSigners: 0, signaturesReceived: 0 });
    expect(client.isThresholdMet()).toBe(false);
  });

  it('should throw if integrity verification fails due to missing state', async () => {
    vi.spyOn(client, 'getRoomState').mockReturnValue(null);
    await expect(client.verifyIntegrity('anchor')).rejects.toThrow();
    await expect(client.getForensicAnchor()).rejects.toThrow();
    await expect(client.getIntegrityReport()).rejects.toThrow();
  });

  it('should throw if claiming coordinator without joining room', async () => {
    vi.spyOn(client.store, 'getState').mockReturnValue(null);
    await expect(client.claimCoordinator('secret')).rejects.toThrow();
  });

  it('should include encryption key in room link when requested', () => {
    vi.spyOn(client, 'getRoomState').mockReturnValue({ roomId: '123' } as any);
    (client as any)._encryptionKey = 'secret-key';
    const link = client.getRoomLink('https://app.com', true);
    expect(link).toContain('#secret-key');
  });

  it('should return empty arrays/0 when getTransactionDetails is null', () => {
    vi.spyOn(client, 'getTransactionDetails').mockReturnValue(null);
    expect(client.getOutputs()).toEqual([]);
    expect(client.getInputs()).toEqual([]);
    expect(client.getNetworkFee()).toBe(0);
  });

  it('should handle result=null in finalizeTransaction', async () => {
    vi.spyOn(client, 'getRoomState').mockReturnValue({ psbt: 'bad-psbt' } as any);
    vi.spyOn(PsbtUtils, 'finalizeTx').mockReturnValue(null);

    const result = await client.finalizeTransaction();
    expect(result).toBeNull();
  });

  it('should throw if claimCoordinator is called before joining', async () => {
    vi.spyOn(client.store, 'getState').mockReturnValue(null);
    await expect(client.claimCoordinator('secret')).rejects.toThrow();
  });

  it('should resolve immediately if waitForState condition is met initially', async () => {
    vi.spyOn(client, 'getRoomState').mockReturnValue({ roomId: '1' } as any);
    await expect(client.waitForState((s) => !!s.roomId)).resolves.toBeUndefined();
  });

  it('should timeout if waitForState condition is never met', async () => {
    vi.useFakeTimers();
    vi.spyOn(client, 'getRoomState').mockReturnValue({ roomId: '1' } as any);

    const promise = client.waitForState((s) => s.roomId === 'wrong', 100);

    vi.advanceTimersByTime(150); // Fast-forward past timeout

    await expect(promise).rejects.toThrow('waitForState condition timed out');

    vi.useRealTimers();
  });

  it('should handle participants map being undefined in claimCoordinator', async () => {
    vi.spyOn(client.store, 'getState').mockReturnValue({} as any);
    (client as any)._sessionId = 'user-1';

    // Mock waitForState to return partial state
    vi.spyOn(client, 'waitForState').mockImplementation(async (cb) => {
      cb({} as any); // Should return false because state.participants is undefined
      return Promise.resolve();
    });

    await client.claimCoordinator('secret');
  });

  it('should return null if no state', async () => {
    const result = await client.finalizeTransaction();
    expect(result).toBeNull();
  });

  it('should successfully finalize transaction and wait for audit log', async () => {
    const initialState = {
      psbt: 'valid-psbt',
      auditLog: [],
    } as any;

    mockStore.getState
      .mockReturnValueOnce(initialState) // First call in finalizeTransaction
      .mockReturnValueOnce({ ...initialState, auditLog: [{ event: 'Tx Finalized' }] }); // After update

    mockStore.update.mockImplementationOnce((updater: any) => {
      const updated = updater(initialState);
      return updated;
    });

    const result = await client.finalizeTransaction();

    expect(result).toEqual({ hex: 'final-hex', txId: 'tx-123' });
    expect(mockStore.update).toHaveBeenCalled();
    expect(mockRelay.broadcastFinalization).toHaveBeenCalled();
  });

  it('should return null when PsbtUtils.finalizeTx returns null', async () => {
    mockStore.getState.mockReturnValueOnce({ psbt: 'invalid-psbt' } as any);
    (PsbtUtils.finalizeTx as any).mockReturnValueOnce(null);

    const result = await client.finalizeTransaction();
    expect(result).toBeNull();
    expect(mockStore.update).not.toHaveBeenCalled();
  });

  it('should get outputs/inputs/fee when details exist', () => {
    const mockDetails = { outputs: ['out1'], inputsList: ['in1'], fee: 1000 };

    // Spy on the method and force it to return your mock data
    vi.spyOn(client, 'getTransactionDetails').mockReturnValue(mockDetails as any);

    expect(client.getOutputs()).toEqual(['out1']);
    expect(client.getInputs()).toEqual(['in1']);
    expect(client.getNetworkFee()).toBe(1000);
  });

  it('should return defaults when getTransactionDetails is null', () => {
    vi.spyOn(client, 'getTransactionDetails').mockReturnValueOnce(null);
    expect(client.getOutputs()).toEqual([]);
    expect(client.getInputs()).toEqual([]);
    expect(client.getNetworkFee()).toBe(0);
  });
});
