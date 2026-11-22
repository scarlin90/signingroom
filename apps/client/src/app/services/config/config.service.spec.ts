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

      service.setWhitelabelAllowed(true);
      await service.loadConfig();

      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
      const requestedUrl = mockHttpClient.get.mock.calls[0][0];
      expect(requestedUrl).toContain(environment.configUrl);
      expect(requestedUrl).toMatch(/\?t=\d+/);

      expect(service.settings.brandName).toBe('Test Brand Corp');
      expect(service.settings.logoUrl).toBe('/test-logo.png');

      expect(service.settings.tagline).toBe(DEFAULT_BRANDING_CONFIG.tagline);
    });

    it('should gracefully fallback to defaults if the HTTP request fails', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockHttpClient.get.mockReturnValue(throwError(() => new Error('404 Not Found')));

      (service as any)._rawConfig.set({ ...DEFAULT_BRANDING_CONFIG, brandName: 'Corrupted State' });

      await service.loadConfig();

      expect(service.settings).toEqual(DEFAULT_BRANDING_CONFIG);
      expect(service.settings.brandName).toBe(DEFAULT_BRANDING_CONFIG.brandName);
    });
  });

  describe('setWhitelabelAllowed() & isEmbedOriginAllowed()', () => {
    it('should enforce default branding when whitelabel is disallowed', () => {
      (service as any)._rawConfig.set({
        ...DEFAULT_BRANDING_CONFIG,
        brandName: 'Custom WhiteLabel',
        brandSuffix: '.custom',
        logoUrl: '/custom.svg',
        hideFooter: true,
      });

      service.setWhitelabelAllowed(false);

      expect(service.config().whitelabel).toBe(false);
      expect(service.config().brandName).toBe('Signing Room®');
      expect(service.config().brandSuffix).toBe('.io');
      expect(service.config().logoUrl).toBe('/brand/logo.svg');
      expect(service.config().hideFooter).toBe(false);
    });

    it('should return false for empty or malformed candidateOrigin values', () => {
      expect(service.isEmbedOriginAllowed('')).toBe(false);
      expect(service.isEmbedOriginAllowed('not-a-valid-url')).toBe(false);
    });

    it('should allow same-origin candidateOrigin matching window.location.origin', () => {
      expect(service.isEmbedOriginAllowed(window.location.origin)).toBe(true);
    });

    it('should match allowlisted origins by full URL and by host fallback', () => {
      service.setWhitelabelAllowed(true);
      (service as any)._rawConfig.set({
        ...DEFAULT_BRANDING_CONFIG,
        allowedEmbedOrigins: ['https://partner.example.com', 'partner.io', '://bad-entry'],
      } as any);

      expect(service.isEmbedOriginAllowed('https://partner.example.com')).toBe(true);
      expect(service.isEmbedOriginAllowed('https://partner.io')).toBe(true);
      expect(service.isEmbedOriginAllowed('https://untrusted.example.com')).toBe(false);
    });

    it('should permit localhost/127.0.0.1 when running on localhost', () => {
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        value: { origin: 'http://localhost:4200', hostname: 'localhost' },
        configurable: true,
      });

      try {
        expect(service.isEmbedOriginAllowed('http://127.0.0.1:5173')).toBe(true);
        expect(service.isEmbedOriginAllowed('https://external-site.com')).toBe(false);
      } finally {
        Object.defineProperty(window, 'location', {
          value: originalLocation,
          configurable: true,
        });
      }
    });
  });
});
