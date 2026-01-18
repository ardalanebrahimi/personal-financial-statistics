import { Routes } from '@angular/router';

export const routes: Routes = [
  // Main routes
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'transactions',
    loadComponent: () => import('./features/transactions/transactions.component').then(m => m.TransactionsComponent)
  },
  {
    path: 'trends',
    loadComponent: () => import('./features/trends/trends.component').then(m => m.TrendsComponent)
  },
  {
    path: 'recurring',
    loadComponent: () => import('./features/recurring/recurring.component').then(m => m.RecurringComponent)
  },
  // Analytics merged into Dashboard Charts tab
  {
    path: 'analytics',
    redirectTo: 'dashboard?tab=charts',
    pathMatch: 'full'
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent)
  },

  // Redirects for deprecated routes (merged into Transactions)
  {
    path: 'upload',
    redirectTo: 'transactions',
    pathMatch: 'full'
  },
  {
    path: 'import/amazon',
    redirectTo: 'transactions',
    pathMatch: 'full'
  },

  // Redirects for routes merged into Settings
  {
    path: 'connectors',
    redirectTo: 'settings?tab=connectors',
    pathMatch: 'full'
  },
  {
    path: 'categories',
    redirectTo: 'settings?tab=categories',
    pathMatch: 'full'
  },
  {
    path: 'help',
    redirectTo: 'settings?tab=help',
    pathMatch: 'full'
  },
  {
    path: 'ai-assistant',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },

  // Default route
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  }
];
