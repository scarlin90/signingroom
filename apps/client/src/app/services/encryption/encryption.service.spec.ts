import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EncryptionService } from './encryption.service';
import { EncryptionEngine } from '@signing-room/sdk';

describe('EncryptionService (Angular Wrapper)', () => {
  let service: EncryptionService;
  let engine: EncryptionEngine;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [EncryptionService],
    });
    service = TestBed.inject(EncryptionService);
    engine = (service as any).engine;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should delegate generateKey to the engine', async () => {
    const spy = vi.spyOn(engine, 'generateKey').mockResolvedValue('mock-key');
    const result = await service.generateKey();
    expect(spy).toHaveBeenCalled();
    expect(result).toBe('mock-key');
  });

  it('should delegate encrypt to the engine (with optional AAD)', async () => {
    const spy = vi.spyOn(engine, 'encrypt').mockResolvedValue('encrypted-val');
    const result = await service.encrypt('data', 'key', 'room:123|field:psbt');
    expect(spy).toHaveBeenCalledWith('data', 'key', 'room:123|field:psbt');
    expect(result).toBe('encrypted-val');
  });

  it('should delegate decrypt to the engine (with optional AAD)', async () => {
    const spy = vi.spyOn(engine, 'decrypt').mockResolvedValue('decrypted-val');
    const result = await service.decrypt('encrypted-data', 'key', 'room:123|field:psbt');
    expect(spy).toHaveBeenCalledWith('encrypted-data', 'key', 'room:123|field:psbt');
    expect(result).toBe('decrypted-val');
  });

  it('should delegate blindData to the engine', async () => {
    const spy = vi.spyOn(engine, 'blindData').mockResolvedValue('blind-val');
    const result = await service.blindData('data', 'key');
    expect(spy).toHaveBeenCalledWith('data', 'key');
    expect(result).toBe('blind-val');
  });

  // --- THE DETERMINISTIC TEST VECTOR GENERATOR (v2.0.0 with AAD, MuSig2 & Hash Chain) ---
  it('should generate BIP protocol test vectors deterministically', async () => {
    // 1. Hardcode a 32-byte Key (256-bit FBEK) & Canonical Room ID
    const roomId = '123e4567-e89b-12d3-a456-426614174000';
    const rawKey = new Uint8Array(32);
    rawKey.fill(1); // Fills with 0x01
    const base64Key = btoa(String.fromCharCode(...rawKey)); // AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=

    const getFieldAad = (field: string) => `room:${roomId}|field:${field}`;
    const sha256Hex = async (input: string) => {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    };

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

    const ivHexFromSeed = (seed: number) =>
      Array.from({ length: 12 }, (_, i) => ((seed + i) % 256).toString(16).padStart(2, '0')).join('');

    const blindPass = await service.blindData(roomId, base64Key);

    console.log(`\n======================================================`);
    console.log(`=== BIP PROTOCOL TEST VECTORS (v2.0.0) ===`);
    console.log(`======================================================`);
    console.log(`* Canonical Room ID: ${roomId}`);
    console.log(
      `* Global Key (Hex): ${Array.from(rawKey)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')}`,
    );
    console.log(`* Global Key (Base64 FBEK): ${base64Key}`);
    console.log(`* Blind Room Pass (SHA-256(roomId + FBEK)[0:16]): ${blindPass}`);
    console.log(`* WebSocket Sec-WebSocket-Protocol Header: signingroom-v2, pass.${blindPass}\n`);

    // --- 2.1 AUTH ---
    const adminSecret = '4155db36-6997-4f67-8ccb-1d740c0f54b6';
    currentIvSeed = 200; // IV = c8c9cacbcccdcecfd0d1d2d3
    const encryptedAdminToken = await service.encrypt(adminSecret, base64Key);
    const ivAuth = ivHexFromSeed(200);
    const adminHash = await sha256Hex(encryptedAdminToken);

    console.log(`### 2.1 AUTH`);
    console.log(`* adminSecret Plaintext (UUID): "${adminSecret}"`);
    console.log(`* encryptedAdminToken AAD: (none - local sessionStorage backup token)`);
    console.log(`* encryptedAdminToken IV (Hex): ${ivAuth}`);
    console.log(`* encryptedAdminToken Output (Base64): ${encryptedAdminToken}`);
    console.log(`* Stored Relay Hash (SHA-256 of encryptedAdminToken): ${adminHash}`);
    console.log(JSON.stringify({ type: 'AUTH', token: encryptedAdminToken }, null, 2) + '\n');

    // --- 2.2 UPLOAD_PARTIAL ---
    const fpPt = 'af4b013d';
    const blindedFp = await service.blindData(fpPt, base64Key);

    currentIvSeed = 0; // IV = 000102030405060708090a0b
    const psbtPt = 'cHNidP8BAFICAAAA...';
    const aadPartial = getFieldAad('partial');
    const encPsbt = await service.encrypt(psbtPt, base64Key, aadPartial);
    const ivPsbt = ivHexFromSeed(0);

    currentIvSeed = 12; // IV = 0c0d0e0f1011121314151617
    const aadAudit = getFieldAad('audit_log');
    const logPt1 = JSON.stringify({
      timestamp: 1710000000000,
      seq: 1,
      roomId,
      event: 'Signature Uploaded',
      detail: 'Signer: af4b013d',
      user: 'Guest (ABCD)',
    });
    const encLog1 = await service.encrypt(logPt1, base64Key, aadAudit);
    const ivLog1 = ivHexFromSeed(12);

    console.log(`### 2.2 UPLOAD_PARTIAL`);
    console.log(`* Fingerprint Plaintext: "${fpPt}"`);
    console.log(`* Fingerprint Output (Blinded): ${blindedFp}`);
    console.log(`* encryptedData Plaintext: "${psbtPt}"`);
    console.log(`* encryptedData AAD: "${aadPartial}"`);
    console.log(`* encryptedData IV (Hex): ${ivPsbt}`);
    console.log(`* encryptedData Output (Base64): ${encPsbt}`);
    console.log(`* encryptedLogBlob Plaintext: ${logPt1}`);
    console.log(`* encryptedLogBlob AAD: "${aadAudit}"`);
    console.log(`* encryptedLogBlob IV (Hex): ${ivLog1}`);
    console.log(`* encryptedLogBlob Output (Base64): ${encLog1}`);
    console.log(
      JSON.stringify(
        {
          type: 'UPLOAD_PARTIAL',
          fingerprint: blindedFp,
          data: { encryptedData: encPsbt },
          encryptedLogBlob: encLog1,
        },
        null,
        2,
      ) + '\n',
    );

    // --- 2.3 UPDATE_LABEL ---
    currentIvSeed = 24;
    const labelPt = 'Bob - CFO';
    const aadSignerLabel = getFieldAad(`signer_label:${blindedFp}`);
    const encLabel = await service.encrypt(labelPt, base64Key, aadSignerLabel);
    const ivLabel = ivHexFromSeed(24);

    currentIvSeed = 36;
    const logPt2 = JSON.stringify({
      timestamp: 1710000000000,
      seq: 2,
      roomId,
      event: 'Label Updated',
      detail: 'Bob - CFO (af4b013d)',
      user: 'Coordinator',
    });
    const encLog2 = await service.encrypt(logPt2, base64Key, aadAudit);
    const ivLog2 = ivHexFromSeed(36);

    console.log(`### 2.3 UPDATE_LABEL`);
    console.log(`* label Plaintext: "${labelPt}"`);
    console.log(`* label AAD: "${aadSignerLabel}"`);
    console.log(`* label IV (Hex): ${ivLabel}`);
    console.log(`* label Output (Base64): ${encLabel}`);
    console.log(`* encryptedLogBlob Plaintext: ${logPt2}`);
    console.log(`* encryptedLogBlob AAD: "${aadAudit}"`);
    console.log(`* encryptedLogBlob IV (Hex): ${ivLog2}`);
    console.log(`* encryptedLogBlob Output (Base64): ${encLog2}`);
    console.log(
      JSON.stringify(
        {
          type: 'UPDATE_LABEL',
          fingerprint: blindedFp,
          label: encLabel,
          encryptedLogBlob: encLog2,
        },
        null,
        2,
      ) + '\n',
    );

    // --- 2.4 SET_DISPLAY_NAME ---
    currentIvSeed = 48;
    const displayNamePt = 'Alice (Ledger)';
    const aadDisplayName = getFieldAad('display_name');
    const encDisplayName = await service.encrypt(displayNamePt, base64Key, aadDisplayName);
    const ivDisplayName = ivHexFromSeed(48);

    console.log(`### 2.4 SET_DISPLAY_NAME`);
    console.log(`* encryptedDisplayName Plaintext: "${displayNamePt}"`);
    console.log(`* encryptedDisplayName AAD: "${aadDisplayName}"`);
    console.log(`* encryptedDisplayName IV (Hex): ${ivDisplayName}`);
    console.log(`* encryptedDisplayName Output (Base64): ${encDisplayName}`);
    console.log(
      JSON.stringify(
        {
          type: 'SET_DISPLAY_NAME',
          encryptedDisplayName: encDisplayName,
        },
        null,
        2,
      ) + '\n',
    );

    // --- 2.5 RENAME_ROOM ---
    currentIvSeed = 60;
    const roomNamePt = 'Q1 Treasury Board Vote';
    const aadRoomName = getFieldAad('room_name');
    const encRoomName = await service.encrypt(roomNamePt, base64Key, aadRoomName);
    const ivRoomName = ivHexFromSeed(60);

    currentIvSeed = 72;
    const logPtRename = JSON.stringify({
      timestamp: 1710000000000,
      seq: 3,
      roomId,
      event: 'Room Renamed',
      detail: 'Renamed: Q1 Treasury Board Vote',
      user: 'Coordinator',
    });
    const encLogRename = await service.encrypt(logPtRename, base64Key, aadAudit);
    const ivLogRename = ivHexFromSeed(72);

    console.log(`### 2.5 RENAME_ROOM`);
    console.log(`* encryptedName Plaintext: "${roomNamePt}"`);
    console.log(`* encryptedName AAD: "${aadRoomName}"`);
    console.log(`* encryptedName IV (Hex): ${ivRoomName}`);
    console.log(`* encryptedName Output (Base64): ${encRoomName}`);
    console.log(`* encryptedLogBlob Plaintext: ${logPtRename}`);
    console.log(`* encryptedLogBlob AAD: "${aadAudit}"`);
    console.log(`* encryptedLogBlob IV (Hex): ${ivLogRename}`);
    console.log(`* encryptedLogBlob Output (Base64): ${encLogRename}`);
    console.log(
      JSON.stringify(
        {
          type: 'RENAME_ROOM',
          encryptedName: encRoomName,
          encryptedLogBlob: encLogRename,
        },
        null,
        2,
      ) + '\n',
    );

    // --- 2.6 TOGGLE_LOCK ---
    currentIvSeed = 84;
    const logPtLock = JSON.stringify({
      timestamp: 1710000000000,
      seq: 4,
      roomId,
      event: 'Room Locked',
      detail: 'Coordinator locked the room',
      user: 'Coordinator',
    });
    const encLogLock = await service.encrypt(logPtLock, base64Key, aadAudit);
    const ivLogLock = ivHexFromSeed(84);

    console.log(`### 2.6 TOGGLE_LOCK`);
    console.log(`* isLocked Plaintext (Boolean): true`);
    console.log(`* encryptedLogBlob Plaintext: ${logPtLock}`);
    console.log(`* encryptedLogBlob AAD: "${aadAudit}"`);
    console.log(`* encryptedLogBlob IV (Hex): ${ivLogLock}`);
    console.log(`* encryptedLogBlob Output (Base64): ${encLogLock}`);
    console.log(
      JSON.stringify(
        {
          type: 'TOGGLE_LOCK',
          isLocked: true,
          encryptedLogBlob: encLogLock,
        },
        null,
        2,
      ) + '\n',
    );

    // --- 2.7 UPDATE_WHITELIST ---
    currentIvSeed = 96;
    const wlPt = '["bc1q04e2117f1b09f7c6a6ff92daecfb9a4de57bc4ca18e33933f28d1067d81b3196"]';
    const aadWl = getFieldAad('whitelist');
    const encWl = await service.encrypt(wlPt, base64Key, aadWl);
    const ivWl = ivHexFromSeed(96);

    currentIvSeed = 108;
    const logPt3 = JSON.stringify({
      timestamp: 1710000000000,
      seq: 5,
      roomId,
      event: 'Whitelist Updated',
      detail: 'Added ...b3196 to whitelist',
      user: 'Coordinator',
    });
    const encLog3 = await service.encrypt(logPt3, base64Key, aadAudit);
    const ivLog3 = ivHexFromSeed(108);

    console.log(`### 2.7 UPDATE_WHITELIST`);
    console.log(`* encryptedWhitelist Plaintext: ${wlPt}`);
    console.log(`* encryptedWhitelist AAD: "${aadWl}"`);
    console.log(`* encryptedWhitelist IV (Hex): ${ivWl}`);
    console.log(`* encryptedWhitelist Output (Base64): ${encWl}`);
    console.log(`* encryptedLogBlob Plaintext: ${logPt3}`);
    console.log(`* encryptedLogBlob AAD: "${aadAudit}"`);
    console.log(`* encryptedLogBlob IV (Hex): ${ivLog3}`);
    console.log(`* encryptedLogBlob Output (Base64): ${encLog3}`);
    console.log(
      JSON.stringify(
        {
          type: 'UPDATE_WHITELIST',
          encryptedWhitelist: encWl,
          encryptedLogBlob: encLog3,
        },
        null,
        2,
      ) + '\n',
    );

    // --- 2.8 LOG_ACTION ---
    currentIvSeed = 120;
    const logPtAction = JSON.stringify({
      timestamp: 1710000000000,
      seq: 2,
      roomId,
      event: 'PSBT Downloaded',
      detail: 'Unsigned file exported',
      user: 'Guest (ABCD)',
    });
    const encLogAction = await service.encrypt(logPtAction, base64Key, aadAudit);
    const ivLogAction = ivHexFromSeed(120);

    console.log(`### 2.8 LOG_ACTION`);
    console.log(`* encryptedLogBlob Plaintext: ${logPtAction}`);
    console.log(`* encryptedLogBlob AAD: "${aadAudit}"`);
    console.log(`* encryptedLogBlob IV (Hex): ${ivLogAction}`);
    console.log(`* encryptedLogBlob Output (Base64): ${encLogAction}`);
    console.log(
      JSON.stringify(
        {
          type: 'LOG_ACTION',
          encryptedLogBlob: encLogAction,
        },
        null,
        2,
      ) + '\n',
    );

    // --- 2.9 TX_FINALIZED ---
    currentIvSeed = 132;
    const hexPt = '0200000000010153ae6e073b...';
    const aadFinalHex = getFieldAad('final_hex');
    const encHex = await service.encrypt(hexPt, base64Key, aadFinalHex);
    const ivHex = ivHexFromSeed(132);

    currentIvSeed = 144;
    const idPt = '6698923ed3153ddb30b96bff7924f47f67e184d243e5bc57098166967c193ce3';
    const aadFinalTxId = getFieldAad('final_txid');
    const encId = await service.encrypt(idPt, base64Key, aadFinalTxId);
    const ivId = ivHexFromSeed(144);

    currentIvSeed = 156;
    const logPt4 = JSON.stringify({
      timestamp: 1710000000000,
      seq: 6,
      roomId,
      event: 'Tx Finalized',
      detail: 'Signatures merged successfully',
      user: 'Coordinator',
    });
    const encLog4 = await service.encrypt(logPt4, base64Key, aadAudit);
    const ivLog4 = ivHexFromSeed(156);

    console.log(`### 2.9 TX_FINALIZED`);
    console.log(`* encryptedFinalTxHex Plaintext: "${hexPt}"`);
    console.log(`* encryptedFinalTxHex AAD: "${aadFinalHex}"`);
    console.log(`* encryptedFinalTxHex IV (Hex): ${ivHex}`);
    console.log(`* encryptedFinalTxHex Output (Base64): ${encHex}`);
    console.log(`* encryptedFinalTxId Plaintext: "${idPt}"`);
    console.log(`* encryptedFinalTxId AAD: "${aadFinalTxId}"`);
    console.log(`* encryptedFinalTxId IV (Hex): ${ivId}`);
    console.log(`* encryptedFinalTxId Output (Base64): ${encId}`);
    console.log(`* encryptedLogBlob Plaintext: ${logPt4}`);
    console.log(`* encryptedLogBlob AAD: "${aadAudit}"`);
    console.log(`* encryptedLogBlob IV (Hex): ${ivLog4}`);
    console.log(`* encryptedLogBlob Output (Base64): ${encLog4}`);
    console.log(
      JSON.stringify(
        {
          type: 'TX_FINALIZED',
          encryptedFinalTxHex: encHex,
          encryptedFinalTxId: encId,
          encryptedLogBlob: encLog4,
        },
        null,
        2,
      ) + '\n',
    );

    // --- 2.10 PARTICIPANTS_UPDATE ---
    currentIvSeed = 168;
    const participantNamePt = 'Charlie (Coldcard)';
    const encParticipantName = await service.encrypt(participantNamePt, base64Key, aadDisplayName);
    const ivParticipantName = ivHexFromSeed(168);

    console.log(`### 2.10 PARTICIPANTS_UPDATE`);
    console.log(`* participantName Plaintext: "${participantNamePt}"`);
    console.log(`* participantName AAD: "${aadDisplayName}"`);
    console.log(`* participantName IV (Hex): ${ivParticipantName}`);
    console.log(`* participantName Output (Base64): ${encParticipantName}`);

    const participantsPayload = {
      ABCD: {
        id: 'ABCD',
        role: 'admin',
        encryptedDisplayName: encParticipantName,
      },
      EFGH: {
        id: 'EFGH',
        role: 'guest',
      },
    };

    console.log(
      JSON.stringify(
        {
          type: 'PARTICIPANTS_UPDATE',
          participants: participantsPayload,
        },
        null,
        2,
      ) + '\n',
    );

    // --- 2.11 UPDATE_ADDRESS_LABEL ---
    const addressPt = 'tb1qww078psjaee79gh0cfrqpf6gtzvxzk7gcfs869vnxtruhj6xj03qjfdnh8';
    const blindedAddress = await service.blindData(addressPt, base64Key);

    currentIvSeed = 216;
    const addressLabelPt = 'Corporate Treasury';
    const aadAddressLabel = getFieldAad(`address_label:${blindedAddress}`);
    const encAddressLabel = await service.encrypt(addressLabelPt, base64Key, aadAddressLabel);
    const ivAddressLabel = ivHexFromSeed(216);

    currentIvSeed = 228;
    const logPtAddressLabel = JSON.stringify({
      timestamp: 1710000000000,
      seq: 7,
      roomId,
      event: 'Address Label Updated',
      detail: 'Corporate Treasury (tb1q...dnh8)',
      user: 'Coordinator',
    });
    const encLogAddressLabel = await service.encrypt(logPtAddressLabel, base64Key, aadAudit);
    const ivLogAddressLabel = ivHexFromSeed(228);

    console.log(`### 2.11 UPDATE_ADDRESS_LABEL`);
    console.log(`* address Plaintext: "${addressPt}"`);
    console.log(`* address Output (Blinded): ${blindedAddress}`);
    console.log(`* label Plaintext: "${addressLabelPt}"`);
    console.log(`* label AAD: "${aadAddressLabel}"`);
    console.log(`* label IV (Hex): ${ivAddressLabel}`);
    console.log(`* label Output (Base64): ${encAddressLabel}`);
    console.log(`* encryptedLogBlob Plaintext: ${logPtAddressLabel}`);
    console.log(`* encryptedLogBlob AAD: "${aadAudit}"`);
    console.log(`* encryptedLogBlob IV (Hex): ${ivLogAddressLabel}`);
    console.log(`* encryptedLogBlob Output (Base64): ${encLogAddressLabel}`);
    console.log(
      JSON.stringify(
        {
          type: 'UPDATE_ADDRESS_LABEL',
          blindedAddress: blindedAddress,
          label: encAddressLabel,
          encryptedLogBlob: encLogAddressLabel,
        },
        null,
        2,
      ) + '\n',
    );

    // --- 2.12 REGISTER_ROLE ---
    const roleTokenPt = '7483256acea64db3b3d0a38efd9104b5';
    const roleTokenId = roleTokenPt.substring(0, 8);
    const roleFlagsPt = JSON.stringify({
      tokenId: roleTokenId,
      canUploadSignature: true,
      canExportPsbt: false,
      canExportAudit: false,
      canViewDetails: true,
      canViewSigners: true,
      canShareSession: false,
    });

    currentIvSeed = 240;
    const encPolicyBlob = await service.encrypt(roleFlagsPt, base64Key);
    const ivPolicyBlob = ivHexFromSeed(240);
    const roleTokenHash = await sha256Hex(roleTokenPt);

    console.log(`### 2.12 REGISTER_ROLE`);
    console.log(`* roleToken Plaintext (Hex): "${roleTokenPt}"`);
    console.log(`* tokenHash Output (SHA-256): ${roleTokenHash}`);
    console.log(`* policyBlob Plaintext JSON: ${roleFlagsPt}`);
    console.log(`* policyBlob IV (Hex): ${ivPolicyBlob}`);
    console.log(`* policyBlob Output (Base64): ${encPolicyBlob}`);
    console.log(
      JSON.stringify(
        {
          type: 'REGISTER_ROLE',
          tokenHash: roleTokenHash,
          canUpload: true,
          policyBlob: encPolicyBlob,
        },
        null,
        2,
      ) + '\n',
    );

    // --- 2.13 AUTH_ROLE ---
    console.log(`### 2.13 AUTH_ROLE`);
    console.log(`* token (Role Fragment): "${roleTokenPt}"`);
    console.log(
      JSON.stringify(
        {
          type: 'AUTH_ROLE',
          token: roleTokenPt,
        },
        null,
        2,
      ) + '\n',
    );

    // --- 2.14 CONSTRAINT_UPDATE ---
    console.log(`### 2.14 CONSTRAINT_UPDATE (Server Response)`);
    console.log(
      JSON.stringify(
        {
          type: 'CONSTRAINT_UPDATE',
          policyBlob: encPolicyBlob,
        },
        null,
        2,
      ) + '\n',
    );

    // --- 2.15 UPLOAD_NONCE (MuSig2 Round 1) ---
    currentIvSeed = 180;
    const noncePsbtPt = 'cHNidP8BAFICAAAA...0x1b_musig2_pubnonce...';
    const aadNonce = getFieldAad('nonce');
    const encNoncePsbt = await service.encrypt(noncePsbtPt, base64Key, aadNonce);
    const ivNonce = ivHexFromSeed(180);

    currentIvSeed = 192;
    const logPtNonce = JSON.stringify({
      timestamp: 1710000000000,
      seq: 1,
      roomId,
      event: 'Public Nonce Uploaded',
      detail: 'Signer: af4b013d',
      user: 'Guest (ABCD)',
    });
    const encLogNonce = await service.encrypt(logPtNonce, base64Key, aadAudit);
    const ivLogNonce = ivHexFromSeed(192);

    console.log(`### 2.15 UPLOAD_NONCE (MuSig2 Round 1)`);
    console.log(`* Fingerprint Plaintext: "${fpPt}"`);
    console.log(`* Fingerprint Output (Blinded): ${blindedFp}`);
    console.log(`* encryptedData Plaintext: "${noncePsbtPt}"`);
    console.log(`* encryptedData AAD: "${aadNonce}"`);
    console.log(`* encryptedData IV (Hex): ${ivNonce}`);
    console.log(`* encryptedData Output (Base64): ${encNoncePsbt}`);
    console.log(`* encryptedLogBlob Plaintext: ${logPtNonce}`);
    console.log(`* encryptedLogBlob AAD: "${aadAudit}"`);
    console.log(`* encryptedLogBlob IV (Hex): ${ivLogNonce}`);
    console.log(`* encryptedLogBlob Output (Base64): ${encLogNonce}`);
    console.log(
      JSON.stringify(
        {
          type: 'UPLOAD_NONCE',
          fingerprint: blindedFp,
          data: { encryptedData: encNoncePsbt },
          encryptedLogBlob: encLogNonce,
        },
        null,
        2,
      ) + '\n',
    );

    // --- 2.16 PUBLISH_AGGREGATE_PSBT (MuSig2 Round 1 -> Round 2 Transition) ---
    currentIvSeed = 54;
    const aggPsbtPt = 'cHNidP8BAFICAAAA...aggregated_0x1b_nonces...';
    const aadBasePsbt = getFieldAad('psbt');
    const encAggPsbt = await service.encrypt(aggPsbtPt, base64Key, aadBasePsbt);
    const ivAggPsbt = ivHexFromSeed(54);

    currentIvSeed = 66;
    const logPtAgg = JSON.stringify({
      timestamp: 1710000000000,
      seq: 8,
      roomId,
      event: 'Aggregate Nonce Broadcasted',
      detail: 'Coordinator transitioning room to signing phase',
      user: 'Coordinator',
    });
    const encLogAgg = await service.encrypt(logPtAgg, base64Key, aadAudit);
    const ivLogAgg = ivHexFromSeed(66);

    console.log(`### 2.16 PUBLISH_AGGREGATE_PSBT (MuSig2 Round 2 Transition)`);
    console.log(`* encryptedPsbt Plaintext: "${aggPsbtPt}"`);
    console.log(`* encryptedPsbt AAD: "${aadBasePsbt}"`);
    console.log(`* encryptedPsbt IV (Hex): ${ivAggPsbt}`);
    console.log(`* encryptedPsbt Output (Base64): ${encAggPsbt}`);
    console.log(`* encryptedLogBlob Plaintext: ${logPtAgg}`);
    console.log(`* encryptedLogBlob AAD: "${aadAudit}"`);
    console.log(`* encryptedLogBlob IV (Hex): ${ivLogAgg}`);
    console.log(`* encryptedLogBlob Output (Base64): ${encLogAgg}`);
    console.log(
      JSON.stringify(
        {
          type: 'PUBLISH_AGGREGATE_PSBT',
          encryptedPsbt: encAggPsbt,
          encryptedLogBlob: encLogAgg,
        },
        null,
        2,
      ) + '\n',
    );

    // --- 2.17 LOG_UPDATE (Incremental Hash-Chained Audit Envelope) ---
    const genesisHash = '0'.repeat(64);
    const serverTimestamp = 1710000000500;
    const chainPreimage = `${genesisHash}|0|${serverTimestamp}|ABCD|guest|${encLog1}`;
    const chainHash0 = await sha256Hex(chainPreimage);

    const chainedEnvelope0 = {
      seq: 0,
      serverTimestamp,
      sessionId: 'ABCD',
      role: 'guest',
      blob: encLog1,
      chainHash: chainHash0,
    };

    console.log(`### 2.17 LOG_UPDATE (Relay-to-Client Incremental Hash-Chained Envelope)`);
    console.log(`* Genesis Previous Hash: ${genesisHash}`);
    console.log(`* Preimage: "${chainPreimage}"`);
    console.log(`* Resulting chainHash (SHA-256): ${chainHash0}`);
    console.log(
      JSON.stringify(
        {
          type: 'LOG_UPDATE',
          entry: chainedEnvelope0,
          chainHead: chainHash0,
        },
        null,
        2,
      ) + '\n',
    );

    // --- 2.18 SESSION_CONNECTED (With Cryptographic Resume Token ---
    const sampleResumeToken =
      'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const sampleResumeTokenHash = await sha256Hex(sampleResumeToken);
    console.log(`### 2.18 SESSION_CONNECTED (Relay-to-Client)`);
    console.log(`* Issued resumeToken (256-bit Hex): ${sampleResumeToken}`);
    console.log(`* Stored Relay resumeTokenHash (SHA-256, never broadcast): ${sampleResumeTokenHash}`);
    console.log(
      JSON.stringify(
        {
          type: 'SESSION_CONNECTED',
          sessionId: 'ABCD',
          resumeToken: sampleResumeToken,
        },
        null,
        2,
      ) + '\n',
    );

    // --- STATE_SYNC (Server-to-Client Aggregation) ---
    console.log(`### STATE_SYNC (Relay-to-Client)`);
    console.log(
      JSON.stringify(
        {
          type: 'STATE_SYNC',
          roomId,
          protocol: 'standard',
          network: 'bitcoin',
          roomName: encRoomName,
          encryptedPsbt: encAggPsbt,
          transientPsbt: null,
          nonces: [],
          signatures: [encPsbt],
          isLocked: true,
          auditLog: [chainedEnvelope0],
          auditChainHead: chainHash0,
          signerLabels: { [blindedFp]: encLabel },
          addressLabels: { [blindedAddress]: encAddressLabel },
          whitelist: encWl,
          participants: participantsPayload,
          encryptedFinalTxHex: encHex,
          encryptedFinalTxId: encId,
          connectedCount: 2,
          protocolVersion: '2.0.0',
        },
        null,
        2,
      ) + '\n',
    );

    console.log(`======================================================\n`);

    // Restore original crypto function
    window.crypto.getRandomValues = originalGetRandomValues;
    expect(adminHash).toBeDefined();
  });
});