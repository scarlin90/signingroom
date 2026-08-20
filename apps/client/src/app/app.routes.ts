import { Route } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { whitelabelGuard } from './guards/whitelabel.guard';

export const appRoutes: Route[] = [
  { path: '', component: HomeComponent, canActivate: [whitelabelGuard] },
  {
    path: 'create',
    loadComponent: () => import('./pages/create/create.component').then((m) => m.CreateComponent),
  },
  {
    path: 'room/:id',
    loadComponent: () => import('./pages/room/room.component').then((m) => m.RoomComponent),
  },
  { path: '**', redirectTo: '' },
];
