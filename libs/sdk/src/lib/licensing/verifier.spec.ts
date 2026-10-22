import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { LicenseEngine, DEFAULT_COMMUNITY_TOKEN, STATELESS_RESEARCH_PUBKEY } from './verifier';
import { LicenseCodec, base64UrlToBytes } from './codec';
import { webcrypto } from 'node:crypto';

describe('LicenseEngine', () => {
  let originalWindow: any;

  beforeAll(() => {
    if (typeof global !== 'undefined' && !global.crypto) {
      Object.defineProperty(global, 'crypto', {
        value: webcrypto,
        writable: true,
        configurable: true,
      });
    }
  });

  afterEach(() => {
    (LicenseEngine as any).cachedLicense = null;
    vi.restoreAllMocks();
  });

  describe('resolve', () => {
    it('should fallback to the Community Token if no token is provided', async () => {
      vi.spyOn(LicenseEngine as any, 'verifyToken').mockResolvedValueOnce({
        tier: 'COMMUNITY', isValid: true, payload: { domain: '*' }
      });
      const license = await LicenseEngine.resolve(null, 'localhost');
      expect(license.tier).toBe('COMMUNITY');
      expect(license.isValid).toBe(true);
      expect(license.payload.domain).toBe('*');
    });

    it('should use explicit host and append port if window.location has one (Browser fallback)', async () => {
      vi.stubGlobal('window', { location: { host: 'browser-host.com:8080', port: '8080' } });
      const spy = vi.spyOn(LicenseEngine as any, 'verifyToken').mockResolvedValueOnce({
        tier: 'COMMUNITY', isValid: true, payload: { domain: '*' }
      });
      
      await LicenseEngine.resolve(DEFAULT_COMMUNITY_TOKEN, 'explicit-host.com');
      
      expect(spy).toHaveBeenCalledWith(DEFAULT_COMMUNITY_TOKEN, 'explicit-host.com:8080');
      
      vi.unstubAllGlobals();
    });

    it('should return cached license if resolving with null token but cache matches default token', async () => {
      (LicenseEngine as any).cachedLicense = {
        tier: 'COMMUNITY', isValid: true, rawToken: DEFAULT_COMMUNITY_TOKEN
      };

      const license = await LicenseEngine.resolve(null);
      expect(license.tier).toBe('COMMUNITY');
      expect(license.isValid).toBe(true);
    });

    it('should automatically resolve window.location.host if host param is omitted', async () => {
      vi.stubGlobal('window', { location: { host: 'browser-host.com', port: '' } });
      vi.spyOn(LicenseEngine as any, 'verifyToken').mockResolvedValueOnce({
        tier: 'COMMUNITY', isValid: true, payload: { domain: '*' }
      });
      
      const license = await LicenseEngine.resolve(DEFAULT_COMMUNITY_TOKEN);
      expect(license.isValid).toBe(true);
      
      vi.unstubAllGlobals();
    });

    it('should append window port if the effective host does not include one', async () => {
      vi.stubGlobal('window', { location: { host: 'localhost:4201', port: '4201' } });
      vi.spyOn(LicenseEngine as any, 'verifyToken').mockResolvedValueOnce({
        tier: 'COMMUNITY', isValid: true, payload: { domain: '*' }
      });
      
      const license = await LicenseEngine.resolve(DEFAULT_COMMUNITY_TOKEN, 'localhost');
      expect(license.isValid).toBe(true); 

      vi.unstubAllGlobals();
    });

    it('should cache a successfully verified license for subsequent calls', async () => {
      const spy = vi.spyOn(LicenseEngine as any, 'verifyToken').mockResolvedValue({
        tier: 'COMMUNITY', isValid: true, payload: { domain: '*' }, rawToken: DEFAULT_COMMUNITY_TOKEN
      });
      
      const firstCall = await LicenseEngine.resolve(DEFAULT_COMMUNITY_TOKEN, 'test.com');
      expect(firstCall.isValid).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);

      const secondCall = await LicenseEngine.resolve(DEFAULT_COMMUNITY_TOKEN, 'test.com');
      
      expect(spy).toHaveBeenCalledTimes(1);
      expect(secondCall).toBe(firstCall);
    });

    it('should fallback to an invalid community state if even the default token fails verification', async () => {
      vi.spyOn(LicenseEngine as any, 'verifyToken').mockResolvedValue(null);
      
      const license = await LicenseEngine.resolve(DEFAULT_COMMUNITY_TOKEN, 'test.com');
      expect(license.tier).toBe('COMMUNITY');
      expect(license.isValid).toBe(false);
      expect(license.rawToken).toBe(DEFAULT_COMMUNITY_TOKEN);
    });
  });

  describe('verifyToken Internal Validation', () => {
    it('should reject a token with an invalid checksum', async () => {
      vi.spyOn(LicenseCodec, 'verifyChecksum').mockResolvedValueOnce(false);
      const license = await (LicenseEngine as any).verifyToken(DEFAULT_COMMUNITY_TOKEN, 'test.com');
      expect(license).toBeNull();
    });

    it('should return null if the token completely fails to unpack', async () => {
      const license = await (LicenseEngine as any).verifyToken('srl_bad', 'test.com');
      expect(license).toBeNull();
    });

    it('should reject a valid token if the domain does not match', async () => {
      const unpackedCommunity = LicenseCodec.unpack(DEFAULT_COMMUNITY_TOKEN)!;
      unpackedCommunity.payload.domain = 'enterprise.com';

      vi.spyOn(LicenseCodec, 'unpack').mockReturnValue(unpackedCommunity);
      
      const license = await (LicenseEngine as any).verifyToken(DEFAULT_COMMUNITY_TOKEN, 'wrong-host.com');
      expect(license).toBeNull();
    });

    it('should use window.crypto for verification if available (Browser environment)', async () => {
      vi.stubGlobal('window', {
        crypto: {
          subtle: {
            importKey: vi.fn().mockResolvedValue({}),
            verify: vi.fn().mockResolvedValue(true)
          }
        },
        location: { host: 'localhost' }
      });
      
      vi.spyOn(LicenseCodec, 'verifyChecksum').mockResolvedValueOnce(true);

      const license = await (LicenseEngine as any).verifyToken(DEFAULT_COMMUNITY_TOKEN, '*');
      expect(window.crypto.subtle.verify).toHaveBeenCalled();
      expect(license?.isValid).toBe(true);

      vi.unstubAllGlobals();
    });

    it('should allow tokens with multi-domain configurations', async () => {
      const unpackedCommunity = LicenseCodec.unpack(DEFAULT_COMMUNITY_TOKEN)!;
      unpackedCommunity.payload.domain = 'enterprise.com,localhost:4200';

      vi.spyOn(LicenseCodec, 'unpack').mockReturnValue(unpackedCommunity);
      
      const localLicense = await (LicenseEngine as any).verifyToken(DEFAULT_COMMUNITY_TOKEN, 'localhost:4200');
      expect(localLicense).not.toBeNull();

      const baseLicense = await (LicenseEngine as any).verifyToken(DEFAULT_COMMUNITY_TOKEN, 'enterprise.com');
      expect(baseLicense).not.toBeNull();
      
      const subLicense = await (LicenseEngine as any).verifyToken(DEFAULT_COMMUNITY_TOKEN, 'vault.enterprise.com');
      expect(subLicense).not.toBeNull();
    });

    it('should reject expired tokens', async () => {
      const unpackedCommunity = LicenseCodec.unpack(DEFAULT_COMMUNITY_TOKEN)!;
      unpackedCommunity.payload.expiresAt = Date.now() - 10000; // Expired 10 seconds ago

      vi.spyOn(LicenseCodec, 'unpack').mockReturnValue(unpackedCommunity);

      const license = await (LicenseEngine as any).verifyToken(DEFAULT_COMMUNITY_TOKEN, '*');
      expect(license).toBeNull();
    });

    it('should reject tokens with valid metadata but a mathematically invalid signature', async () => {
      const raw = base64UrlToBytes(DEFAULT_COMMUNITY_TOKEN.slice(4));
      raw[10] = 0x99;
      const corruptedToken = 'srl_' + Buffer.from(raw).toString('base64url');

      const license = await (LicenseEngine as any).verifyToken(corruptedToken, '*');
      expect(license).toBeNull();
    });

    it('should fail safely if crypto validation throws an error', async () => {
      const cryptoSpy = vi.spyOn(globalThis.crypto.subtle, 'verify').mockRejectedValueOnce(new Error('Crypto failure'));
      
      vi.spyOn(LicenseCodec, 'verifyChecksum').mockResolvedValueOnce(true);

      const license = await (LicenseEngine as any).verifyToken(DEFAULT_COMMUNITY_TOKEN, '*');
      expect(license).toBeNull();

      cryptoSpy.mockRestore();
    });
  });
});