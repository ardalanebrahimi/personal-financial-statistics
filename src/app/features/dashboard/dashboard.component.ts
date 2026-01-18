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
  template: `
    <div class="dashboard-container">
      <!-- Header with Sync All -->
      <header class="dashboard-header">
        <div class="header-content">
          <h1>Financial Dashboard</h1>
          <p>Overview of your financial accounts and transactions</p>
        </div>
        <div class="header-actions">
          <button mat-raised-button color="primary"
                  [disabled]="isSyncing"
                  (click)="syncAll()">
            <mat-icon *ngIf="!isSyncing">sync</mat-icon>
            <mat-spinner *ngIf="isSyncing" diameter="20"></mat-spinner>
            {{ isSyncing ? 'Syncing...' : 'Sync All' }}
          </button>
        </div>
      </header>

      <!-- Sync Progress -->
      <app-sync-progress
        [syncProgress]="syncProgress"
        [isSyncing]="isSyncing">
      </app-sync-progress>

      <!-- Stats Overview -->
      <app-stats-overview [stats]="stats"></app-stats-overview>

      <!-- Tab Group -->
      <mat-tab-group [selectedIndex]="selectedTabIndex" (selectedIndexChange)="onTabChange($event)">
        <!-- Overview Tab -->
        <mat-tab label="Overview">
          <ng-template matTabContent>
            <div class="tab-content">
              <div class="content-grid">
                <app-connected-accounts [connectors]="connectors"></app-connected-accounts>
                <app-pending-items
                  [uncategorizedCount]="stats.uncategorizedCount"
                  [unmatchedCount]="stats.unmatchedCount"
                  [isAutoCategorizing]="isAutoCategorizing"
                  (autoCategorize)="autoCategorizePending()">
                </app-pending-items>
                <app-top-categories
                  [categories]="stats.topCategories"
                  (viewCharts)="selectedTabIndex = 1">
                </app-top-categories>
                <app-recent-transactions [transactions]="recentTransactions"></app-recent-transactions>
              </div>
              <app-quick-actions (exportData)="exportData()"></app-quick-actions>
            </div>
          </ng-template>
        </mat-tab>

        <!-- Charts Tab -->
        <mat-tab label="Charts">
          <ng-template matTabContent>
            <div class="tab-content charts-tab">
              <app-chart-controls
                [startDate]="chartStartDate"
                [endDate]="chartEndDate"
                [chartType]="selectedChartType"
                (startDateChange)="chartStartDate = $event; loadChartData()"
                (endDateChange)="chartEndDate = $event; loadChartData()"
                (chartTypeChange)="selectedChartType = $event; updateChart()"
                (presetSelected)="setDatePreset($event)">
              </app-chart-controls>

              <!-- Chart Card -->
              <mat-card class="chart-card" *ngIf="chartData">
                <mat-card-header>
                  <mat-icon mat-card-avatar>{{ selectedChartType === 'pie' ? 'pie_chart' : 'bar_chart' }}</mat-icon>
                  <mat-card-title>Spending by Category</mat-card-title>
                  <mat-card-subtitle>{{ chartStartDate | date:'mediumDate' }} - {{ chartEndDate | date:'mediumDate' }}</mat-card-subtitle>
                </mat-card-header>
                <mat-card-content>
                  <div class="chart-container">
                    <canvas baseChart
                      [type]="selectedChartType"
                      [datasets]="chartData.datasets"
                      [labels]="chartData.labels"
                      [options]="chartService.pieChartOptions">
                    </canvas>
                  </div>
                </mat-card-content>
              </mat-card>

              <!-- Monthly Trend Card -->
              <mat-card class="chart-card" *ngIf="monthlyTrendData">
                <mat-card-header>
                  <mat-icon mat-card-avatar>show_chart</mat-icon>
                  <mat-card-title>Monthly Spending Trend</mat-card-title>
                  <mat-card-subtitle>Expense trends over time</mat-card-subtitle>
                </mat-card-header>
                <mat-card-content>
                  <div class="chart-container">
                    <canvas baseChart
                      type="line"
                      [datasets]="monthlyTrendData.datasets"
                      [labels]="monthlyTrendData.labels"
                      [options]="chartService.lineChartOptions">
                    </canvas>
                  </div>
                </mat-card-content>
              </mat-card>

              <app-category-breakdown [breakdown]="categoryBreakdown"></app-category-breakdown>
            </div>
          </ng-template>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .dashboard-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1rem;
    }

    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.5rem;
    }

    .header-content h1 {
      margin: 0;
      font-size: 2rem;
    }

    .header-content p {
      margin: 0.5rem 0 0;
      color: #666;
    }

    .header-actions button {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .content-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.5rem;
      margin-bottom: 1.5rem;
    }

    @media (max-width: 900px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
    }

    .tab-content {
      padding: 1.5rem 0;
    }

    .charts-tab {
      max-width: 1000px;
      margin: 0 auto;
    }

    .chart-card {
      margin-bottom: 1.5rem;
    }

    .chart-container {
      padding: 1rem;
      min-height: 300px;
      position: relative;
    }
  `]
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
