import { describe, it, expect, beforeAll } from 'vitest';
import { LicenseCodec, base64UrlToBytes } from './codec';
import { webcrypto } from 'node:crypto';

describe('LicenseCodec', () => {
  beforeAll(() => {
    if (typeof global !== 'undefined' && !global.crypto) {
      Object.defineProperty(global, 'crypto', {
        value: webcrypto,
        writable: true,
        configurable: true,
      });
    }
  });

  const validCommunityToken =
    'srl_0DGPSeBK6w99XjmrwvdFBbfIC6XH-_czfymlxEgguusg5mb9tpEmNfuPBZdNSittYGuQiei1jvD67XKdxUYuVkdCgQEBAwAAAAAAAAAAAAAAAaFTwDzFASoeU2lnbmluZyBSb29tIENvbW11bml0eSBFZGl0aW9uAAAA';

  describe('base64UrlToBytes', () => {
    it('should correctly pad and decode a base64url string', () => {
      const decoded = base64UrlToBytes('SGVsbG8gV29ybGQ');
      const str = new TextDecoder().decode(decoded);
      expect(str).toBe('Hello World');
    });

    it('should handle strings with underscores and hyphens', () => {
      const bytes = base64UrlToBytes('a-b_cQ');
      expect(bytes).toBeInstanceOf(Uint8Array);
    });

    it('should fallback to Buffer if atob is undefined (Node environment)', () => {
      const originalAtob = global.atob;
      // @ts-ignore - Sabotage atob to force the Buffer execution path
      global.atob = undefined;
      
      const decoded = base64UrlToBytes('SGVsbG8gV29ybGQ');
      const str = new TextDecoder().decode(decoded);
      expect(str).toBe('Hello World');

      global.atob = originalAtob;
    });
  });

  describe('unpack', () => {
    it('should return null for empty or improperly prefixed strings', () => {
      expect(LicenseCodec.unpack('')).toBeNull();
      expect(LicenseCodec.unpack('invalid-token')).toBeNull();
      expect(LicenseCodec.unpack('srl_short')).toBeNull();
    });

    it('should return null if the byte payload is too short', () => {
      const shortToken = 'srl_' + btoa('A'.repeat(80));
      expect(LicenseCodec.unpack(shortToken)).toBeNull();
    });

    it('should unpack a valid Community Edition token correctly', () => {
      const result = LicenseCodec.unpack(validCommunityToken);
      expect(result).not.toBeNull();
      expect(result?.payload.tier).toBe('COMMUNITY');
      expect(result?.payload.domain).toBe('*');
      expect(result?.payload.licensee).toBe('Signing Room Community Edition');
      expect(result?.payload.features.whiteLabel).toBe(false);
      expect(result?.payload.features.auditWatermarkRemoved).toBe(false);
    });

    it('should handle completely invalid base64 encoding gracefully', () => {
      expect(LicenseCodec.unpack('srl_!@#$invalid_*^%')).toBeNull();
    });

    it('should reject a token with an unsupported version byte', () => {
      const raw = base64UrlToBytes(validCommunityToken.slice(4));
      raw[68] = 2;
      const badVersionToken = 'srl_' + Buffer.from(raw).toString('base64url');
      expect(LicenseCodec.unpack(badVersionToken)).toBeNull();
    });

    it('should properly map missing tier bytes to COMMUNITY', () => {
      const raw = base64UrlToBytes(validCommunityToken.slice(4));
      raw[69] = 99;
      const badTierToken = 'srl_' + Buffer.from(raw).toString('base64url');
      const unpacked = LicenseCodec.unpack(badTierToken);
      expect(unpacked?.payload.tier).toBe('COMMUNITY');
    });

    it('should extract correct bitmask flags', () => {
      const raw = base64UrlToBytes(validCommunityToken.slice(4));

      raw[70] = 3; 
      const token = 'srl_' + Buffer.from(raw).toString('base64url');
      const unpacked = LicenseCodec.unpack(token);
      expect(unpacked?.payload.features.whiteLabel).toBe(true);
      expect(unpacked?.payload.features.auditWatermarkRemoved).toBe(true);
    });

    it('should handle optional registration and office strings when present', () => {
      const encoder = new TextEncoder();
      const domain = encoder.encode('acme.com');
      const licensee = encoder.encode('Acme');
      const reg = encoder.encode('1234');
      const office = encoder.encode('London');

      const payload = Buffer.alloc(19 + 1 + domain.length + 1 + licensee.length + 1 + reg.length + 2 + office.length);
      payload.writeUInt8(1, 0);
      payload.writeUInt8(2, 1);
      payload.writeUInt8(3, 2);
      payload.writeBigUInt64BE(BigInt(0), 3); // expiry
      payload.writeBigUInt64BE(BigInt(Date.now()), 11); // issued
      
      let offset = 19;
      payload.writeUInt8(domain.length, offset++);
      Buffer.from(domain).copy(payload, offset); offset += domain.length;
      
      payload.writeUInt8(licensee.length, offset++);
      Buffer.from(licensee).copy(payload, offset); offset += licensee.length;

      payload.writeUInt8(reg.length, offset++);
      Buffer.from(reg).copy(payload, offset); offset += reg.length;

      payload.writeUInt16BE(office.length, offset); offset += 2;
      Buffer.from(office).copy(payload, offset);

      const fakeChecksum = Buffer.alloc(4);
      const fakeSig = Buffer.alloc(64);
      const envelope = Buffer.concat([fakeChecksum, fakeSig, payload]);
      const token = 'srl_' + envelope.toString('base64url');

      const result = LicenseCodec.unpack(token);
      expect(result?.payload.registration).toBe('1234');
      expect(result?.payload.registeredOffice).toBe('London');
    });
  });

  describe('verifyChecksum', () => {
    it('should return true for a mathematically matching checksum', async () => {
      const unpacked = LicenseCodec.unpack(validCommunityToken);
      const isValid = await LicenseCodec.verifyChecksum(unpacked!.checksum, unpacked!.payloadBytes);
      expect(isValid).toBe(true);
    });

    it('should return false if the checksum does not match', async () => {
      const unpacked = LicenseCodec.unpack(validCommunityToken);
      const badChecksum = new Uint8Array([...unpacked!.checksum]);
      badChecksum[0] = 0x99; 

      const isValid = await LicenseCodec.verifyChecksum(badChecksum, unpacked!.payloadBytes);
      expect(isValid).toBe(false);
    });

    it('should handle crypto api failures safely', async () => {
      const cryptoSpy = vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValueOnce(new Error('Crypto failure'));
      
      const unpacked = LicenseCodec.unpack(validCommunityToken);
      const isValid = await LicenseCodec.verifyChecksum(unpacked!.checksum, unpacked!.payloadBytes);
      expect(isValid).toBe(false);

      cryptoSpy.mockRestore();
    });

    it('should use window.crypto if available (Browser environment fallback)', async () => {
      // Stub window to simulate a browser environment
      vi.stubGlobal('window', {
        crypto: {
          subtle: {
            digest: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5]).buffer)
          }
        }
      });

      // The checksum will fail mathematically, but we just need it to execute the branch
      await LicenseCodec.verifyChecksum(new Uint8Array(4), new Uint8Array(4));
      
      expect(window.crypto.subtle.digest).toHaveBeenCalledWith('SHA-256', expect.any(Uint8Array));
      vi.unstubAllGlobals();
    });
  });
});