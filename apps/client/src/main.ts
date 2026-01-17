import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

if (environment.production) {
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
  console.warn = () => {};
}

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
