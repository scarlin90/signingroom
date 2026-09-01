/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Injectable, signal } from '@angular/core';
import { UR, URDecoder, UREncoder } from '@ngraveio/bc-ur';
import * as fflate from 'fflate';
import { hex, base64 } from '@scure/base';

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
    const psbtBytes = base64.decode(cleanBase64); // Using @scure/base

    // generate the CBOR Byte String
    const genericUr = UR.fromBuffer(Buffer.from(psbtBytes));

    const cborPayload =
      genericUr.cbor || (genericUr as any)._cbor || (genericUr as any).cborMessage;

    if (!cborPayload) {
      console.error('Critical: Could not extract CBOR payload from UR', genericUr);
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
    const psbtBytes = base64.decode(psbtBase64.replace(/\s+/g, ''));
    const psbtHex = hex.encode(psbtBytes).toUpperCase();

    const totalChunks = Math.ceil(psbtHex.length / charsPerFrame);

    if (totalChunks > 1295) throw new Error('PSBT too large for BBQr');

    const totalBase36 = totalChunks.toString(36).toUpperCase().padStart(2, '0');
    const frames: string[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const currentBase36 = i.toString(36).toUpperCase().padStart(2, '0');
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
    if (!fragment || typeof fragment !== 'string') {
      this.scanError.set('Invalid QR data received.');
      return null;
    }

    try {
      const upper = fragment.toUpperCase();
      this.lastScannedText.set(upper.length > 40 ? upper.substring(0, 40) + '...' : upper);
      this.scanError.set(null);

      // --- PROTOCOL 1: BC-UR ---
      if (upper.startsWith('UR:')) {
        this.decoder.receivePart(upper);

        const progress = this.decoder.estimatedPercentComplete();
        this.scanProgress.set(Math.max(progress, this.scanProgress()));

        if (this.decoder.isComplete()) {
          if (this.decoder.isSuccess()) {
            try {
              const resultUR = this.decoder.resultUR();

              const cborPayload =
                resultUR.cbor || (resultUR as any)._cbor || (resultUR as any).cborMessage;

              if (cborPayload) {
                let hexData = hex.encode(new Uint8Array(cborPayload)).toLowerCase();

                const magicIndex = hexData.indexOf('70736274ff');
                if (magicIndex !== -1) {
                  hexData = hexData.substring(magicIndex);
                }

                this.resetDecoder();
                return hexData;
              }
            } catch (e) {
              console.error('Failed to decode CBOR', e);
              this.scanError.set('UR decoded but payload extraction failed');
            }
          } else {
            this.scanError.set('UR checksum failed. Please rescan.');
            this.resetDecoder();
          }
        }
        return null;
      }

      // --- PROTOCOL 2: BBQr ---
      if (upper.startsWith('B$')) {
        const encoding = upper[2]; // 'H' (Hex) or 'Z' (Zlib)
        const totalStr = upper.substring(4, 6);
        const indexStr = upper.substring(6, 8);
        const payload = upper.substring(8);

        const total = parseInt(totalStr, 36);
        const index = parseInt(indexStr, 36);

        if (this.bbqrTotal === 0) this.bbqrTotal = total;

        if (!this.bbqrState.has(index)) {
          this.bbqrState.set(index, payload);
          this.scanProgress.set(this.bbqrState.size / this.bbqrTotal);
        }

        if (this.bbqrState.size === this.bbqrTotal) {
          let fullPayload = '';
          for (let i = 0; i < this.bbqrTotal; i++) {
            fullPayload += this.bbqrState.get(i);
          }

          if (encoding === 'Z') {
            const compressed = this.decodeBase32(fullPayload);
            const decompressed = fflate.inflateSync(compressed);
            this.resetDecoder();

            return hex.encode(decompressed);
          } else {
            this.resetDecoder();
            return fullPayload;
          }
        }
        return null;
      }

      this.resetDecoder();
      return fragment;
    } catch (e) {
      console.error('Omni-Decoder error:', e);
      this.scanError.set('Decoding failure. Check wallet settings.');
      return null;
    }
  }

  // --- Helper: Base32 Decoding (RFC 4648) for BBQr ---
  private decodeBase32(s: string): Uint8Array {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const lookup = new Map([...alphabet].map((char, i) => [char, i]));
    const bits = s.split('').map((c) => lookup.get(c.toUpperCase()) ?? 0);
    const bytes = new Uint8Array(Math.floor((bits.length * 5) / 8));
    let bitBuffer = 0,
      bitCount = 0,
      byteIndex = 0;
    for (const b of bits) {
      bitBuffer = (bitBuffer << 5) | b;
      bitCount += 5;
      if (bitCount >= 8) {
        bytes[byteIndex++] = (bitBuffer >> (bitCount - 8)) & 0xff;
        bitCount -= 8;
      }
    }
    return bytes;
  }

  resetDecoder() {
    this.decoder = new URDecoder();
    this.bbqrState.clear();
    this.bbqrTotal = 0;
    this.scanProgress.set(0);
  }
}
