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
        configurable: true,
      });

      Object.defineProperty(window, 'crypto', {
        value: webcrypto,
        writable: true,
        configurable: true,
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

  it('should correctly fallback to browser btoa/atob when Buffer is undefined', async () => {
    const originalBuffer = global.Buffer;

    // 2. Temporarily erase Buffer from the global scope
    // @ts-ignore
    delete global.Buffer;

    try {
      const originalText = 'Fallback Test Data';
      const key = await engine.generateKey();

      // Execute encryption and decryption using the fallback paths
      const encrypted = await engine.encrypt(originalText, key);
      const decrypted = await engine.decrypt(encrypted, key);

      // Assertions
      expect(decrypted).toBe(originalText);
      expect(encrypted).not.toBe(originalText);
    } finally {
      global.Buffer = originalBuffer;
    }
  });
});

describe('Unsupported Environments', () => {
  let originalGlobalCrypto: any;
  let originalWindowCrypto: any;

  beforeEach(() => {
    // Save both references before breaking them
    originalGlobalCrypto = (global as any).crypto;
    originalWindowCrypto = typeof window !== 'undefined' ? (window as any).crypto : undefined;
  });

  afterEach(() => {
    // Safely restore both global contexts
    Object.defineProperty(global, 'crypto', {
      value: originalGlobalCrypto,
      writable: true,
      configurable: true,
    });

    if (typeof window !== 'undefined' && originalWindowCrypto) {
      Object.defineProperty(window, 'crypto', {
        value: originalWindowCrypto,
        writable: true,
        configurable: true,
      });
    }
  });

  it('should throw an error if WebCrypto subtle is not supported', async () => {
    const brokenCrypto = { getRandomValues: originalGlobalCrypto.getRandomValues };

    // Sabotage global AND window
    Object.defineProperty(global, 'crypto', {
      value: brokenCrypto,
      configurable: true,
      writable: true,
    });
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'crypto', {
        value: brokenCrypto,
        configurable: true,
        writable: true,
      });
    }

    const freshEngine = new EncryptionEngine();
    await expect(freshEngine.generateKey()).rejects.toThrow('WebCrypto not supported');
  });

  it('should throw an error if getRandomValues is not supported', async () => {
    const brokenCrypto = { subtle: originalGlobalCrypto.subtle };

    // Sabotage global AND window
    Object.defineProperty(global, 'crypto', {
      value: brokenCrypto,
      configurable: true,
      writable: true,
    });
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'crypto', {
        value: brokenCrypto,
        configurable: true,
        writable: true,
      });
    }

    const freshEngine = new EncryptionEngine();

    const dummyKey = await originalGlobalCrypto.subtle
      .generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
      .then((k: any) => originalGlobalCrypto.subtle.exportKey('raw', k))
      .then((buf: any) => Buffer.from(buf).toString('base64'));

    await expect(freshEngine.encrypt('test', dummyKey)).rejects.toThrow('Crypto not supported');
  });

  it('should fall back to global.crypto if window is undefined', async () => {
    // Temporarily back up and erase the global window object
    const originalWindow = (global as any).window;
    // @ts-ignore
    delete global.window;

    try {
      const freshEngine = new EncryptionEngine();

      // Perform an operation to prove global context evaluation works
      const key = await freshEngine.generateKey();
      expect(key).toBeDefined();
      expect(key.length).toBe(44);
    } finally {
      (global as any).window = originalWindow;
    }
  });

  it('should fall back to global.crypto if window is undefined', async () => {
    // Temporarily back up and erase the global window object
    const originalWindow = (global as any).window;
    // @ts-ignore
    delete global.window;

    try {
      const freshEngine = new EncryptionEngine();

      // Generate a valid key using the global context fallback (Covers line 4)
      const key = await freshEngine.generateKey();

      // Encrypt data to force getRandomValues() to also use the global context fallback (Covers line 12!)
      const encrypted = await freshEngine.encrypt('Clear text data', key);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
    } finally {
      // Always restore window to keep the environment safe
      (global as any).window = originalWindow;
    }
  });
});
