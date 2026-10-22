import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditionService } from './edition.service';
import { SocketService } from '../socket/socket.service';
import { ConfigService } from '../config/config.service';
import { Subject } from 'rxjs';
import { VerifiedLicense, ProductTier } from '@signing-room/sdk';

const DISMISS_STORAGE_KEY = 'signingroom_license_warning_dismissed_until';

const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

vi.stubGlobal('localStorage', mockLocalStorage);
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, writable: true });
}

function makeLicense(overrides: Partial<VerifiedLicense> = {}): VerifiedLicense {
  return {
    isValid: true,
    tier: 'ENTERPRISE' as ProductTier,
    payload: {
      licensee: 'Acme Corp',
      expiresAt: Date.now() + 10 * 24 * 60 * 60 * 1000, // 10 days
      features: { whiteLabel: true },
    },
    ...overrides,
  } as VerifiedLicense;
}

describe('EditionService', () => {
  let service: EditionService;
  let stateChange$: Subject<void>;
  let mockSdk: {
    onStateChange: ReturnType<typeof vi.fn>;
    init: ReturnType<typeof vi.fn>;
    license: VerifiedLicense | null;
  };
  let mockSocketService: { sdk: typeof mockSdk };
  let mockConfigService: { setWhitelabelAllowed: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    stateChange$ = new Subject<void>();

    mockSdk = {
      onStateChange: vi.fn().mockReturnValue(stateChange$.asObservable()),
      init: vi.fn().mockResolvedValue(null),
      license: null,
    };

    mockSocketService = { sdk: mockSdk };

    mockConfigService = {
      setWhitelabelAllowed: vi.fn(),
    };

    // Clean mock storage between tests
    mockLocalStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        EditionService,
        { provide: SocketService, useValue: mockSocketService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    });

    service = TestBed.inject(EditionService);
  });

  afterEach(() => {
    mockLocalStorage.clear();
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // defaults (no license)

  it('defaults to COMMUNITY tier when no license is set', () => {
    expect(service.tier()).toBe('COMMUNITY');
    expect(service.isCommunity()).toBe(true);
    expect(service.isEnterprise()).toBe(false);
    expect(service.isPublicGood()).toBe(false);
  });

  it('defaults licenseeName and white-label flag when no license', () => {
    expect(service.licenseeName()).toBe('Signing Room Community Edition');
    expect(service.isWhiteLabelAllowed()).toBe(false);
  });

  it('isExpiringSoon / daysRemaining / showExpirationBanner are false with no license', () => {
    expect(service.isExpiringSoon()).toBe(false);
    expect(service.daysRemaining()).toBe(0);
    expect(service.showExpirationBanner()).toBe(false);
  });

  // init()

  it('init() loads the verified license and updates config', async () => {
    const lic = makeLicense();
    mockSdk.init.mockResolvedValue(lic);

    await service.init();

    expect(service.license()).toEqual(lic);
    expect(service.tier()).toBe('ENTERPRISE');
    expect(service.isEnterprise()).toBe(true);
    expect(service.licenseeName()).toBe('Acme Corp');
    expect(service.isWhiteLabelAllowed()).toBe(true);
    expect(mockConfigService.setWhitelabelAllowed).toHaveBeenCalledWith(true);
  });

  it('init() with COMMUNITY license keeps white-label false', async () => {
    const lic = makeLicense({
      tier: 'COMMUNITY' as ProductTier,
      payload: {
        licensee: 'Community',
        expiresAt: 0,
        features: { whiteLabel: false },
      },
    });
    mockSdk.init.mockResolvedValue(lic);

    await service.init();

    expect(service.isCommunity()).toBe(true);
    expect(service.isWhiteLabelAllowed()).toBe(false);
    expect(mockConfigService.setWhitelabelAllowed).toHaveBeenCalledWith(false);
  });

  // syncWithRoomState()

  it('syncWithRoomState() copies sdk.license when present', () => {
    const lic = makeLicense({ tier: 'PUBLIC_GOOD' as ProductTier });
    mockSdk.license = lic;

    service.syncWithRoomState();

    expect(service.license()).toEqual(lic);
    expect(service.isPublicGood()).toBe(true);
    expect(mockConfigService.setWhitelabelAllowed).toHaveBeenCalledWith(true);
  });

  it('syncWithRoomState() is a no-op when sdk.license is null', () => {
    mockSdk.license = null;
    service.syncWithRoomState();
    expect(service.license()).toBeNull();
    expect(mockConfigService.setWhitelabelAllowed).not.toHaveBeenCalled();
  });

  it('constructor subscribes to onStateChange and syncs on emission', () => {
    const lic = makeLicense();
    mockSdk.license = lic;

    stateChange$.next();

    expect(service.license()).toEqual(lic);
  });

  // isExpiringSoon / daysRemaining

  it('isExpiringSoon is true when valid commercial license expires within 30 days', async () => {
    const lic = makeLicense({
      payload: {
        licensee: 'Acme',
        expiresAt: Date.now() + 5 * 24 * 60 * 60 * 1000, // 5 days
        features: { whiteLabel: true },
      },
    });
    mockSdk.init.mockResolvedValue(lic);
    await service.init();

    expect(service.isExpiringSoon()).toBe(true);
    expect(service.daysRemaining()).toBe(5);
    expect(service.showExpirationBanner()).toBe(true);
  });

  it('isExpiringSoon is false for perpetual licenses (expiresAt === 0)', async () => {
    const lic = makeLicense({
      payload: {
        licensee: 'Acme',
        expiresAt: 0,
        features: { whiteLabel: true },
      },
    });
    mockSdk.init.mockResolvedValue(lic);
    await service.init();

    expect(service.isExpiringSoon()).toBe(false);
    expect(service.daysRemaining()).toBe(0);
  });

  it('isExpiringSoon is false when license is already expired', async () => {
    const lic = makeLicense({
      payload: {
        licensee: 'Acme',
        expiresAt: Date.now() - 1000,
        features: { whiteLabel: true },
      },
    });
    mockSdk.init.mockResolvedValue(lic);
    await service.init();

    expect(service.isExpiringSoon()).toBe(false);
    expect(service.daysRemaining()).toBe(0);
  });

  it('isExpiringSoon is false for COMMUNITY tier even if expires soon', async () => {
    const lic = makeLicense({
      tier: 'COMMUNITY' as ProductTier,
      payload: {
        licensee: 'Community',
        expiresAt: Date.now() + 5 * 24 * 60 * 60 * 1000,
        features: { whiteLabel: false },
      },
    });
    mockSdk.init.mockResolvedValue(lic);
    await service.init();

    expect(service.isExpiringSoon()).toBe(false);
  });

  it('isExpiringSoon is false when license is invalid', async () => {
    const lic = makeLicense({ isValid: false });
    mockSdk.init.mockResolvedValue(lic);
    await service.init();

    expect(service.isExpiringSoon()).toBe(false);
  });

  it('daysRemaining returns at least 1 when any positive time remains', async () => {
    const lic = makeLicense({
      payload: {
        licensee: 'Acme',
        expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
        features: { whiteLabel: true },
      },
    });
    mockSdk.init.mockResolvedValue(lic);
    await service.init();

    expect(service.daysRemaining()).toBe(1);
  });

  // dismissExpirationWarning / checkIfDismissed 

  it('dismissExpirationWarning sets dismissed flag and writes localStorage', async () => {
    const lic = makeLicense({
      payload: {
        licensee: 'Acme',
        expiresAt: Date.now() + 5 * 24 * 60 * 60 * 1000,
        features: { whiteLabel: true },
      },
    });
    mockSdk.init.mockResolvedValue(lic);
    await service.init();

    expect(service.showExpirationBanner()).toBe(true);

    service.dismissExpirationWarning();

    expect(service.isDismissed()).toBe(true);
    expect(service.showExpirationBanner()).toBe(false);

    const stored = window.localStorage.getItem(DISMISS_STORAGE_KEY);
    expect(stored).toBeTruthy();
    expect(parseInt(stored!, 10)).toBeGreaterThan(Date.now());
  });

  it('checkIfDismissed returns true when a future dismiss timestamp exists', () => {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, (Date.now() + 60_000).toString());

    // Re-create so the private check runs in the constructor
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        EditionService,
        { provide: SocketService, useValue: mockSocketService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    });
    const fresh = TestBed.inject(EditionService);

    expect(fresh.isDismissed()).toBe(true);
  });

  it('checkIfDismissed returns false when stored timestamp is in the past', () => {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, (Date.now() - 1000).toString());

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        EditionService,
        { provide: SocketService, useValue: mockSocketService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    });
    const fresh = TestBed.inject(EditionService);

    expect(fresh.isDismissed()).toBe(false);
  });

  it('checkIfDismissed returns false for non-numeric stored value', () => {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, 'not-a-number');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        EditionService,
        { provide: SocketService, useValue: mockSocketService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    });
    const fresh = TestBed.inject(EditionService);

    expect(fresh.isDismissed()).toBe(false);
  });
});