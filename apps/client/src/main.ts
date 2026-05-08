import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';
// 1. Import the newly installed buffer package
import { Buffer } from 'buffer';

// 2. Shim Node.js globals for browser-compatibility
(window as any).global = window;
(window as any).Buffer = Buffer;
(window as any).process = {
  env: { DEBUG: undefined },
  version: '',
  nextTick: function(cb: any) { setTimeout(cb, 0); }
};

if (environment.production) {
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
  console.warn = () => {};
}

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
