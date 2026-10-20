import {
  provideAppInitializer,
  inject,
  Injector,
  runInInjectionContext,
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
  isDevMode,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { appRoutes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { ConfigService } from './services/config/config.service';
import { EditionService } from './services/edition/edition.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes),
    provideHttpClient(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAppInitializer(async () => {
      const configService = inject(ConfigService);
      const injector = inject(Injector);

      await configService.loadConfig();

      const editionService = runInInjectionContext(injector, () => inject(EditionService));
      await editionService.init();

      configService.setWhitelabelAllowed(editionService.isWhiteLabelAllowed());
    }),
  ],
};