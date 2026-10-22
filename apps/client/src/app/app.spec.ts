import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { RouterTestingModule } from '@angular/router/testing';
import { PLATFORM_ID, Renderer2 } from '@angular/core';
import { Router } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { ConfigService } from './services/config/config.service';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

@Component({ template: '', standalone: true })
class DummyComponent {}

describe('AppComponent', () => {
  let originalIsSecureContext: boolean | undefined;

  let mockTitleService: { setTitle: ReturnType<typeof vi.fn> };
  let mockMetaService: { updateTag: ReturnType<typeof vi.fn> };
  let mockConfigService: any;

  beforeEach(async () => {
    originalIsSecureContext = window.isSecureContext;

    mockTitleService = { setTitle: vi.fn() };
    mockMetaService = { updateTag: vi.fn() };

    mockConfigService = {
      config: vi.fn().mockReturnValue({
        brandName: 'TestBrand',
        brandSuffix: ' Inc',
        tagline: 'Secure Vault',
        subTagline: 'Advanced cold storage.',
        brandColorHex: '#FF5500',
        useTradeMark: true,
      }),
      settings: { licenseToken: undefined },
    };

    await TestBed.configureTestingModule({
      imports: [
        App,
        RouterTestingModule.withRoutes([
          { path: 'test', component: DummyComponent },
        ]),
      ],
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: Title, useValue: mockTitleService },
        { provide: Meta, useValue: mockMetaService },
        { provide: ConfigService, useValue: mockConfigService },
        Renderer2,
      ],
    }).compileComponents();
  });

  afterEach(() => {
    Object.defineProperty(window, 'isSecureContext', {
      value: originalIsSecureContext,
      writable: true,
    });
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should trigger window.scrollTo on NavigationEnd', async () => {
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/test');

    expect(scrollSpy).toHaveBeenCalledWith(0, 0);
  });

  it('should throw an error and render a security warning if NOT a secure context', () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, writable: true });
    const fixture = TestBed.createComponent(App);

    expect(() => fixture.componentInstance.ngOnInit()).toThrowError(
      'Insecure Context - Crypto API disabled',
    );
    expect(document.body.innerHTML).toContain('Security Error');
  });

  describe('applyBrandMetadata()', () => {
    it('should set Title and Meta tags using values from ConfigService', () => {
      Object.defineProperty(window, 'isSecureContext', { value: true, writable: true });
      const fixture = TestBed.createComponent(App);

      fixture.componentInstance.ngOnInit();

      expect(mockTitleService.setTitle).toHaveBeenCalledWith('TestBrand Inc | Secure Vault');

      expect(mockMetaService.updateTag).toHaveBeenCalledWith({
        name: 'description',
        content: 'Advanced cold storage.',
      });
      expect(mockMetaService.updateTag).toHaveBeenCalledWith({
        name: 'theme-color',
        content: '#FF5500',
      });

      expect(mockMetaService.updateTag).toHaveBeenCalledWith({
        property: 'og:title',
        content: 'TestBrand Inc | Secure Vault',
      });
      expect(mockMetaService.updateTag).toHaveBeenCalledWith({
        property: 'og:description',
        content: 'Advanced cold storage.',
      });
      expect(mockMetaService.updateTag).toHaveBeenCalledWith({
        property: 'og:site_name',
        content: 'TestBrand Inc',
      });

      expect(mockMetaService.updateTag).toHaveBeenCalledWith({
        name: 'twitter:title',
        content: 'TestBrand Inc | Secure Vault',
      });
      expect(mockMetaService.updateTag).toHaveBeenCalledWith({
        name: 'twitter:description',
        content: 'Advanced cold storage.',
      });
    });

    it('should construct and append JSON-LD schema to the document head', () => {
      Object.defineProperty(window, 'isSecureContext', { value: true, writable: true });
      const fixture = TestBed.createComponent(App);

      const renderer = (fixture.componentInstance as any).renderer;
      const createElementSpy = vi.spyOn(renderer, 'createElement');
      const setAttributeSpy = vi.spyOn(renderer, 'setAttribute');
      const setPropertySpy = vi.spyOn(renderer, 'setProperty');
      const appendChildSpy = vi.spyOn(renderer, 'appendChild');

      fixture.componentInstance.ngOnInit();

      expect(createElementSpy).toHaveBeenCalledWith('script');
      expect(setAttributeSpy).toHaveBeenCalledWith(
        expect.any(Object),
        'type',
        'application/ld+json',
      );

      const setPropertyCall = setPropertySpy.mock.calls[0];
      expect(setPropertyCall[1]).toBe('text');

      const schemaStr = setPropertyCall[2];
      expect(schemaStr).toContain('"name":"TestBrand Inc"');
      expect(schemaStr).toContain('"description":"Advanced cold storage."');
      expect(schemaStr).toContain(
        '"author":{"@type":"Organization","name":"Stateless Research Ltd"}',
      );

      expect(appendChildSpy).toHaveBeenCalledWith(document.head, expect.any(Object));
    });

    it('should use default fallback strings if optional config values are missing', () => {
      Object.defineProperty(window, 'isSecureContext', { value: true, writable: true });

      mockConfigService.config.mockReturnValue({
        brandName: 'NakedBrand',
        useTradeMark: false,
      });

      const fixture = TestBed.createComponent(App);

      const renderer = (fixture.componentInstance as any).renderer;
      const setPropertySpy = vi.spyOn(renderer, 'setProperty');

      fixture.componentInstance.ngOnInit();

      expect(mockTitleService.setTitle).toHaveBeenCalledWith(
        'NakedBrand | Real-Time Multisig Coordinator',
      );
      expect(mockMetaService.updateTag).toHaveBeenCalledWith({
        name: 'description',
        content: 'The ephemeral, zero-knowledge Bitcoin multisig coordinator.',
      });

      expect(mockMetaService.updateTag).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'theme-color' }),
      );

      const schemaStr = setPropertySpy.mock.calls[0][2];
      expect(schemaStr).toContain('"author":{"@type":"Organization","name":"NakedBrand"}');
    });
  });
});