export class EncryptionEngine {
  async generateKey(): Promise<string> {
    const key = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const exported = await window.crypto.subtle.exportKey('raw', key);
    return this.buf2base64(exported as ArrayBuffer);
  }

  async encrypt(data: string, key: string): Promise<string> {
    const encoder = new TextEncoder();
    const rawKey = this.base642buf(key);
    const keyBuffer = await crypto.subtle.importKey(
      'raw', rawKey, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, keyBuffer, encoder.encode(data)
    );

    const result = new Uint8Array(iv.length + new Uint8Array(encryptedData).length);
    result.set(iv);
    result.set(new Uint8Array(encryptedData), iv.length);
    return this.buf2base64(result.buffer as ArrayBuffer);
  }

  async decrypt(encryptedData: string, key: string): Promise<string> {
    const rawKey = this.base642buf(key);
    const keyBuffer = await crypto.subtle.importKey(
      'raw', rawKey, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']
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

  private buf2base64(buffer: ArrayBuffer): string {
    return window.btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  private base642buf(base64: string): Uint8Array {
    return Uint8Array.from(window.atob(base64), c => c.charCodeAt(0));
  }
}