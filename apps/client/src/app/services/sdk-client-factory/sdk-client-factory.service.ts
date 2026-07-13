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

import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
export const PROTOCOL_VERSION = '1.0.0';
import { SigningRoomClient } from '@signing-room/sdk';

@Injectable({ providedIn: 'root' })
export class SDKClientFactoryService {
  /**
   * Creates a Signing Room SDK Client
   * @returns SigningRoomClient
   */
  create(config?: Partial<{ apiUrl: string; protocolVersion: string }>) {
    return new SigningRoomClient({
      apiUrl: config?.apiUrl ?? environment.apiUrl,
      protocolVersion: config?.protocolVersion ?? PROTOCOL_VERSION,
    });
  }
}
