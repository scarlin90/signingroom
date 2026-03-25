import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { EncryptionService } from './encryption.service';
import { webcrypto } from 'node:crypto';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeAll(() => {
    // Forcefully overwrite JSDOM's incomplete crypto object with Node's full WebCrypto API
    Object.defineProperty(window, 'crypto', {
      value: webcrypto,
      writable: true,
      configurable: true
    });
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EncryptionService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should generate a key string', async () => {
    const key = await service.generateKey();
    expect(key).toBeTypeOf('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('should encrypt and decrypt a message correctly', async () => {
    const key = await service.generateKey();
    const original = 'Hello World';
    
    const encrypted = await service.encrypt(original, key);
    expect(encrypted).not.toBe(original);
    
    const decrypted = await service.decrypt(encrypted, key);
    expect(decrypted).toBe(original);
  });

  it('should fail to decrypt with wrong key', async () => {
    const key1 = await service.generateKey();
    const key2 = await service.generateKey();
    const encrypted = await service.encrypt('Secret', key1);

    await expect(service.decrypt(encrypted, key2)).rejects.toThrow();
  });

  // --- THE DETERMINISTIC TEST VECTOR GENERATOR ---
  it('should generate BIP protocol test vectors deterministically', async () => {
    // 1. Hardcode a 32-byte Key (256-bit FBEK)
    const rawKey = new Uint8Array(32);
    rawKey.fill(1); // Fills with 0x01
    const base64Key = btoa(String.fromCharCode(...rawKey)); // AQEBAQ...

    // 2. Mock crypto.getRandomValues to generate predictable IVs
    const originalGetRandomValues = window.crypto.getRandomValues.bind(window.crypto);
    let currentIvSeed = 0;
    
    // @ts-ignore
    window.crypto.getRandomValues = (array: Uint8Array) => {
        for (let i = 0; i < array.length; i++) {
            array[i] = (currentIvSeed + i) % 256;
        }
        return array;
    };

    console.log(`\n======================================================`);
    console.log(`=== BIP PROTOCOL TEST VECTORS ===`);
    console.log(`======================================================`);
    console.log(`* Global Key (Hex): ${Array.from(rawKey).map(b => b.toString(16).padStart(2, '0')).join('')}`);
    console.log(`* Global Key (Base64 FBEK): ${base64Key}\n`);

    // --- 2.1 AUTH ---
    const adminSecret = "4155db36-6997-4f67-8ccb-1d740c0f54b6";
    
    // 1. Encrypt the secret
    currentIvSeed = 200; // IV = c8c9cacbcccdcecfd0d1d2d3
    const encryptedAdminToken = await service.encrypt(adminSecret, base64Key);
    const ivAuth = Array.from({length: 12}, (_, i) => (200 + i).toString(16).padStart(2, '0')).join('');
    
    // 2. Hash the Base64 string
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encryptedAdminToken));
    const adminHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    console.log(`### 2.1 AUTH`);
    console.log(`* adminSecret Plaintext (UUID): "${adminSecret}"`);
    console.log(`* encryptedAdminToken IV (Hex): ${ivAuth}`);
    console.log(`* encryptedAdminToken Output (Base64): ${encryptedAdminToken}`);
    console.log(`* Final Transmitted Token (SHA-256 of Base64): ${adminHash}`);
    console.log(JSON.stringify({ type: "AUTH", token: adminHash }, null, 2) + "\n");

    
    // --- 2.2 UPLOAD_PARTIAL ---
    const fpPt = "af4b013d";
    const blindedFp = await service.blindData(fpPt, base64Key);
    
    currentIvSeed = 0; // IV = 000102030405060708090a0b
    const psbtPt = "cHNidP8BAFICAAAA...";
    const encPsbt = await service.encrypt(psbtPt, base64Key);
    const ivPsbt = Array.from({length: 12}, (_, i) => (0 + i).toString(16).padStart(2, '0')).join('');
    
    currentIvSeed = 12; // IV = 0c0d0e0f1011121314151617
    const logPt1 = '{"timestamp":1710000000000,"event":"Signature Uploaded","detail":"Signer: af4b013d","user":"Guest (ABCD)"}';
    const encLog1 = await service.encrypt(logPt1, base64Key);
    const ivLog1 = Array.from({length: 12}, (_, i) => (12 + i).toString(16).padStart(2, '0')).join('');

    console.log(`### 2.2 UPLOAD_PARTIAL`);
    console.log(`* Fingerprint Plaintext: "${fpPt}"`);
    console.log(`* Fingerprint Output (Blinded): ${blindedFp}`);
    console.log(`* encryptedData Plaintext: "${psbtPt}"`);
    console.log(`* encryptedData IV (Hex): ${ivPsbt}`);
    console.log(`* encryptedData Output (Base64): ${encPsbt}`);
    console.log(`* encryptedLogBlob Plaintext: ${logPt1}`);
    console.log(`* encryptedLogBlob IV (Hex): ${ivLog1}`);
    console.log(`* encryptedLogBlob Output (Base64): ${encLog1}`);
    console.log(JSON.stringify({
      type: "UPLOAD_PARTIAL",
      fingerprint: blindedFp,
      data: { encryptedData: encPsbt },
      encryptedLogBlob: encLog1
    }, null, 2) + "\n");

    // --- 2.3 UPDATE_LABEL ---
    currentIvSeed = 24;
    const labelPt = "Bob - CFO";
    const encLabel = await service.encrypt(labelPt, base64Key);
    const ivLabel = Array.from({length: 12}, (_, i) => (24 + i).toString(16).padStart(2, '0')).join('');

    currentIvSeed = 36;
    const logPt2 = '{"timestamp":1710000000000,"event":"Label Updated","detail":"Bob - CFO (af4b013d)","user":"Coordinator"}';
    const encLog2 = await service.encrypt(logPt2, base64Key);
    const ivLog2 = Array.from({length: 12}, (_, i) => (36 + i).toString(16).padStart(2, '0')).join('');

    console.log(`### 2.3 UPDATE_LABEL`);
    console.log(`* label Plaintext: "${labelPt}"`);
    console.log(`* label IV (Hex): ${ivLabel}`);
    console.log(`* label Output (Base64): ${encLabel}`);
    console.log(`* encryptedLogBlob Plaintext: ${logPt2}`);
    console.log(`* encryptedLogBlob IV (Hex): ${ivLog2}`);
    console.log(`* encryptedLogBlob Output (Base64): ${encLog2}`);
    console.log(JSON.stringify({
      type: "UPDATE_LABEL",
      fingerprint: blindedFp,
      label: encLabel,
      encryptedLogBlob: encLog2
    }, null, 2) + "\n");

    // --- 2.4 SET_DISPLAY_NAME ---
    currentIvSeed = 48;
    const displayNamePt = "Alice (Ledger)";
    const encDisplayName = await service.encrypt(displayNamePt, base64Key);
    const ivDisplayName = Array.from({length: 12}, (_, i) => (48 + i).toString(16).padStart(2, '0')).join('');

    console.log(`### 2.4 SET_DISPLAY_NAME`);
    console.log(`* encryptedDisplayName Plaintext: "${displayNamePt}"`);
    console.log(`* encryptedDisplayName IV (Hex): ${ivDisplayName}`);
    console.log(`* encryptedDisplayName Output (Base64): ${encDisplayName}`);
    console.log(JSON.stringify({
      type: "SET_DISPLAY_NAME",
      encryptedDisplayName: encDisplayName
    }, null, 2) + "\n");

    // --- 2.5 RENAME_ROOM ---
    currentIvSeed = 60;
    const roomNamePt = "Q1 Treasury Board Vote";
    const encRoomName = await service.encrypt(roomNamePt, base64Key);
    const ivRoomName = Array.from({length: 12}, (_, i) => (60 + i).toString(16).padStart(2, '0')).join('');

    currentIvSeed = 72;
    const logPtRename = '{"timestamp":1710000000000,"event":"Room Renamed","detail":"Renamed: Q1 Treasury Board Vote","user":"Coordinator"}';
    const encLogRename = await service.encrypt(logPtRename, base64Key);
    const ivLogRename = Array.from({length: 12}, (_, i) => (72 + i).toString(16).padStart(2, '0')).join('');

    console.log(`### 2.5 RENAME_ROOM`);
    console.log(`* encryptedName Plaintext: "${roomNamePt}"`);
    console.log(`* encryptedName IV (Hex): ${ivRoomName}`);
    console.log(`* encryptedName Output (Base64): ${encRoomName}`);
    console.log(`* encryptedLogBlob Plaintext: ${logPtRename}`);
    console.log(`* encryptedLogBlob IV (Hex): ${ivLogRename}`);
    console.log(`* encryptedLogBlob Output (Base64): ${encLogRename}`);
    console.log(JSON.stringify({
      type: "RENAME_ROOM",
      encryptedName: encRoomName,
      encryptedLogBlob: encLogRename
    }, null, 2) + "\n");

    // --- 2.6 TOGGLE_LOCK ---
    currentIvSeed = 84;
    const logPtLock = '{"timestamp":1710000000000,"event":"Room Locked","detail":"Coordinator locked the room","user":"Coordinator"}';
    const encLogLock = await service.encrypt(logPtLock, base64Key);
    const ivLogLock = Array.from({length: 12}, (_, i) => (84 + i).toString(16).padStart(2, '0')).join('');

    console.log(`### 2.6 TOGGLE_LOCK`);
    console.log(`* isLocked Plaintext (Boolean): true`);
    console.log(`* encryptedLogBlob Plaintext: ${logPtLock}`);
    console.log(`* encryptedLogBlob IV (Hex): ${ivLogLock}`);
    console.log(`* encryptedLogBlob Output (Base64): ${encLogLock}`);
    console.log(JSON.stringify({
      type: "TOGGLE_LOCK",
      isLocked: true,
      encryptedLogBlob: encLogLock
    }, null, 2) + "\n");

    // --- 2.7 UPDATE_WHITELIST ---
    currentIvSeed = 96;
    const wlPt = '["bc1q04e2117f1b09f7c6a6ff92daecfb9a4de57bc4ca18e33933f28d1067d81b3196"]';
    const encWl = await service.encrypt(wlPt, base64Key);
    const ivWl = Array.from({length: 12}, (_, i) => (96 + i).toString(16).padStart(2, '0')).join('');

    currentIvSeed = 108;
    const logPt3 = '{"timestamp":1710000000000,"event":"Whitelist Updated","detail":"Added ...b3196 to whitelist","user":"Coordinator"}';
    const encLog3 = await service.encrypt(logPt3, base64Key);
    const ivLog3 = Array.from({length: 12}, (_, i) => (108 + i).toString(16).padStart(2, '0')).join('');

    console.log(`### 2.7 UPDATE_WHITELIST`);
    console.log(`* encryptedWhitelist Plaintext: ${wlPt}`);
    console.log(`* encryptedWhitelist IV (Hex): ${ivWl}`);
    console.log(`* encryptedWhitelist Output (Base64): ${encWl}`);
    console.log(`* encryptedLogBlob Plaintext: ${logPt3}`);
    console.log(`* encryptedLogBlob IV (Hex): ${ivLog3}`);
    console.log(`* encryptedLogBlob Output (Base64): ${encLog3}`);
    console.log(JSON.stringify({
      type: "UPDATE_WHITELIST",
      encryptedWhitelist: encWl,
      encryptedLogBlob: encLog3
    }, null, 2) + "\n");

    // --- 2.8 LOG_ACTION ---
    currentIvSeed = 120;
    const logPtAction = '{"timestamp":1710000000000,"event":"PSBT Downloaded","detail":"Unsigned file exported","user":"Guest (ABCD)"}';
    const encLogAction = await service.encrypt(logPtAction, base64Key);
    const ivLogAction = Array.from({length: 12}, (_, i) => (120 + i).toString(16).padStart(2, '0')).join('');

    console.log(`### 2.8 LOG_ACTION`);
    console.log(`* encryptedLogBlob Plaintext: ${logPtAction}`);
    console.log(`* encryptedLogBlob IV (Hex): ${ivLogAction}`);
    console.log(`* encryptedLogBlob Output (Base64): ${encLogAction}`);
    console.log(JSON.stringify({
      type: "LOG_ACTION",
      encryptedLogBlob: encLogAction
    }, null, 2) + "\n");

    // --- 2.9 TX_FINALIZED ---
    currentIvSeed = 132;
    const hexPt = "0200000000010153ae6e073b...";
    const encHex = await service.encrypt(hexPt, base64Key);
    const ivHex = Array.from({length: 12}, (_, i) => (132 + i).toString(16).padStart(2, '0')).join('');

    currentIvSeed = 144;
    const idPt = "6698923ed3153ddb30b96bff7924f47f67e184d243e5bc57098166967c193ce3";
    const encId = await service.encrypt(idPt, base64Key);
    const ivId = Array.from({length: 12}, (_, i) => (144 + i).toString(16).padStart(2, '0')).join('');

    currentIvSeed = 156;
    const logPt4 = '{"timestamp":1710000000000,"event":"Tx Finalized","detail":"Signatures merged successfully","user":"Coordinator"}';
    const encLog4 = await service.encrypt(logPt4, base64Key);
    const ivLog4 = Array.from({length: 12}, (_, i) => (156 + i).toString(16).padStart(2, '0')).join('');

    console.log(`### 2.9 TX_FINALIZED`);
    console.log(`* encryptedFinalTxHex Plaintext: "${hexPt}"`);
    console.log(`* encryptedFinalTxHex IV (Hex): ${ivHex}`);
    console.log(`* encryptedFinalTxHex Output (Base64): ${encHex}`);
    console.log(`* encryptedFinalTxId Plaintext: "${idPt}"`);
    console.log(`* encryptedFinalTxId IV (Hex): ${ivId}`);
    console.log(`* encryptedFinalTxId Output (Base64): ${encId}`);
    console.log(`* encryptedLogBlob Plaintext: ${logPt4}`);
    console.log(`* encryptedLogBlob IV (Hex): ${ivLog4}`);
    console.log(`* encryptedLogBlob Output (Base64): ${encLog4}`);
    console.log(JSON.stringify({
      type: "TX_FINALIZED",
      encryptedFinalTxHex: encHex,
      encryptedFinalTxId: encId,
      encryptedLogBlob: encLog4
    }, null, 2) + "\n");

    // --- STATE_SYNC (Server-to-Client Aggregation) ---
    console.log(`### STATE_SYNC (Relay-to-Client)`);
    console.log(JSON.stringify({
        type: "STATE_SYNC",
        roomId: "123e4567-e89b-12d3-a456-426614174000",
        network: "bitcoin",
        roomName: encRoomName,
        encryptedPsbt: encPsbt,
        signatures: [encPsbt],
        isLocked: true,
        auditLog: [encLog1],
        signerLabels: { [blindedFp]: encLabel },
        whitelist: encWl,
        encryptedFinalTxHex: encHex,
        encryptedFinalTxId: encId,
        connectedCount: 2,
        protocolVersion: "1.0.0"
    }, null, 2) + "\n");

    console.log(`======================================================\n`);

    // Restore original crypto function
    window.crypto.getRandomValues = originalGetRandomValues;
    expect(adminHash).toBeDefined();
  });
});