import { describe, it, expect, beforeAll } from 'vitest';
import { RoomFactory } from './room-factory';
import { EncryptionEngine } from '../crypto/encryption-engine';

describe('RoomFactory', () => {
  let engine: EncryptionEngine;
  const dummyPsbt = 'cHNidGNvbmZpZ3VyYXRpb25kYXRhZXhhbXBsZQ==';

  beforeAll(() => {
    engine = new EncryptionEngine();
  });

  it('should cleanly execute and generate a valid RoomCreationPayload with provided parameters', async () => {
    const payload = await RoomFactory.prepareCreationPayload(
      engine,
      dummyPsbt,
      'testnet',
      'Multisig Signing Room Alpha',
      '2.0.0',
    );

    // Verify local properties
    expect(payload.localData.roomId).toBeDefined();
    expect(payload.localData.encryptionKey).toHaveLength(44);
    expect(payload.localData.adminSecret).toBeDefined();

    // Verify HTTP network options pass through
    expect(payload.httpPayload.network).toBe('testnet');
    expect(payload.httpPayload.protocolVersion).toBe('2.0.0');
    expect(payload.httpPayload.roomId).toBe(payload.localData.roomId);

    // Verify encryption wrappers mask plaintext fields
    expect(payload.httpPayload.encryptedPsbt).not.toBe(dummyPsbt);
    expect(payload.httpPayload.encryptedRoomName).not.toBe('Multisig Signing Room Alpha');

    // Cross-verify decryptability to check for accurate data composition
    const decryptedName = await engine.decrypt(
      payload.httpPayload.encryptedRoomName,
      payload.localData.encryptionKey,
    );
    expect(decryptedName).toBe('Multisig Signing Room Alpha');
  });

  it('should accurately handle default fallback parameters when parameters are left blank', async () => {
    const payload = await RoomFactory.prepareCreationPayload(engine, dummyPsbt, 'bitcoin');

    // Confirm that structural default parameters are set correctly
    expect(payload.httpPayload.protocolVersion).toBe('1.0.0');

    const decryptedName = await engine.decrypt(
      payload.httpPayload.encryptedRoomName,
      payload.localData.encryptionKey,
    );
    expect(decryptedName).toBe('Untitled Room');
  });

  it('should fall back to fallbackUUID generation when crypto.randomUUID is not available', async () => {
    // Back up native context environment properties
    const originalCrypto = (global as any).crypto;
    const originalRandomUUID = originalCrypto ? originalCrypto.randomUUID : undefined;

    // Clear out the modern target API method to intercept operations
    if (global.crypto) {
      Object.defineProperty(global.crypto, 'randomUUID', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    } else {
      (global as any).crypto = { randomUUID: undefined };
    }

    try {
      const payload = await RoomFactory.prepareCreationPayload(engine, dummyPsbt, 'signet');

      // Confirm UUID structures match standard 36 character canonical formatting layouts
      expect(payload.localData.roomId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(payload.localData.adminSecret).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      // Safely reconstruct the global context space to match the sandbox framework rules
      if (originalCrypto) {
        Object.defineProperty(global.crypto, 'randomUUID', {
          value: originalRandomUUID,
          writable: true,
          configurable: true,
        });
      } else {
        // @ts-ignore
        delete global.crypto;
      }
    }
  });
});
