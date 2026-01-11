import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subscription, interval } from 'rxjs';
import { environment } from '../../../environments/environment';

interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  beneficiary?: string;
  source?: {
    connectorType: string;
  };
  matchId?: string;
}

interface ConnectorState {
  config: {
    id: string;
    type: string;
    name: string;
    lastSyncAt?: string;
    lastSyncStatus?: string;
  };
  status: string;
}

interface SyncProgress {
  connectorId: string;
  connectorName: string;
  status: 'pending' | 'syncing' | 'success' | 'error';
  message?: string;
  transactionsCount?: number;
}

interface DashboardStats {
  totalTransactions: number;
  totalSpending: number;
  totalIncome: number;
  netBalance: number;
  uncategorizedCount: number;
  unmatchedCount: number;
  thisMonthSpending: number;
  lastMonthSpending: number;
  spendingChange: number;
  topCategories: { name: string; total: number; color?: string }[];
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
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDividerModule,
    MatBadgeModule,
    MatTooltipModule,
    MatSnackBarModule
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
      <mat-card class="sync-progress-card" *ngIf="syncProgress.length > 0">
        <mat-card-content>
          <h3>Sync Progress</h3>
          <div class="sync-items">
            <div *ngFor="let item of syncProgress" class="sync-item" [class]="'status-' + item.status">
              <div class="sync-item-header">
                <mat-icon *ngIf="item.status === 'pending'">schedule</mat-icon>
                <mat-spinner *ngIf="item.status === 'syncing'" diameter="20"></mat-spinner>
                <mat-icon *ngIf="item.status === 'success'" class="success">check_circle</mat-icon>
                <mat-icon *ngIf="item.status === 'error'" class="error">error</mat-icon>
                <span class="connector-name">{{ item.connectorName }}</span>
              </div>
              <span class="sync-message">{{ item.message }}</span>
            </div>
          </div>
          <mat-progress-bar *ngIf="isSyncing" mode="indeterminate"></mat-progress-bar>
        </mat-card-content>
      </mat-card>

      <!-- Stats Overview -->
      <div class="stats-grid">
        <mat-card class="stat-card">
          <mat-card-content>
            <mat-icon>account_balance_wallet</mat-icon>
            <div class="stat-info">
              <span class="stat-label">Net Balance</span>
              <span class="stat-value" [class.positive]="stats.netBalance >= 0" [class.negative]="stats.netBalance < 0">
                {{ stats.netBalance >= 0 ? '+' : '' }}{{ stats.netBalance | currency:'EUR' }}
              </span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="stat-card">
          <mat-card-content>
            <mat-icon>trending_down</mat-icon>
            <div class="stat-info">
              <span class="stat-label">This Month</span>
              <span class="stat-value negative">{{ stats.thisMonthSpending | currency:'EUR' }}</span>
              <span class="stat-change" [class.positive]="stats.spendingChange < 0" [class.negative]="stats.spendingChange > 0">
                {{ stats.spendingChange > 0 ? '+' : '' }}{{ stats.spendingChange | number:'1.0-0' }}%
              </span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="stat-card">
          <mat-card-content>
            <mat-icon>trending_up</mat-icon>
            <div class="stat-info">
              <span class="stat-label">Total Income</span>
              <span class="stat-value positive">{{ stats.totalIncome | currency:'EUR' }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="stat-card">
          <mat-card-content>
            <mat-icon>receipt_long</mat-icon>
            <div class="stat-info">
              <span class="stat-label">Transactions</span>
              <span class="stat-value">{{ stats.totalTransactions }}</span>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Main Content Grid -->
      <div class="content-grid">
        <!-- Connected Accounts -->
        <mat-card class="accounts-card">
          <mat-card-header>
            <mat-icon mat-card-avatar>account_balance</mat-icon>
            <mat-card-title>Connected Accounts</mat-card-title>
            <mat-card-subtitle>{{ connectors.length }} sources</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="account-list">
              <div *ngFor="let connector of connectors" class="account-item">
                <div class="account-icon">
                  <mat-icon>{{ getConnectorIcon(connector.config.type) }}</mat-icon>
                </div>
                <div class="account-info">
                  <span class="account-name">{{ connector.config.name }}</span>
                  <span class="account-sync" *ngIf="connector.config.lastSyncAt">
                    Last sync: {{ connector.config.lastSyncAt | date:'short' }}
                  </span>
                </div>
                <mat-chip [class]="'status-' + connector.status">
                  {{ connector.status }}
                </mat-chip>
              </div>
              <div *ngIf="connectors.length === 0" class="empty-accounts">
                <p>No accounts connected</p>
                <a mat-button color="primary" routerLink="/connectors">Add Account</a>
              </div>
            </div>
          </mat-card-content>
          <mat-card-actions>
            <a mat-button routerLink="/connectors">Manage Connectors</a>
          </mat-card-actions>
        </mat-card>

        <!-- Pending Items -->
        <mat-card class="pending-card">
          <mat-card-header>
            <mat-icon mat-card-avatar>pending_actions</mat-icon>
            <mat-card-title>Needs Attention</mat-card-title>
            <mat-card-subtitle>Items requiring action</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="pending-items">
              <a class="pending-item" routerLink="/transactions" [queryParams]="{filter: 'uncategorized'}">
                <mat-icon>label_off</mat-icon>
                <div class="pending-info">
                  <span class="pending-count">{{ stats.uncategorizedCount }}</span>
                  <span class="pending-label">Uncategorized</span>
                </div>
                <mat-icon class="chevron">chevron_right</mat-icon>
              </a>
              <a class="pending-item" routerLink="/transactions" [queryParams]="{filter: 'unmatched'}">
                <mat-icon>link_off</mat-icon>
                <div class="pending-info">
                  <span class="pending-count">{{ stats.unmatchedCount }}</span>
                  <span class="pending-label">Unmatched</span>
                </div>
                <mat-icon class="chevron">chevron_right</mat-icon>
              </a>
            </div>
          </mat-card-content>
          <mat-card-actions>
            <button mat-button color="primary" (click)="autoCategorizePending()" [disabled]="isAutoCategorizing">
              <mat-icon>auto_fix_high</mat-icon>
              Auto-Categorize
            </button>
          </mat-card-actions>
        </mat-card>

        <!-- Top Categories -->
        <mat-card class="categories-card">
          <mat-card-header>
            <mat-icon mat-card-avatar>pie_chart</mat-icon>
            <mat-card-title>Top Categories</mat-card-title>
            <mat-card-subtitle>This month's spending</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="category-list">
              <div *ngFor="let category of stats.topCategories; let i = index" class="category-item">
                <span class="category-rank">{{ i + 1 }}</span>
                <div class="category-bar" [style.background-color]="category.color || '#ccc'"
                     [style.width.%]="getCategoryWidth(category.total)"></div>
                <span class="category-name">{{ category.name }}</span>
                <span class="category-amount">{{ category.total | currency:'EUR' }}</span>
              </div>
              <div *ngIf="stats.topCategories.length === 0" class="empty-categories">
                <p>No spending data yet</p>
              </div>
            </div>
          </mat-card-content>
          <mat-card-actions>
            <a mat-button routerLink="/analytics">View Analytics</a>
          </mat-card-actions>
        </mat-card>

        <!-- Recent Transactions -->
        <mat-card class="recent-card">
          <mat-card-header>
            <mat-icon mat-card-avatar>history</mat-icon>
            <mat-card-title>Recent Transactions</mat-card-title>
            <mat-card-subtitle>Latest activity</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="transaction-list">
              <div *ngFor="let tx of recentTransactions" class="transaction-item">
                <div class="tx-icon" [class]="tx.amount < 0 ? 'expense' : 'income'">
                  <mat-icon>{{ tx.amount < 0 ? 'remove' : 'add' }}</mat-icon>
                </div>
                <div class="tx-info">
                  <span class="tx-description">{{ tx.description | slice:0:40 }}{{ tx.description.length > 40 ? '...' : '' }}</span>
                  <span class="tx-date">{{ tx.date | date:'mediumDate' }}</span>
                </div>
                <div class="tx-amount" [class.negative]="tx.amount < 0" [class.positive]="tx.amount > 0">
                  {{ tx.amount | currency:'EUR' }}
                </div>
              </div>
              <div *ngIf="recentTransactions.length === 0" class="empty-transactions">
                <p>No transactions yet</p>
              </div>
            </div>
          </mat-card-content>
          <mat-card-actions>
            <a mat-button routerLink="/transactions">View All Transactions</a>
          </mat-card-actions>
        </mat-card>
      </div>

      <!-- Quick Actions -->
      <mat-card class="quick-actions-card">
        <mat-card-content>
          <h3>Quick Actions</h3>
          <div class="actions-grid">
            <a mat-stroked-button routerLink="/upload">
              <mat-icon>upload_file</mat-icon>
              Upload CSV
            </a>
            <a mat-stroked-button routerLink="/import/amazon">
              <mat-icon>shopping_cart</mat-icon>
              Import Amazon
            </a>
            <a mat-stroked-button routerLink="/ai-assistant">
              <mat-icon>smart_toy</mat-icon>
              AI Assistant
            </a>
            <button mat-stroked-button (click)="exportData()">
              <mat-icon>download</mat-icon>
              Export Data
            </button>
          </div>
        </mat-card-content>
      </mat-card>
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

    .sync-progress-card {
      margin-bottom: 1.5rem;
      background: #fafafa;
    }

    .sync-progress-card h3 {
      margin: 0 0 1rem;
    }

    .sync-items {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .sync-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 0.5rem 1rem;
      background: white;
      border-radius: 8px;
      min-width: 150px;
    }

    .sync-item-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .sync-item .success { color: #4caf50; }
    .sync-item .error { color: #f44336; }

    .sync-message {
      font-size: 12px;
      color: #666;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .stat-card mat-card-content {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem !important;
    }

    .stat-card mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #1976d2;
    }

    .stat-info {
      display: flex;
      flex-direction: column;
    }

    .stat-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 500;
    }

    .stat-value.positive { color: #4caf50; }
    .stat-value.negative { color: #f44336; }

    .stat-change {
      font-size: 12px;
    }

    .stat-change.positive { color: #4caf50; }
    .stat-change.negative { color: #f44336; }

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

    .account-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .account-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem;
      border-radius: 8px;
      background: #fafafa;
    }

    .account-icon {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
      border-radius: 50%;
    }

    .account-info {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .account-name {
      font-weight: 500;
    }

    .account-sync {
      font-size: 12px;
      color: #666;
    }

    .status-connected { background: #e8f5e9 !important; color: #2e7d32 !important; }
    .status-disconnected { background: #f5f5f5 !important; color: #666 !important; }
    .status-error { background: #ffebee !important; color: #c62828 !important; }

    .empty-accounts, .empty-categories, .empty-transactions {
      text-align: center;
      padding: 1rem;
      color: #666;
    }

    .pending-items {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .pending-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: #fafafa;
      border-radius: 8px;
      text-decoration: none;
      color: inherit;
      transition: background 0.2s;
    }

    .pending-item:hover {
      background: #f0f0f0;
    }

    .pending-info {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .pending-count {
      font-size: 1.25rem;
      font-weight: 500;
    }

    .pending-label {
      font-size: 12px;
      color: #666;
    }

    .chevron {
      color: #ccc;
    }

    .category-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .category-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      position: relative;
    }

    .category-rank {
      width: 20px;
      text-align: center;
      font-weight: 500;
      color: #666;
    }

    .category-bar {
      height: 24px;
      border-radius: 4px;
      min-width: 10px;
      opacity: 0.7;
    }

    .category-name {
      flex: 1;
      font-weight: 500;
    }

    .category-amount {
      color: #666;
    }

    .transaction-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .transaction-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem;
    }

    .tx-icon {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .tx-icon.expense {
      background: #ffebee;
      color: #f44336;
    }

    .tx-icon.income {
      background: #e8f5e9;
      color: #4caf50;
    }

    .tx-icon mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .tx-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .tx-description {
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tx-date {
      font-size: 12px;
      color: #666;
    }

    .tx-amount {
      font-weight: 500;
    }

    .tx-amount.negative { color: #f44336; }
    .tx-amount.positive { color: #4caf50; }

    .quick-actions-card h3 {
      margin: 0 0 1rem;
    }

    .actions-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .actions-grid a, .actions-grid button {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    mat-card-actions {
      padding: 0.5rem 1rem !important;
    }

    mat-card-actions a, mat-card-actions button {
      margin: 0 !important;
    }
  `]
})
export class DashboardComponent implements OnInit, OnDestroy {
  connectors: ConnectorState[] = [];
  recentTransactions: Transaction[] = [];
  syncProgress: SyncProgress[] = [];
  isSyncing = false;
  isAutoCategorizing = false;

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
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadDashboardData();
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
    try {
      const response = await this.http.get<{ connectors: ConnectorState[] }>(
        `${environment.apiUrl}/connectors`
      ).toPromise();
      this.connectors = response?.connectors || [];
    } catch (error) {
      console.error('Failed to load connectors:', error);
    }
  }

  async loadTransactions(): Promise<void> {
    try {
      const response = await this.http.get<{ transactions: Transaction[] }>(
        `${environment.apiUrl}/transactions`
      ).toPromise();
      const transactions = response?.transactions || [];
      this.recentTransactions = transactions.slice(0, 10);
      this.calculateTransactionStats(transactions);
    } catch (error) {
      console.error('Failed to load transactions:', error);
    }
  }

  private categories: { id: string; name: string; color?: string }[] = [];

  async loadCategories(): Promise<void> {
    try {
      const response = await this.http.get<{ categories: any[] }>(
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

    // Total stats
    this.stats.totalTransactions = transactions.length;
    this.stats.totalSpending = Math.abs(
      transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
    );
    this.stats.totalIncome = transactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    this.stats.netBalance = this.stats.totalIncome - this.stats.totalSpending;

    // This month
    const thisMonthTx = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    this.stats.thisMonthSpending = Math.abs(
      thisMonthTx.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
    );

    // Last month
    const lastMonthTx = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    });
    this.stats.lastMonthSpending = Math.abs(
      lastMonthTx.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
    );

    // Change percentage
    if (this.stats.lastMonthSpending > 0) {
      this.stats.spendingChange =
        ((this.stats.thisMonthSpending - this.stats.lastMonthSpending) /
          this.stats.lastMonthSpending) * 100;
    }

    // Uncategorized count
    this.stats.uncategorizedCount = transactions.filter(
      t => !t.category || t.category === '' || t.category === 'Uncategorized'
    ).length;

    // Unmatched count (transactions that could be matched but aren't)
    this.stats.unmatchedCount = transactions.filter(
      t => !t.matchId && this.couldBeMatched(t)
    ).length;
  }

  calculateStats(): void {
    // Calculate top categories from this month's transactions
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
    // Check if transaction looks like it could be matched
    const desc = tx.description.toLowerCase();
    return desc.includes('paypal') ||
           desc.includes('advanzia') ||
           desc.includes('mastercard') ||
           desc.includes('n26');
  }

  getCategoryWidth(total: number): number {
    const max = this.stats.topCategories[0]?.total || 1;
    return (total / max) * 100;
  }

  getConnectorIcon(type: string): string {
    const icons: Record<string, string> = {
      sparkasse: 'account_balance',
      n26: 'smartphone',
      paypal: 'payment',
      gebuhrenfrei: 'credit_card',
      amazon: 'shopping_cart'
    };
    return icons[type] || 'account_balance';
  }

  async syncAll(): Promise<void> {
    if (this.connectors.length === 0) {
      this.snackBar.open('No connectors configured', 'Close', { duration: 3000 });
      return;
    }

    this.isSyncing = true;
    this.syncProgress = this.connectors
      .filter(c => c.status === 'connected')
      .map(c => ({
        connectorId: c.config.id,
        connectorName: c.config.name,
        status: 'pending' as const,
        message: 'Waiting...'
      }));

    if (this.syncProgress.length === 0) {
      this.snackBar.open('No connected accounts to sync', 'Close', { duration: 3000 });
      this.isSyncing = false;
      return;
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);

    let totalNew = 0;
    let totalDuplicates = 0;

    for (const progress of this.syncProgress) {
      progress.status = 'syncing';
      progress.message = 'Fetching transactions...';

      try {
        const result = await this.http.post<any>(
          `${environment.apiUrl}/connectors/${progress.connectorId}/fetch`,
          {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          }
        ).toPromise();

        progress.status = 'success';
        progress.transactionsCount = result?.newTransactionsCount || 0;
        progress.message = `${result?.newTransactionsCount || 0} new transactions`;
        totalNew += result?.newTransactionsCount || 0;
        totalDuplicates += result?.duplicatesSkipped || 0;
      } catch (error: any) {
        progress.status = 'error';
        progress.message = error.error?.error || 'Sync failed';
      }
    }

    // Run matching after sync
    try {
      await this.http.post(`${environment.apiUrl}/matching/run`, {}).toPromise();
    } catch (error) {
      console.error('Matching failed:', error);
    }

    this.isSyncing = false;
    await this.loadDashboardData();

    this.snackBar.open(
      `Sync complete: ${totalNew} new transactions, ${totalDuplicates} duplicates skipped`,
      'Close',
      { duration: 5000 }
    );

    // Clear progress after delay
    setTimeout(() => {
      this.syncProgress = [];
    }, 5000);
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
    } catch (error) {
      this.snackBar.open('Auto-categorization failed', 'Close', { duration: 3000 });
    }

    this.isAutoCategorizing = false;
  }

  async exportData(): Promise<void> {
    try {
      const [transactions, categories] = await Promise.all([
        this.http.get<{ transactions: Transaction[] }>(`${environment.apiUrl}/transactions`).toPromise(),
        this.http.get<{ categories: any[] }>(`${environment.apiUrl}/categories`).toPromise()
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
    } catch (error) {
      this.snackBar.open('Export failed', 'Close', { duration: 3000 });
    }
  }
}
