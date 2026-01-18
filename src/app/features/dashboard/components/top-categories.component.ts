/**
 * Top Categories Component
 *
 * Displays the top spending categories with visual bars.
 */

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

export interface CategoryStat {
  name: string;
  total: number;
  color?: string;
}

@Component({
  selector: 'app-top-categories',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule],
  template: `
    <mat-card class="categories-card">
      <mat-card-header>
        <mat-icon mat-card-avatar>pie_chart</mat-icon>
        <mat-card-title>Top Categories</mat-card-title>
        <mat-card-subtitle>This month's spending</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div class="category-list">
          <div *ngFor="let category of categories; let i = index" class="category-item">
            <span class="category-rank">{{ i + 1 }}</span>
            <div class="category-bar" [style.background-color]="category.color || '#ccc'"
                 [style.width.%]="getCategoryWidth(category.total)"></div>
            <span class="category-name">{{ category.name }}</span>
            <span class="category-amount">{{ category.total | currency:'EUR' }}</span>
          </div>
          <div *ngIf="categories.length === 0" class="empty-categories">
            <p>No spending data yet</p>
          </div>
        </div>
      </mat-card-content>
      <mat-card-actions>
        <button mat-button (click)="viewCharts.emit()">View Charts</button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    .category-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .category-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      position: relative;
    }

    .category-rank {
      width: 20px;
      text-align: center;
      font-weight: 500;
      color: #666;
    }

    .category-bar {
      height: 24px;
      border-radius: 4px;
      min-width: 10px;
      opacity: 0.7;
    }

    .category-name {
      flex: 1;
      font-weight: 500;
    }

    .category-amount {
      color: #666;
    }

    .empty-categories {
      text-align: center;
      padding: 1rem;
      color: #666;
    }

    mat-card-actions {
      padding: 0.5rem 1rem !important;
    }

    mat-card-actions button {
      margin: 0 !important;
    }
  `]
})
export class TopCategoriesComponent {
  @Input() categories: CategoryStat[] = [];
  @Output() viewCharts = new EventEmitter<void>();

  getCategoryWidth(total: number): number {
    const max = this.categories[0]?.total || 1;
    return (total / max) * 100;
  }
}
