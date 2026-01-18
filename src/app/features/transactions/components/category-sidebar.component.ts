/**
 * Category Sidebar Component
 *
 * Displays category list with drag-and-drop support for categorization.
 */

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DragDropModule, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';

import { Transaction, Category } from '../../../core/models/transaction.model';

export interface CategoryStats {
  name: string;
  count: number;
  total: number;
  color?: string;
}

@Component({
  selector: 'app-category-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatTooltipModule,
    DragDropModule
  ],
  template: `
    <div class="category-sidebar">
      <h3>
        <mat-icon>folder</mat-icon>
        Categories
      </h3>
      <p class="hint">Drag transactions here to categorize</p>

      <div class="category-list" cdkDropListGroup>
        <!-- Categories -->
        <div *ngFor="let cat of categories"
             cdkDropList
             [cdkDropListData]="cat.name"
             (cdkDropListDropped)="onDrop($event)"
             class="category-drop-zone">
          <div class="category-header">
            <span class="color-dot" [style.background]="cat.color || '#9e9e9e'"></span>
            <span class="category-name">{{ cat.name }}</span>
            <span class="category-count" *ngIf="getCategoryCount(cat.name) > 0">
              {{ getCategoryCount(cat.name) }}
            </span>
          </div>
        </div>

        <!-- Uncategorize drop zone -->
        <div cdkDropList
             [cdkDropListData]="''"
             (cdkDropListDropped)="onDrop($event)"
             class="category-drop-zone uncategorize">
          <div class="category-header">
            <mat-icon>label_off</mat-icon>
            <span class="category-name">Remove Category</span>
          </div>
        </div>
      </div>

      <!-- Quick Stats -->
      <div class="quick-stats">
        <h4>Quick Stats</h4>
        <div class="stat-row">
          <span class="stat-name">Total Transactions</span>
          <span class="stat-value">{{ totalTransactions }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-name">Categorized</span>
          <span class="stat-value">{{ categorizedCount }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-name">Uncategorized</span>
          <span class="stat-value warn">{{ uncategorizedCount }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-name">Total Expenses</span>
          <span class="stat-value expense">{{ formatCurrency(totalExpenses) }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-name">Total Income</span>
          <span class="stat-value income">{{ formatCurrency(totalIncome) }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .category-sidebar {
      width: 280px;
      background: white;
      border-left: 1px solid #e0e0e0;
      padding: 16px;
      overflow-y: auto;
    }

    h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 8px;
      font-size: 16px;
    }

    .hint {
      color: #666;
      font-size: 12px;
      margin: 0 0 16px;
    }

    .category-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .category-drop-zone {
      border: 2px dashed #e0e0e0;
      border-radius: 8px;
      transition: all 0.2s;
    }

    .category-drop-zone:hover,
    .category-drop-zone.cdk-drop-list-dragging {
      border-style: solid;
      background: #f5f5f5;
    }

    .category-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 6px;
    }

    .color-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }

    .category-name {
      flex: 1;
      font-size: 14px;
      font-weight: 500;
    }

    .category-count {
      font-size: 12px;
      color: #666;
      background: #f0f0f0;
      padding: 2px 8px;
      border-radius: 12px;
    }

    .category-drop-zone.uncategorize {
      border-color: #ffcdd2;
      margin-top: 16px;
    }

    .category-drop-zone.uncategorize .category-header {
      color: #c62828;
    }

    .quick-stats {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #e0e0e0;
    }

    .quick-stats h4 {
      margin: 0 0 12px;
      font-size: 14px;
      color: #666;
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 13px;
    }

    .stat-name {
      color: #333;
    }

    .stat-value {
      font-weight: 500;
    }

    .stat-value.warn {
      color: #ff9800;
    }

    .stat-value.expense {
      color: #f44336;
    }

    .stat-value.income {
      color: #4caf50;
    }
  `]
})
export class CategorySidebarComponent {
  @Input() categories: Category[] = [];
  @Input() transactions: Transaction[] = [];
  @Input() categoryStats: Map<string, number> = new Map();
  @Output() categoryDrop = new EventEmitter<{ transaction: Transaction; category: string }>();

  get totalTransactions(): number {
    return this.transactions.length;
  }

  get categorizedCount(): number {
    return this.transactions.filter(t => t.category).length;
  }

  get uncategorizedCount(): number {
    return this.transactions.filter(t => !t.category && !t.isContextOnly).length;
  }

  get totalExpenses(): number {
    return Math.abs(
      this.transactions
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + t.amount, 0)
    );
  }

  get totalIncome(): number {
    return this.transactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
  }

  getCategoryCount(categoryName: string): number {
    return this.categoryStats.get(categoryName) || 0;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  }

  onDrop(event: CdkDragDrop<string>): void {
    const transaction = event.item.data as Transaction;
    const category = event.container.data;

    this.categoryDrop.emit({ transaction, category });
  }
}
