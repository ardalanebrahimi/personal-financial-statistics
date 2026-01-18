/**
 * Matching Transaction Item Component
 *
 * A single transaction item in the matching list.
 */

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TransactionData } from '../../services/matching.service';

@Component({
  selector: 'app-matching-tx-item',
  standalone: true,
  imports: [CommonModule, MatCheckboxModule, MatIconModule, MatTooltipModule],
  template: `
    <div class="transaction-item"
         [class.selected]="isSelected"
         [class.has-suggestion]="hasSuggestion"
         [class.batch-selected]="isBatchSelected"
         [class.suggested]="isSuggested"
         (click)="itemClick.emit()">
      <mat-checkbox
        *ngIf="showCheckbox"
        [checked]="isChecked"
        (click)="$event.stopPropagation()"
        (change)="checkboxChange.emit($event.checked)"
        class="item-checkbox">
      </mat-checkbox>
      <div class="tx-main">
        <div class="tx-date">{{ transaction.date | date:'dd.MM.yy' }}</div>
        <div class="tx-desc" [matTooltip]="transaction.description">
          {{ transaction.description | slice:0:35 }}{{ transaction.description.length > 35 ? '...' : '' }}
        </div>
        <div class="tx-amount" [class.negative]="transaction.amount < 0">
          {{ transaction.amount | currency:'EUR':'symbol':'1.2-2' }}
        </div>
      </div>
      <div class="tx-suggestion" *ngIf="hasSuggestion && !showCheckboxOnly">
        <mat-icon>lightbulb</mat-icon>
        <span>Suggestion available</span>
      </div>
    </div>
  `,
  styles: [`
    .transaction-item {
      padding: 10px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .transaction-item:hover {
      background: #f5f5f5;
      border-color: #ccc;
    }

    .transaction-item.selected {
      background: #e3f2fd;
      border-color: #1976d2;
    }

    .transaction-item.has-suggestion {
      border-color: #ff9800;
    }

    .transaction-item.batch-selected {
      background: #e8f5e9;
      border-color: #4caf50;
    }

    .transaction-item.suggested {
      background: #fff3e0;
      border-color: #ff9800;
    }

    .item-checkbox {
      flex-shrink: 0;
    }

    .tx-main {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .tx-date {
      font-size: 12px;
      color: #666;
      min-width: 60px;
      flex-shrink: 0;
    }

    .tx-desc {
      flex: 1;
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tx-amount {
      font-size: 13px;
      font-weight: 600;
      font-family: 'Roboto Mono', monospace;
      min-width: 80px;
      text-align: right;
      flex-shrink: 0;
    }

    .tx-amount.negative {
      color: #d32f2f;
    }

    .tx-suggestion {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: #ff9800;
      flex-shrink: 0;
    }

    .tx-suggestion mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }
  `]
})
export class MatchingTxItemComponent {
  @Input() transaction!: TransactionData;
  @Input() isSelected = false;
  @Input() isChecked = false;
  @Input() hasSuggestion = false;
  @Input() isBatchSelected = false;
  @Input() isSuggested = false;
  @Input() showCheckbox = false;
  @Input() showCheckboxOnly = false;

  @Output() itemClick = new EventEmitter<void>();
  @Output() checkboxChange = new EventEmitter<boolean>();
}
