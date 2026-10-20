/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { LicensePayload, ProductTier } from './types';

const TIER_MAP: Record<number, ProductTier> = {
	1: 'PUBLIC_GOOD',
	2: 'ENTERPRISE',
	3: 'COMMUNITY',
};

export function base64UrlToBytes(base64url: string): Uint8Array {
	const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
	const bin = typeof atob !== 'undefined' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary');
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

export class LicenseCodec {
	static unpack(
		tokenString: string,
	): { checksum: Uint8Array; signature: Uint8Array; payloadBytes: Uint8Array; payload: LicensePayload } | null {
		try {
			if (!tokenString || !tokenString.startsWith('srl_')) return null;
			const rawBytes = base64UrlToBytes(tokenString.slice(4));

			if (rawBytes.length < 87) return null;

			const checksum = rawBytes.slice(0, 4);
			const signature = rawBytes.slice(4, 68);
			const payloadBytes = rawBytes.slice(68);

			const view = new DataView(payloadBytes.buffer, payloadBytes.byteOffset, payloadBytes.byteLength);
			const version = view.getUint8(0);
			if (version !== 1) return null;

			const tier = TIER_MAP[view.getUint8(1)] || 'COMMUNITY';
			const flags = view.getUint8(2);
			const expiresAt = Number(view.getBigUint64(3));
			const issuedAt = Number(view.getBigUint64(11));

			let offset = 19;
			const decoder = new TextDecoder();

			const domainLen = view.getUint8(offset++);
			const domain = decoder.decode(payloadBytes.slice(offset, offset + domainLen));
			offset += domainLen;

			const licenseeLen = view.getUint8(offset++);
			const licensee = decoder.decode(payloadBytes.slice(offset, offset + licenseeLen));
			offset += licenseeLen;

			const regLen = view.getUint8(offset++);
			const registration = regLen > 0 ? decoder.decode(payloadBytes.slice(offset, offset + regLen)) : undefined;
			offset += regLen;

			const officeLen = view.getUint16(offset);
			offset += 2;
			const registeredOffice = officeLen > 0 ? decoder.decode(payloadBytes.slice(offset, offset + officeLen)) : undefined;

			const payload: LicensePayload = {
				tier,
				features: {
					whiteLabel: (flags & 0x01) !== 0,
					auditWatermarkRemoved: (flags & 0x02) !== 0,
				},
				expiresAt,
				issuedAt,
				domain,
				licensee,
				registration,
				registeredOffice,
			};

			return { checksum, signature, payloadBytes, payload };
		} catch {
			return null;
		}
	}

	static async verifyChecksum(checksum: Uint8Array, payloadBytes: Uint8Array): Promise<boolean> {
		try {
			const cryptoApi = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
			const hashBuffer = await cryptoApi.subtle.digest('SHA-256', payloadBytes);
			const expectedChecksum = new Uint8Array(hashBuffer).slice(0, 4);

			for (let i = 0; i < 4; i++) {
				if (checksum[i] !== expectedChecksum[i]) return false;
			}
			return true;
		} catch {
			return false;
		}
	}
}