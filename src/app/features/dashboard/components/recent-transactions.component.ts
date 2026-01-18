/**
 * Recent Transactions Component
 *
 * Displays the most recent transactions.
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category?: string;
}

@Component({
  selector: 'app-recent-transactions',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule
  ],
  template: `
    <mat-card class="recent-card">
      <mat-card-header>
        <mat-icon mat-card-avatar>history</mat-icon>
        <mat-card-title>Recent Transactions</mat-card-title>
        <mat-card-subtitle>Latest activity</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div class="transaction-list">
          <div *ngFor="let tx of transactions" class="transaction-item">
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
          <div *ngIf="transactions.length === 0" class="empty-transactions">
            <p>No transactions yet</p>
          </div>
        </div>
      </mat-card-content>
      <mat-card-actions>
        <a mat-button routerLink="/transactions">View All Transactions</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
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

    .empty-transactions {
      text-align: center;
      padding: 1rem;
      color: #666;
    }

    mat-card-actions {
      padding: 0.5rem 1rem !important;
    }

    mat-card-actions a {
      margin: 0 !important;
    }
  `]
})
export class RecentTransactionsComponent {
  @Input() transactions: Transaction[] = [];
}
