/**
 * Summary Bar Component
 *
 * Displays total, income, expense, and selected totals.
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-summary-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="summary-bar">
      <div class="summary-item">
        <span class="label">Total</span>
        <span class="value" [class.negative]="totalAmount < 0" [class.positive]="totalAmount > 0">
          {{ totalAmount | currency:'EUR':'symbol':'1.2-2' }}
        </span>
      </div>
      <div class="summary-item">
        <span class="label">Income</span>
        <span class="value positive">{{ incomeTotal | currency:'EUR':'symbol':'1.2-2' }}</span>
      </div>
      <div class="summary-item">
        <span class="label">Expenses</span>
        <span class="value negative">{{ expenseTotal | currency:'EUR':'symbol':'1.2-2' }}</span>
      </div>
      <div class="summary-item" *ngIf="selectedCount > 0">
        <span class="label">Selected ({{ selectedCount }})</span>
        <span class="value">{{ selectedTotal | currency:'EUR':'symbol':'1.2-2' }}</span>
      </div>
    </div>
  `,
  styles: [`
    .summary-bar {
      display: flex;
      gap: 32px;
      padding: 12px 24px;
      background: #fafafa;
      border-bottom: 1px solid #e0e0e0;
    }

    .summary-item {
      display: flex;
      flex-direction: column;
    }

    .summary-item .label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
    }

    .summary-item .value {
      font-size: 18px;
      font-weight: 600;
      font-family: 'Roboto Mono', monospace;
    }

    .summary-item .value.negative {
      color: #d32f2f;
    }

    .summary-item .value.positive {
      color: #388e3c;
    }
  `]
})
export class SummaryBarComponent {
  @Input() totalAmount = 0;
  @Input() incomeTotal = 0;
  @Input() expenseTotal = 0;
  @Input() selectedTotal = 0;
  @Input() selectedCount = 0;
}
