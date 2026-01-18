import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { environment } from '../../../environments/environment';
import { Transaction, Category } from '../../core/models/transaction.model';
import { TransactionCardComponent } from '../transactions/transaction-card.component';

interface RecurringPattern {
  id: string;
  beneficiary: string;
  averageAmount: number;
  frequency: string;
  transactionIds: string[];
  occurrenceCount: number;
  firstOccurrence: string;
  lastOccurrence: string;
}

interface DialogData {
  pattern: RecurringPattern;
  categories: Category[];
}

@Component({
  selector: 'app-pattern-transactions-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    TransactionCardComponent
  ],
  template: `
    <div class="dialog-container">
      <div class="dialog-header">
        <div class="header-info">
          <h2>
            <mat-icon>receipt_long</mat-icon>
            Transactions for {{ data.pattern.beneficiary }}
          </h2>
          <div class="header-chips">
            <mat-chip>{{ data.pattern.occurrenceCount }} transactions</mat-chip>
            <mat-chip>{{ data.pattern.frequency }}</mat-chip>
            <mat-chip class="total-chip">
              Total: {{ getTotalSpent() | currency:'EUR':'symbol':'1.2-2' }}
            </mat-chip>
          </div>
        </div>
        <button mat-icon-button (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-dialog-content>
        <!-- Loading State -->
        <div class="loading-state" *ngIf="isLoading">
          <mat-spinner diameter="40"></mat-spinner>
          <p>Loading transactions...</p>
        </div>

        <!-- Transactions List -->
        <div class="transactions-list" *ngIf="!isLoading && transactions.length > 0">
          <app-transaction-card
            *ngFor="let tx of transactions"
            [transaction]="tx"
            [categories]="data.categories"
            [compact]="true">
          </app-transaction-card>
        </div>

        <!-- Empty State -->
        <div class="empty-state" *ngIf="!isLoading && transactions.length === 0">
          <mat-icon>search_off</mat-icon>
          <p>No transactions found for this pattern</p>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions>
        <button mat-button (click)="close()">Close</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-container {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 16px 24px;
      border-bottom: 1px solid #e0e0e0;
      background: #fafafa;
    }

    .header-info h2 {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 0 0 12px 0;
      font-size: 20px;
      font-weight: 500;
    }

    .header-info h2 mat-icon {
      color: #1976d2;
    }

    .header-chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .header-chips mat-chip {
      font-size: 12px;
      min-height: 24px;
      padding: 0 8px;
    }

    .total-chip {
      background: #e8f5e9 !important;
      color: #2e7d32 !important;
      font-weight: 500;
    }

    mat-dialog-content {
      flex: 1;
      padding: 16px 24px !important;
      max-height: none !important;
      overflow-y: auto;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      color: #666;
    }

    .loading-state p {
      margin-top: 16px;
    }

    .transactions-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      color: #666;
    }

    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #ccc;
      margin-bottom: 16px;
    }

    mat-dialog-actions {
      padding: 12px 24px;
      border-top: 1px solid #e0e0e0;
    }
  `]
})
export class PatternTransactionsDialogComponent implements OnInit {
  transactions: Transaction[] = [];
  isLoading = true;

  constructor(
    private dialogRef: MatDialogRef<PatternTransactionsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData
  ) {}

  ngOnInit() {
    this.loadTransactions();
  }

  async loadTransactions() {
    this.isLoading = true;
    try {
      // Use the dedicated endpoint that returns transactions for a pattern
      const response = await fetch(`${environment.apiUrl}/recurring/patterns/${this.data.pattern.id}`);
      const result = await response.json();

      if (result.transactions && Array.isArray(result.transactions)) {
        this.transactions = result.transactions
          .sort((a: Transaction, b: Transaction) => new Date(b.date).getTime() - new Date(a.date).getTime());
      } else {
        // Fallback: fetch all transactions and filter by IDs
        const allResponse = await fetch(`${environment.apiUrl}/transactions`);
        const allTransactions: Transaction[] = await allResponse.json();
        const patternTxIds = new Set(this.data.pattern.transactionIds || []);
        this.transactions = allTransactions
          .filter(tx => patternTxIds.has(tx.id))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
    this.isLoading = false;
  }

  getTotalSpent(): number {
    return this.transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  }

  close() {
    this.dialogRef.close();
  }
}
