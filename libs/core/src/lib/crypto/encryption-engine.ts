export class EncryptionEngine {
  private getCrypto() {
    const c = (typeof window !== 'undefined' && window.crypto) || 
              (typeof global !== 'undefined' && (global as any).crypto);
    if (!c || !c.subtle) throw new Error("WebCrypto not supported");
    return c.subtle;
  }

  private getRandomValues(array: Uint8Array) {
    const c = (typeof window !== 'undefined' && window.crypto) || 
              (typeof global !== 'undefined' && (global as any).crypto);
    if (!c || !c.getRandomValues) throw new Error("Crypto not supported");
    return c.getRandomValues(array);
  }

  private buf2base64(buffer: ArrayBuffer): string {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(buffer).toString('base64');
    }
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  private base642buf(base64Str: string): Uint8Array {
    if (typeof Buffer !== 'undefined') {
        return new Uint8Array(Buffer.from(base64Str, 'base64'));
    }
    return Uint8Array.from(atob(base64Str), c => c.charCodeAt(0));
  }

async generateKey(): Promise<string> {
    const cryptoSubtle = this.getCrypto(); 
    const key = await cryptoSubtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const exported = await cryptoSubtle.exportKey('raw', key);
    return this.buf2base64(exported as ArrayBuffer);
  }

  async encrypt(data: string, key: string): Promise<string> {
    const encoder = new TextEncoder();
    const rawKey = this.base642buf(key);
    const cryptoSubtle = this.getCrypto();
    
    const keyBuffer = await cryptoSubtle.importKey(
      'raw', rawKey, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']
    );

    const iv = this.getRandomValues(new Uint8Array(12));
    const encryptedData = await cryptoSubtle.encrypt(
      { name: 'AES-GCM', iv }, keyBuffer, encoder.encode(data)
    );

    const result = new Uint8Array(iv.length + encryptedData.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encryptedData), iv.length);
    return this.buf2base64(result.buffer);
  }

  async decrypt(encryptedData: string, key: string): Promise<string> {
    const rawKey = this.base642buf(key);
    const keyBuffer = await crypto.subtle.importKey(
      'raw', rawKey as BufferSource, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']
    );

    const encryptedArray = this.base642buf(encryptedData);
    const iv = encryptedArray.slice(0, 12);
    const ciphertext = encryptedArray.slice(12);
    
    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, keyBuffer, ciphertext
    );
    return new TextDecoder().decode(decryptedData);
  }

  async blindData(data: string, key: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data + key);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('').slice(0, 16);
  }
}