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
    path: 'connectors',
    loadComponent: () => import('./features/connectors/connectors.component').then(m => m.ConnectorsComponent)
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
    path: 'help',
    loadComponent: () => import('./features/help/help.component').then(m => m.HelpComponent)
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent)
  },

  // Redirects for deprecated routes (imports merged into transactions)
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
