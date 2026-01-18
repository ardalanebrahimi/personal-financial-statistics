/**
 * Dashboard Component
 *
 * Main dashboard view with overview and charts tabs.
 */

import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { BaseChartDirective, NgChartsModule } from 'ng2-charts';
import { Chart, ChartType, registerables, ChartData } from 'chart.js';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';

// Services
import {
  DashboardSyncService,
  ConnectorState,
  SyncProgress
} from './services/dashboard-sync.service';
import {
  DashboardChartService,
  CategoryBreakdown,
  DateRange
} from './services/dashboard-chart.service';

// Components
import { SyncProgressComponent } from './components/sync-progress.component';
import { StatsOverviewComponent, DashboardStats } from './components/stats-overview.component';
import { ConnectedAccountsComponent } from './components/connected-accounts.component';
import { PendingItemsComponent } from './components/pending-items.component';
import { TopCategoriesComponent } from './components/top-categories.component';
import { RecentTransactionsComponent, Transaction } from './components/recent-transactions.component';
import { QuickActionsComponent } from './components/quick-actions.component';
import { ChartControlsComponent } from './components/chart-controls.component';
import { CategoryBreakdownComponent } from './components/category-breakdown.component';

// Register Chart.js
Chart.register(...registerables);

interface Category {
  id: string;
  name: string;
  color?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTabsModule,
    NgChartsModule,
    SyncProgressComponent,
    StatsOverviewComponent,
    ConnectedAccountsComponent,
    PendingItemsComponent,
    TopCategoriesComponent,
    RecentTransactionsComponent,
    QuickActionsComponent,
    ChartControlsComponent,
    CategoryBreakdownComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

  connectors: ConnectorState[] = [];
  recentTransactions: Transaction[] = [];
  allTransactions: Transaction[] = [];
  syncProgress: SyncProgress[] = [];
  isSyncing = false;
  isAutoCategorizing = false;
  categories: Category[] = [];

  // Tab management
  selectedTabIndex = 0;

  // Chart properties
  selectedChartType: ChartType = 'pie';
  chartStartDate: Date;
  chartEndDate: Date;
  chartData: ChartData<'pie' | 'bar'> | undefined;
  monthlyTrendData: ChartData<'line'> | undefined;
  categoryBreakdown: CategoryBreakdown[] = [];

  stats: DashboardStats = {
    totalTransactions: 0,
    totalSpending: 0,
    totalIncome: 0,
    netBalance: 0,
    uncategorizedCount: 0,
    unmatchedCount: 0,
    thisMonthSpending: 0,
    lastMonthSpending: 0,
    spendingChange: 0,
    topCategories: []
  };

  private subscriptions: Subscription[] = [];

  constructor(
    private http: HttpClient,
    private snackBar: MatSnackBar,
    private route: ActivatedRoute,
    private syncService: DashboardSyncService,
    public chartService: DashboardChartService
  ) {
    const defaultRange = this.chartService.getDefaultDateRange();
    this.chartStartDate = defaultRange.start;
    this.chartEndDate = defaultRange.end;
  }

  ngOnInit(): void {
    this.subscriptions.push(
      this.syncService.isSyncing$.subscribe(val => this.isSyncing = val),
      this.syncService.syncProgress$.subscribe(val => this.syncProgress = val)
    );

    this.loadDashboardData();

    this.route.queryParams.subscribe(params => {
      if (params['tab'] === 'charts') {
        this.selectedTabIndex = 1;
        this.loadChartData();
      }
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  async loadDashboardData(): Promise<void> {
    await Promise.all([
      this.loadConnectors(),
      this.loadTransactions(),
      this.loadCategories()
    ]);
    this.calculateStats();
  }

  async loadConnectors(): Promise<void> {
    this.connectors = await this.syncService.loadConnectors();
  }

  async loadTransactions(): Promise<void> {
    try {
      const response = await this.http.get<{ transactions: Transaction[] }>(
        `${environment.apiUrl}/transactions`
      ).toPromise();
      const transactions = response?.transactions || [];
      this.allTransactions = transactions;
      this.recentTransactions = transactions.slice(0, 10);
      this.calculateTransactionStats(transactions);
    } catch (error) {
      console.error('Failed to load transactions:', error);
    }
  }

  async loadCategories(): Promise<void> {
    try {
      const response = await this.http.get<{ categories: Category[] }>(
        `${environment.apiUrl}/categories`
      ).toPromise();
      this.categories = response?.categories || [];
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  }

  calculateTransactionStats(transactions: Transaction[]): void {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

    this.stats.totalTransactions = transactions.length;
    this.stats.totalSpending = Math.abs(
      transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
    );
    this.stats.totalIncome = transactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    this.stats.netBalance = this.stats.totalIncome - this.stats.totalSpending;

    const thisMonthTx = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    this.stats.thisMonthSpending = Math.abs(
      thisMonthTx.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
    );

    const lastMonthTx = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    });
    this.stats.lastMonthSpending = Math.abs(
      lastMonthTx.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
    );

    if (this.stats.lastMonthSpending > 0) {
      this.stats.spendingChange =
        ((this.stats.thisMonthSpending - this.stats.lastMonthSpending) /
          this.stats.lastMonthSpending) * 100;
    }

    this.stats.uncategorizedCount = transactions.filter(
      t => !t.category || t.category === '' || t.category === 'Uncategorized'
    ).length;

    this.stats.unmatchedCount = transactions.filter(
      t => !(t as any).matchId && this.couldBeMatched(t)
    ).length;
  }

  calculateStats(): void {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const categoryTotals = new Map<string, number>();

    this.recentTransactions
      .filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear && t.amount < 0;
      })
      .forEach(t => {
        const cat = t.category || 'Uncategorized';
        categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + Math.abs(t.amount));
      });

    this.stats.topCategories = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, total]) => ({
        name,
        total,
        color: this.categories.find(c => c.name === name)?.color
      }));
  }

  couldBeMatched(tx: Transaction): boolean {
    const desc = tx.description.toLowerCase();
    return desc.includes('paypal') ||
           desc.includes('advanzia') ||
           desc.includes('mastercard') ||
           desc.includes('n26');
  }

  async syncAll(): Promise<void> {
    if (this.connectors.length === 0) {
      this.snackBar.open('No connectors configured', 'Close', { duration: 3000 });
      return;
    }

    const result = await this.syncService.syncAll(this.connectors);

    await this.loadDashboardData();

    this.snackBar.open(
      `Sync complete: ${result.totalNew} new transactions, ${result.totalDuplicates} duplicates skipped`,
      'Close',
      { duration: 5000 }
    );

    setTimeout(() => this.syncService.clearProgress(), 5000);
  }

  async autoCategorizePending(): Promise<void> {
    this.isAutoCategorizing = true;

    try {
      const result = await this.http.post<any>(
        `${environment.apiUrl}/ai/analyze-all`,
        {}
      ).toPromise();

      this.snackBar.open(
        `Found ${result?.withSuggestions || 0} category suggestions`,
        'Close',
        { duration: 3000 }
      );

      await this.loadDashboardData();
    } catch {
      this.snackBar.open('Auto-categorization failed', 'Close', { duration: 3000 });
    }

    this.isAutoCategorizing = false;
  }

  async exportData(): Promise<void> {
    try {
      const [transactions, categories] = await Promise.all([
        this.http.get<{ transactions: Transaction[] }>(`${environment.apiUrl}/transactions`).toPromise(),
        this.http.get<{ categories: Category[] }>(`${environment.apiUrl}/categories`).toPromise()
      ]);

      const exportData = {
        exportDate: new Date().toISOString(),
        transactions: transactions?.transactions || [],
        categories: categories?.categories || []
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `financial-data-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      this.snackBar.open('Data exported successfully', 'Close', { duration: 3000 });
    } catch {
      this.snackBar.open('Export failed', 'Close', { duration: 3000 });
    }
  }

  onTabChange(index: number): void {
    this.selectedTabIndex = index;
    if (index === 1) {
      this.loadChartData();
    }
  }

  loadChartData(): void {
    const dateRange: DateRange = {
      start: this.chartStartDate,
      end: this.chartEndDate
    };

    this.categoryBreakdown = this.chartService.calculateCategoryBreakdown(
      this.allTransactions,
      this.categories,
      dateRange
    );

    this.chartData = this.chartService.buildCategoryChartData(this.categoryBreakdown);
    this.monthlyTrendData = this.chartService.buildMonthlyTrendData(this.allTransactions, dateRange);
  }

  setDatePreset(preset: string): void {
    const range = this.chartService.getDatePreset(preset);
    this.chartStartDate = range.start;
    this.chartEndDate = range.end;
    this.loadChartData();
  }

  updateChart(): void {
    if (this.chart) {
      this.chart.update();
    }
  }
}
