import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { ConfigService } from '../services/config/config.service';

export const whitelabelGuard: CanActivateFn = () => {
  const configService = inject(ConfigService);
  const router = inject(Router);

  if (configService.config().whitelabel) {
    return router.createUrlTree(['/create']);
  }

  return true;
};
