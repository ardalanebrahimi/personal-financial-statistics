/**
 * Import Result Component
 *
 * Displays the result of an import operation.
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { ImportResult } from '../../services/import.service';

@Component({
  selector: 'app-import-result',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatExpansionModule],
  template: `
    <div class="result-section" *ngIf="result">
      <div class="result-card" [class.success]="result.success" [class.error]="!result.success">
        <mat-icon *ngIf="result.success">check_circle</mat-icon>
        <mat-icon *ngIf="!result.success">error</mat-icon>
        <div class="result-content">
          <h4>{{ result.message }}</h4>
          <div class="stats">
            <span *ngIf="showNewTransactions">
              <strong>{{ result.stats.newTransactions }}</strong> {{ compact ? 'imported' : 'new transactions imported' }}
            </span>
            <span *ngIf="showDuplicates">
              <strong>{{ result.stats.duplicatesSkipped }}</strong> {{ compact ? 'skipped' : 'duplicates skipped' }}
            </span>
            <span *ngIf="showRecurring && result.stats.recurringTransactions !== undefined">
              <strong>{{ result.stats.recurringTransactions }}</strong> recurring detected
            </span>
            <span *ngIf="result.stats.errors > 0" class="errors">
              <strong>{{ result.stats.errors }}</strong> errors
            </span>
          </div>
        </div>
      </div>

      <!-- Error Details -->
      <mat-expansion-panel *ngIf="result.errors && result.errors.length > 0" class="error-panel">
        <mat-expansion-panel-header>
          <mat-panel-title>
            <mat-icon>warning</mat-icon>
            {{ result.errors.length }} parsing errors
          </mat-panel-title>
        </mat-expansion-panel-header>
        <ul>
          <li *ngFor="let error of result.errors.slice(0, 20)">{{ error }}</li>
          <li *ngIf="result.errors.length > 20">
            ... and {{ result.errors.length - 20 }} more
          </li>
        </ul>
      </mat-expansion-panel>
    </div>
  `,
  styles: [`
    .result-section {
      margin: 16px 0;
    }

    .result-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      border-radius: 8px;
    }

    .result-card.success {
      background: #e8f5e9;
    }

    .result-card.success mat-icon {
      color: #4caf50;
    }

    .result-card.error {
      background: #ffebee;
    }

    .result-card.error mat-icon {
      color: #f44336;
    }

    .result-card mat-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
    }

    .result-content h4 {
      margin: 0 0 8px;
    }

    .stats {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 13px;
      color: #666;
    }

    .stats .errors {
      color: #f44336;
    }

    .error-panel {
      margin-top: 12px;
    }

    .error-panel ul {
      margin: 0;
      padding-left: 20px;
      font-size: 12px;
      max-height: 150px;
      overflow-y: auto;
    }

    /* Compact mode for amazon sections */
    :host-context(.amazon-section) .result-card {
      padding: 12px;
    }

    :host-context(.amazon-section) .result-card mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    :host-context(.amazon-section) .result-content h4 {
      font-size: 13px;
      margin-bottom: 4px;
    }

    :host-context(.amazon-section) .stats {
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
    }
  `]
})
export class ImportResultComponent {
  @Input() result: ImportResult | null = null;
  @Input() showNewTransactions = true;
  @Input() showDuplicates = true;
  @Input() showRecurring = false;
  @Input() compact = false;
}
