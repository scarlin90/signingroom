/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Injectable, signal } from '@angular/core';
import { UR, URDecoder, UREncoder } from '@ngraveio/bc-ur';
import { Buffer } from 'buffer';

@Injectable({ providedIn: 'root' })
export class UrService {
  private decoder = new URDecoder();
  
  public scanProgress = signal<number>(0);

  private bbqrState = new Map<number, string>();
  private bbqrTotal = 0;

  public lastScannedText = signal<string>('Waiting for camera to lock on...');
  public scanError = signal<string | null>(null);

  /**
   * EXHALE: Converts a Hex PSBT into an array of animated QR fragments
   */
  generateFrames(psbtBase64: string, maxFragmentLength = 150): string[] {
    const cleanBase64 = psbtBase64.replace(/\s+/g, '');
    const psbtBytes = Buffer.from(cleanBase64, 'base64');
    
    // generate the CBOR Byte String
    const genericUr = UR.fromBuffer(psbtBytes);
    
    const cborPayload = genericUr.cbor || (genericUr as any)._cbor || (genericUr as any).cborMessage;
    
    if (!cborPayload) {
        console.error("Critical: Could not extract CBOR payload from UR", genericUr);
        return [];
    }

    const ur = new UR(cborPayload, 'crypto-psbt');
    
    const encoder = new UREncoder(ur, maxFragmentLength);
    const frames: string[] = [];
    

    for (let i = 0; i < encoder.fragmentsLength * 2; i++) { 
      frames.push(encoder.nextPart().toUpperCase());
    }
    
    return frames;
  }

  generateBBQrFrames(psbtBase64: string, charsPerFrame = 1000): string[] {
  
    const psbtBuffer = Buffer.from(psbtBase64.replace(/\s+/g, ''), 'base64');
    const psbtHex = psbtBuffer.toString('hex').toUpperCase();

   
    const totalChunks = Math.ceil(psbtHex.length / charsPerFrame);
    
    // Safety check: BBQr uses Base36 (0-9, A-Z) for chunk counting, max 1295 parts
    if (totalChunks > 1295) throw new Error("PSBT too large for BBQr");

    // Convert total chunks to a 2-character Base36 string (e.g., 5 -> "05", 10 -> "0A")
    const totalBase36 = totalChunks.toString(36).toUpperCase().padStart(2, '0');

    const frames: string[] = [];

    // 3. Generate the frames
    for (let i = 0; i < totalChunks; i++) {
      const currentBase36 = i.toString(36).toUpperCase().padStart(2, '0');
      
      // Header: B$ (Protocol) + H (Hex) + P (PSBT) + Total + Current
      const header = `B$HP${totalBase36}${currentBase36}`;
      const chunk = psbtHex.substring(i * charsPerFrame, (i + 1) * charsPerFrame);
      
      frames.push(header + chunk);
    }

    return frames;
  }

  /**
   * INHALE (OMNI-DECODER): Automatically detects and decodes UR, BBQr, or Static QRs.
   */
  processFragment(fragment: string): string | null {
    console.log(`\n--- 🔍 OPTICAL FRAGMENT RECEIVED ---`);
    console.log(`Length: ${fragment.length} chars`);
    console.log(`Prefix: ${fragment.substring(0, 15)}...`);

    try {
      const upper = fragment.toUpperCase();
      
      // Update the X-Ray UI
      this.lastScannedText.set(upper.length > 40 ? upper.substring(0, 40) + '...' : upper);
      this.scanError.set(null); 

      // --- PROTOCOL 1: BC-UR ---
      if (upper.startsWith('UR:')) {
        console.log(`Detected Protocol: Universal Resource (UR)`);
        this.decoder.receivePart(fragment);
        this.scanProgress.set(this.decoder.estimatedPercentComplete());
        
        if (this.decoder.isComplete() && this.decoder.isSuccess()) {
          console.log(`[UR] Sequence Complete! Unpacking CBOR...`);
          const hex = this.decoder.resultUR().decodeCBOR().toString('hex');
          this.resetDecoder();
          return hex;
        }
        return null;
      }

      // --- PROTOCOL 2: BBQr ---
      if (upper.startsWith('B$')) {
        const encoding = upper[2]; // e.g., 'H', '2', 'Z'
        const fileType = upper[3]; // e.g., 'P', 'T'
        console.log(`Detected Protocol: BBQr | Encoding: ${encoding} | Type: ${fileType}`);

        if (encoding !== 'H') {
            const errorMsg = `Coldcard is using Zlib/Base32 ('${encoding}'). Please export as HEX.`;
            console.warn(`[BBQr Error] ${errorMsg}`);
            this.scanError.set(errorMsg);
            return null;
        }
        
        const totalStr = upper.substring(4, 6);
        const indexStr = upper.substring(6, 8);
        const payload = upper.substring(8);

        const total = parseInt(totalStr, 36);
        const index = parseInt(indexStr, 36);

        console.log(`[BBQr] Extracted Chunk ${index + 1} of ${total} (Payload size: ${payload.length})`);

        if (this.bbqrTotal === 0) this.bbqrTotal = total;

        if (!this.bbqrState.has(index)) {
            this.bbqrState.set(index, payload);
            const progress = this.bbqrState.size / this.bbqrTotal;
            this.scanProgress.set(progress);
            console.log(`[BBQr] Saved new chunk. Progress: ${(progress * 100).toFixed(0)}%`);
        } else {
            console.log(`[BBQr] Ignored duplicate chunk ${index + 1}.`);
        }

        if (this.bbqrState.size === this.bbqrTotal) {
            console.log(`[BBQr] Sequence Complete! Concatenating hex...`);
            let fullHex = '';
            for (let i = 0; i < this.bbqrTotal; i++) {
                fullHex += this.bbqrState.get(i);
            }
            this.resetDecoder();
            return fullHex;
        }
        return null;
      }

      // --- PROTOCOL 3: Static QR Fallback ---
      console.log(`Detected Protocol: Static Unknown (Likely raw hex)`);
      this.resetDecoder();
      return fragment;

    } catch (e) {
      console.error("Omni-Decoder Crash:", e);
      this.scanError.set("Malformed QR data detected.");
    }
    return null;
  }

  resetDecoder() {
    this.decoder = new URDecoder();
    this.bbqrState.clear();
    this.bbqrTotal = 0;
    this.scanProgress.set(0);
  }
}