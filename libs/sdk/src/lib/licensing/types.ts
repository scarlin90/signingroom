/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

export type ProductTier = 'PUBLIC_GOOD' | 'ENTERPRISE' | 'COMMUNITY';

export interface LicenseFeatures {
	whiteLabel: boolean;
	auditWatermarkRemoved: boolean;
}

export interface LicensePayload {
	tier: ProductTier;
	features: LicenseFeatures;
	expiresAt: number;
	issuedAt: number;
	domain: string;
	licensee: string;
	registration?: string;
	registeredOffice?: string;
}

export interface VerifiedLicense {
	tier: ProductTier;
	isValid: boolean;
	payload: LicensePayload;
	rawToken: string;
}

export interface MessageMetadata {
	protocolVersion: string;
	sdkVersion: string;
	tier: ProductTier;
	licensee: string;
	domain: string;
	clientTimestamp: number;
}

export interface LicenseAuditReport {
    isValid: boolean;
    tier: ProductTier;
    licensee: string;
    domain: string;
    issuedAt: Date | null;
    expiresAt: Date | null;
    isExpired: boolean;
    tamperEvidentError?: string;
}