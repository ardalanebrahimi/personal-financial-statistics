import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';

interface DuplicateTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  beneficiary?: string;
  source?: string;
  category?: string;
  linkedOrderIds?: string[];
}

interface DuplicateGroup {
  key: string;
  transactions: DuplicateTransaction[];
}

export interface DuplicatesDialogData {
  groups: DuplicateGroup[];
  totalDuplicates: number;
}

export interface DuplicatesDialogResult {
  removedIds: string[];
}

@Component({
  selector: 'app-duplicates-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    MatTooltipModule,
    MatProgressBarModule
  ],
  template: `
    <div class="duplicates-dialog">
      <div class="dialog-header">
        <h2 mat-dialog-title>
          <mat-icon>content_copy</mat-icon>
          Duplicate Transactions
        </h2>
        <button mat-icon-button (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-dialog-content>
        <div *ngIf="data.groups.length === 0" class="no-duplicates">
          <mat-icon>check_circle</mat-icon>
          <h3>No duplicates found!</h3>
          <p>Your transactions are clean.</p>
        </div>

        <div *ngIf="data.groups.length > 0" class="summary">
          <p>Found <strong>{{ data.totalDuplicates }}</strong> potential duplicates in <strong>{{ data.groups.length }}</strong> groups.</p>
          <p class="hint">For each group, select which transaction(s) to <span class="remove">remove</span>. The one you keep should have the most complete information.</p>
        </div>

        <div *ngIf="isProcessing" class="processing">
          <mat-progress-bar mode="indeterminate"></mat-progress-bar>
          <span>Removing duplicates...</span>
        </div>

        <div class="groups-list">
          <div *ngFor="let group of data.groups; let i = index" class="duplicate-group">
            <div class="group-header">
              <span class="group-number">Group {{ i + 1 }}</span>
              <span class="group-key">{{ formatKey(group.key) }}</span>
              <span class="group-count">{{ group.transactions.length }} items</span>
            </div>

            <div class="transactions-list">
              <div *ngFor="let tx of group.transactions"
                   class="transaction-item"
                   [class.marked-for-removal]="isMarkedForRemoval(tx.id)"
                   [class.kept]="!isMarkedForRemoval(tx.id)">
                <div class="tx-main">
                  <div class="tx-info">
                    <div class="tx-date">{{ tx.date | date:'dd.MM.yy' }}</div>
                    <div class="tx-description" [matTooltip]="tx.description">
                      {{ tx.description | slice:0:60 }}{{ tx.description.length > 60 ? '...' : '' }}
                    </div>
                    <div class="tx-beneficiary" *ngIf="tx.beneficiary">
                      <mat-icon class="small-icon">person</mat-icon>
                      {{ tx.beneficiary | slice:0:30 }}
                    </div>
                  </div>
                  <div class="tx-meta">
                    <div class="tx-amount" [class.negative]="tx.amount < 0" [class.positive]="tx.amount > 0">
                      {{ tx.amount | currency:'EUR':'symbol':'1.2-2' }}
                    </div>
                    <mat-chip *ngIf="tx.category" class="category-chip">{{ tx.category }}</mat-chip>
                    <mat-chip *ngIf="tx.source" class="source-chip">{{ tx.source }}</mat-chip>
                    <mat-chip *ngIf="tx.linkedOrderIds?.length" class="linked-chip">
                      <mat-icon class="small-icon">link</mat-icon>
                      {{ tx.linkedOrderIds?.length }} linked
                    </mat-chip>
                  </div>
                </div>
                <div class="tx-actions">
                  <button mat-stroked-button
                          *ngIf="!isMarkedForRemoval(tx.id)"
                          color="warn"
                          (click)="markForRemoval(tx.id)"
                          matTooltip="Mark for removal">
                    <mat-icon>delete</mat-icon>
                    Remove
                  </button>
                  <button mat-stroked-button
                          *ngIf="isMarkedForRemoval(tx.id)"
                          color="primary"
                          (click)="unmarkForRemoval(tx.id)"
                          matTooltip="Keep this transaction">
                    <mat-icon>undo</mat-icon>
                    Keep
                  </button>
                </div>
              </div>
            </div>

            <mat-divider *ngIf="i < data.groups.length - 1"></mat-divider>
          </div>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end" *ngIf="data.groups.length > 0">
        <span class="removal-count" *ngIf="markedForRemoval.size > 0">
          {{ markedForRemoval.size }} transaction(s) marked for removal
        </span>
        <button mat-button (click)="close()">Cancel</button>
        <button mat-raised-button
                color="warn"
                [disabled]="markedForRemoval.size === 0 || isProcessing"
                (click)="removeMarked()">
          <mat-icon>delete_sweep</mat-icon>
          Remove Selected ({{ markedForRemoval.size }})
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .duplicates-dialog {
      min-width: 800px;
      max-width: 1000px;
      width: 95vw;
    }

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px 0;
    }

    .dialog-header h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
    }

    .no-duplicates {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px;
      color: #4caf50;
    }

    .no-duplicates mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
    }

    .summary {
      padding: 16px;
      background: #fff3e0;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .summary p {
      margin: 0;
    }

    .summary .hint {
      font-size: 13px;
      color: #666;
      margin-top: 8px;
    }

    .summary .remove {
      color: #d32f2f;
      font-weight: 500;
    }

    .processing {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: #e3f2fd;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .processing mat-progress-bar {
      flex: 1;
    }

    mat-dialog-content {
      max-height: 60vh;
      padding: 0 24px;
    }

    .groups-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .duplicate-group {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
    }

    .group-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: #f5f5f5;
      border-bottom: 1px solid #e0e0e0;
    }

    .group-number {
      font-weight: 600;
      color: #1976d2;
    }

    .group-key {
      font-size: 12px;
      color: #666;
      font-family: monospace;
    }

    .group-count {
      margin-left: auto;
      font-size: 12px;
      background: #e0e0e0;
      padding: 2px 8px;
      border-radius: 12px;
    }

    .transactions-list {
      padding: 8px;
    }

    .transaction-item {
      display: flex;
      align-items: center;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 8px;
      background: #fafafa;
      transition: all 0.2s;
      gap: 12px;
    }

    .transaction-item:last-child {
      margin-bottom: 0;
    }

    .transaction-item.kept {
      background: #e8f5e9;
      border-left: 4px solid #4caf50;
    }

    .transaction-item.marked-for-removal {
      background: #ffebee;
      border-left: 4px solid #d32f2f;
      opacity: 0.7;
    }

    .tx-main {
      display: flex;
      flex: 1;
      gap: 16px;
      align-items: center;
      min-width: 0;
      overflow: hidden;
    }

    .tx-info {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }

    .tx-date {
      font-size: 12px;
      color: #666;
    }

    .tx-description {
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tx-beneficiary {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: #666;
      margin-top: 4px;
    }

    .tx-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
      flex-wrap: wrap;
      justify-content: flex-end;
      max-width: 280px;
    }

    .tx-amount {
      font-weight: 600;
      font-family: 'Roboto Mono', monospace;
      min-width: 100px;
      text-align: right;
    }

    .tx-amount.negative {
      color: #d32f2f;
    }

    .tx-amount.positive {
      color: #388e3c;
    }

    .small-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .category-chip, .source-chip, .linked-chip {
      font-size: 11px;
      min-height: 22px;
      padding: 0 8px;
    }

    .source-chip {
      background: #e3f2fd !important;
    }

    .linked-chip {
      background: #e8f5e9 !important;
    }

    .tx-actions {
      flex-shrink: 0;
    }

    mat-dialog-actions {
      padding: 16px 24px;
      gap: 8px;
    }

    .removal-count {
      margin-right: auto;
      color: #d32f2f;
      font-weight: 500;
    }
  `]
})
export class DuplicatesDialogComponent {
  markedForRemoval = new Set<string>();
  isProcessing = false;

  constructor(
    public dialogRef: MatDialogRef<DuplicatesDialogComponent, DuplicatesDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: DuplicatesDialogData
  ) {}

  formatKey(key: string): string {
    // Format the key for display
    const parts = key.split(':');
    if (parts[0] === 'amazon') {
      return `Amazon order ${parts[2]} on ${parts[1]}`;
    }
    return `${parts[1]} | ${parts[2]}`;
  }

  isMarkedForRemoval(id: string): boolean {
    return this.markedForRemoval.has(id);
  }

  markForRemoval(id: string) {
    this.markedForRemoval.add(id);
  }

  unmarkForRemoval(id: string) {
    this.markedForRemoval.delete(id);
  }

  async removeMarked() {
    if (this.markedForRemoval.size === 0) return;

    this.isProcessing = true;
    const removedIds: string[] = [];

    for (const id of this.markedForRemoval) {
      try {
        await fetch(`http://localhost:3000/transactions/remove-duplicate/${id}`, {
          method: 'POST'
        });
        removedIds.push(id);
      } catch (error) {
        console.error(`Failed to remove transaction ${id}:`, error);
      }
    }

    this.isProcessing = false;
    this.dialogRef.close({ removedIds });
  }

  close() {
    this.dialogRef.close();
  }
}
