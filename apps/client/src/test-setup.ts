import '@angular/compiler';
import '@analogjs/vitest-angular/setup-zone';

import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { getTestBed } from '@angular/core/testing';

// Initialize test environment only once
getTestBed().initTestEnvironment(
  BrowserTestingModule,
  platformBrowserTesting(),
  {
    teardown: {
      destroyAfterEach: true,        // ← This is the most important line
    },
  }
);

// Global cleanup after every test (critical for Vitest)
afterEach(() => {
  // Let Angular destroy everything properly
  getTestBed().resetTestingModule();

  // Aggressive DOM cleanup - removes leftover #rootN elements that Angular creates internally
  document.body.innerHTML = '';

  const rootElements = document.querySelectorAll('[id^="root"]');
  rootElements.forEach((el) => el.remove());

  // Clear any lingering Zone.js tasks (timers, effects, etc.)
  (window as any).__zone_symbol__unregisterAllTasks?.();

  // Clear mocks
  vi.clearAllMocks?.();
});