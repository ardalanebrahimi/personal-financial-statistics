/**
 * Selection Bar Component
 *
 * Displays actions for selected transactions.
 */

import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { Subscription } from 'rxjs';

import { Transaction, Category } from '../../../core/models/transaction.model';
import { TransactionSelectionService } from '../services/transaction-selection.service';

@Component({
  selector: 'app-selection-bar',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule
  ],
  template: `
    <div class="selection-bar" *ngIf="selectedCount > 0">
      <div class="selection-info">
        <mat-icon>check_box</mat-icon>
        <span>{{ selectedCount }} selected</span>
      </div>

      <mat-divider vertical></mat-divider>

      <div class="selection-actions">
        <!-- Category Assignment -->
        <button mat-button [matMenuTriggerFor]="categoryMenu" matTooltip="Assign Category">
          <mat-icon>label</mat-icon>
          Category
        </button>
        <mat-menu #categoryMenu>
          <button mat-menu-item *ngFor="let cat of categories"
                  (click)="assignCategory.emit(cat.name)">
            <span class="color-dot" [style.background]="cat.color"></span>
            {{ cat.name }}
          </button>
          <mat-divider></mat-divider>
          <button mat-menu-item (click)="assignCategory.emit('')">
            <mat-icon>clear</mat-icon>
            Remove Category
          </button>
        </mat-menu>

        <!-- Categorize with AI -->
        <button mat-button (click)="categorizeAI.emit()" matTooltip="Categorize with AI">
          <mat-icon>auto_awesome</mat-icon>
          AI Categorize
        </button>

        <!-- Delete -->
        <button mat-button color="warn" (click)="deleteSelected.emit()" matTooltip="Delete Selected">
          <mat-icon>delete</mat-icon>
          Delete
        </button>
      </div>

      <div class="selection-end">
        <button mat-icon-button (click)="clearSelection()" matTooltip="Clear Selection">
          <mat-icon>close</mat-icon>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .selection-bar {
      display: flex;
      align-items: center;
      gap: 16px;
      background: #e3f2fd;
      padding: 8px 16px;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .selection-info {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
      color: #1565c0;
    }

    .selection-actions {
      display: flex;
      gap: 8px;
      flex: 1;
    }

    .selection-end {
      margin-left: auto;
    }

    .color-dot {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 8px;
    }

    mat-divider[vertical] {
      height: 24px;
    }
  `]
})
export class SelectionBarComponent implements OnInit, OnDestroy {
  @Input() categories: Category[] = [];
  @Output() assignCategory = new EventEmitter<string>();
  @Output() categorizeAI = new EventEmitter<void>();
  @Output() deleteSelected = new EventEmitter<void>();

  selectedCount = 0;
  private subscription?: Subscription;

  constructor(private selectionService: TransactionSelectionService) {}

  ngOnInit(): void {
    this.subscription = this.selectionService.selectedTransactions$.subscribe(
      selected => this.selectedCount = selected.length
    );
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  clearSelection(): void {
    this.selectionService.clearSelection();
  }
}
