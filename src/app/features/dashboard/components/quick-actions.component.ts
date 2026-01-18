/**
 * Quick Actions Component
 *
 * Provides quick action buttons for common tasks.
 */

import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-quick-actions',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule
  ],
  template: `
    <mat-card class="quick-actions-card">
      <mat-card-content>
        <h3>Quick Actions</h3>
        <div class="actions-grid">
          <a mat-stroked-button routerLink="/transactions">
            <mat-icon>upload_file</mat-icon>
            Import Transactions
          </a>
          <a mat-stroked-button routerLink="/settings" [queryParams]="{tab: 'categories'}">
            <mat-icon>category</mat-icon>
            Manage Categories
          </a>
          <button mat-stroked-button (click)="exportData.emit()">
            <mat-icon>download</mat-icon>
            Export Data
          </button>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .quick-actions-card h3 {
      margin: 0 0 1rem;
    }

    .actions-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .actions-grid a, .actions-grid button {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  `]
})
export class QuickActionsComponent {
  @Output() exportData = new EventEmitter<void>();
}
