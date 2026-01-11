import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'connectors',
    loadComponent: () => import('./features/connectors/connectors.component').then(m => m.ConnectorsComponent)
  },
  {
    path: 'upload',
    loadComponent: () => import('./features/upload/upload.component').then(m => m.UploadComponent)
  },
  {
    path: 'categories',
    loadComponent: () => import('./features/categories/categories.component').then(m => m.CategoriesComponent)
  },
  {
    path: 'analytics',
    loadComponent: () => import('./features/analytics/analytics.component').then(m => m.AnalyticsComponent)
  },
  {
    path: '',
    redirectTo: 'connectors',
    pathMatch: 'full'
  }
];
