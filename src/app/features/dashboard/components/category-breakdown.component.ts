/**
 * Category Breakdown Component
 *
 * Displays a detailed table of spending by category.
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { CategoryBreakdown } from '../services/dashboard-chart.service';

@Component({
  selector: 'app-category-breakdown',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule],
  template: `
    <mat-card class="breakdown-card">
      <mat-card-header>
        <mat-icon mat-card-avatar>table_chart</mat-icon>
        <mat-card-title>Category Breakdown</mat-card-title>
        <mat-card-subtitle>Detailed spending by category</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div class="breakdown-table">
          <div class="breakdown-header">
            <span class="col-category">Category</span>
            <span class="col-amount">Amount</span>
            <span class="col-percent">%</span>
            <span class="col-count">Count</span>
          </div>
          <div *ngFor="let item of breakdown" class="breakdown-row">
            <span class="col-category">
              <span class="color-dot" [style.background-color]="item.color"></span>
              {{ item.name }}
            </span>
            <span class="col-amount">{{ item.total | currency:'EUR' }}</span>
            <span class="col-percent">{{ item.percentage | number:'1.1-1' }}%</span>
            <span class="col-count">{{ item.count }}</span>
          </div>
          <div *ngIf="breakdown.length === 0" class="empty-breakdown">
            <p>No data for selected period</p>
          </div>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .breakdown-card {
      margin-bottom: 1.5rem;
    }

    .breakdown-table {
      width: 100%;
    }

    .breakdown-header {
      display: flex;
      padding: 0.75rem 0;
      border-bottom: 2px solid #e0e0e0;
      font-weight: 500;
      color: #666;
    }

    .breakdown-row {
      display: flex;
      padding: 0.75rem 0;
      border-bottom: 1px solid #f0f0f0;
    }

    .breakdown-row:hover {
      background: #fafafa;
    }

    .col-category {
      flex: 2;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .col-amount {
      flex: 1;
      text-align: right;
      font-weight: 500;
    }

    .col-percent {
      flex: 0.5;
      text-align: right;
      color: #666;
    }

    .col-count {
      flex: 0.5;
      text-align: right;
      color: #666;
    }

    .color-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .empty-breakdown {
      text-align: center;
      padding: 2rem;
      color: #666;
    }
  `]
})
export class CategoryBreakdownComponent {
  @Input() breakdown: CategoryBreakdown[] = [];
}
