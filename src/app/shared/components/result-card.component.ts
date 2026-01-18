/**
 * Result Card Component
 *
 * Displays operation results with success/warning/error states.
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

export type ResultStatus = 'success' | 'warning' | 'error' | 'info';

export interface ResultItem {
  label: string;
  value: string | number;
  icon?: string;
}

@Component({
  selector: 'app-result-card',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule],
  template: `
    <mat-card class="result-card" [class]="status">
      <div class="result-header">
        <mat-icon class="status-icon">{{ statusIcon }}</mat-icon>
        <span class="title">{{ title }}</span>
      </div>

      <div class="result-message" *ngIf="message">
        {{ message }}
      </div>

      <div class="result-items" *ngIf="items.length > 0">
        <div class="result-item" *ngFor="let item of items">
          <mat-icon *ngIf="item.icon">{{ item.icon }}</mat-icon>
          <span class="item-label">{{ item.label }}</span>
          <span class="item-value">{{ item.value }}</span>
        </div>
      </div>

      <ng-content></ng-content>
    </mat-card>
  `,
  styles: [`
    .result-card {
      padding: 16px;
    }

    .result-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .status-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .title {
      font-size: 16px;
      font-weight: 500;
    }

    .result-message {
      color: #666;
      margin-bottom: 12px;
    }

    .result-items {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .result-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      background: rgba(0, 0, 0, 0.03);
      border-radius: 4px;
    }

    .result-item mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #666;
    }

    .item-label {
      flex: 1;
    }

    .item-value {
      font-weight: 500;
    }

    /* Status variants */
    .result-card.success {
      border-left: 4px solid #4caf50;
    }
    .result-card.success .status-icon {
      color: #4caf50;
    }

    .result-card.warning {
      border-left: 4px solid #ff9800;
    }
    .result-card.warning .status-icon {
      color: #ff9800;
    }

    .result-card.error {
      border-left: 4px solid #f44336;
    }
    .result-card.error .status-icon {
      color: #f44336;
    }

    .result-card.info {
      border-left: 4px solid #2196f3;
    }
    .result-card.info .status-icon {
      color: #2196f3;
    }
  `]
})
export class ResultCardComponent {
  @Input() title = '';
  @Input() message?: string;
  @Input() status: ResultStatus = 'info';
  @Input() items: ResultItem[] = [];

  get statusIcon(): string {
    const icons: Record<ResultStatus, string> = {
      success: 'check_circle',
      warning: 'warning',
      error: 'error',
      info: 'info'
    };
    return icons[this.status];
  }
}
