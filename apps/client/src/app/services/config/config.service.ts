import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BrandingConfig, DEFAULT_BRANDING_CONFIG } from '../../models/branding-config.model';

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  private readonly _config = signal<BrandingConfig>(DEFAULT_BRANDING_CONFIG);
  public readonly config = this._config.asReadonly();

  constructor(private readonly http: HttpClient) {}

  async loadConfig(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<Partial<BrandingConfig>>(`${environment.configUrl}?t=${Date.now()}`),
      );
      this._config.set({ ...DEFAULT_BRANDING_CONFIG, ...response });
      console.log('Brand configuration loaded successfully.');
    } catch {
      console.log('No custom brand config found. Using default SigningRoom branding.');
      this._config.set(DEFAULT_BRANDING_CONFIG);
    }
  }

  get settings(): BrandingConfig {
    return this._config();
  }
}
