/**
 * Stats Card Component
 *
 * Reusable card for displaying statistics.
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-stats-card',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule],
  template: `
    <mat-card class="stats-card" [class]="colorClass">
      <div class="card-content">
        <div class="icon-wrapper" *ngIf="icon">
          <mat-icon>{{ icon }}</mat-icon>
        </div>
        <div class="stats-info">
          <span class="label">{{ label }}</span>
          <span class="value">{{ formattedValue }}</span>
          <span class="subtitle" *ngIf="subtitle">{{ subtitle }}</span>
        </div>
      </div>
      <div class="trend" *ngIf="trend !== undefined">
        <mat-icon [class.positive]="trend > 0" [class.negative]="trend < 0">
          {{ trend > 0 ? 'trending_up' : trend < 0 ? 'trending_down' : 'trending_flat' }}
        </mat-icon>
        <span [class.positive]="trend > 0" [class.negative]="trend < 0">
          {{ trend > 0 ? '+' : '' }}{{ trend }}%
        </span>
      </div>
    </mat-card>
  `,
  styles: [`
    .stats-card {
      padding: 16px;
      height: 100%;
    }

    .card-content {
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }

    .icon-wrapper {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f5f5f5;
    }

    .icon-wrapper mat-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .stats-info {
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .label {
      font-size: 14px;
      color: #666;
      margin-bottom: 4px;
    }

    .value {
      font-size: 24px;
      font-weight: 600;
      color: #333;
    }

    .subtitle {
      font-size: 12px;
      color: #999;
      margin-top: 4px;
    }

    .trend {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 12px;
      font-size: 14px;
    }

    .trend mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .positive {
      color: #4caf50;
    }

    .negative {
      color: #f44336;
    }

    /* Color variants */
    .stats-card.primary .icon-wrapper {
      background: #e3f2fd;
    }
    .stats-card.primary .icon-wrapper mat-icon {
      color: #1976d2;
    }

    .stats-card.success .icon-wrapper {
      background: #e8f5e9;
    }
    .stats-card.success .icon-wrapper mat-icon {
      color: #4caf50;
    }

    .stats-card.warning .icon-wrapper {
      background: #fff3e0;
    }
    .stats-card.warning .icon-wrapper mat-icon {
      color: #ff9800;
    }

    .stats-card.danger .icon-wrapper {
      background: #ffebee;
    }
    .stats-card.danger .icon-wrapper mat-icon {
      color: #f44336;
    }
  `]
})
export class StatsCardComponent {
  @Input() label = '';
  @Input() value: string | number = '';
  @Input() subtitle?: string;
  @Input() icon?: string;
  @Input() color?: 'primary' | 'success' | 'warning' | 'danger';
  @Input() trend?: number;
  @Input() isCurrency = false;

  get formattedValue(): string {
    if (this.isCurrency && typeof this.value === 'number') {
      return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR'
      }).format(this.value);
    }
    return String(this.value);
  }

  get colorClass(): string {
    return this.color || '';
  }
}
