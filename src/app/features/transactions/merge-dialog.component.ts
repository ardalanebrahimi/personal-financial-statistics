import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Transaction } from '../../core/models/transaction.model';

export interface MergeDialogData {
  sourceTransaction: Transaction;
  transactions: Transaction[];
}

@Component({
  selector: 'app-merge-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatIconModule,
    MatListModule,
    MatCheckboxModule
  ],
  template: `
    <h2 mat-dialog-title>Merge Transactions</h2>

    <mat-dialog-content>
      <div class="source-transaction">
        <h4>Source Transaction</h4>
        <div class="transaction-preview">
          <span class="date">{{ data.sourceTransaction.date | date:'dd.MM.yyyy' }}</span>
          <span class="description">{{ data.sourceTransaction.description }}</span>
          <span class="amount">{{ data.sourceTransaction.amount | currency:'EUR' }}</span>
        </div>
      </div>

      <div class="search-section">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Search transactions to merge</mat-label>
          <input matInput [(ngModel)]="searchTerm" placeholder="Search by description...">
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>
      </div>

      <div class="candidates-section">
        <h4>Select transactions to merge ({{ selectedCount }} selected)</h4>
        <div class="candidates-list">
          <div *ngFor="let tx of filteredTransactions"
               class="candidate-item"
               [class.selected]="isSelected(tx)"
               (click)="toggleSelection(tx)">
            <mat-checkbox [checked]="isSelected(tx)" (click)="$event.stopPropagation()"></mat-checkbox>
            <span class="date">{{ tx.date | date:'dd.MM.yy' }}</span>
            <span class="description">{{ tx.description }}</span>
            <span class="amount" [class.negative]="tx.amount < 0">{{ tx.amount | currency:'EUR' }}</span>
          </div>
        </div>
      </div>

      <div class="result-section" *ngIf="selectedCount > 0">
        <h4>Result</h4>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Merged Description</mat-label>
          <input matInput [(ngModel)]="mergedDescription">
        </mat-form-field>
        <div class="result-summary">
          <span>Total Amount:</span>
          <span class="amount" [class.negative]="mergedAmount < 0">{{ mergedAmount | currency:'EUR' }}</span>
        </div>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button
              color="primary"
              [disabled]="selectedCount === 0"
              (click)="merge()">
        Merge {{ selectedCount + 1 }} Transactions
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content {
      min-width: 500px;
    }

    .source-transaction {
      margin-bottom: 16px;
      padding: 12px;
      background: #e3f2fd;
      border-radius: 8px;
    }

    .source-transaction h4 {
      margin: 0 0 8px;
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
    }

    .transaction-preview {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .date {
      color: #666;
      font-size: 13px;
      min-width: 80px;
    }

    .description {
      flex: 1;
      font-weight: 500;
    }

    .amount {
      font-weight: 600;
      font-family: 'Roboto Mono', monospace;
    }

    .amount.negative {
      color: #d32f2f;
    }

    .full-width {
      width: 100%;
    }

    .candidates-section h4 {
      margin: 16px 0 8px;
      font-size: 14px;
    }

    .candidates-list {
      max-height: 250px;
      overflow-y: auto;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
    }

    .candidate-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .candidate-item:hover {
      background: #f5f5f5;
    }

    .candidate-item.selected {
      background: #e8f5e9;
    }

    .candidate-item:not(:last-child) {
      border-bottom: 1px solid #e0e0e0;
    }

    .result-section {
      margin-top: 16px;
      padding: 12px;
      background: #f5f5f5;
      border-radius: 8px;
    }

    .result-section h4 {
      margin: 0 0 12px;
      font-size: 14px;
    }

    .result-summary {
      display: flex;
      justify-content: space-between;
      margin-top: 12px;
      font-size: 16px;
    }
  `]
})
export class MergeDialogComponent {
  searchTerm = '';
  selectedIds = new Set<string>();
  mergedDescription = '';

  constructor(
    public dialogRef: MatDialogRef<MergeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MergeDialogData
  ) {
    this.mergedDescription = data.sourceTransaction.description;
  }

  get filteredTransactions(): Transaction[] {
    if (!this.searchTerm) {
      return this.data.transactions.slice(0, 20);
    }
    const term = this.searchTerm.toLowerCase();
    return this.data.transactions.filter(tx =>
      tx.description.toLowerCase().includes(term)
    ).slice(0, 20);
  }

  get selectedCount(): number {
    return this.selectedIds.size;
  }

  get mergedAmount(): number {
    let total = this.data.sourceTransaction.amount;
    this.data.transactions.forEach(tx => {
      if (this.selectedIds.has(tx.id)) {
        total += tx.amount;
      }
    });
    return total;
  }

  isSelected(tx: Transaction): boolean {
    return this.selectedIds.has(tx.id);
  }

  toggleSelection(tx: Transaction) {
    if (this.selectedIds.has(tx.id)) {
      this.selectedIds.delete(tx.id);
    } else {
      this.selectedIds.add(tx.id);
    }
  }

  merge() {
    const selectedTransactions = this.data.transactions.filter(tx =>
      this.selectedIds.has(tx.id)
    );

    this.dialogRef.close({
      sourceTransaction: this.data.sourceTransaction,
      mergeWith: selectedTransactions,
      description: this.mergedDescription,
      amount: this.mergedAmount
    });
  }
}
