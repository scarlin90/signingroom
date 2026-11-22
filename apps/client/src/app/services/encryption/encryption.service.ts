/*
 * Copyright (C) 2026 Stateless Research Ltd
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
import { EncryptionEngine } from '@signing-room/sdk';

@Injectable({ providedIn: 'root' })
export class EncryptionService {

  private engine = new EncryptionEngine();

  public getEngine(): EncryptionEngine {
    return this.engine;
  }

  /**
   * Generates a cryptographically strong random AES-GCM 256-bit key.
   * @returns The raw key material encoded as a URL-safe Base64 string.
   */
  async generateKey() { return this.engine.generateKey(); }

  /**
   * Encrypts a string using AES-GCM.
   * @param data The plaintext string to encrypt.
   * @param key The Base64 encoded encryption key.
   * @param aad Additional Authenticated Data
   * @returns A Base64 string containing the IV + Ciphertext.
   */
  encrypt(data: string, key: string, aad?: string): Promise<string> {
    return this.engine.encrypt(data, key, aad);
  }

  /**
   * Decrypts a Base64 payload using AES-GCM.
   * @param encryptedData The Base64 string (IV + Ciphertext).
   * @param key The Base64 encoded decryption key.
   * @param aad Additional Authenticated Data
   * @returns The decrypted plaintext string.
   */
  decrypt(encryptedData: string, key: string, aad?: string): Promise<string> {
    return this.engine.decrypt(encryptedData, key, aad);
  }

  /**
   * Deterministically blinds metadata using the room's encryption key as a salt.
   */
  async blindData(data: string, key: string) { return this.engine.blindData(data, key); }
}