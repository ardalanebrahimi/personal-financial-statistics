/**
 * Transaction Toolbar Component
 *
 * Toolbar with import, categorize, export, and maintenance actions.
 */

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CategorizationProgressComponent } from '../../../../shared/categorization-progress/categorization-progress.component';

@Component({
  selector: 'app-transaction-toolbar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatDividerModule,
    MatButtonToggleModule,
    MatTooltipModule,
    CategorizationProgressComponent
  ],
  template: `
    <div class="toolbar">
      <div class="toolbar-left">
        <h1>Transactions</h1>
        <span class="transaction-count">{{ filteredCount }} of {{ totalCount }}</span>
      </div>
      <div class="toolbar-center">
        <mat-button-toggle-group [(ngModel)]="viewMode" (ngModelChange)="viewModeChange.emit($event)" class="view-toggle">
          <mat-button-toggle value="cards" matTooltip="Card View">
            <mat-icon>view_agenda</mat-icon>
          </mat-button-toggle>
          <mat-button-toggle value="compact" matTooltip="Compact View">
            <mat-icon>view_list</mat-icon>
          </mat-button-toggle>
        </mat-button-toggle-group>
      </div>
      <div class="toolbar-right">
        <button mat-raised-button color="primary" [matMenuTriggerFor]="importMenu">
          <mat-icon>cloud_upload</mat-icon>
          Import
        </button>
        <mat-menu #importMenu>
          <button mat-menu-item (click)="importClick.emit('csv')">
            <mat-icon>description</mat-icon>
            <span>Bank Statement (CSV)</span>
          </button>
          <button mat-menu-item (click)="importClick.emit('amazon')">
            <mat-icon>shopping_cart</mat-icon>
            <span>Amazon Orders</span>
          </button>
          <button mat-menu-item (click)="importClick.emit('paypal')">
            <mat-icon>account_balance_wallet</mat-icon>
            <span>PayPal Transactions</span>
          </button>
        </mat-menu>
        <button mat-button (click)="toggleFiltersClick.emit()">
          <mat-icon>filter_list</mat-icon>
          Filters
        </button>
        <button mat-button (click)="runMatchingClick.emit()" [disabled]="isMatching">
          <mat-icon>link</mat-icon>
          Run Matching
        </button>
        <button mat-button (click)="matchingOverviewClick.emit()">
          <mat-icon>dashboard</mat-icon>
          Matching Overview
        </button>
        <button mat-raised-button color="accent" [matMenuTriggerFor]="categorizeMenu" [disabled]="isCategorizing">
          <mat-icon>auto_fix_high</mat-icon>
          Categorize
        </button>
        <mat-menu #categorizeMenu>
          <button mat-menu-item (click)="categorizeClick.emit('selected')" [disabled]="selectedCount === 0">
            <mat-icon>check_box</mat-icon>
            <span>Selected ({{ selectedCount }})</span>
          </button>
          <button mat-menu-item (click)="categorizeClick.emit('uncategorized')">
            <mat-icon>help_outline</mat-icon>
            <span>All Uncategorized ({{ uncategorizedCount }})</span>
          </button>
          <button mat-menu-item (click)="categorizeClick.emit('filtered')">
            <mat-icon>filter_list</mat-icon>
            <span>All Filtered ({{ filteredCount }})</span>
          </button>
          <mat-divider></mat-divider>
          <button mat-menu-item (click)="viewProgressClick.emit()">
            <mat-icon>visibility</mat-icon>
            <span>View Progress</span>
          </button>
        </mat-menu>
        <app-categorization-progress (openDialog)="viewProgressClick.emit()"></app-categorization-progress>
        <button mat-button (click)="exportClick.emit()">
          <mat-icon>download</mat-icon>
          Export
        </button>
        <button mat-button [matMenuTriggerFor]="maintenanceMenu">
          <mat-icon>build</mat-icon>
          Maintenance
        </button>
        <mat-menu #maintenanceMenu>
          <button mat-menu-item (click)="maintenanceClick.emit('cleanup')">
            <mat-icon>cleaning_services</mat-icon>
            <span>Remove Generic Categories</span>
          </button>
          <button mat-menu-item (click)="maintenanceClick.emit('find-duplicates')">
            <mat-icon>content_copy</mat-icon>
            <span>Find Duplicates</span>
          </button>
          <button mat-menu-item (click)="maintenanceClick.emit('remove-duplicates')">
            <mat-icon>delete_sweep</mat-icon>
            <span>Remove Duplicates</span>
          </button>
        </mat-menu>
      </div>
    </div>
  `,
  styles: [`
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 24px;
      background: white;
      border-bottom: 1px solid #e0e0e0;
    }

    .toolbar-left {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }

    .toolbar-left h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 500;
    }

    .transaction-count {
      color: #666;
      font-size: 14px;
    }

    .toolbar-center {
      display: flex;
      gap: 8px;
    }

    .toolbar-right {
      display: flex;
      gap: 8px;
    }

    .view-toggle {
      border: none;
    }
  `]
})
export class TransactionToolbarComponent {
  @Input() totalCount = 0;
  @Input() filteredCount = 0;
  @Input() selectedCount = 0;
  @Input() uncategorizedCount = 0;
  @Input() viewMode: 'cards' | 'compact' = 'cards';
  @Input() isMatching = false;
  @Input() isCategorizing = false;

  @Output() viewModeChange = new EventEmitter<'cards' | 'compact'>();
  @Output() toggleFiltersClick = new EventEmitter<void>();
  @Output() importClick = new EventEmitter<'csv' | 'amazon' | 'paypal'>();
  @Output() runMatchingClick = new EventEmitter<void>();
  @Output() matchingOverviewClick = new EventEmitter<void>();
  @Output() categorizeClick = new EventEmitter<'selected' | 'uncategorized' | 'filtered'>();
  @Output() viewProgressClick = new EventEmitter<void>();
  @Output() exportClick = new EventEmitter<void>();
  @Output() maintenanceClick = new EventEmitter<'cleanup' | 'find-duplicates' | 'remove-duplicates'>();
}
