import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Transaction, Category } from '../../core/models/transaction.model';

export interface TransactionDetailDialogData {
  transaction: Transaction;
  categories: Category[];
  linkedTransactions?: Transaction[];
}

export interface TransactionDetailDialogResult {
  action: 'save' | 'delete' | 'split' | 'merge' | 'askAI' | 'cancel';
  transaction?: Transaction;
}

@Component({
  selector: 'app-transaction-detail-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatSlideToggleModule,
    MatDividerModule,
    MatTooltipModule
  ],
  template: `
    <div class="transaction-detail-dialog">
      <div class="dialog-header">
        <h2 mat-dialog-title>Transaction Details</h2>
        <button mat-icon-button (click)="close('cancel')" class="close-button">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-dialog-content>
        <!-- Amount & Date Header -->
        <div class="transaction-header">
          <div class="amount" [class.positive]="transaction.amount > 0" [class.negative]="transaction.amount < 0">
            {{ transaction.amount | currency:'EUR':'symbol':'1.2-2' }}
          </div>
          <div class="date">{{ transaction.date | date:'fullDate' }}</div>
        </div>

        <mat-divider></mat-divider>

        <!-- Main Fields -->
        <div class="fields-section">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Description</mat-label>
            <textarea matInput [(ngModel)]="transaction.description" rows="2"></textarea>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Beneficiary / Payer</mat-label>
            <input matInput [(ngModel)]="transaction.beneficiary">
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Category</mat-label>
            <mat-select [(ngModel)]="transaction.category">
              <mat-option [value]="''">-- None --</mat-option>
              <mat-option *ngFor="let cat of data.categories" [value]="cat.name">
                <span class="category-option">
                  <span class="color-dot" [style.background-color]="cat.color"></span>
                  {{ cat.name }}
                </span>
              </mat-option>
            </mat-select>
          </mat-form-field>

          <div class="toggle-row">
            <mat-slide-toggle [(ngModel)]="transaction.excludeFromStats">
              Exclude from statistics
            </mat-slide-toggle>
            <mat-icon matTooltip="When enabled, this transaction won't be counted in spending reports">info_outline</mat-icon>
          </div>
        </div>

        <mat-divider></mat-divider>

        <!-- Source Information -->
        <div class="source-section" *ngIf="transaction.source">
          <h3>Source Information</h3>
          <div class="source-info">
            <div class="info-row">
              <span class="label">Imported from:</span>
              <span class="value">{{ transaction.source.connectorType | titlecase }}</span>
            </div>
            <div class="info-row" *ngIf="transaction.source.importedAt">
              <span class="label">Imported on:</span>
              <span class="value">{{ transaction.source.importedAt | date:'medium' }}</span>
            </div>
            <div class="info-row" *ngIf="transaction.source.externalId">
              <span class="label">External ID:</span>
              <span class="value mono">{{ transaction.source.externalId }}</span>
            </div>
          </div>
        </div>

        <!-- Linked Transactions -->
        <div class="linked-section" *ngIf="data.linkedTransactions?.length">
          <mat-divider></mat-divider>
          <h3>Linked Transactions ({{ data.linkedTransactions?.length }})</h3>
          <div class="linked-list">
            <div class="linked-item" *ngFor="let linked of data.linkedTransactions">
              <div class="linked-info">
                <span class="linked-date">{{ linked.date | date:'shortDate' }}</span>
                <span class="linked-desc">{{ linked.description | slice:0:40 }}{{ linked.description.length > 40 ? '...' : '' }}</span>
              </div>
              <span class="linked-amount" [class.positive]="linked.amount > 0" [class.negative]="linked.amount < 0">
                {{ linked.amount | currency:'EUR':'symbol':'1.2-2' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Merge/Split Info -->
        <div class="history-section" *ngIf="transaction.mergedFrom?.length || transaction.splitFrom">
          <mat-divider></mat-divider>
          <h3>History</h3>
          <div class="history-info" *ngIf="transaction.mergedFrom?.length">
            <mat-icon>merge</mat-icon>
            <span>Merged from {{ transaction.mergedFrom?.length }} transactions</span>
          </div>
          <div class="history-info" *ngIf="transaction.splitFrom">
            <mat-icon>call_split</mat-icon>
            <span>Split from another transaction</span>
          </div>
        </div>

        <!-- Transaction ID (footer) -->
        <div class="id-section">
          <span class="id-label">ID:</span>
          <span class="id-value mono">{{ transaction.id }}</span>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <div class="action-buttons-left">
          <button mat-button color="warn" (click)="close('delete')" matTooltip="Delete this transaction">
            <mat-icon>delete</mat-icon>
            Delete
          </button>
        </div>
        <div class="action-buttons-right">
          <button mat-button (click)="close('split')" matTooltip="Split into multiple transactions">
            <mat-icon>call_split</mat-icon>
            Split
          </button>
          <button mat-button (click)="close('merge')" matTooltip="Merge with another transaction">
            <mat-icon>merge</mat-icon>
            Merge
          </button>
          <button mat-stroked-button color="primary" (click)="close('askAI')" matTooltip="Ask AI about this transaction">
            <mat-icon>smart_toy</mat-icon>
            Ask AI
          </button>
          <button mat-raised-button color="primary" (click)="close('save')">
            <mat-icon>save</mat-icon>
            Save
          </button>
        </div>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .transaction-detail-dialog {
      min-width: 500px;
      max-width: 600px;
    }

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px 0;
    }

    .dialog-header h2 {
      margin: 0;
    }

    .close-button {
      margin: -8px -8px 0 0;
    }

    .transaction-header {
      text-align: center;
      padding: 16px 0;
    }

    .amount {
      font-size: 2rem;
      font-weight: 500;
    }

    .amount.positive {
      color: #4caf50;
    }

    .amount.negative {
      color: #f44336;
    }

    .date {
      color: #666;
      margin-top: 4px;
    }

    mat-dialog-content {
      padding: 0 24px;
      max-height: 60vh;
    }

    mat-divider {
      margin: 16px 0;
    }

    .fields-section {
      padding: 8px 0;
    }

    .full-width {
      width: 100%;
    }

    .toggle-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 8px 0;
    }

    .toggle-row mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #666;
      cursor: help;
    }

    .source-section, .linked-section, .history-section {
      padding: 8px 0;
    }

    .source-section h3, .linked-section h3, .history-section h3 {
      font-size: 14px;
      font-weight: 500;
      color: #666;
      margin: 0 0 12px 0;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
    }

    .info-row .label {
      color: #666;
    }

    .info-row .value {
      font-weight: 500;
    }

    .mono {
      font-family: monospace;
      font-size: 12px;
    }

    .linked-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .linked-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #f5f5f5;
      border-radius: 4px;
    }

    .linked-info {
      display: flex;
      gap: 12px;
    }

    .linked-date {
      color: #666;
      white-space: nowrap;
    }

    .linked-desc {
      color: #333;
    }

    .linked-amount {
      font-weight: 500;
      white-space: nowrap;
    }

    .linked-amount.positive {
      color: #4caf50;
    }

    .linked-amount.negative {
      color: #f44336;
    }

    .history-info {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #666;
    }

    .history-info mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .id-section {
      margin-top: 16px;
      padding: 8px 0;
      font-size: 11px;
      color: #999;
    }

    .id-label {
      margin-right: 4px;
    }

    .category-option {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .color-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }

    mat-dialog-actions {
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
    }

    .action-buttons-left {
      display: flex;
      gap: 8px;
    }

    .action-buttons-right {
      display: flex;
      gap: 8px;
    }
  `]
})
export class TransactionDetailDialogComponent {
  transaction: Transaction;

  constructor(
    public dialogRef: MatDialogRef<TransactionDetailDialogComponent, TransactionDetailDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: TransactionDetailDialogData
  ) {
    // Create a copy to allow editing without affecting original until save
    this.transaction = { ...data.transaction };
  }

  close(action: TransactionDetailDialogResult['action']) {
    this.dialogRef.close({
      action,
      transaction: action === 'save' ? this.transaction : this.data.transaction
    });
  }
}
