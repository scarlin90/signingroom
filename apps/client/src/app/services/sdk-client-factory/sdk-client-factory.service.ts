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

import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ConfigService } from '../config/config.service';
import { SigningRoomClient } from '@signing-room/sdk';

export const PROTOCOL_VERSION = '1.0.0';

@Injectable({ providedIn: 'root' })
export class SDKClientFactoryService {
  private configService = inject(ConfigService);

  /**
   * Creates a configured Signing Room SDK Client instance.
   */
  create(config?: Partial<{ apiUrl: string; protocolVersion: string; licenseToken?: string; host?: string }>) {
    let resolvedToken = config?.licenseToken;

    if (!resolvedToken && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      resolvedToken = urlParams.get('licenseToken') || (window as any).__env?.licenseToken;
    }

    if (!resolvedToken) {
      resolvedToken = this.configService.settings.licenseToken;
    }

    const resolvedHost =
      config?.host ?? (typeof window !== 'undefined' ? window.location.host : 'localhost');

    return new SigningRoomClient({
      apiUrl: config?.apiUrl ?? environment.apiUrl,
      protocolVersion: config?.protocolVersion ?? PROTOCOL_VERSION,
      licenseToken: resolvedToken,
      host: resolvedHost,
    } as any);
  }
}