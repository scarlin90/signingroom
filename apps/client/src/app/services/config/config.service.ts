/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BrandingConfig, DEFAULT_BRANDING_CONFIG } from '../../models/branding-config.model';

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  private readonly http = inject(HttpClient);

  private readonly _rawConfig = signal<BrandingConfig>(DEFAULT_BRANDING_CONFIG);

  private readonly _isWhitelabelAllowed = signal<boolean>(false);

  public readonly config = computed<BrandingConfig>(() => {
    const raw = this._rawConfig();
    const isAllowed = this._isWhitelabelAllowed();

    if (!isAllowed) {
      return {
        ...raw,
        whitelabel: false,
        useTradeMark: true,
        brandName: 'Signing Room®',
        brandSuffix: '.io',
        logoUrl: '/brand/logo.svg',
        hideFooter: false,
      };
    }

    return {
      ...raw,
      whitelabel: true,
    };
  });

  public setWhitelabelAllowed(allowed: boolean): void {
    this._isWhitelabelAllowed.set(allowed);
  }

  async loadConfig(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<Partial<BrandingConfig>>(`${environment.configUrl}?t=${Date.now()}`),
      );
      this._rawConfig.set({ ...DEFAULT_BRANDING_CONFIG, ...response });
    } catch {
      this._rawConfig.set(DEFAULT_BRANDING_CONFIG);
    }
  }

  get settings(): BrandingConfig {
    return this.config();
  }
}