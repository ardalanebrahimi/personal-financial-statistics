/**
 * Pending Items Component
 *
 * Displays items requiring attention (uncategorized, unmatched).
 */

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-pending-items',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule
  ],
  template: `
    <mat-card class="pending-card">
      <mat-card-header>
        <mat-icon mat-card-avatar>pending_actions</mat-icon>
        <mat-card-title>Needs Attention</mat-card-title>
        <mat-card-subtitle>Items requiring action</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div class="pending-items">
          <a class="pending-item" routerLink="/transactions" [queryParams]="{filter: 'uncategorized'}">
            <mat-icon>label_off</mat-icon>
            <div class="pending-info">
              <span class="pending-count">{{ uncategorizedCount }}</span>
              <span class="pending-label">Uncategorized</span>
            </div>
            <mat-icon class="chevron">chevron_right</mat-icon>
          </a>
          <a class="pending-item" routerLink="/transactions" [queryParams]="{filter: 'unmatched'}">
            <mat-icon>link_off</mat-icon>
            <div class="pending-info">
              <span class="pending-count">{{ unmatchedCount }}</span>
              <span class="pending-label">Unmatched</span>
            </div>
            <mat-icon class="chevron">chevron_right</mat-icon>
          </a>
        </div>
      </mat-card-content>
      <mat-card-actions>
        <button mat-button color="primary" (click)="autoCategorize.emit()" [disabled]="isAutoCategorizing">
          <mat-icon>auto_fix_high</mat-icon>
          Auto-Categorize
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    .pending-items {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .pending-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: #fafafa;
      border-radius: 8px;
      text-decoration: none;
      color: inherit;
      transition: background 0.2s;
    }

    .pending-item:hover {
      background: #f0f0f0;
    }

    .pending-info {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .pending-count {
      font-size: 1.25rem;
      font-weight: 500;
    }

    .pending-label {
      font-size: 12px;
      color: #666;
    }

    .chevron {
      color: #ccc;
    }

    mat-card-actions {
      padding: 0.5rem 1rem !important;
    }

    mat-card-actions button {
      margin: 0 !important;
    }
  `]
})
export class PendingItemsComponent {
  @Input() uncategorizedCount = 0;
  @Input() unmatchedCount = 0;
  @Input() isAutoCategorizing = false;
  @Output() autoCategorize = new EventEmitter<void>();
}
