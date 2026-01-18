/**
 * Matching Link Summary Component
 *
 * Shows the link indicator and amount summary.
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TransactionData } from '../../services/matching.service';

@Component({
  selector: 'app-matching-link-summary',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="link-indicator">
      <mat-icon class="link-arrow" *ngIf="selectedBankTx && selectedCount > 0">link</mat-icon>
      <mat-icon class="link-arrow dimmed" *ngIf="!selectedBankTx || selectedCount === 0">link_off</mat-icon>

      <div class="link-summary" *ngIf="selectedBankTx">
        <div class="summary-row">
          <span class="label">Bank:</span>
          <span class="value">{{ selectedBankTx.amount | currency:'EUR':'symbol':'1.2-2' }}</span>
        </div>
        <div class="summary-row" *ngIf="selectedCount > 0">
          <span class="label">Selected:</span>
          <span class="value">{{ selectedTotal | currency:'EUR':'symbol':'1.2-2' }}</span>
        </div>
        <div class="summary-row match-status" *ngIf="selectedCount > 0"
             [class.match]="isMatch"
             [class.close-match]="isCloseMatch"
             [class.mismatch]="!isMatch && !isCloseMatch">
          <mat-icon *ngIf="isMatch">check_circle</mat-icon>
          <mat-icon *ngIf="isCloseMatch && !isMatch">warning</mat-icon>
          <mat-icon *ngIf="!isMatch && !isCloseMatch">error</mat-icon>
          <span *ngIf="isMatch">Match!</span>
          <span *ngIf="!isMatch">Diff: {{ difference | currency:'EUR':'symbol':'1.2-2' }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .link-indicator {
      width: 120px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: #f5f5f5;
    }

    .link-arrow {
      font-size: 36px;
      width: 36px;
      height: 36px;
      color: #4caf50;
    }

    .link-arrow.dimmed {
      color: #ccc;
    }

    .link-summary {
      margin-top: 16px;
      text-align: center;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      margin-bottom: 4px;
    }

    .summary-row .label {
      color: #666;
    }

    .summary-row .value {
      font-weight: 500;
      font-family: 'Roboto Mono', monospace;
    }

    .match-status {
      margin-top: 8px;
      padding: 4px 8px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }

    .match-status mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .match-status.match {
      background: #c8e6c9;
      color: #2e7d32;
    }

    .match-status.close-match {
      background: #fff9c4;
      color: #f9a825;
    }

    .match-status.mismatch {
      background: #ffcdd2;
      color: #c62828;
    }
  `]
})
export class MatchingLinkSummaryComponent {
  @Input() selectedBankTx: TransactionData | null = null;
  @Input() selectedTotal = 0;
  @Input() selectedCount = 0;
  @Input() isMatch = false;
  @Input() isCloseMatch = false;
  @Input() difference = 0;
}
