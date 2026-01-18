/**
 * Stats Overview Component
 *
 * Displays the main stats cards grid.
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

export interface DashboardStats {
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
  selector: 'app-stats-overview',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule],
  template: `
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
  `,
  styles: [`
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
  `]
})
export class StatsOverviewComponent {
  @Input() stats: DashboardStats = {
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
}
