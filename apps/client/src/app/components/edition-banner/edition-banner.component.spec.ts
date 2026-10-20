import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditionBannerComponent } from './edition-banner.component';
import { ActivatedRoute } from '@angular/router';
import { EditionService } from '../../services/edition/edition.service';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('EditionBannerComponent', () => {
  let component: EditionBannerComponent;
  let fixture: ComponentFixture<EditionBannerComponent>;

  let mockEditionService: any;
  let mockActivatedRoute: any;

  beforeEach(async () => {
    mockEditionService = {
      isCommunity: vi.fn().mockReturnValue(true),
      showExpirationBanner: vi.fn().mockReturnValue(false),
      licenseeName: vi.fn().mockReturnValue(''),
      daysRemaining: vi.fn().mockReturnValue(0),
      dismissExpirationWarning: vi.fn(),
    };

    mockActivatedRoute = {
      snapshot: { queryParamMap: { get: vi.fn().mockReturnValue(null) } },
    };

    await TestBed.configureTestingModule({
      imports: [EditionBannerComponent],
      providers: [
        { provide: EditionService, useValue: mockEditionService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditionBannerComponent);
    component = fixture.componentInstance;
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization and Context', () => {
    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should correctly detect embedded iframes via URL params', () => {
      mockActivatedRoute.snapshot.queryParamMap.get.mockReturnValue('true');
      expect(component.isEmbedded).toBe(true);
    });

    it('should fall back to false if not embedded and no params exist', () => {
      expect(component.isEmbedded).toBe(false);
    });
  });
});