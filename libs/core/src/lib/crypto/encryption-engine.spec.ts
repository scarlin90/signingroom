import { describe, it, expect, beforeAll } from 'vitest';
import { EncryptionEngine } from './encryption-engine';
import { webcrypto } from 'node:crypto';

describe('EncryptionEngine', () => {
  let engine: EncryptionEngine;

  beforeAll(() => {
  if (typeof window === 'undefined') {
    // Define window first
    (global as any).window = {};
    
    // Use defineProperty to bypass the getter restriction
    Object.defineProperty(global, 'crypto', {
      value: webcrypto,
      writable: true,
      configurable: true
    });

    Object.defineProperty(window, 'crypto', {
      value: webcrypto,
      writable: true,
      configurable: true
    });

    // Mock browser-specific btoa/atob if needed
    (window as any).btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
    (window as any).atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
  }
  engine = new EncryptionEngine();
});

  it('should generate a valid 256-bit key in Base64', async () => {
    const key = await engine.generateKey();
    expect(typeof key).toBe('string');
    // 256 bits = 32 bytes. Base64 encoding of 32 bytes is 44 characters
    expect(key.length).toBe(44);
  });

  it('should encrypt and decrypt correctly', async () => {
    const key = await engine.generateKey();
    const original = 'Test Multisig Coordination';
    
    const encrypted = await engine.encrypt(original, key);
    const decrypted = await engine.decrypt(encrypted, key);
    
    expect(decrypted).toBe(original);
    expect(encrypted).not.toBe(original); // Ensure ciphertext is masked
  });

  it('should throw an error when decrypting with the wrong key', async () => {
    const key = await engine.generateKey();
    const wrongKey = await engine.generateKey();
    const original = 'Secret Data';
    
    const encrypted = await engine.encrypt(original, key);
    
    await expect(engine.decrypt(encrypted, wrongKey)).rejects.toThrow();
  });

  it('should produce deterministic blinds (blindData)', async () => {
    const key = 'test-key-material';
    const data = 'user-metadata-123';
    
    const blind1 = await engine.blindData(data, key);
    const blind2 = await engine.blindData(data, key);
    
    expect(blind1).toBe(blind2); // Must be deterministic
    expect(blind1.length).toBe(16); // Must be exactly 16 hex chars
  });

  it('should produce different blinds for different keys', async () => {
    const data = 'user-metadata-123';
    const blind1 = await engine.blindData(data, 'key-a');
    const blind2 = await engine.blindData(data, 'key-b');
    
    expect(blind1).not.toBe(blind2);
  });
});