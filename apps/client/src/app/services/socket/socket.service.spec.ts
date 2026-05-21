import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SocketService } from './socket.service';
import { EncryptionService } from '../encryption/encryption.service';
import { Transaction } from '@scure/btc-signer';
import { base64, hex, bech32 } from '@scure/base';

class MockWebSocket {
  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  readyState = 1; 
}

describe('SocketService', () => {
  let service: SocketService;
  let ws: MockWebSocket;
  let encryptionMock: any;

  beforeEach(() => {
    encryptionMock = {
      encrypt: vi.fn().mockResolvedValue('encrypted_data'),
      decrypt: vi.fn().mockResolvedValue('decrypted_data'),
      blindData: vi.fn().mockImplementation(async (data) => `blinded_${data}`)
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        SocketService,
        { provide: EncryptionService, useValue: encryptionMock }
      ]
    });

    service = TestBed.inject(SocketService);
    ws = new MockWebSocket();
    const MockWSConstructor = vi.fn(() => ws);
    (MockWSConstructor as any).OPEN = 1; 
    vi.stubGlobal('WebSocket', MockWSConstructor);

    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn()
    };
    vi.stubGlobal('localStorage', localStorageMock);

    const sessionStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    };
    vi.stubGlobal('sessionStorage', sessionStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  describe('Connection & Core Flow', () => {
    it('should initialize connection and handle onopen', async () => {
      await service.connect('room-1', 'key');
      expect(service.status()).toBe('connecting');
      
      if (ws.onopen) ws.onopen({});
      expect(service.status()).toBe('connected');
    });

    it('should send AUTH token if present in sessionStorage on connect', async () => {
      (sessionStorage.getItem as any).mockReturnValue('secret-token');
      
      await service.connect('room-1', 'key');
      
      if (ws.onopen) await ws.onopen({} as any); 
      
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"AUTH"'));
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"token":"secret-token"'));
    });

    it('should set error signal on ERROR_NOT_FOUND', async () => {
      await service.connect('room-1', 'key');
      if (ws.onmessage) ws.onmessage({ data: JSON.stringify({ type: 'ERROR_NOT_FOUND' }) });

      expect(service.roomNotFound()).toBe(true);
      expect(service.status()).toBe('disconnected');
    });

    it('should clear state on disconnect', () => {
      service.role.set('admin');
      service.disconnect(true);
      
      expect(service.role()).toBe('guest');
      expect(service.status()).toBe('disconnected');
    });

    it('should handle onclose with code 4001 (Room Full)', async () => {
      await service.connect('room-1', 'key');
      if (ws.onclose) ws.onclose({ code: 4001, reason: '', wasClean: true } as any);
      expect(service.isRoomFull()).toBe(true);
    });

    it('should handle onclose with code 1006 (Invalid Pass)', async () => {
      await service.connect('room-1', 'key');
      if (ws.onclose) ws.onclose({ code: 1006, reason: '', wasClean: false } as any);
      expect(service.decryptionError()).toContain('Invalid decryption key');
      expect(service.getRoomKey()).toBeNull();
    });
  });

  describe('WebSocket Event Handlers', () => {
    beforeEach(async () => {
      await service.connect('room-1', 'key');
    });

    it('should update role when ROLE_UPDATE message is received', async () => {
      const mockMsg = { data: JSON.stringify({ type: 'ROLE_UPDATE', role: 'admin' }) };
      if (ws.onmessage) ws.onmessage(mockMsg);

      expect(service.role()).toBe('admin');
      expect(service.isCoordinator()).toBe(true);
    });

    it('should log "Role Claimed" when a guest successfully claims coordinator role', async () => {
      // 1. Setup specific state (must be inside a connected session)
      service.role.set('guest');
      (service as any).hasAnnouncedJoin = true; 
      service.currentSessionId.set('S123');
      
      const logSpy = vi.spyOn(service as any, 'createSecureLogBlob');
      const sendSpy = vi.spyOn(service as any, 'send');

      // 2. Action: Simulate the server message confirming admin role
      const mockData = JSON.stringify({ type: 'ROLE_UPDATE', role: 'admin' });
      
      if (ws.onmessage) {
          ws.onmessage({ data: mockData } as any);
      }

      // 3. Assertions: Wait for BOTH the signal update AND the async send call
      await vi.waitFor(() => {
        // Ensure role signal updated
        expect(service.role()).toBe('admin');
        
        // Ensure the WebSocket message was actually sent after the async blob creation
        expect(sendSpy).toHaveBeenCalledWith('LOG_ACTION', expect.objectContaining({
            encryptedLogBlob: expect.any(String)
        }));
      }, { timeout: 2000 });

      // Final verification of the log content
      expect(logSpy).toHaveBeenCalledWith(
        'Role Claimed Coordinator', 
        expect.stringContaining('upgraded'), 
        'Coordinator'
      );
    });

    it('should handle STATE_SYNC and decrypt PSBT', async () => {
      const stateSyncMsg = {
        data: JSON.stringify({
          type: 'STATE_SYNC',
          roomId: 'room-1',
          encryptedPsbt: 'some_payload',
          protocolVersion: '1.0.0'
        })
      };

      encryptionMock.decrypt.mockResolvedValue('70736274ff010203');
      if (ws.onmessage) await ws.onmessage(stateSyncMsg);

      expect(encryptionMock.decrypt).toHaveBeenCalled();
      expect(service.roomState()?.roomId).toBe('room-1');
    });

    it('should handle LABELS_UPDATED', async () => {
      const labelMsg = { data: JSON.stringify({ 
        type: 'LABELS_UPDATED', 
        signerLabels: { 'fp1': 'encrypted_label' } 
      })};
      encryptionMock.decrypt.mockResolvedValue('Plain Label');
      if (ws.onmessage) await ws.onmessage(labelMsg);
      expect(service.roomState()?.signerLabels['fp1']).toBe('Plain Label');
    });

    it('should handle ROOM_CLOSED', () => {
      const closeMsg = { data: JSON.stringify({ type: 'ROOM_CLOSED' }) };
      if (ws.onmessage) ws.onmessage(closeMsg);
      expect(service.isClosed()).toBe(true);
    });

    it('should handle ROOM_CLOSED and clear local data', () => {
      service.roomState.set({ roomId: 'room-1' } as any);
      
      const closeMsg = { data: JSON.stringify({ type: 'ROOM_CLOSED' }) };
      if (ws.onmessage) ws.onmessage(closeMsg);
      
      expect(service.isClosed()).toBe(true);
      expect(localStorage.removeItem).toHaveBeenCalledWith('display_name_room-1');
      expect(service.status()).toBe('disconnected');
    });

    it('should handle LOG_UPDATE with mixed audit log formats', async () => {
      const logMsg = { data: JSON.stringify({ 
        type: 'LOG_UPDATE', 
        auditLog: [
          { encryptedLogBlob: 'enc1' },
          'enc2',
          { event: 'Raw Event', user: 'Admin', timestamp: 1234 }
        ] 
      })};
      
      encryptionMock.decrypt
        .mockResolvedValueOnce('{"event": "Decrypted 1", "user": "Guest"}')
        .mockResolvedValueOnce('{"event": "Decrypted 2", "user": "Guest"}');

      if (ws.onmessage) await ws.onmessage(logMsg);
      
      const logs = service.roomState()?.auditLog;
      expect(logs).toBeDefined();
      expect(logs?.length).toBe(3);
    });

    it('should handle CONNECTIONS_UPDATE and decrypt session names', async () => {
      const connMsg = { data: JSON.stringify({ 
        type: 'CONNECTIONS_UPDATE', 
        count: 2, 
        sessions: [
          { id: 'S1', role: 'admin', encryptedDisplayName: 'enc_name_1' },
          { id: 'S2', role: 'guest' } 
        ] 
      })};
      
      encryptionMock.decrypt.mockResolvedValueOnce('Decrypted Name');
      if (ws.onmessage) await ws.onmessage(connMsg);
      
      expect(service.roomState()?.connectedCount).toBe(2);
      expect(service.activeSessions().length).toBe(2);
      expect(service.activeSessions()[0].displayName).toBe('Decrypted Name');
      expect(service.activeSessions()[1].displayName).toBeUndefined();
    });

    it('should handle NEW_PARTIAL_DATA and merge signatures', async () => {
      service.roomState.set({ psbt: 'AAAA', signatures: [] } as any);
      const partialMsg = { data: JSON.stringify({
        type: 'NEW_PARTIAL_DATA',
        data: { encryptedData: 'enc_partial' },
        fingerprint: 'blinded_fp'
      }) };
      
      encryptionMock.decrypt.mockResolvedValue('BBBB');
      const mergeSpy = vi.spyOn(service, 'mergePsbts').mockReturnValue('MERGED_PSBT');

      if (ws.onmessage) await ws.onmessage(partialMsg);

      expect(mergeSpy).toHaveBeenCalledWith('AAAA', 'BBBB');
      expect(service.roomState()?.psbt).toBe('MERGED_PSBT');
      expect(service.roomState()?.signatures).toContain('BBBB');
    });

    it('should handle STATE_SYNC fallback branches (unencrypted psbt, array whitelist)', async () => {
      const stateSyncMsg = {
        data: JSON.stringify({
          type: 'STATE_SYNC',
          roomId: 'room-1',
          psbt: 'unencrypted_psbt',
          whitelist: ['addr1', 'addr2'],
          signatures: ['plain_sig', { encryptedData: 'enc_sig' }],
          protocolVersion: '1.0.0'
        })
      };

      encryptionMock.decrypt.mockResolvedValue('decrypted_sig');
      if (ws.onmessage) await ws.onmessage(stateSyncMsg);

      expect(service.roomState()?.psbt).toBeDefined();
      expect(service.roomState()?.whitelist).toEqual(['addr1', 'addr2']);
    });

    it('should handle ROOM_RENAMED', async () => {
      const renameMsg = { data: JSON.stringify({ type: 'ROOM_RENAMED', encryptedName: 'enc' }) };
      encryptionMock.decrypt.mockResolvedValue('New Room Name');
      if (ws.onmessage) await ws.onmessage(renameMsg);
      expect(service.roomState()?.roomName).toBe('New Room Name');
    });

    it('should handle ERROR_LOCKED', () => {
      const lockMsg = { data: JSON.stringify({ type: 'ERROR_LOCKED' }) };
      if (ws.onmessage) ws.onmessage(lockMsg);
      expect(service.isLockedOut()).toBe(true);
      expect(service.status()).toBe('disconnected');
    });

    it('should handle WHITELIST_UPDATED', async () => {
      const whitelistMsg = { data: JSON.stringify({ type: 'WHITELIST_UPDATED', encryptedWhitelist: 'enc' }) };
      encryptionMock.decrypt.mockResolvedValue('["addr1", "addr2"]');
      if (ws.onmessage) await ws.onmessage(whitelistMsg);
      expect(service.roomState()?.whitelist).toEqual(["addr1", "addr2"]);
    });

    it('should handle LOCK_UPDATED', () => {
      const msg = { data: JSON.stringify({ type: 'LOCK_UPDATED', isLocked: true }) };
      if (ws.onmessage) ws.onmessage(msg);
      expect(service.roomState()?.isLocked).toBe(true);
    });

    it('should handle TX_FINALIZED_BROADCAST', async () => {
      const msg = { data: JSON.stringify({ type: 'TX_FINALIZED_BROADCAST', encryptedFinalTxHex: 'encHex', encryptedFinalTxId: 'encId' }) };
      encryptionMock.decrypt.mockResolvedValueOnce('final-hex').mockResolvedValueOnce('final-id');
      if (ws.onmessage) await ws.onmessage(msg);
      expect(service.roomState()?.finalTxHex).toBe('final-hex');
      expect(service.roomState()?.finalTxId).toBe('final-id');
    });

    it('should handle SESSION_CONNECTED', () => {
      const msg = { data: JSON.stringify({ type: 'SESSION_CONNECTED', sessionId: '12345' }) };
      if (ws.onmessage) ws.onmessage(msg);
      expect(service.currentSessionId()).toBe('12345');
    });

    it('should handle ERROR_VERSION_MISMATCH and fallback', () => {
      const connectSpy = vi.spyOn(service, 'connect');
      if (ws.onclose) ws.onclose({ code: 4026 } as any);
      expect(connectSpy).toHaveBeenCalledWith('room-1', 'key', '1.0.0');
    });

    it('should block encrypted payloads if no decryption key is present', async () => {
      service.setRoomKey(null);
      
      const msg = { data: JSON.stringify({ type: 'NEW_PARTIAL_DATA', data: { encryptedData: 'enc' } }) };
      if (ws.onmessage) await ws.onmessage(msg);
      
      expect(service.decryptionError()).toContain('Decryption Key Missing');
    });

    it('should handle STATE_SYNC fatal decryption error and disconnect', async () => {
      const disconnectSpy = vi.spyOn(service, 'disconnect');
      
      encryptionMock.decrypt.mockRejectedValueOnce(new Error('Fatal Key Error'));
      
      const msg = { data: JSON.stringify({ type: 'STATE_SYNC', roomId: '1', encryptedPsbt: 'bad_data' }) };
      if (ws.onmessage) await ws.onmessage(msg);
      
      expect(service.decryptionError()).toContain('Invalid decryption key');
      expect(disconnectSpy).toHaveBeenCalledWith(false);
    });

    it('should gracefully catch decryption errors on minor room updates', async () => {
      
      encryptionMock.decrypt.mockRejectedValue(new Error('Bad Data'));
      
      if (ws.onmessage) await ws.onmessage({ data: JSON.stringify({ type: 'ROOM_RENAMED', encryptedName: 'bad' }) });
      
      if (ws.onmessage) await ws.onmessage({ data: JSON.stringify({ type: 'LABELS_UPDATED', signerLabels: { 'fp1': 'bad' } }) });
      
      if (ws.onmessage) await ws.onmessage({ data: JSON.stringify({ type: 'WHITELIST_UPDATED', encryptedWhitelist: 'bad' }) });
      
      if (ws.onmessage) await ws.onmessage({ data: JSON.stringify({ type: 'TX_FINALIZED_BROADCAST', encryptedFinalTxHex: 'bad', encryptedFinalTxId: 'bad' }) });
      
      if (ws.onmessage) await ws.onmessage({ data: JSON.stringify({ type: 'CONNECTIONS_UPDATE', count: 1, sessions: [{ id: 'S1', encryptedDisplayName: 'bad' }] }) });

      
      expect(service.roomState()?.roomName).not.toBe('bad');
      expect(service.activeSessions()[0].displayName).toBe('Decrypt Error');
    });

    it('should completely clear local and session storage on ROOM_CLOSED', () => {
      service.roomState.set({ roomId: 'room-1' } as any);
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      if (ws.onmessage) ws.onmessage({ data: JSON.stringify({ type: 'ROOM_CLOSED' }) });

      expect(localStorage.removeItem).toHaveBeenCalledWith('display_name_room-1');
      expect(sessionStorage.removeItem).toHaveBeenCalledWith('admin_token_room-1');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Privacy] Local identity data for room room-1 has been purged.'));
    });
  });

  describe('Public Actions (Sending Data)', () => {
    beforeEach(async () => {
      await service.connect('room-1', 'key');
      if (ws.onopen) ws.onopen({});
    });

    it('should claimCoordinator', async () => {
      await service.claimCoordinator('my-secret-token');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"AUTH"'));
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"token":"my-secret-token"'));
    });

    it('should closeRoom', () => {
      service.closeRoom();
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"CLOSE_ROOM"'));
    });

    it('should renameRoom', async () => {
      await service.renameRoom('Corporate Vault');
      expect(encryptionMock.encrypt).toHaveBeenCalled();
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"RENAME_ROOM"'));
    });

    it('should logAction', async () => {
      await service.logAction('Test Action', 'Test Details');
      expect(encryptionMock.encrypt).toHaveBeenCalled();
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"LOG_ACTION"'));
    });

    it('should updateSignerLabel', async () => {
      await service.updateSignerLabel('fp123', 'Hardware Wallet');
      expect(encryptionMock.encrypt).toHaveBeenCalled();
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"UPDATE_LABEL"'));
    });

    it('should setDisplayName', async () => {
      await service.setDisplayName('Alice');
      expect(localStorage.setItem).toHaveBeenCalledWith('display_name_room-1', 'Alice');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"SET_DISPLAY_NAME"'));
    });

    it('should clear display name if empty', async () => {
      await service.setDisplayName('   ');
      expect(localStorage.removeItem).toHaveBeenCalledWith('display_name_room-1');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"encryptedDisplayName":null'));
    });

    it('should updateWhitelist (add)', async () => {
      service.roomState.set({ whitelist: [] } as any);
      await service.updateWhitelist('bc1qnew', false);
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"UPDATE_WHITELIST"'));
    });

    it('should updateWhitelist (remove)', async () => {
      service.roomState.set({ whitelist: ['bc1qold'] } as any);
      await service.updateWhitelist('bc1qold', true);
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"UPDATE_WHITELIST"'));
    });

    it('should updateWhitelistBatch', async () => {
      service.roomState.set({ whitelist: [] } as any);
      await service.updateWhitelistBatch(['addr1', 'addr2'], false);
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"UPDATE_WHITELIST"'));
    });

    it('should updateWhitelist (add & remove)', async () => {
      service.roomState.set({ whitelist: ['bc1qold'] } as any);
      
      await service.updateWhitelist('bc1qnew', false);
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"UPDATE_WHITELIST"'));
      
      await service.updateWhitelist('bc1qold', true);
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"UPDATE_WHITELIST"'));
    });

    it('should toggleLock', () => {
      service.toggleLock(true);
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"TOGGLE_LOCK"'));
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"locked":true'));
    });

    it('should broadcastFinalization', async () => {
      await service.broadcastFinalization('finalHex123', 'finalTxId123');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"TX_FINALIZED"'));
    });

    it('should gracefullyDisconnect', async () => {
      service.currentSessionId.set('S1');
      const spy = vi.spyOn(service, 'disconnect');
      vi.useFakeTimers();
      
      await service.gracefullyDisconnect();
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"LOG_ACTION"'));
      
      vi.advanceTimersByTime(100);
      expect(spy).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should exit early from actions if no encryption key is set', async () => {
      service.setRoomKey(null);
      
      await service.uploadSignature('AAAA');
      await service.renameRoom('New Room');
      await service.updateSignerLabel('fp1', 'label');
      await service.updateWhitelist('addr1', true);
      await service.updateWhitelistBatch(['addr1'], false);
      await service.broadcastFinalization('hex', 'id');
      await service.setDisplayName('Name');
      
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('should not send label update if the label is exactly the same', async () => {
      service.roomState.set({ signerLabels: { 'fp123': 'My Wallet' } } as any);
      await service.updateSignerLabel('fp123', 'My Wallet');
      
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('should catch errors during gracefullyDisconnect if logging fails', async () => {
      service.currentSessionId.set('S1');
      encryptionMock.encrypt.mockRejectedValueOnce(new Error('Encryption failure'));
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await service.gracefullyDisconnect();
      
      expect(consoleSpy).toHaveBeenCalledWith('Failed to send disconnect log');
    });
  });

  describe('Address Book Logic', () => {
    it('should get local label', () => {
      (localStorage.getItem as any).mockReturnValue('Saved Wallet');
      const res = service.getLocalLabel('fp123');
      expect(res).toBe('Saved Wallet');
      expect(localStorage.getItem).toHaveBeenCalledWith('addr_book_fp123');
    });

    it('should save to address book', () => {
      service.saveToAddressBook('fp123', 'My Device');
      expect(localStorage.setItem).toHaveBeenCalledWith('addr_book_fp123', 'My Device');
    });

    it('should remove from address book', () => {
      service.removeFromAddressBook('fp123');
      expect(localStorage.removeItem).toHaveBeenCalledWith('addr_book_fp123');
    });

    it('should check and apply local labels if coordinator', () => {
      service.role.set('admin');
      service.roomState.set({ signerLabels: {} } as any);
      
      vi.spyOn(service as any, 'signers').mockReturnValue([{ fingerprint: 'fp123', signed: false }]);
      (localStorage.getItem as any).mockReturnValue('Local Device Name');
      
      const updateLabelSpy = vi.spyOn(service, 'updateSignerLabel').mockImplementation(async () => {});

      service.checkAndApplyLocalLabels();

      expect(localStorage.getItem).toHaveBeenCalledWith('addr_book_fp123');
      expect(updateLabelSpy).toHaveBeenCalledWith('fp123', 'Local Device Name');
    });

    it('should not apply local labels if not coordinator', () => {
      service.role.set('guest');
      const updateLabelSpy = vi.spyOn(service, 'updateSignerLabel');
      
      service.checkAndApplyLocalLabels();
      
      expect(updateLabelSpy).not.toHaveBeenCalled();
    });
  });

describe('Getters & Crypto Helpers', () => {
    beforeEach(() => {
      service.role.set('admin');
      service.roomState.set({ psbt: 'AAAA' } as any);
    });

    it('should handle getFinalTxHex securely', () => {
      vi.spyOn(Transaction, 'fromPSBT').mockReturnValue({
        finalize: vi.fn(),
        extract: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3]))
      } as any);

      const txHex = service.getFinalTxHex();
      expect(txHex).toBe('010203');
    });

    it('should return null for getFinalTxHex if not admin', () => {
      service.role.set('guest');
      expect(service.getFinalTxHex()).toBeNull();
    });

    it('should handle getFinalTxId securely', () => {
      vi.spyOn(Transaction, 'fromPSBT').mockReturnValue({
        finalize: vi.fn(),
        id: 'mocked-tx-id'
      } as any);

      const id = service.getFinalTxId();
      expect(id).toBe('mocked-tx-id');
    });

    it('should determine threshold safely', () => {
      vi.spyOn(Transaction, 'fromPSBT').mockReturnValue({
        getInput: () => ({ witnessScript: new Uint8Array([82]) }) // 0x52 = OP_2
      } as any);

      const threshold = service.getThreshold('AAAA');
      expect(threshold).toBe(2);
    });
  });

  describe('PSBT Merging', () => {
    it('should merge two PSBTs using scure/btc-signer', () => {
      const psbt = 'cHNidXf0AAA...'; 
      const result = service.mergePsbts(psbt, psbt);
      expect(result).toBeDefined();
    });

    it('should safely return base psbt if merge fails', () => {
      vi.spyOn(Transaction, 'fromPSBT').mockImplementation(() => { throw new Error('Crash'); });
      const result = service.mergePsbts('valid-base', 'invalid-next');
      expect(result).toBe('valid-base');
    });
  });

  describe('Advanced PSBT Parsing & Complex Workflows', () => {
    beforeEach(async () => {
      await service.connect('room-1', 'key');
    });

    it('should parse TxDetails and detect change outputs', () => {
      vi.spyOn(Transaction, 'fromPSBT').mockReturnValue({
        inputsLength: 1,
        outputsLength: 2,
        unsignedTx: { inputs: [{ txid: new Uint8Array([10, 20, 30]), index: 0 }] },
        getInput: () => ({
          witnessUtxo: { amount: 2000n, script: new Uint8Array([0, 20, 1, 2, 3]) }
        }),
        getOutput: (i: number) => {
          if (i === 0) return { amount: 1000n, script: new Uint8Array([0, 20, 9, 9]) };
          return { 
            amount: 800n, 
            script: new Uint8Array([0, 20, 8, 8]),
            bip32Derivation: [[new Uint8Array(), { path: [44, 0, 0, 1, 5] }]] 
          };
        },
        vsize: 150
      } as any);

      service.roomState.set({ psbt: 'AAAA' } as any);
      const details = service.txDetails();

      expect(details).toBeDefined();
      expect(details?.inputs).toBe(1);
      expect(details?.outputs.length).toBe(2);
      
      expect(details?.outputs[0].isChange).toBe(true); 
      expect(details?.outputs[1].isChange).toBe(false); 
      expect(details?.fee).toBe(200); // 2000 - (1000 + 800)
    });

    it('should extract signers successfully', () => {
      const mockPubkey = new Uint8Array(33).fill(1);
      vi.spyOn(Transaction, 'fromPSBT').mockReturnValue({
        inputsLength: 1,
        getInput: () => ({
          partialSig: [[mockPubkey, new Uint8Array([2, 2])]],
          bip32Derivation: [[mockPubkey, { fingerprint: 0x12345678 }]]
        })
      } as any);

      service.roomState.set({ psbt: 'AAAA' } as any);
      const signers = service.signers();

      expect(signers.length).toBe(1);
      expect(signers[0].fingerprint).toBe('12345678');
      expect(signers[0].signed).toBe(true);
    });

    it('should handle uploadSignature with fingerprint extraction', async () => {
      const mockPubkey = new Uint8Array(33).fill(2);
      
      vi.spyOn(Transaction, 'fromPSBT').mockImplementation((bytes: Uint8Array) => {
        const isUploadedFile = bytes[0] !== 0; 
        return {
          inputsLength: 1,
          getInput: () => ({
            partialSig: isUploadedFile ? [[mockPubkey, new Uint8Array([3])]] : undefined,
            bip32Derivation: [[mockPubkey, { fingerprint: 0xaabbccdd }]]
          })
        } as any;
      });

      service.roomState.set({ psbt: 'AAAA', roomId: 'room-1' } as any);
      
      (localStorage.getItem as any).mockImplementation((key: string) => {
        if (key.startsWith('addr_book_')) return 'Saved Label';
        return null;
      });

      await service.uploadSignature('BBBB');

      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"UPLOAD_PARTIAL"'));
      expect(encryptionMock.blindData).toHaveBeenCalledWith('aabbccdd', 'key');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"SET_DISPLAY_NAME"'));
    });

    it('should execute registerAllFingerprints internally during STATE_SYNC', async () => {
      const stateSyncMsg = {
        data: JSON.stringify({ type: 'STATE_SYNC', roomId: 'room-1', psbt: 'AAAA' })
      };
      
      const mockPubkey = new Uint8Array([1, 2, 3]);
      vi.spyOn(Transaction, 'fromPSBT').mockReturnValue({
        inputsLength: 1,
        getInput: () => ({
          bip32Derivation: [[mockPubkey, { fingerprint: 0x11223344 }]]
        })
      } as any);

      if (ws.onmessage) await ws.onmessage(stateSyncMsg);
      
      expect(encryptionMock.blindData).toHaveBeenCalledWith('11223344', 'key');
    });

    it('should handle legacy inputs and taproot signatures in PSBT parsing', () => {
      const mockPubkey = new Uint8Array(33).fill(5);
      
      vi.spyOn(Transaction, 'fromPSBT').mockReturnValue({
        inputsLength: 1,
        outputsLength: 0,
        unsignedTx: { inputs: [{ index: 0 }] },
        getInput: () => ({
          nonWitnessUtxo: new Uint8Array([1, 2, 3]),
          tapScriptSig: [[{ pubKey: mockPubkey }, new Uint8Array([9, 9])]],
          bip32Derivation: [[mockPubkey, { fingerprint: 0x99887766 }]]
        }),
        getOutput: () => ({}),
        vsize: 150
      } as any);

      service.roomState.set({ psbt: 'AAAA' } as any);
      
      const details = service.txDetails();
      expect(details?.inputsList[0].address).toBe('Legacy Input');
      
      const signers = service.signers();
      expect(signers[0].fingerprint).toBe('99887766');
      expect(signers[0].signed).toBe(true);
    });

    it('should return 0 for getThreshold if script is empty or invalid', () => {
      vi.spyOn(Transaction, 'fromPSBT').mockReturnValue({
        getInput: () => ({ witnessScript: new Uint8Array([0x00]) })
      } as any);

      const threshold = service.getThreshold('AAAA');
      expect(threshold).toBe(0);
    });

    it('should handle PARTICIPANTS_UPDATE and decrypt historical display names', async () => {
      const partsMsg = { data: JSON.stringify({
        type: 'PARTICIPANTS_UPDATE',
        participants: {
          'S1': { id: 'S1', role: 'admin', encryptedDisplayName: 'enc_name_1' },
          'S2': { id: 'S2', role: 'guest' }
        }
      })};

      encryptionMock.decrypt.mockResolvedValueOnce('Alice Auditor');
      if (ws.onmessage) await ws.onmessage(partsMsg);

      const participants = service.roomState()?.participants;
      expect(participants).toBeDefined();
      expect(participants!['S1'].displayName).toBe('Alice Auditor');
      expect(participants!['S2'].displayName).toBeUndefined(); 
    });

    it('should decrypt participants display names during STATE_SYNC', async () => {
      const syncMsg = { data: JSON.stringify({
        type: 'STATE_SYNC',
        roomId: 'room-1',
        participants: {
          'S3': { id: 'S3', role: 'guest', encryptedDisplayName: 'enc_name_3' }
        },
        protocolVersion: '1.0.0'
      })};

      encryptionMock.decrypt.mockResolvedValueOnce('Bob Signer');
      if (ws.onmessage) await ws.onmessage(syncMsg);

      const participants = service.roomState()?.participants;
      expect(participants).toBeDefined();
      expect(participants!['S3'].displayName).toBe('Bob Signer');
    });
  });

  describe('PSBT Finalization Error Handling', () => {
    it('should return null from getFinalTxHex and getFinalTxId if parsing fails', () => {
      service.role.set('admin');
      service.roomState.set({ psbt: 'not-a-valid-base64-psbt!' } as any);
      
      expect(service.getFinalTxHex()).toBeNull();
      expect(service.getFinalTxId()).toBeNull();
    });

    it('should return null from getFinalTxHex and getFinalTxId if state is corrupt', () => {
      // Forcing roomState to null guarantees a TypeError when methods try to read it
      service.roomState.set(null as any);
      
      expect(service.getFinalTxHex()).toBeNull();
      expect(service.getFinalTxId()).toBeNull();
    });
  });

  describe('Address Encoding (formatScriptAddress)', () => {
    // Helper to convert raw hex strings to Uint8Array for the encoder
    const hexToBytes = (hexStr: string) => 
        new Uint8Array(hexStr.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

    beforeEach(() => {
      // Default all tests to Mainnet unless overridden
      service.roomState.set({ network: 'bitcoin' } as any);
    });

    it('should encode Mainnet P2WPKH (Native SegWit Single-Sig) correctly', () => {
      const script = hexToBytes('0014751e76e8199196d454941c45d1b3a323f1433bd6');
      const result = service['formatScriptAddress'](script);
      expect(result).toBe('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
    });

    it('should encode Mainnet P2WSH (Native SegWit Multi-Sig) correctly', () => {
      const script = hexToBytes('00201863143c14c5166804bd19203356da136c985678cd4d27a1b8c6329604903262');
      const result = service['formatScriptAddress'](script);
      expect(result).toBe('bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3');
    });

    it('should encode Mainnet P2TR (Taproot) correctly using bech32m', () => {
      const script = hexToBytes('5120cc8a4bc6416805ac1141fb11508f72382f71694fbbbf017a5223e743a6d96923');
      const result = service['formatScriptAddress'](script);
      expect(result).toBe('bc1pej9yh3jpdqz6cy2plvg4prmj8qhhz620hwlsz7jjy0n58fkedy3szerluj');
    });

    it('should encode Signet/Testnet P2WSH correctly when room network is signet', () => {
      service.roomState.set({ network: 'signet' } as any);
      
      const script = hexToBytes('00203d6bbc9c7ff1c578f24322a1f3b9f78c4646f96a450060c181fec38a3ce41519');
      const result = service['formatScriptAddress'](script);
      
      expect(result).toBe('tb1q844me8rl78zh3ujry2sl8w0h33ryd7t2g5qxpsvplmpc508yz5vslwxw8z');
    });

    it('should return raw hex for legacy or unknown script templates', () => {
      // Standard P2PKH legacy script starting with 76a914...
      const script = hexToBytes('76a914751e76e8199196d454941c45d1b3a323f1433bd688ac');
      const result = service['formatScriptAddress'](script);
      expect(result).toBe('76a914751e76e8199196d454941c45d1b3a323f1433bd688ac');
    });

    it('should return "Unknown" for empty or uninitialized script arrays', () => {
      const result = service['formatScriptAddress'](new Uint8Array([]));
      expect(result).toBe('Unknown');
    });

    it('should fallback to slicing hex if a fatal error occurs during encoding', () => {
      // Force the underlying library to throw an unexpected runtime error
      vi.spyOn(bech32, 'toWords').mockImplementationOnce(() => { 
          throw new Error('Simulated hardware read failure'); 
      });
      
      const script = hexToBytes('00203d6bbc9c7ff1c578f24322a1f3b9f78c4646f96a450060c181fec38a3ce41519');
      const result = service['formatScriptAddress'](script);
      
      // Because the script starts with '0020', the catch block should safely slice off the first 4 chars
      expect(result).toBe('3d6bbc9c7ff1c578f24322a1f3b9f78c4646f96a450060c181fec38a3ce41519');
    });
  });
});