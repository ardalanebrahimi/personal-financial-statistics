import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { Transaction, Category } from '../../core/models/transaction.model';

export interface SplitDialogData {
  transaction: Transaction;
  categories: Category[];
}

interface SplitItem {
  description: string;
  amount: number;
  category?: string;
}

@Component({
  selector: 'app-split-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatIconModule,
    MatSelectModule
  ],
  template: `
    <h2 mat-dialog-title>Split Transaction</h2>

    <mat-dialog-content>
      <div class="original-transaction">
        <h4>Original Transaction</h4>
        <div class="transaction-preview">
          <span class="date">{{ data.transaction.date | date:'dd.MM.yyyy' }}</span>
          <span class="description">{{ data.transaction.description }}</span>
          <span class="amount" [class.negative]="data.transaction.amount < 0">
            {{ data.transaction.amount | currency:'EUR' }}
          </span>
        </div>
      </div>

      <div class="splits-section">
        <h4>Split Into</h4>

        <div *ngFor="let split of splits; let i = index" class="split-item">
          <div class="split-row">
            <mat-form-field appearance="outline" class="description-field">
              <mat-label>Description</mat-label>
              <input matInput [(ngModel)]="split.description" placeholder="Split description">
            </mat-form-field>

            <mat-form-field appearance="outline" class="amount-field">
              <mat-label>Amount</mat-label>
              <input matInput type="number" [(ngModel)]="split.amount" step="0.01">
              <span matTextPrefix>€&nbsp;</span>
            </mat-form-field>

            <mat-form-field appearance="outline" class="category-field">
              <mat-label>Category</mat-label>
              <mat-select [(ngModel)]="split.category">
                <mat-option [value]="undefined">None</mat-option>
                <mat-option *ngFor="let cat of data.categories" [value]="cat.name">
                  {{ cat.name }}
                </mat-option>
              </mat-select>
            </mat-form-field>

            <button mat-icon-button
                    color="warn"
                    (click)="removeSplit(i)"
                    [disabled]="splits.length <= 2">
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        </div>

        <button mat-stroked-button (click)="addSplit()" class="add-button">
          <mat-icon>add</mat-icon>
          Add Split
        </button>
      </div>

      <div class="summary-section" [class.error]="!isBalanced">
        <div class="summary-row">
          <span>Original Amount:</span>
          <span class="amount">{{ data.transaction.amount | currency:'EUR' }}</span>
        </div>
        <div class="summary-row">
          <span>Split Total:</span>
          <span class="amount">{{ splitTotal | currency:'EUR' }}</span>
        </div>
        <div class="summary-row difference" *ngIf="!isBalanced">
          <span>Difference:</span>
          <span class="amount error">{{ difference | currency:'EUR' }}</span>
        </div>
        <div class="balance-hint" *ngIf="!isBalanced">
          The split amounts must equal the original transaction amount.
        </div>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-stroked-button (click)="distributeEvenly()">
        Distribute Evenly
      </button>
      <button mat-raised-button
              color="primary"
              [disabled]="!isBalanced || !isValid"
              (click)="split()">
        Split Transaction
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content {
      min-width: 550px;
    }

    .original-transaction {
      margin-bottom: 16px;
      padding: 12px;
      background: #fff3e0;
      border-radius: 8px;
    }

    .original-transaction h4 {
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

    .amount.error {
      color: #d32f2f;
    }

    .splits-section h4 {
      margin: 16px 0 12px;
      font-size: 14px;
    }

    .split-item {
      margin-bottom: 8px;
    }

    .split-row {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    .description-field {
      flex: 2;
    }

    .amount-field {
      width: 120px;
    }

    .category-field {
      flex: 1;
    }

    .add-button {
      margin-top: 8px;
    }

    .summary-section {
      margin-top: 16px;
      padding: 12px;
      background: #e8f5e9;
      border-radius: 8px;
    }

    .summary-section.error {
      background: #ffebee;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
    }

    .summary-row.difference {
      padding-top: 8px;
      margin-top: 8px;
      border-top: 1px solid #ffcdd2;
    }

    .balance-hint {
      margin-top: 8px;
      font-size: 12px;
      color: #c62828;
    }
  `]
})
export class SplitDialogComponent {
  splits: SplitItem[] = [];

  constructor(
    public dialogRef: MatDialogRef<SplitDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SplitDialogData
  ) {
    // Initialize with two splits
    const halfAmount = Math.round((data.transaction.amount / 2) * 100) / 100;
    this.splits = [
      {
        description: data.transaction.description,
        amount: halfAmount,
        category: data.transaction.category
      },
      {
        description: data.transaction.description,
        amount: data.transaction.amount - halfAmount,
        category: data.transaction.category
      }
    ];
  }

  get splitTotal(): number {
    return this.splits.reduce((sum, s) => sum + (s.amount || 0), 0);
  }

  get difference(): number {
    return Math.round((this.splitTotal - this.data.transaction.amount) * 100) / 100;
  }

  get isBalanced(): boolean {
    return Math.abs(this.difference) < 0.01;
  }

  get isValid(): boolean {
    return this.splits.every(s => s.description && s.amount !== undefined);
  }

  addSplit() {
    this.splits.push({
      description: this.data.transaction.description,
      amount: 0,
      category: undefined
    });
  }

  removeSplit(index: number) {
    if (this.splits.length > 2) {
      this.splits.splice(index, 1);
    }
  }

  distributeEvenly() {
    const count = this.splits.length;
    const baseAmount = Math.floor((this.data.transaction.amount / count) * 100) / 100;
    const remainder = Math.round((this.data.transaction.amount - baseAmount * count) * 100) / 100;

    this.splits.forEach((split, i) => {
      split.amount = i === 0 ? baseAmount + remainder : baseAmount;
    });
  }

  split() {
    this.dialogRef.close({
      originalTransaction: this.data.transaction,
      splits: this.splits
    });
  }
}
