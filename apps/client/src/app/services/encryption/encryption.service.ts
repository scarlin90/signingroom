/*
 * Copyright (C) 2025 Sean Carlin
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 */

import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class EncryptionService {

  /**
   * Generates a cryptographically strong random AES-GCM 256-bit key.
   * @returns The raw key material encoded as a URL-safe Base64 string.
   */
  async generateKey(): Promise<string> {
    const key = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    // Export as 'raw' to get the bytes
    const exported = await window.crypto.subtle.exportKey('raw', key);
    // Cast exported to ArrayBuffer just to be safe with strict TS types
    return this.buf2base64(exported as ArrayBuffer); 
  }

  /**
   * Encrypts a string using AES-GCM.
   * @param data The plaintext string to encrypt.
   * @param key The Base64 encoded encryption key.
   * @returns A Base64 string containing the IV + Ciphertext.
   */
  async encrypt(data: string, key: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const rawKey = this.base642buf(key);

      const keyBuffer = await crypto.subtle.importKey(
        'raw',
        rawKey as BufferSource,
        { name: 'AES-GCM' },
        true,
        ['encrypt', 'decrypt']
      );

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encodedData = encoder.encode(data);

      const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        keyBuffer,
        encodedData
      );

      const resultArray = new Uint8Array(iv.length + new Uint8Array(encryptedData).length);
      resultArray.set(iv);
      resultArray.set(new Uint8Array(encryptedData), iv.length);
      
      return this.buf2base64(resultArray.buffer as ArrayBuffer); 
    } catch (error) {
      console.error('Encryption failed:', error);
      throw error; 
    }
  }

  /**
   * Decrypts a Base64 payload using AES-GCM.
   * @param encryptedData The Base64 string (IV + Ciphertext).
   * @param key The Base64 encoded decryption key.
   * @returns The decrypted plaintext string.
   */
  async decrypt(encryptedData: string, key: string): Promise<string> {
    try {
      const rawKey = this.base642buf(key);
      
      const keyBuffer = await crypto.subtle.importKey(
        'raw',
        rawKey as BufferSource,
        { name: 'AES-GCM' },
        true,
        ['encrypt', 'decrypt']
      );

      const encryptedArray = this.base642buf(encryptedData);
      
      const iv = encryptedArray.slice(0, 12);
      const ciphertext = encryptedArray.slice(12);
      
      const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        keyBuffer,
        ciphertext
      );
      
      return new TextDecoder().decode(decryptedData);
    } catch (error) {
      console.error('Decryption failed:', error);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private buf2base64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private base642buf(base64: string): Uint8Array {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
  }
}