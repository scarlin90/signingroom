import { Route } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';

export const appRoutes: Route[] = [
  { path: '', component: HomeComponent },
  { 
    path: 'create', 
    loadComponent: () => import('./pages/create/create.component').then(m => m.CreateComponent) 
  },
  { 
    path: 'room/:id', 
    loadComponent: () => import('./pages/room/room.component').then(m => m.RoomComponent) 
  },
  { path: '**', redirectTo: '' },
];