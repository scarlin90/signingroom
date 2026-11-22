import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RelayClient } from './relay-client';
import { EncryptionEngine } from '../crypto/encryption-engine';

// --- MOCK PLATFORM BOUNDARIES ---
class MockWebSocket {
  public url: string;
  public protocols?: string | string[];
  public readyState: number = 0; // CONNECTING
  public send = vi.fn();
  public close = vi.fn();

  public onopen: (() => void) | null = null;
  public onclose: ((e: any) => void) | null = null;
  public onerror: ((e: any) => void) | null = null;
  public onmessage: ((e: any) => void) | null = null;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.lastInstance = this;
  }
  static lastInstance: MockWebSocket | null = null;
  static OPEN = 1;
}

vi.stubGlobal('WebSocket', MockWebSocket);

vi.mock('../bitcoin/psbt-utils', () => ({
  PsbtUtils: {
    normalize: vi.fn((s) => s || ''),
    merge: vi.fn((a, b) => `${a || ''}+${b || ''}`),
    decode: vi.fn((s) => {
      if (s === 'CORRUPT_PSBT') throw new Error('Decode error');
      return new Uint8Array([1, 2, 3]);
    }),
    extractSigners: vi.fn(() => []),
    parseTxDetails: vi.fn(() => ({
      inputsList: [],
      outputs: [],
    })),
  },
}));

vi.mock('@scure/btc-signer', () => ({
  Transaction: {
    fromPSBT: vi.fn(() => ({
      inputsLength: 1,
      getInput: vi.fn(() => ({
        bip32Derivation: [['pubkey', { fingerprint: 0x12345678 }]],
      })),
    })),
  },
}));

describe('RelayClient', () => {
  let client: RelayClient;
  let mockCrypto: any;

  beforeEach(() => {
    vi.useFakeTimers();
    mockCrypto = {
      blindData: vi.fn(async (data, key) => `blinded-${data}-${key}`),
      encrypt: vi.fn(async (data) => {
        if (data && data.includes('TRIGGER_LOG_BLOB_FAIL')) throw new Error('Encrypt fail');
        return `enc-${data}`;
      }),
      decrypt: vi.fn(async (data) => {
        if (data === 'FAIL' || data === 'enc-FAIL') throw new Error('Decryption Failed');
        if (data === '{"timestamp":1,"event":"TEST","user":"alice"}') return data;
        if (data.startsWith('enc-')) return data.replace('enc-', '');
        return data;
      }),
      sha256: vi.fn(async () => 'd532dd5a168537f7bfd8278d174acb6814ac10bff1793060d8c34b8d36a1e3cf'),
    };
    client = new RelayClient(mockCrypto as unknown as EncryptionEngine);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Connection Lifecycle Routing', () => {
    it('should successfully map websocket operational callback parameters upon connect()', () => {
      let opened = false;
      let closed = false;
      let errorReceived = null;

      client.events.on('ROOM_CONNECTED').subscribe(() => (opened = true));
      client.events.on('ROOM_DISCONNECTED').subscribe(() => (closed = true));
      client.events.on('ERROR').subscribe((e) => (errorReceived = e.payload));

      client.connect('wss://relay-test.signingroom.com');
      const ws = MockWebSocket.lastInstance!;

      ws.onopen!();
      ws.onclose!({ code: 1000, reason: 'Clean closure' });
      ws.onerror!({ message: 'Network dropped' });

      expect(opened).toBe(true);
      expect(closed).toBe(true);
      expect(errorReceived).toBeDefined();
    });

    it('should sanitize, decode and calculate parameters correctly during joinRoom execution profiles', async () => {
      await client.joinRoom('wss://test', 'room-1', '  key%20with%20spaces  ', '1.0.0');
      const ws = MockWebSocket.lastInstance!;
      expect(ws.url).toBe('wss://test/api/room/room-1/websocket?v=1.0.0');
      expect(ws.protocols).toEqual(['signingroom-v2', 'pass.blinded-room-1-key with spaces']);
    });

    it('should swallow URI decoding errors if joinRoom encounters a broken percent string', async () => {
      await client.joinRoom('wss://test', 'room-1', 'key%E0%A4%A', '1.0.0');
      const ws = MockWebSocket.lastInstance!;
      expect(ws.url).toBeDefined();
    });

    it('should enforce clearListeners restrictions completely upon triggering disconnect requests', () => {
      client.connect('wss://relay');
      const ws = MockWebSocket.lastInstance!;
      client.disconnect(true);

      expect(ws.onclose).toBeNull();
      expect(ws.onmessage).toBeNull();
      expect(ws.close).toHaveBeenCalled();
    });

    it('should skip structural payloads cleanly during send() if readyState conditions are invalid', () => {
      client.connect('wss://relay');
      const ws = MockWebSocket.lastInstance!;
      ws.readyState = 0; // CONNECTING
      client.send('PING');
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('Incoming Message Topic Routing Paths', () => {
    beforeEach(() => {
      client.connect('wss://relay');
      MockWebSocket.lastInstance!.readyState = MockWebSocket.OPEN;
    });

    it('should abort routing and emit DECRYPTION_ERROR if encryptedPsbt is present without an active key', async () => {
      let errorFired = false;
      client.events.on('DECRYPTION_ERROR').subscribe(() => (errorFired = true));

      const ws = MockWebSocket.lastInstance!;
      client.setKey(null); // Ensure key is missing

      await ws.onmessage!({ data: JSON.stringify({ encryptedPsbt: 'enc-data' }) });
      expect(errorFired).toBe(true);
    });

    it('should return empty structures for sessions and participants if encryption key is missing', async () => {
      client.setKey(null);
      let sessionResult: any = null;
      let participantResult: any = null;

      client.events.on('CONNECTIONS_DECRYPTED').subscribe((v) => (sessionResult = v.payload));
      client.events.on('PARTICIPANTS_DECRYPTED').subscribe((v) => (participantResult = v.payload));

      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({
        data: JSON.stringify({ type: 'CONNECTIONS_UPDATE', count: 1, sessions: [{ id: '1' }] }),
      });
      await ws.onmessage!({
        data: JSON.stringify({ type: 'PARTICIPANTS_UPDATE', participants: { sid: { id: 'sid' } } }),
      });

      expect(sessionResult.sessions).toEqual([]);
      expect(participantResult).toEqual({});
    });

    it('should return DECRYPTION_ERROR alerts if security tokens are completely absent', async () => {
      let errorFired = false;
      client.events.on('DECRYPTION_ERROR').subscribe(() => (errorFired = true));

      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({ data: JSON.stringify({ type: 'NEW_PARTIAL_DATA' }) });

      expect(errorFired).toBe(true);
    });

    it('should log an error to console but continue gracefully if incoming frame json is completely broken', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({ data: 'INVALID_JSON_HERE{' });
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should pass individual topic strings seamlessly down custom event lines', async () => {
      const ws = MockWebSocket.lastInstance!;
      client.setKey('valid-key');

      const expectations: Record<string, any> = {
        SESSION_CONNECTED: { type: 'SESSION_CONNECTED', sessionId: 'sid-1' },
        ROLE_UPDATE: { type: 'ROLE_UPDATE', role: 'admin' },
        ROOM_CLOSED: { type: 'ROOM_CLOSED' },
        LOCK_UPDATED: { type: 'LOCK_UPDATED', isLocked: true },
        ERROR_LOCKED: { type: 'ERROR_LOCKED' },
        ERROR_NOT_FOUND: { type: 'ERROR_NOT_FOUND' },
        ERROR_VERSION_MISMATCH: { type: 'ERROR_VERSION_MISMATCH', roomVersion: '2' },
        UNKNOWN_RAW_TOPIC: { type: 'UNKNOWN_RAW_TOPIC', data: 'xyz' },
      };

      for (const [topic, frame] of Object.entries(expectations)) {
        let routed = false;
        const targetBus =
          topic === 'UNKNOWN_RAW_TOPIC'
            ? 'RAW_MESSAGE'
            : topic === 'ERROR_LOCKED' ||
                topic === 'ERROR_NOT_FOUND' ||
                topic === 'ERROR_VERSION_MISMATCH'
              ? 'PROTOCOL_ERROR'
              : topic;
        const sub = client.events.on(targetBus as any).subscribe(() => (routed = true));
        await ws.onmessage!({ data: JSON.stringify(frame) });
        expect(routed).toBe(true);
        sub.unsubscribe();
      }
    });

    it('should process cleartext and ciphertext branches securely under ROOM_RENAMED actions', async () => {
      client.setKey('key');
      let nameResult = '';
      client.events.on('ROOM_RENAMED_DECRYPTED').subscribe((v) => (nameResult = v.payload));

      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({
        data: JSON.stringify({ type: 'ROOM_RENAMED', encryptedName: 'enc-NewName' }),
      });
      expect(nameResult).toBe('NewName');
    });

    it('should suppress platform errors smoothly if ROOM_RENAMED catches bad cipher packets', async () => {
      client.setKey('key');
      const ws = MockWebSocket.lastInstance!;
      await expect(
        ws.onmessage!({ data: JSON.stringify({ type: 'ROOM_RENAMED', encryptedName: 'FAIL' }) }),
      ).resolves.not.toThrow();
    });

    it('should execute Whitelist array conversions securely during WHITELIST_UPDATED updates', async () => {
      client.setKey('key');
      let targetArray: string[] = [];
      client.events.on('WHITELIST_DECRYPTED').subscribe((v) => (targetArray = v.payload));

      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({
        data: JSON.stringify({ type: 'WHITELIST_UPDATED', encryptedWhitelist: 'enc-["a","b"]' }),
      });
      expect(targetArray).toEqual(['a', 'b']);
    });

    it('should suppress exceptions cleanly if WHITELIST_UPDATED encounters malformed text mapping rules', async () => {
      client.setKey('key');
      const ws = MockWebSocket.lastInstance!;
      await expect(
        ws.onmessage!({
          data: JSON.stringify({ type: 'WHITELIST_UPDATED', encryptedWhitelist: 'FAIL' }),
        }),
      ).resolves.not.toThrow();
    });

    it('should parse complex multi-argument properties cleanly under TX_FINALIZED_BROADCAST streams', async () => {
      client.setKey('key');
      let hexOut = '',
        idOut = '';
      client.events.on('TX_FINALIZED_DECRYPTED').subscribe((v) => {
        hexOut = v.payload.finalTxHex;
        idOut = v.payload.finalTxId;
      });

      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({
        data: JSON.stringify({
          type: 'TX_FINALIZED_BROADCAST',
          encryptedFinalTxHex: 'enc-01',
          encryptedFinalTxId: 'enc-id',
        }),
      });
      expect(hexOut).toBe('01');
      expect(idOut).toBe('id');
    });

    it('should absorb parse exceptions safely if final tx broadcast captures corrupt data elements', async () => {
      client.setKey('key');
      const ws = MockWebSocket.lastInstance!;
      await expect(
        ws.onmessage!({
          data: JSON.stringify({
            type: 'TX_FINALIZED_BROADCAST',
            encryptedFinalTxHex: 'FAIL',
            encryptedFinalTxId: 'FAIL',
          }),
        }),
      ).resolves.not.toThrow();
    });

    it('should map unblinded hardware references securely using local caches when routing LABELS_UPDATED tasks', async () => {
      client.setKey('key');
      client.blindFingerprintMap.set('blinded-fp', 'real-fp');
      let outputMap: any = null;
      client.events.on('LABELS_DECRYPTED').subscribe((v) => (outputMap = v.payload));

      const ws = MockWebSocket.lastInstance!;
      const longEncryptedLabel = 'enc-LabelText' + 'X'.repeat(30);
      const expectedLabel = 'LabelText' + 'X'.repeat(30);

      await ws.onmessage!({
        data: JSON.stringify({
          type: 'LABELS_UPDATED',
          signerLabels: { 'blinded-fp': longEncryptedLabel },
        }),
      });
      expect(outputMap['real-fp']).toBe(expectedLabel);
    });

    it('should map unblinded UTXO references securely using local caches when routing ADDRESS_LABELS_UPDATED tasks', async () => {
      client.setKey('key');
      client.blindAddressMap.set('blinded-addr', 'real-addr');
      let outputMap: any = null;
      client.events.on('ADDRESS_LABELS_DECRYPTED' as any).subscribe((v) => (outputMap = v.payload));

      const ws = MockWebSocket.lastInstance!;
      const longEncryptedLabel = 'enc-Treasury' + 'X'.repeat(30);
      const expectedLabel = 'Treasury' + 'X'.repeat(30);

      await ws.onmessage!({
        data: JSON.stringify({
          type: 'ADDRESS_LABELS_UPDATED',
          addressLabels: { 'blinded-addr': longEncryptedLabel },
        }),
      });
      expect(outputMap['real-addr']).toBe(expectedLabel);
    });

    it('should handle label decryption errors by falling back gracefully to the ciphertext', async () => {
      client.setKey('key');
      let outputMap: any = null;
      client.events.on('LABELS_DECRYPTED').subscribe((v) => (outputMap = v.payload));

      const ws = MockWebSocket.lastInstance!;
      const failingLongLabel = 'enc-FAIL' + 'X'.repeat(30);

      await ws.onmessage!({
        data: JSON.stringify({
          type: 'LABELS_UPDATED',
          signerLabels: { 'fp-1': failingLongLabel },
        }),
      });
      expect(outputMap['fp-1']).toBe(failingLongLabel);
    });

    it('should fall back to raw input values if label text parameters stretch below standard cipher lengths', async () => {
      client.setKey('key');
      let outputMap: any = null;
      client.events.on('LABELS_DECRYPTED').subscribe((v) => (outputMap = v.payload));

      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({
        data: JSON.stringify({ type: 'LABELS_UPDATED', signerLabels: { 'short-fp': 'short' } }),
      });
      expect(outputMap['short-fp']).toBe('short');
    });

    it('should process multi-tier session encryption matrices cleanly inside CONNECTIONS_UPDATE topics', async () => {
      client.setKey('key');
      let payloadResult: any = null;
      client.events.on('CONNECTIONS_DECRYPTED').subscribe((v) => (payloadResult = v.payload));

      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({
        data: JSON.stringify({
          type: 'CONNECTIONS_UPDATE',
          count: 5,
          sessions: [{ id: '1', role: 'guest', encryptedDisplayName: 'enc-UserA' }],
        }),
      });
      expect(payloadResult.count).toBe(5);
      expect(payloadResult.sessions[0].displayName).toBe('UserA');
    });

    it('should map standard indicator text strings if display names trigger cryptographic runtime failure boundaries', async () => {
      client.setKey('key');
      let payloadResult: any = null;
      client.events.on('CONNECTIONS_DECRYPTED').subscribe((v) => (payloadResult = v.payload));

      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({
        data: JSON.stringify({
          type: 'CONNECTIONS_UPDATE',
          count: 1,
          sessions: [{ id: '1', role: 'guest', encryptedDisplayName: 'FAIL' }],
        }),
      });
      expect(payloadResult.sessions[0].displayName).toBe('Decrypt Error');
    });

    it('should resolve standard structural dictionary shapes cleanly during incoming PARTICIPANTS_UPDATE frames', async () => {
      client.setKey('key');
      let payloadResult: any = null;
      client.events.on('PARTICIPANTS_DECRYPTED').subscribe((v) => (payloadResult = v.payload));

      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({
        data: JSON.stringify({
          type: 'PARTICIPANTS_UPDATE',
          participants: { sid: { id: 'sid', encryptedDisplayName: 'enc-Bob' } },
        }),
      });
      expect(payloadResult['sid'].displayName).toBe('Bob');
    });

    it('should handle exceptions gracefully when participant display name decryption fails', async () => {
      client.setKey('key');
      let payloadResult: any = null;
      client.events.on('PARTICIPANTS_DECRYPTED').subscribe((v) => (payloadResult = v.payload));

      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({
        data: JSON.stringify({
          type: 'PARTICIPANTS_UPDATE',
          participants: { sid: { id: 'sid', encryptedDisplayName: 'FAIL' } },
        }),
      });
      expect(payloadResult['sid'].displayName).toBeUndefined();
    });

    it('should extract raw string elements sequentially when evaluating audit records under LOG_UPDATE topics', async () => {
      client.setKey('key');
      let logsResult: any[] = [];
      client.events.on('LOG_UPDATE_DECRYPTED').subscribe((v) => (logsResult = v.payload));

      const mockEntry = { timestamp: 10, event: 'SIGN', user: 'alice' };
      const encryptedEntryString = '{"timestamp":1,"event":"TEST","user":"alice"}';
      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({
        data: JSON.stringify({ type: 'LOG_UPDATE', auditLog: [encryptedEntryString, mockEntry] }),
      });
      expect(logsResult).toHaveLength(2);
    });

    it('should append custom indicators to the collection timeline if decryption attempts capture corrupt logging formats', async () => {
      client.setKey('key');
      let logsResult: any[] = [];
      client.events.on('LOG_UPDATE_DECRYPTED').subscribe((v) => (logsResult = v.payload));

      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({ data: JSON.stringify({ type: 'LOG_UPDATE', auditLog: ['FAIL'] }) });
      expect(logsResult[0].event).toBe('Encrypted Data (Decryption Failed)');
    });
  });

  describe('Deep State Sync Extraction Mechanics', () => {
    beforeEach(() => {
      client.connect('wss://relay');
      client.setKey('key');
      MockWebSocket.lastInstance!.readyState = MockWebSocket.OPEN;
    });

    it('should emit DECRYPTION_ERROR and not emit STATE_SYNC_DECRYPTED if encryptedPsbt fails to decrypt during STATE_SYNC', async () => {
      let stateSyncFired = false;
      let errFired = false;
      client.events.on('STATE_SYNC_DECRYPTED').subscribe(() => (stateSyncFired = true));
      client.events.on('DECRYPTION_ERROR').subscribe(() => (errFired = true));

      const ws = MockWebSocket.lastInstance!;
      await expect(
        ws.onmessage!({ data: JSON.stringify({ type: 'STATE_SYNC', encryptedPsbt: 'FAIL' }) }),
      ).resolves.not.toThrow();
      expect(errFired).toBe(true);
      expect(stateSyncFired).toBe(false);
    });

    it('should reconcile complete master histories, falling back to cleartext strings if signatures lack padding', async () => {
      let resultData: any = null;
      client.events.on('STATE_SYNC_DECRYPTED').subscribe((v) => (resultData = v.payload));

      const syncPayload = {
        type: 'STATE_SYNC',
        encryptedPsbt: 'enc-master-psbt',
        signatures: [{ encryptedData: 'enc-sig-a' }, 'enc-FAIL', 'clear-sig-b'],
        whitelist: 'enc-["user1"]',
        roomName: 'enc-VaultNameCustomTextStretchingLongToTriggerValidation',
        encryptedFinalTxHex: 'enc-hex',
        encryptedFinalTxId: 'enc-id',
      };

      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({ data: JSON.stringify(syncPayload) });

      expect(resultData.psbt).toBeDefined();
      expect(resultData.whitelist).toEqual(['user1']);
      expect(resultData.roomName).toBe('VaultNameCustomTextStretchingLongToTriggerValidation');
      expect(resultData.finalTxHex).toBe('hex');
    });

    it('should handle sync errors safely if final TX and room name decryption chains break inside state syncs', async () => {
      let resultData: any = null;
      client.events.on('STATE_SYNC_DECRYPTED').subscribe((v) => (resultData = v.payload));

      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({
        data: JSON.stringify({
          type: 'STATE_SYNC',
          encryptedPsbt: 'enc-psbt',
          roomName: 'enc-FAIL-ExtendedStringToExceedTheFortyCharacterConstraintGuard',
          encryptedFinalTxHex: 'FAIL',
          encryptedFinalTxId: 'FAIL',
          whitelist: 'FAIL',
        }),
      });
      expect(resultData.finalTxHex).toBeUndefined();
    });

    it('should skip structural array JSON processing steps if whitelist parameters map plain array arrays', async () => {
      let resultData: any = null;
      client.events.on('STATE_SYNC_DECRYPTED').subscribe((v) => (resultData = v.payload));

      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({
        data: JSON.stringify({
          type: 'STATE_SYNC',
          encryptedPsbt: 'enc-psbt',
          whitelist: ['direct-user'],
        }),
      });
      expect(resultData.whitelist).toEqual(['direct-user']);
    });

    it('should assign parameter strings directly if room names scale below minimal threshold parsing limits', async () => {
      let resultData: any = null;
      client.events.on('STATE_SYNC_DECRYPTED').subscribe((v) => (resultData = v.payload));

      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({
        data: JSON.stringify({
          type: 'STATE_SYNC',
          encryptedPsbt: 'enc-psbt',
          roomName: 'ShortName',
        }),
      });
      expect(resultData.roomName).toBe('ShortName');
    });

    it('should route standalone data packages safely through processNewPartial pipeline channels', async () => {
      let payloadResult: any = null;
      client.events.on('NEW_PARTIAL_DECRYPTED').subscribe((v) => (payloadResult = v.payload));

      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({
        data: JSON.stringify({
          type: 'NEW_PARTIAL_DATA',
          fingerprint: 'fp',
          sessionId: '1',
          data: { encryptedData: 'enc-partial' },
        }),
      });
      expect(payloadResult.decryptedPsbt).toBe('partial');
    });

    it('should short-circuit processNewPartial completely if data structures are missing', async () => {
      let payloadResult: any = null;
      client.events.on('NEW_PARTIAL_DECRYPTED').subscribe((v) => (payloadResult = v.payload));

      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({
        data: JSON.stringify({ type: 'NEW_PARTIAL_DATA', fingerprint: 'fp' }),
      });
      expect(payloadResult).toBeNull();
    });

    it('should catch exceptions safely inside registerAllFingerprints if parsing crashes', async () => {
      let resultData: any = null;
      client.events.on('STATE_SYNC_DECRYPTED').subscribe((v) => (resultData = v.payload));

      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({
        data: JSON.stringify({ type: 'STATE_SYNC', encryptedPsbt: 'enc-CORRUPT_PSBT' }),
      });
      expect(resultData).toBeDefined();
    });
  });

  describe('Outbound Protocol Coordination Actions', () => {
    beforeEach(() => {
      client.connect('wss://relay');
      client.setKey('key');
      MockWebSocket.lastInstance!.readyState = MockWebSocket.OPEN;
    });

    it('should short-circuit all state modifiers completely if the encryption key is null', async () => {
      client.setKey(null);
      const ws = MockWebSocket.lastInstance!;

      // Attempt all outbound actions without a key
      await client.uploadSignature('psbt', 'fp', 'usr');
      await client.renameRoom('name', 'usr');
      await client.updateSignerLabel('fp', 'label', 'usr');
      await client.updateAddressLabel('addr', 'label', 'usr');
      await client.setDisplayName('name');
      await client.updateWhitelist(['a'], 'det', 'usr');
      await client.toggleLock(true, 'usr');
      await client.broadcastFinalization('hex', 'id', 'usr');

      // None of them should have triggered a network send
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('should handle empty string labels safely during updateSignerLabel and updateAddressLabel', async () => {
      const ws = MockWebSocket.lastInstance!;

      await client.updateSignerLabel('12345678', '', 'usr');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('UPDATE_LABEL'));

      await client.updateAddressLabel('tb1q123...', '', 'usr');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('UPDATE_ADDRESS_LABEL'));
    });

    it('should abort operational logs completely if active keys are missing', async () => {
      client.setKey(null);
      const res = await client.createSecureLogBlob('A', 'B', 'C');
      expect(res).toBe('');
    });

    it('should push valid payloads onto active network lines across distinct action methods', async () => {
      const ws = MockWebSocket.lastInstance!;

      await client.logAction('EV', 'DET', 'USR');
      expect(ws.send).toHaveBeenCalled();

      await client.uploadSignature('psbt', '12345678', 'usr');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('UPLOAD_PARTIAL'));

      client.claimCoordinator(' token ');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"token":"token"'));

      client.closeRoom();
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('CLOSE_ROOM'));

      await client.renameRoom('New', 'usr');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('RENAME_ROOM'));

      await client.updateSignerLabel('12345678', 'label', 'usr');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('UPDATE_LABEL'));

      await client.updateAddressLabel('tb1q123...', 'Treasury Vault', 'usr');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('UPDATE_ADDRESS_LABEL'));

      await client.setDisplayName('  alice  ');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('SET_DISPLAY_NAME'));

      await client.setDisplayName('    '); // Verify clean empty string truncation handling
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"encryptedDisplayName":null'));

      await client.updateWhitelist(['u'], 'det', 'usr');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('UPDATE_WHITELIST'));

      await client.toggleLock(true, 'usr');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('TOGGLE_LOCK'));

      await client.broadcastFinalization('hex', 'id', 'usr');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('TX_FINALIZED'));
    });

    it('should swallow exceptions safely inside gracefullyDisconnect if secure logging fails', async () => {
      const ws = MockWebSocket.lastInstance!;
      await client.gracefullyDisconnect('TRIGGER_LOG_BLOB_FAIL');
      expect(ws.send).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
    });

    it('should fire telemetry updates before closing tunnels during gracefullyDisconnect requests', async () => {
      const ws = MockWebSocket.lastInstance!;
      await client.gracefullyDisconnect('session-id-value');

      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('LOG_ACTION'));

      vi.advanceTimersByTime(100);
      expect(client.blindFingerprintMap.size).toBe(0); // Proves client state cleanup completed
    });

    it('should pass individual topic strings seamlessly down custom event lines', async () => {
      const ws = MockWebSocket.lastInstance!;
      client.setKey('valid-key');

      const expectations: Record<string, any> = {
        SESSION_CONNECTED: { type: 'SESSION_CONNECTED', sessionId: 'sid-1' },
        ROLE_UPDATE: { type: 'ROLE_UPDATE', role: 'admin' },
        ROOM_CLOSED: { type: 'ROOM_CLOSED' },
        LOCK_UPDATED: { type: 'LOCK_UPDATED', isLocked: true },
        ERROR_LOCKED: { type: 'ERROR_LOCKED' },
        ERROR_NOT_FOUND: { type: 'ERROR_NOT_FOUND' },
        ERROR_VERSION_MISMATCH: { type: 'ERROR_VERSION_MISMATCH', roomVersion: '2' },
        ROLE_REGISTERED_SUCCESS: { type: 'ROLE_REGISTERED_SUCCESS' },
        CONSTRAINT_UPDATE: { type: 'CONSTRAINT_UPDATE', policyBlob: 'enc-policy-blob' },
        ERROR_POLICY_VIOLATION: { type: 'ERROR_POLICY_VIOLATION', message: 'Action blocked' },
        ERROR: { type: 'ERROR', message: 'Generic error' },
        UNKNOWN_RAW_TOPIC: { type: 'UNKNOWN_RAW_TOPIC', data: 'xyz' },
      };

      for (const [topic, frame] of Object.entries(expectations)) {
        let routed = false;
        const targetBus =
          topic === 'UNKNOWN_RAW_TOPIC'
            ? 'RAW_MESSAGE'
            : topic === 'ERROR_LOCKED' ||
                topic === 'ERROR_NOT_FOUND' ||
                topic === 'ERROR_VERSION_MISMATCH'
              ? 'PROTOCOL_ERROR'
              : topic;
        const sub = client.events.on(targetBus as any).subscribe(() => (routed = true));
        await ws.onmessage!({ data: JSON.stringify(frame) });
        expect(routed).toBe(true);
        sub.unsubscribe();
      }
    });
  });

  describe('MuSig2, Resumption & Hash-Chained Audit Log', () => {

    it('should support separate sessionId and resumeToken args and skip MuSig2 uploads without key', async () => {
      await client.joinRoom('wss://relay', 'room-sep', 'key', '2.0.0', 'S1', 'R1');
      const ws = MockWebSocket.lastInstance!;
      expect(ws.protocols).toContain('resume.S1.R1');

      client.setKey(null);
      ws.readyState = MockWebSocket.OPEN;
      await client.uploadNonce('n', 'fp', 'u');
      await client.publishAggregatePsbt('p', 'u');
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('should include pass and resume subprotocols in joinRoom and support composite sessionId:resumeToken', async () => {
      await client.joinRoom('wss://test', 'room-1', 'secret-key', '2.0.0', 'ABCD:token-xyz');
      const ws = MockWebSocket.lastInstance!;
      expect(ws.url).toBe('wss://test/api/room/room-1/websocket?v=2.0.0');
      expect(ws.protocols).toEqual([
        'signingroom-v2',
        'pass.blinded-room-1-secret-key',
        'resume.ABCD.token-xyz',
      ]);
    });

    it('should store resumeToken on SESSION_CONNECTED and expose via getResumeToken()', async () => {
      client.connect('wss://relay');
      const ws = MockWebSocket.lastInstance!;
      await ws.onmessage!({
        data: JSON.stringify({
          type: 'SESSION_CONNECTED',
          sessionId: 'ABCD',
          resumeToken: 'a1b2c3d4e5f6',
        }),
      });
      expect(client.getResumeToken()).toBe('a1b2c3d4e5f6');
    });

    it('should decrypt transientPsbt and nonces in STATE_SYNC and register fingerprints', async () => {
      const { PsbtUtils } = await import('../bitcoin/psbt-utils');
      vi.mocked(PsbtUtils.extractSigners).mockReturnValueOnce([{ fingerprint: 'af4b013d' }] as any);

      client.connect('wss://relay');
      client.setKey('key');
      const ws = MockWebSocket.lastInstance!;

      let syncResult: any = null;
      client.events.on('STATE_SYNC_DECRYPTED').subscribe((v) => (syncResult = v.payload));

      await ws.onmessage!({
        data: JSON.stringify({
          type: 'STATE_SYNC',
          roomId: 'room-musig2',
          protocol: 'musig2',
          encryptedPsbt: null,
          transientPsbt: 'enc-setup-psbt',
          nonces: { '07877d968ee881d3': { encryptedData: 'enc-nonce-1' } },
        }),
      });

      expect(syncResult.transientPsbt).toBe('setup-psbt');
      expect(syncResult.nonces).toEqual(['nonce-1']);
      expect(client.blindFingerprintMap.get('blinded-af4b013d-key')).toBe('af4b013d');
      expect(mockCrypto.decrypt).toHaveBeenCalledWith(
        'enc-setup-psbt',
        'key',
        'room:room-musig2|field:psbt',
      );
      expect(mockCrypto.decrypt).toHaveBeenCalledWith(
        'enc-nonce-1',
        'key',
        'room:room-musig2|field:nonce',
      );
    });

    it('should handle NEW_NONCE_DATA and AGGREGATE_PSBT_PUBLISHED events', async () => {
      client.connect('wss://relay');
      client.setKey('key');
      client.blindFingerprintMap.set('blind-fp', 'af4b013d');
      const ws = MockWebSocket.lastInstance!;

      let nonceEvent: any = null;
      let aggPsbtEvent: any = null;
      client.events.on('NEW_NONCE_DECRYPTED' as any).subscribe((v) => (nonceEvent = v.payload));
      client.events
        .on('AGGREGATE_PSBT_DECRYPTED' as any)
        .subscribe((v) => (aggPsbtEvent = v.payload));

      await ws.onmessage!({
        data: JSON.stringify({
          type: 'NEW_NONCE_DATA',
          fingerprint: 'blind-fp',
          sessionId: 'ABCD',
          data: { encryptedData: 'enc-nonce-psbt' },
        }),
      });
      expect(nonceEvent).toEqual({
        decryptedPsbt: 'nonce-psbt',
        fingerprint: 'af4b013d',
        sessionId: 'ABCD',
      });

      await ws.onmessage!({
        data: JSON.stringify({
          type: 'AGGREGATE_PSBT_PUBLISHED',
          encryptedPsbt: 'enc-agg-psbt',
        }),
      });
      expect(aggPsbtEvent).toBe('agg-psbt');
    });

    it('should verify hash chain and append incremental LOG_UPDATE entries', async () => {
      client.connect('wss://relay');
      client.setKey('key');
      const ws = MockWebSocket.lastInstance!;

      let logs: any[] = [];
      client.events.on('LOG_UPDATE_DECRYPTED').subscribe((v) => (logs = v.payload));

      const entryBlob =
        'enc-' +
        JSON.stringify({
          timestamp: 1710000000000,
          seq: 0,
          event: 'Public Nonce Uploaded',
          user: 'Guest (ABCD)',
        });
      
      const digestSpy = vi.spyOn(crypto.subtle, 'digest');

      await ws.onmessage!({
        data: JSON.stringify({
          type: 'LOG_UPDATE',
          entry: {
            seq: 0,
            serverTimestamp: 1710000000500,
            sessionId: 'ABCD',
            role: 'guest',
            blob: entryBlob,
            chainHash: 'd532dd5a168537f7bfd8278d174acb6814ac10bff1793060d8c34b8d36a1e3cf',
          },
          chainHead: 'd532dd5a168537f7bfd8278d174acb6814ac10bff1793060d8c34b8d36a1e3cf',
        }),
      });

      expect(mockCrypto.sha256).toHaveBeenCalled();
      expect(logs).toHaveLength(1);
      expect(logs[0].event).toBe('Public Nonce Uploaded');
    });

    it('should send UPLOAD_NONCE and PUBLISH_AGGREGATE_PSBT with blinded fingerprint and AAD', async () => {
      await client.joinRoom('wss://relay', 'room-aad', 'key', '2.0.0');
      const ws = MockWebSocket.lastInstance!;
      ws.readyState = MockWebSocket.OPEN;

      await client.uploadNonce('nonce-psbt-b64', 'af4b013d', 'Guest (ABCD)');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"UPLOAD_NONCE"'));
      expect(mockCrypto.encrypt).toHaveBeenCalledWith(
        'nonce-psbt-b64',
        'key',
        'room:room-aad|field:nonce',
      );

      await client.publishAggregatePsbt('agg-psbt-b64', 'Coordinator');
      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"PUBLISH_AGGREGATE_PSBT"'),
      );
      expect(mockCrypto.encrypt).toHaveBeenCalledWith(
        'agg-psbt-b64',
        'key',
        'room:room-aad|field:psbt',
      );
    });

    it('should dispatch PROTOCOL_ERROR on non-1000 close codes and reset log seq on room change', async () => {
      const protoErrors: any[] = [];
      client.events.on('PROTOCOL_ERROR').subscribe((e) => protoErrors.push(e.payload));

      client.connect('wss://relay');
      const ws = MockWebSocket.lastInstance!;
      ws.onclose!({ code: 4026, reason: 'mismatch' });
      ws.onclose!({ code: 4001, reason: 'full' });
      ws.onclose!({ code: 1006, reason: 'denied' });
      ws.onclose!({ code: 4004, reason: 'missing' });

      expect(protoErrors.map((p) => p.type)).toEqual([
        'version_mismatch',
        'room_full',
        'access_denied',
        'not_found',
      ]);

      await client.joinRoom('wss://relay', 'room-A', 'key', '2.0.0');
      const blob1 = await client.createSecureLogBlob('E1', 'D1', 'U1');
      expect(blob1).toContain('"seq":1');

      await client.joinRoom('wss://relay', 'room-B', 'key', '2.0.0');
      const blob2 = await client.createSecureLogBlob('E2', 'D2', 'U2');
      expect(blob2).toContain('"seq":1');
    });

    it('should flag hash chain mismatches and ignore mismatched roomId audit entries', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      client.connect('wss://relay');
      client.setKey('key');
      const ws = MockWebSocket.lastInstance!;

      let logs: any[] = [];
      client.events.on('LOG_UPDATE_DECRYPTED').subscribe((v) => (logs = v.payload));

      await ws.onmessage!({
        data: JSON.stringify({
          type: 'STATE_SYNC',
          roomId: 'room-expected',
          auditLog: [
            {
              seq: 0,
              serverTimestamp: 1000,
              sessionId: 'ABCD',
              role: 'guest',
              blob: 'enc-' + JSON.stringify({ timestamp: 1, roomId: 'other-room', event: 'Skip', user: 'x' }),
              chainHash: 'wrong-hash',
            },
          ],
        }),
      });

      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('hash chain mismatch'));
      expect(logs).toEqual([]);
      errSpy.mockRestore();
    });

    it('should cover aggregate psbt error, mismatched roomId in incremental log, and address label fallbacks', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await client.joinRoom('wss://relay', 'room-match', 'key', '2.0.0');
      const ws = MockWebSocket.lastInstance!;
      ws.readyState = MockWebSocket.OPEN;

      await ws.onmessage!({
        data: JSON.stringify({ type: 'AGGREGATE_PSBT_PUBLISHED', encryptedPsbt: 'FAIL' }),
      });

      await ws.onmessage!({
        data: JSON.stringify({
          type: 'LOG_UPDATE',
          entry: {
            seq: 0,
            serverTimestamp: 1000,
            sessionId: 'ABCD',
            role: 'guest',
            blob: 'enc-' + JSON.stringify({ timestamp: 1, roomId: 'wrong-room', event: 'Drop', user: 'u' }),
          },
        }),
      });

      let addrLabels: any = null;
      client.events.on('ADDRESS_LABELS_DECRYPTED').subscribe((v) => (addrLabels = v.payload));
      await ws.onmessage!({
        data: JSON.stringify({
          type: 'ADDRESS_LABELS_UPDATED',
          addressLabels: {
            shortAddr: 'tiny',
            failAddr: 'enc-FAIL' + 'X'.repeat(30),
          },
        }),
      });
      expect(addrLabels.shortAddr).toBe('tiny');
      expect(addrLabels.failAddr).toBe('enc-FAIL' + 'X'.repeat(30));
      errSpy.mockRestore();
    });

    it('should cover transientPsbt/nonce decrypt errors and malformed incremental LOG_UPDATE entry', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      client.connect('wss://relay');
      client.setKey('key');
      const ws = MockWebSocket.lastInstance!;

      await ws.onmessage!({
        data: JSON.stringify({
          type: 'STATE_SYNC',
          transientPsbt: 'FAIL',
          nonces: ['FAIL'],
        }),
      });

      await ws.onmessage!({
        data: JSON.stringify({
          type: 'LOG_UPDATE',
          entry: { seq: 0, serverTimestamp: 1000, sessionId: 'ABCD', role: 'guest', blob: 'FAIL' },
        }),
      });

      errSpy.mockRestore();
    });
  });
});