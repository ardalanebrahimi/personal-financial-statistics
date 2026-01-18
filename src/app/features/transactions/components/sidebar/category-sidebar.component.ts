/**
 * Category Sidebar Component
 *
 * Category drop zones for drag-and-drop categorization.
 */

import { Component, Input, Output, EventEmitter, ViewChildren, QueryList } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { DragDropModule, CdkDropList, CdkDragDrop } from '@angular/cdk/drag-drop';
import { Category, Transaction } from '../../../../core/models/transaction.model';

export interface CategoryStat {
  name: string;
  total: number;
}

@Component({
  selector: 'app-category-sidebar',
  standalone: true,
  imports: [CommonModule, MatIconModule, DragDropModule],
  template: `
    <div class="category-sidebar">
      <h3>
        <mat-icon>category</mat-icon>
        Categories
      </h3>
      <p class="hint">Drag transactions here to categorize</p>

      <div class="category-list">
        <div *ngFor="let category of categories"
             class="category-drop-zone"
             cdkDropList
             #categoryDrop="cdkDropList"
             [cdkDropListData]="category"
             [cdkDropListConnectedTo]="connectedListIds"
             (cdkDropListDropped)="onDrop($event, category)"
             [style.border-color]="category.color">
          <div class="category-header" [style.background-color]="category.color + '20'">
            <span class="color-dot" [style.background-color]="category.color"></span>
            <span class="category-name">{{ category.name }}</span>
            <span class="category-count">{{ getCategoryCount(category.name) }}</span>
          </div>
        </div>

        <!-- Uncategorize drop zone -->
        <div class="category-drop-zone uncategorize"
             cdkDropList
             [cdkDropListConnectedTo]="connectedListIds"
             (cdkDropListDropped)="onUncategorize($event)">
          <div class="category-header">
            <mat-icon>remove_circle_outline</mat-icon>
            <span class="category-name">Remove Category</span>
          </div>
        </div>
      </div>

      <!-- Quick Stats -->
      <div class="quick-stats">
        <h4>Quick Stats</h4>
        <div class="stat-row" *ngFor="let stat of categoryStats | slice:0:5">
          <span class="stat-name">{{ stat.name }}</span>
          <span class="stat-value">{{ stat.total | currency:'EUR':'symbol':'1.0-0' }}</span>
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

    .category-sidebar h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 8px;
      font-size: 16px;
    }

    .category-sidebar .hint {
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
      font-family: 'Roboto Mono', monospace;
    }
  `]
})
export class CategorySidebarComponent {
  @Input() categories: Category[] = [];
  @Input() categoryStats: CategoryStat[] = [];
  @Input() transactions: Transaction[] = [];
  @Input() connectedListIds: string[] = [];

  @Output() dropToCategory = new EventEmitter<{ transaction: Transaction; category: Category }>();
  @Output() dropToUncategorize = new EventEmitter<Transaction>();

  @ViewChildren('categoryDrop') categoryDropLists!: QueryList<CdkDropList>;

  getCategoryCount(categoryName: string): number {
    return this.transactions.filter(t => t.category === categoryName).length;
  }

  onDrop(event: CdkDragDrop<Category>, category: Category): void {
    const transaction = event.item.data as Transaction;
    this.dropToCategory.emit({ transaction, category });
  }

  onUncategorize(event: CdkDragDrop<any>): void {
    const transaction = event.item.data as Transaction;
    this.dropToUncategorize.emit(transaction);
  }
}
