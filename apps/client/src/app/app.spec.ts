import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { RouterTestingModule } from '@angular/router/testing';
import { PLATFORM_ID, Renderer2 } from '@angular/core';
import { Router, NavigationEnd, Event } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { ConfigService } from './services/config/config.service';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Subject } from 'rxjs';

describe('AppComponent', () => {
  let originalIsSecureContext: boolean | undefined;
  let routerEventsSubject: Subject<Event>;

  let mockTitleService: { setTitle: ReturnType<typeof vi.fn> };
  let mockMetaService: { updateTag: ReturnType<typeof vi.fn> };
  let mockConfigService: any;

  beforeEach(async () => {
    originalIsSecureContext = window.isSecureContext;
    routerEventsSubject = new Subject<Event>();

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
    };

    await TestBed.configureTestingModule({
      imports: [App, RouterTestingModule],
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: Router, useValue: { events: routerEventsSubject } },
        { provide: Title, useValue: mockTitleService },
        { provide: Meta, useValue: mockMetaService },
        { provide: ConfigService, useValue: mockConfigService },
        Renderer2, // Allow standard Angular injection
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

  it('should trigger window.scrollTo on NavigationEnd', () => {
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const fixture = TestBed.createComponent(App); // Subscribes in constructor

    // Emit a NavigationEnd event to trigger the constructor subscription
    routerEventsSubject.next(new NavigationEnd(1, '/test', '/test'));

    expect(scrollSpy).toHaveBeenCalledWith(0, 0);
  });

  it('should set hideHeader to true when ?hideHeader=true is in the URL', () => {
    window.history.replaceState({}, '', '/?hideHeader=true');
    Object.defineProperty(window, 'isSecureContext', { value: true, writable: true });

    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.ngOnInit();

    expect(fixture.componentInstance.hideHeader).toBe(true);
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

      fixture.componentInstance.ngOnInit(); // triggers applyBrandMetadata

      // Title
      expect(mockTitleService.setTitle).toHaveBeenCalledWith('TestBrand Inc | Secure Vault');

      // Standard Meta
      expect(mockMetaService.updateTag).toHaveBeenCalledWith({
        name: 'description',
        content: 'Advanced cold storage.',
      });
      expect(mockMetaService.updateTag).toHaveBeenCalledWith({
        name: 'theme-color',
        content: '#FF5500',
      });

      // Open Graph
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

      // Twitter
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

      // Spy on the component's internal renderer methods BEFORE calling ngOnInit
      const renderer = (fixture.componentInstance as any).renderer;
      const createElementSpy = vi.spyOn(renderer, 'createElement');
      const setAttributeSpy = vi.spyOn(renderer, 'setAttribute');
      const setPropertySpy = vi.spyOn(renderer, 'setProperty');
      const appendChildSpy = vi.spyOn(renderer, 'appendChild');

      fixture.componentInstance.ngOnInit(); // triggers applyBrandMetadata

      // Verify Renderer2 interactions
      expect(createElementSpy).toHaveBeenCalledWith('script');
      expect(setAttributeSpy).toHaveBeenCalledWith(
        expect.any(Object),
        'type',
        'application/ld+json',
      );

      // Verify schema stringification and property setting
      const setPropertyCall = setPropertySpy.mock.calls[0];
      expect(setPropertyCall[1]).toBe('text');

      const schemaStr = setPropertyCall[2];
      expect(schemaStr).toContain('"name":"TestBrand Inc"');
      expect(schemaStr).toContain('"description":"Advanced cold storage."');
      expect(schemaStr).toContain(
        '"author":{"@type":"Organization","name":"Stateless Research Ltd"}',
      ); // Because useTradeMark is true

      // Verify it was appended
      expect(appendChildSpy).toHaveBeenCalledWith(document.head, expect.any(Object));
    });

    it('should use default fallback strings if optional config values are missing', () => {
      Object.defineProperty(window, 'isSecureContext', { value: true, writable: true });

      // Override mock to return empty/missing optional values
      mockConfigService.config.mockReturnValue({
        brandName: 'NakedBrand',
        useTradeMark: false,
        // missing brandSuffix, tagline, subTagline, brandColorHex
      });

      const fixture = TestBed.createComponent(App);

      // Spy on the renderer to catch the property call
      const renderer = (fixture.componentInstance as any).renderer;
      const setPropertySpy = vi.spyOn(renderer, 'setProperty');

      fixture.componentInstance.ngOnInit();

      expect(mockTitleService.setTitle).toHaveBeenCalledWith(
        'NakedBrand | Real-Time Multisig Coordinator',
      );
      expect(mockMetaService.updateTag).toHaveBeenCalledWith({
        name: 'description',
        content: 'The stateless, zero-knowledge Bitcoin multisig coordinator.',
      });

      // Should not have called theme-color
      expect(mockMetaService.updateTag).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'theme-color' }),
      );

      // Schema author should match brand name since useTradeMark is false
      const schemaStr = setPropertySpy.mock.calls[0][2];
      expect(schemaStr).toContain('"author":{"@type":"Organization","name":"NakedBrand"}');
    });
  });
});
