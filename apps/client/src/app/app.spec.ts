import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { RouterTestingModule } from '@angular/router/testing';
import { PLATFORM_ID } from '@angular/core';
import { Router, NavigationEnd, Event } from '@angular/router';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Subject } from 'rxjs';

describe('AppComponent', () => {
  let originalIsSecureContext: boolean | undefined;
  let routerEventsSubject: Subject<Event>;

  beforeEach(async () => {
    originalIsSecureContext = window.isSecureContext;
    routerEventsSubject = new Subject<Event>();
    
    await TestBed.configureTestingModule({
      imports: [App, RouterTestingModule],
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        // Mock the Router to control the events stream
        { provide: Router, useValue: { events: routerEventsSubject } }
      ]
    }).compileComponents();
  });

  afterEach(() => {
    Object.defineProperty(window, 'isSecureContext', { 
      value: originalIsSecureContext, 
      writable: true 
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
    const fixture = TestBed.createComponent(App);
    
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
    
    expect(() => fixture.componentInstance.ngOnInit()).toThrowError("Insecure Context - Crypto API disabled");
    expect(document.body.innerHTML).toContain('Security Error');
  });
});