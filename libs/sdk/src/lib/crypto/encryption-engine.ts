/**
 * Utility engine providing high-level cryptographic operations including
 * symmetrical encryption, decryption, key generation, and deterministic data blinding.
 * Native web crypto APIs are abstracted to safely fall back between Browser and Node.js runtimes.
 */
export class EncryptionEngine {
  /**
   * Safely retrieves the cryptographic SubtleCrypto API across global contexts.
   * @returns The active environment's SubtleCrypto instance.
   * @throws {Error} If WebCrypto or its Subtle property is unsupported in the host environment.
   */
  private getCrypto() {
    const c =
      (typeof window !== 'undefined' && window.crypto) ||
      (typeof global !== 'undefined' && (global as any).crypto);
    if (!c || !c.subtle) throw new Error('WebCrypto not supported');
    return c.subtle;
  }

  /**
   * Fills a given Uint8Array with cryptographically strong pseudo-random values.
   * @param array - The destination array to populate with random bytes.
   * @returns The same populated Uint8Array instance.
   * @throws {Error} If a reliable cryptographically secure random number generator is unavailable.
   */
  private getRandomValues(array: Uint8Array) {
    const c =
      (typeof window !== 'undefined' && window.crypto) ||
      (typeof global !== 'undefined' && (global as any).crypto);
    if (!c || !c.getRandomValues) throw new Error('Crypto not supported');
    return c.getRandomValues(array);
  }

  /**
   * Converts a binary ArrayBuffer to a standard Base64 string representation.
   * @param buffer - The raw binary data buffer.
   * @returns A base64-encoded string.
   */
  private buf2base64(buffer: ArrayBuffer): string {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(buffer).toString('base64');
    }
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  /**
   * Decodes a standard Base64 string back into binary byte format.
   * @param base64Str - The base64-encoded string.
   * @returns A Uint8Array containing the raw binary bytes.
   */
  private base642buf(base64Str: string): Uint8Array {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(base64Str, 'base64'));
    }
    return Uint8Array.from(atob(base64Str), (c) => c.charCodeAt(0));
  }

  /**
   * Generates a brand new, random 256-bit AES-GCM symmetric key.
   * @returns A Promise that resolves to the raw exported key encoded in Base64 format (44 characters).
   */
  async generateKey(): Promise<string> {
    const cryptoSubtle = this.getCrypto();
    const key = await cryptoSubtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]);
    const exported = await cryptoSubtle.exportKey('raw', key);
    return this.buf2base64(exported as ArrayBuffer);
  }

  /**
   * Encrypts plain text string data using authenticated 256-bit AES-GCM encryption.
   * @param data - The string message content to encrypt.
   * @param key - The base64-encoded 256-bit secret key.
   * @returns A Promise resolving to a single Base64 string containing both the 12-byte random Initialization Vector (IV) and the encrypted ciphertext payload.
   */
  async encrypt(data: string, key: string): Promise<string> {
    const encoder = new TextEncoder();
    const rawKey = this.base642buf(key);
    const cryptoSubtle = this.getCrypto();

    const keyBuffer = await cryptoSubtle.importKey('raw', rawKey, { name: 'AES-GCM' }, true, [
      'encrypt',
      'decrypt',
    ]);

    const iv = this.getRandomValues(new Uint8Array(12));
    const encryptedData = await cryptoSubtle.encrypt(
      { name: 'AES-GCM', iv },
      keyBuffer,
      encoder.encode(data),
    );

    const result = new Uint8Array(iv.length + encryptedData.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encryptedData), iv.length);
    return this.buf2base64(result.buffer);
  }

  /**
   * Decrypts a combined IV and ciphertext payload using 256-bit AES-GCM.
   * @param encryptedData - The base64 string combining the 12-byte IV and the encrypted payload.
   * @param key - The base64-encoded 256-bit secret key matching the encryption instance.
   * @returns A Promise resolving to the original UTF-8 plain text string.
   * @throws {Error} If decryption fails, indicating invalid parameters, data tampering, or a key mismatch.
   */
  async decrypt(encryptedData: string, key: string): Promise<string> {
    const rawKey = this.base642buf(key);
    const cryptoSubtle = this.getCrypto();
    const keyBuffer = await cryptoSubtle.importKey(
      'raw',
      rawKey as BufferSource,
      { name: 'AES-GCM' },
      true,
      ['encrypt', 'decrypt'],
    );

    const encryptedArray = this.base642buf(encryptedData);
    const iv = encryptedArray.slice(0, 12);
    const ciphertext = encryptedArray.slice(12);

    const decryptedData = await cryptoSubtle.decrypt(
      { name: 'AES-GCM', iv },
      keyBuffer,
      ciphertext,
    );
    return new TextDecoder().decode(decryptedData);
  }

  /**
   * Generates a deterministic, one-way pseudo-anonymous data blind via SHA-256 hashing.
   * Given identical parameters, the output string remains deterministic, making it ideal for tracking identity metrics without storing plain records.
   * @param data - The contextual raw input string to mask.
   * @param key - Salt/Key material appended to the data structure prior to hashing.
   * @returns A Promise resolving to a fixed 16-character hex-encoded string segment of the resulting digest.
   */
  async blindData(data: string, key: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data + key);
    const cryptoSubtle = this.getCrypto();
    const hashBuffer = await cryptoSubtle.digest('SHA-256', dataBuffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);
  }
}
