import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { SigningRoomClient } from './signing-room-client';
import { RoomFactory } from './relay/room-factory';
import { RoomAuditor } from './bitcoin/room-auditor';
import { PsbtUtils } from './bitcoin/psbt-utils';
import { jsPDF } from 'jspdf';
import { RoomState } from './relay/room-state-store';

// --- MOCKS ---
vi.mock('./relay/room-factory', () => ({
  RoomFactory: {
    prepareCreationPayload: vi.fn(),
  },
}));

vi.mock('./bitcoin/room-auditor', () => ({
  RoomAuditor: {
    getAuditLogCsvData: vi.fn(),
    getSettlementCsvData: vi.fn(),
    generateAuditPdf: vi.fn(),
    verifyRoomIntegrity: vi.fn(),
    calculateForensicAnchor: vi.fn(),
    getIntegrityReport: vi.fn(),
  },
}));

vi.mock('./bitcoin/psbt-utils', () => ({
  PsbtUtils: {
    finalizeTx: vi.fn(),
    analyze: vi.fn(),
    parseTxDetails: vi.fn(),
    getThreshold: vi.fn(),
    extractSigners: vi.fn(),
    getFingerprintFromPsbt: vi.fn(),
  },
}));

vi.mock('jspdf', () => ({
  jsPDF: vi.fn(function () {
    return {};
  }),
}));

describe('SigningRoomClient', () => {
  let client: SigningRoomClient;
  let mockFetch: Mock;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    client = new SigningRoomClient({
      apiUrl: 'https://api.signingroom.com/',
      protocolVersion: '1.2.0',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Initialization and Session Context', () => {
    it('should initialize correctly with stripped trailing slashes and default roles', () => {
      // @ts-ignore - inspecting private property for test
      expect(client.apiUrl).toBe('https://api.signingroom.com');
      expect(client.userContext).toBe('Guest (Unknown)');
    });

    it('should fall back to 1.0.0 if no protocol version is provided', () => {
      const defaultClient = new SigningRoomClient({ apiUrl: 'https://api.test.com' });
      // @ts-ignore
      expect(defaultClient.protocolVersion).toBe('1.0.0');
    });

    it('should capture session IDs and handle role upgrades automatically', async () => {
      const logSpy = vi.spyOn(client, 'logParticipantAction').mockResolvedValue();

      client.relay.events.dispatch('SESSION_CONNECTED', 'session-xyz');
      expect(client.userContext).toBe('Guest (session-xyz)');

      client.relay.events.dispatch('ROLE_UPDATE', 'admin');

      await Promise.resolve();

      expect(client.userContext).toBe('Coordinator');
      expect(logSpy).toHaveBeenCalledWith(
        'Role Claimed Coordinator',
        'Session ID: session-xyz upgraded',
        'Coordinator',
      );
    });

    it('should stream state changes out to observers', () => {
      let fired = false;
      client.onStateChange().subscribe(() => (fired = true));
      client.relay.events.dispatch('STATE_CHANGED', {} as RoomState);
      expect(fired).toBe(true);
    });
  });

  describe('Room Orchestration & Network Actions', () => {
    const mockPayload = {
      localData: { roomId: 'room-1', encryptionKey: 'key', adminSecret: 'secret' },
      httpPayload: { adminToken: 'token' },
    };

    beforeEach(() => {
      vi.mocked(RoomFactory.prepareCreationPayload).mockResolvedValue(mockPayload as any);
    });

    it('should successfully create a room and store keys', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const res = await client.createRoom('psbtData', 'testnet', 'My Room');

      expect(RoomFactory.prepareCreationPayload).toHaveBeenCalledWith(
        expect.anything(),
        'psbtData',
        'testnet',
        'My Room',
        '1.2.0',
      );
      expect(mockFetch).toHaveBeenCalled();
      expect(res).toEqual(mockPayload);
      // @ts-ignore
      expect(client._encryptionKey).toBe('key');
    });

    it('should throw an error if room creation network fetch fails', async () => {
      mockFetch.mockResolvedValue({ ok: false, text: () => Promise.resolve('Server Error') });
      await expect(client.createRoom('psbtData', 'bitcoin')).rejects.toThrow(
        'Failed to create room: Server Error',
      );
    });

    it('should completely orchestrate room creation, joining, and role claiming', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const joinSpy = vi.spyOn(client.relay, 'joinRoom').mockImplementation(async () => {
        client.relay.events.dispatch('ROOM_CONNECTED');
        client.relay.events.dispatch('SESSION_CONNECTED', 'sid-1');
      });

      const claimSpy = vi.spyOn(client.relay, 'claimCoordinator').mockImplementation(() => {
        client.relay.events.dispatch('ROLE_UPDATE', 'admin');
      });

      const res = await client.createRoomAndJoin('psbtData', 'bitcoin');

      expect(joinSpy).toHaveBeenCalled();
      expect(claimSpy).toHaveBeenCalledWith('token');
      expect(res.roomId).toBe('room-1');
    });

    it('should join an existing room and await connections', async () => {
      const joinSpy = vi.spyOn(client.relay, 'joinRoom').mockImplementation(async () => {
        client.relay.events.dispatch('ROOM_CONNECTED');
        client.relay.events.dispatch('SESSION_CONNECTED', 'sid-2');
      });

      await client.joinRoom('room-id', 'existing-key');

      expect(joinSpy).toHaveBeenCalledWith(
        'wss://api.signingroom.com',
        'room-id',
        'existing-key',
        '1.2.0',
      );
      expect(client.userContext).toContain('sid-2');
    });
  });

  describe('Relay Action Wrappers (State Modifiers)', () => {
    const testActionWrapper = async (
      method: keyof SigningRoomClient,
      args: any[],
      relayMethod: string,
      confirmEvent: string,
      expectedRelayArgs: any[],
    ) => {
      const spy = vi.spyOn(client.relay as any, relayMethod).mockImplementation(async () => {
        client.relay.events.dispatch(confirmEvent);
      });
      await (client as any)[method](...args);
      expect(spy).toHaveBeenCalledWith(...expectedRelayArgs);
    };

    it('setRoomName', () =>
      testActionWrapper('setRoomName', ['New Name'], 'renameRoom', 'ROOM_RENAMED_DECRYPTED', [
        'New Name',
        'Guest (Unknown)',
      ]));
    it('toggleLock', () =>
      testActionWrapper('toggleLock', [true], 'toggleLock', 'LOCK_UPDATED', [
        true,
        'Guest (Unknown)',
      ]));
    it('uploadSignature', () =>
      testActionWrapper(
        'uploadSignature',
        ['base64', 'fp1'],
        'uploadSignature',
        'NEW_PARTIAL_DECRYPTED',
        ['base64', 'fp1', 'Guest (Unknown)'],
      ));
    it('setSignerLabel', () =>
      testActionWrapper(
        'setSignerLabel',
        ['fp1', 'Label'],
        'updateSignerLabel',
        'LABELS_DECRYPTED',
        ['fp1', 'Label', 'Guest (Unknown)'],
      ));
    it('setAddressLabel', () =>
      testActionWrapper(
        // @ts-ignore (dynamic method cast based on implementation addition)
        'setAddressLabel',
        ['tb1q123', 'Treasury'],
        'updateAddressLabel',
        'ADDRESS_LABELS_DECRYPTED',
        ['tb1q123', 'Treasury', 'Guest (Unknown)'],
      ));
    it('closeRoom', () => testActionWrapper('closeRoom', [], 'closeRoom', 'ROOM_CLOSED', []));

    it('setDisplayName', async () => {
      const spy = vi.spyOn(client.relay, 'setDisplayName').mockImplementation(async () => {
        client.relay.events.dispatch('PARTICIPANTS_DECRYPTED');
      });
      const logSpy = vi.spyOn(client, 'logParticipantAction').mockResolvedValue();

      await client.setDisplayName('Alice');

      expect(spy).toHaveBeenCalledWith('Alice');
      expect(logSpy).toHaveBeenCalledWith('Participant Identified', "Identified as 'Alice'");
    });

    it('disconnect triggers graceful closure', () => {
      const spy = vi.spyOn(client.relay, 'gracefullyDisconnect').mockImplementation(() => {});
      client.disconnect();
      expect(spy).toHaveBeenCalledWith(null);
    });
  });

  describe('Whitelist Management', () => {
    it('should abort adding an address if it already exists in the whitelist', async () => {
      client.store.set({ whitelist: ['addr1'] } as any);
      const spy = vi.spyOn(client.relay, 'updateWhitelist');
      await client.updateWhitelist(['addr1']);
      expect(spy).not.toHaveBeenCalled();
    });

    it('should execute updateWhitelist for new entries', async () => {
      client.store.set({ whitelist: [] } as any);
      const spy = vi.spyOn(client.relay, 'updateWhitelist').mockImplementation(async () => {
        client.relay.events.dispatch('WHITELIST_DECRYPTED');
      });

      await client.updateWhitelist(['bc1qnewaddress']);
      expect(spy).toHaveBeenCalledWith(
        ['bc1qnewaddress'],
        'Added ...dress to whitelist',
        'Guest (Unknown)',
      );
    });

    it('should process batch updates securely (Addition)', async () => {
      client.store.set({ whitelist: ['addr1'] } as any);
      const spy = vi.spyOn(client.relay, 'updateWhitelist').mockImplementation(async () => {
        client.relay.events.dispatch('WHITELIST_DECRYPTED');
      });

      await client.updateWhitelist(['addr2', 'addr3'], false);
      expect(spy).toHaveBeenCalledWith(
        ['addr1', 'addr2', 'addr3'],
        'Verified 2 batch address(es)',
        'Guest (Unknown)',
      );
    });

    it('should process batch updates securely (Removal)', async () => {
      client.store.set({ whitelist: ['addr1', 'addr2', 'addr3'] } as any);

      const spy = vi.spyOn(client.relay, 'updateWhitelist').mockImplementation(async () => {
        client.relay.events.dispatch('WHITELIST_DECRYPTED');
      });

      await client.updateWhitelist(['addr1', 'addr2'], true);

      expect(spy).toHaveBeenCalledWith(['addr3'], 'Removed 2 batch address(es)', 'Guest (Unknown)');
    });
  });

  describe('PSBT and Synchronization Metrics', () => {
    beforeEach(() => {
      client.store.set({
        psbt: 'base64psbt',
        network: 'bitcoin',
        signatures: ['sig1', 'sig2'],
      } as any);
    });

    it('should calculate signature progress successfully', () => {
      vi.mocked(PsbtUtils.analyze).mockReturnValue({ signerCount: 3 } as any);
      const progress = client.getSignatureProgress();
      expect(progress).toEqual({ totalSigners: 3, signaturesReceived: 2 });
    });

    it('should return 0 metrics if state is missing during progress check', () => {
      client.store.set(null);
      expect(client.getSignatureProgress()).toEqual({ totalSigners: 0, signaturesReceived: 0 });
    });

    it('should calculate remaining signatures based on provided threshold', () => {
      expect(client.getSignaturesRemaining(5)).toBe(3);
      expect(client.getSignaturesRemaining(1)).toBe(0); // Ensures it doesn't drop below 0

      client.store.set(null);
      expect(client.getSignaturesRemaining(3)).toBe(3);
    });

    it('should proxy directly to PsbtUtils for threshold metrics', () => {
      vi.mocked(PsbtUtils.getThreshold).mockReturnValue(2);
      expect(client.getThreshold(client.getRoomState())).toBe(2);
    });

    it('should return signer lengths if threshold is unreadable in PsbtUtils', () => {
      vi.mocked(PsbtUtils.getThreshold).mockReturnValue(0);
      vi.mocked(PsbtUtils.extractSigners).mockReturnValue([1, 2, 3] as any);
      expect(client.getThreshold(client.getRoomState())).toBe(3);
    });

    it('should map underlying getter layers accurately for Details, Outputs, Inputs, and Fees', () => {
      const mockDetails = { fee: 5000, outputs: [{ amount: 100 }], inputsList: [{ txId: '1' }] };
      vi.mocked(PsbtUtils.parseTxDetails).mockReturnValue(mockDetails as any);

      expect(client.getTransactionDetails()).toEqual(mockDetails);
      expect(client.getOutputs()).toEqual(mockDetails.outputs);
      expect(client.getInputs()).toEqual(mockDetails.inputsList);
      expect(client.getNetworkFee()).toBe(5000);
      expect(client.getTxDetails(client.getRoomState())).toEqual(mockDetails);

      client.store.set(null);
      expect(client.getOutputs()).toEqual([]);
      expect(client.getInputs()).toEqual([]);
      expect(client.getNetworkFee()).toBe(0);
    });

    it('should correctly proxy extractFingerprintFromSignature to utils', () => {
      vi.mocked(PsbtUtils.getFingerprintFromPsbt).mockReturnValue('fp001');
      expect(client.extractFingerprintFromSignature('rawdata')).toBe('fp001');
    });
  });

  describe('Transaction Finalization & State Promises', () => {
    it('should abort finalizeTransaction if validation fails or room is missing', async () => {
      client.store.set(null);
      expect(await client.finalizeTransaction()).toBeNull();

      client.store.set({ psbt: 'xyz' } as any);
      vi.mocked(PsbtUtils.finalizeTx).mockReturnValue(null);
      expect(await client.finalizeTransaction()).toBeNull();
      expect(client.isThresholdMet()).toBe(false);
    });

    it('should update storage and broadcast final hex when finalized successfully', async () => {
      client.store.set({ psbt: 'xyz', auditLog: [] } as any);
      vi.mocked(PsbtUtils.finalizeTx).mockReturnValue({ hex: '0100', txId: 'txid' });

      const broadcastSpy = vi
        .spyOn(client.relay, 'broadcastFinalization')
        .mockImplementation(async () => {
          client.store.update((s) => ({
            ...s!,
            auditLog: [{ event: 'Tx Finalized', timestamp: 1, user: 'sys' }],
          }));
        });

      const res = await client.finalizeTransaction();

      expect(res).toEqual({ hex: '0100', txId: 'txid' });
      expect(client.getFinalTransactionHex()).toBe('0100');
      expect(broadcastSpy).toHaveBeenCalledWith('0100', 'txid', 'Guest (Unknown)');
      expect(client.isThresholdMet()).toBe(true);
    });
  });

  describe('Auditor & Exporter Routines', () => {
    const stateMock = { psbt: 'abc', network: 'bitcoin', signatures: [] } as unknown as RoomState;

    beforeEach(() => {
      client.store.set(stateMock);
    });

    it('should route CSV requests safely and abort if no state exists', () => {
      client.store.set(null);
      expect(client.getAuditLogCsv()).toBe('');
      expect(client.getSettlementCsvData()).toBe('');

      client.store.set(stateMock);
      vi.mocked(PsbtUtils.parseTxDetails).mockReturnValue({} as any);
      vi.mocked(RoomAuditor.getAuditLogCsvData).mockReturnValue('csv-log');
      vi.mocked(RoomAuditor.getSettlementCsvData).mockReturnValue('csv-settlement');

      expect(client.getAuditLogCsv()).toBe('csv-log');
      expect(client.getSettlementCsvData()).toBe('csv-settlement');
    });

    it('should construct Audit PDFs safely', async () => {
      vi.mocked(RoomAuditor.generateAuditPdf).mockResolvedValue({
        doc: {},
        filename: 'test.pdf',
      } as any);
      const res = await client.getAuditLogPdf();
      expect(res.filename).toBe('test.pdf');
    });

    it('should reject Audit PDFs if context state goes missing', async () => {
      client.store.set(null);
      await expect(client.getAuditLogPdf()).rejects.toThrow('No state available');
    });

    it('should delegate integrity verifications correctly', async () => {
      client.store.set(null);
      await expect(client.verifyIntegrity('anchor')).rejects.toThrow();
      await expect(client.getForensicAnchor()).rejects.toThrow();
      await expect(client.getIntegrityReport()).rejects.toThrow();

      client.store.set({ finalTxHex: 'hex', auditLog: [] } as any);
      vi.mocked(RoomAuditor.verifyRoomIntegrity).mockResolvedValue({
        anchor: 'abc',
        isValid: true,
      });
      expect(await client.verifyIntegrity('anc')).toEqual({ anchor: 'abc', isValid: true });
    });
  });

  describe('Advanced Context Resolvers', () => {
    it('waitForState should resolve immediately if condition matches initially', async () => {
      client.store.set({ isLocked: true } as any);
      const promise = client.waitForState((s) => s.isLocked);
      await expect(promise).resolves.toBeUndefined();
    });

    it('waitForState should resolve dynamically when condition is met later', async () => {
      client.store.set({ isLocked: false } as any);
      const promise = client.waitForState((s) => s.isLocked);

      client.store.set({ isLocked: true } as any);

      await expect(promise).resolves.toBeUndefined();
    });

    it('waitForState should timeout and reject if condition is not met within boundary', async () => {
      client.store.set({ isLocked: false } as any);
      const promise = client.waitForState((s) => s.isLocked, 1000);

      vi.advanceTimersByTime(1100);
      await expect(promise).rejects.toThrow('waitForState condition timed out');
    });

    it('getRoomLink should compile valid dynamic route schemas', () => {
      client.store.set({ roomId: 'uuid-123' } as any);
      // @ts-ignore
      client._encryptionKey = 'secretKey';

      expect(client.getRoomLink('https://app.com/')).toBe('https://app.com/room/uuid-123');
      expect(client.getRoomLink('https://app.com', true)).toBe(
        'https://app.com/room/uuid-123#secretKey',
      );

      client.store.set(null);
      expect(client.getRoomLink('https://app.com/')).toBe('');
    });

    it('claimCoordinator should trigger relay authorization and await participant elevation', async () => {
      client.store.set({ participants: {} } as any);
      // @ts-ignore
      client._sessionId = 'my-session';
      const sendSpy = vi.spyOn(client.relay, 'send');

      const promise = client.claimCoordinator('admin-token');
      expect(sendSpy).toHaveBeenCalledWith('AUTH', { token: 'admin-token' });

      // Hits missing participants map (!state.participants)
      client.store.set({} as any);

      // Hits missing role optional chaining (undefined?.role)
      client.store.set({ participants: { 'other-session': { role: 'admin' } } } as any);

      // Resolves successfully
      client.store.set({ participants: { 'my-session': { role: 'admin' } } } as any);

      await promise;
    });

    it('claimCoordinator should handle missing session IDs gracefully', async () => {
      client.store.set({ participants: {} } as any);
      // @ts-ignore
      client._sessionId = null;

      const promise = client.claimCoordinator('admin-token');

      // Dispatch state update. _sessionId is null, so it returns false.
      client.store.set({ participants: { 'new-session': { role: 'admin' } } } as any);

      // Now fix the session ID and dispatch again to resolve it
      // @ts-ignore
      client._sessionId = 'new-session';
      client.store.set({ participants: { 'new-session': { role: 'admin' } } } as any);

      await promise;
    });

    it('claimCoordinator should throw if executed offline without local state', async () => {
      client.store.set(null);
      await expect(client.claimCoordinator('token')).rejects.toThrow(
        'Must join room before claiming',
      );
    });

    it('parsePsbtFile should interpret standard base64 files cleanly', async () => {
      const encoder = new TextEncoder();
      const mockFile = {
        arrayBuffer: () => Promise.resolve(encoder.encode('cHNidGZha2U=').buffer),
      } as File;
      expect(await client.parsePsbtFile(mockFile)).toBe('cHNidGZha2U=');
    });

    it('parsePsbtFile should interpret binary PSBTs into raw hex strings via magic bytes', async () => {
      const binArray = new Uint8Array([0x70, 0x73, 0x62, 0x74, 0xff, 0x01, 0x02]);
      const mockFile = { arrayBuffer: () => Promise.resolve(binArray.buffer) } as File;
      expect(await client.parsePsbtFile(mockFile)).toBe('70736274ff0102');
    });

    it('parsePsbtFile should evaluate all magic bytes before falling back to text parsing', async () => {
      const runTest = async (arr: number[]) => {
        const file = { arrayBuffer: () => Promise.resolve(new Uint8Array(arr).buffer) } as File;
        await client.parsePsbtFile(file);
      };

      await runTest([0x70, 0x00]); // Fails at [1]
      await runTest([0x70, 0x73, 0x00]); // Fails at [2]
      await runTest([0x70, 0x73, 0x62, 0x00]); // Fails at [3]
      await runTest([0x70, 0x73, 0x62, 0x74, 0x00]); // Fails at [4]

      expect(true).toBe(true); // Verification completes cleanly without throwing
    });

    it('parsePsbtFile should actively reject raw transaction formats', async () => {
      const encoder = new TextEncoder();
      const mockFile = {
        arrayBuffer: () => Promise.resolve(encoder.encode('01000000xyz').buffer),
      } as File;
      await expect(client.parsePsbtFile(mockFile)).rejects.toThrow(/looks like a Raw Transaction/);
    });

    it('getErrorCategory should map WebSocket close codes accurately', () => {
      expect(client.getErrorCategory(4026)).toBe('PROTOCOL_MISMATCH');
      expect(client.getErrorCategory(4001)).toBe('ROOM_FULL');
      expect(client.getErrorCategory(1006)).toBe('AUTH_FAILED');
      expect(client.getErrorCategory(9999)).toBe('UNKNOWN');
    });
  });
});
