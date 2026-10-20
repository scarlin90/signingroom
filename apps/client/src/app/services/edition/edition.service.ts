/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Injectable, signal, computed, inject } from '@angular/core';
import { SocketService } from '../socket/socket.service';
import { ConfigService } from '../config/config.service';
import { ProductTier, VerifiedLicense } from '@signing-room/sdk';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DISMISS_STORAGE_KEY = 'signingroom_license_warning_dismissed_until';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class EditionService {
  private socketService = inject(SocketService);
  private configService = inject(ConfigService);

  private readonly _license = signal<VerifiedLicense | null>(null);
  public readonly license = this._license.asReadonly();

  private readonly _isDismissed = signal<boolean>(this.checkIfDismissed());
  public readonly isDismissed = this._isDismissed.asReadonly();

  public readonly tier = computed<ProductTier>(() => {
    return this._license()?.tier || 'COMMUNITY';
  });

  public readonly isCommunity = computed(() => this.tier() === 'COMMUNITY');
  public readonly isEnterprise = computed(() => this.tier() === 'ENTERPRISE');
  public readonly isPublicGood = computed(() => this.tier() === 'PUBLIC_GOOD');

  public readonly isWhiteLabelAllowed = computed(() => {
    return this._license()?.payload.features.whiteLabel ?? false;
  });

  public readonly licenseeName = computed(() => {
    return this._license()?.payload.licensee || 'Signing Room Community Edition';
  });

  /**
   * True if a valid non-community license has an expiration date within the next 30 days.
   */
  public readonly isExpiringSoon = computed(() => {
    const lic = this._license();
    if (!lic || !lic.isValid || lic.tier === 'COMMUNITY') return false;

    const expiresAt = lic.payload?.expiresAt;
    if (!expiresAt || expiresAt === 0) return false; // 0 = Perpetual

    const msRemaining = expiresAt - Date.now();
    return msRemaining > 0 && msRemaining <= THIRTY_DAYS_MS;
  });

  /**
   * Number of days remaining until token expiration (minimum 1 day).
   */
  public readonly daysRemaining = computed(() => {
    const lic = this._license();
    const expiresAt = lic?.payload?.expiresAt;
    if (!expiresAt || expiresAt === 0) return 0;

    const msRemaining = expiresAt - Date.now();
    if (msRemaining <= 0) return 0;

    return Math.max(1, Math.ceil(msRemaining / ONE_DAY_MS));
  });

  /**
   * Determines whether the expiration banner should be rendered in the UI.
   */
  public readonly showExpirationBanner = computed(() => {
    return this.isExpiringSoon() && !this._isDismissed();
  });

  constructor() {
    this.socketService.sdk.onStateChange().subscribe(() => {
      this.syncWithRoomState();
    });
  }

  async init(): Promise<void> {
    const verified = await this.socketService.sdk.init();
    this._license.set(verified);
    this.configService.setWhitelabelAllowed(this.isWhiteLabelAllowed());
  }

  syncWithRoomState(): void {
    const sdkLic = this.socketService.sdk.license;
    if (sdkLic) {
      this._license.set(sdkLic);
      this.configService.setWhitelabelAllowed(this.isWhiteLabelAllowed());
    }
  }

  /**
   * Dismisses the expiration banner for 24 hours.
   */
  public dismissExpirationWarning(): void {
    if (typeof window !== 'undefined') {
      const until = Date.now() + DISMISS_DURATION_MS;
      localStorage.setItem(DISMISS_STORAGE_KEY, until.toString());
    }
    this._isDismissed.set(true);
  }

  private checkIfDismissed(): boolean {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!stored) return false;
    const until = parseInt(stored, 10);
    return !isNaN(until) && Date.now() < until;
  }
}