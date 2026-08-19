import { TestBed } from '@angular/core/testing';
import { ConfigService } from './config.service';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DEFAULT_BRANDING_CONFIG } from '../../models/branding-config.model';
import { environment } from '../../../environments/environment';

describe('ConfigService', () => {
  let service: ConfigService;
  let mockHttpClient: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [ConfigService, { provide: HttpClient, useValue: mockHttpClient }],
    });
    service = TestBed.inject(ConfigService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Environment & Context', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should initialize with the default branding configuration', () => {
      expect(service.settings).toEqual(DEFAULT_BRANDING_CONFIG);
      expect(service.config()).toEqual(DEFAULT_BRANDING_CONFIG);
    });
  });

  describe('loadConfig()', () => {
    it('should successfully fetch, merge with defaults, and update the config signal', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockApiResponse = {
        brandName: 'Test Brand Corp',
        logoUrl: '/test-logo.png',
      };

      mockHttpClient.get.mockReturnValue(of(mockApiResponse));

      await service.loadConfig();

      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
      const requestedUrl = mockHttpClient.get.mock.calls[0][0];
      expect(requestedUrl).toContain(environment.configUrl);
      expect(requestedUrl).toMatch(/\?t=\d+/); // Matches ?t=1690000000000

      expect(service.settings.brandName).toBe('Test Brand Corp');
      expect(service.settings.logoUrl).toBe('/test-logo.png');

      expect(service.settings.tagline).toBe(DEFAULT_BRANDING_CONFIG.tagline);
      expect(consoleSpy).toHaveBeenCalledWith('Brand configuration loaded successfully.');
    });

    it('should gracefully fallback to defaults if the HTTP request fails', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockHttpClient.get.mockReturnValue(throwError(() => new Error('404 Not Found')));

      (service as any)._config.set({ ...DEFAULT_BRANDING_CONFIG, brandName: 'Corrupted State' });

      await service.loadConfig();

      expect(service.settings).toEqual(DEFAULT_BRANDING_CONFIG);
      expect(service.settings.brandName).toBe(DEFAULT_BRANDING_CONFIG.brandName);
      expect(consoleSpy).toHaveBeenCalledWith(
        'No custom brand config found. Using default SigningRoom branding.',
      );
    });
  });
});
