/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { LicenseCodec, base64UrlToBytes } from './codec';
import { VerifiedLicense } from './types';


export const STATELESS_RESEARCH_PUBKEY = 'MCowBQYDK2VwAyEAVHmMGOonAgglS98rsyHOycwc7acID4LBUXTE/b41TCY=';
export const DEFAULT_COMMUNITY_TOKEN = 'srl_0DGPSeBK6w99XjmrwvdFBbfIC6XH-_czfymlxEgguusg5mb9tpEmNfuPBZdNSittYGuQiei1jvD67XKdxUYuVkdCgQEBAwAAAAAAAAAAAAAAAaFTwDzFASoeU2lnbmluZyBSb29tIENvbW11bml0eSBFZGl0aW9uAAAA';

export class LicenseEngine {
  private static cachedLicense: VerifiedLicense | null = null;

  static async resolve(candidateToken: string | undefined | null, host?: string): Promise<VerifiedLicense> {
    let effectiveHost = host;
    if (typeof window !== 'undefined' && window.location?.host) {
      if (!effectiveHost) {
        effectiveHost = window.location.host;
      } else if (!effectiveHost.includes(':') && window.location.port) {
        effectiveHost = `${effectiveHost}:${window.location.port}`;
      }
    }

    const normalizedHost = (effectiveHost || '').toLowerCase();

    if (
      this.cachedLicense && 
      this.cachedLicense.rawToken === (candidateToken || DEFAULT_COMMUNITY_TOKEN)
    ) {
      return this.cachedLicense;
    }

    if (candidateToken) {
      const verified = await this.verifyToken(candidateToken, normalizedHost);
      if (verified && verified.isValid) {
        this.cachedLicense = verified;
        return verified;
      }
    }

    const community = await this.verifyToken(DEFAULT_COMMUNITY_TOKEN, '*');
    if (community) {
      this.cachedLicense = community;
      return community;
    }

    const unpacked = LicenseCodec.unpack(DEFAULT_COMMUNITY_TOKEN);
    return {
      tier: 'COMMUNITY',
      isValid: false,
      payload: unpacked!.payload,
      rawToken: DEFAULT_COMMUNITY_TOKEN,
    };
  }

  private static async verifyToken(token: string, requiredHost: string): Promise<VerifiedLicense | null> {
    const unpacked = LicenseCodec.unpack(token);
    if (!unpacked) return null;

    const isChecksumValid = await LicenseCodec.verifyChecksum(unpacked.checksum, unpacked.payloadBytes);
    if (!isChecksumValid) return null;

    const allowedRaw = unpacked.payload.domain.toLowerCase();
    const allowedDomains = allowedRaw.split(',').map((d) => d.trim());
    let matchesDomain = false;

    const browserHost =
      typeof window !== 'undefined' && window.location?.host
        ? window.location.host.toLowerCase()
        : '';
    const reqHostname = requiredHost.replace(/:\d+$/, '');

    for (const allowed of allowedDomains) {
      if (allowed === '*') {
        matchesDomain = true;
        break;
      } else if (allowed.includes(':')) {
        if (requiredHost === allowed || browserHost === allowed) {
          matchesDomain = true;
          break;
        }
      } else {
        if (reqHostname === allowed || reqHostname.endsWith(`.${allowed}`)) {
          matchesDomain = true;
          break;
        }
      }
    }

    if (!matchesDomain) {
      console.warn(`[LicenseVerifier] Host mismatch: Token requires '${allowedRaw}', host is '${requiredHost}'.`);
      return null;
    }

    if (unpacked.payload.expiresAt !== 0 && Date.now() > unpacked.payload.expiresAt) {
      return null;
    }

    try {
      const cryptoApi = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
      const keyBytes = base64UrlToBytes(STATELESS_RESEARCH_PUBKEY);

      const pubKey = await cryptoApi.subtle.importKey(
        'spki',
        keyBytes,
        { name: 'Ed25519' },
        false,
        ['verify'],
      );

      const isSignatureValid = await cryptoApi.subtle.verify(
        'Ed25519',
        pubKey,
        unpacked.signature,
        unpacked.payloadBytes,
      );

      if (!isSignatureValid) return null;

      return {
        tier: unpacked.payload.tier,
        isValid: true,
        payload: unpacked.payload,
        rawToken: token,
      };
    } catch {
      return null;
    }
  }
}