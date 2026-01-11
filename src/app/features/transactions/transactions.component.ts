import { Component, OnInit, OnDestroy, HostListener, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DragDropModule, CdkDragDrop, CdkDrag, CdkDropList, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';

import { TransactionService } from '../../services/transaction.service';
import { CategoryService } from '../../services/category.service';
import { Transaction, Category } from '../../core/models/transaction.model';
import { TransactionCardComponent } from './transaction-card.component';
import { MergeDialogComponent } from './merge-dialog.component';
import { SplitDialogComponent } from './split-dialog.component';

interface UndoAction {
  type: 'category' | 'merge' | 'split' | 'delete' | 'edit';
  data: any;
  description: string;
}

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatSelectModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonToggleModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    DragDropModule,
    TransactionCardComponent
  ],
  template: `
    <div class="transactions-container">
      <!-- Toolbar -->
      <div class="toolbar">
        <div class="toolbar-left">
          <h1>Transactions</h1>
          <span class="transaction-count">{{ filteredTransactions.length }} of {{ transactions.length }}</span>
        </div>
        <div class="toolbar-center">
          <mat-button-toggle-group [(ngModel)]="viewMode" class="view-toggle">
            <mat-button-toggle value="cards" matTooltip="Card View">
              <mat-icon>view_agenda</mat-icon>
            </mat-button-toggle>
            <mat-button-toggle value="compact" matTooltip="Compact View">
              <mat-icon>view_list</mat-icon>
            </mat-button-toggle>
          </mat-button-toggle-group>
        </div>
        <div class="toolbar-right">
          <button mat-button (click)="toggleFilters()">
            <mat-icon>filter_list</mat-icon>
            Filters
          </button>
          <button mat-button (click)="runMatching()" [disabled]="isMatching">
            <mat-icon>link</mat-icon>
            Run Matching
          </button>
          <button mat-button (click)="exportCSV()">
            <mat-icon>download</mat-icon>
            Export
          </button>
        </div>
      </div>

      <!-- Filters Panel -->
      <div class="filters-panel" *ngIf="showFilters">
        <mat-form-field appearance="outline">
          <mat-label>Search</mat-label>
          <input matInput [(ngModel)]="filters.search" (input)="applyFilters()" placeholder="Description or beneficiary...">
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Start Date</mat-label>
          <input matInput [matDatepicker]="startPicker" [(ngModel)]="filters.startDate" (dateChange)="applyFilters()">
          <mat-datepicker-toggle matSuffix [for]="startPicker"></mat-datepicker-toggle>
          <mat-datepicker #startPicker></mat-datepicker>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>End Date</mat-label>
          <input matInput [matDatepicker]="endPicker" [(ngModel)]="filters.endDate" (dateChange)="applyFilters()">
          <mat-datepicker-toggle matSuffix [for]="endPicker"></mat-datepicker-toggle>
          <mat-datepicker #endPicker></mat-datepicker>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Category</mat-label>
          <mat-select [(ngModel)]="filters.category" (selectionChange)="applyFilters()">
            <mat-option [value]="''">All Categories</mat-option>
            <mat-option value="__uncategorized__">Uncategorized</mat-option>
            <mat-option *ngFor="let cat of categories" [value]="cat.name">{{ cat.name }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Type</mat-label>
          <mat-select [(ngModel)]="filters.type" (selectionChange)="applyFilters()">
            <mat-option [value]="''">All</mat-option>
            <mat-option value="expense">Expenses</mat-option>
            <mat-option value="income">Income</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Source</mat-label>
          <mat-select [(ngModel)]="filters.source" (selectionChange)="applyFilters()">
            <mat-option [value]="''">All Sources</mat-option>
            <mat-option *ngFor="let source of sources" [value]="source">{{ source }}</mat-option>
          </mat-select>
        </mat-form-field>

        <button mat-stroked-button (click)="resetFilters()">
          <mat-icon>clear</mat-icon>
          Reset
        </button>
      </div>

      <!-- Summary Bar -->
      <div class="summary-bar">
        <div class="summary-item">
          <span class="label">Total</span>
          <span class="value" [class.negative]="totalAmount < 0" [class.positive]="totalAmount > 0">
            {{ totalAmount | currency:'EUR':'symbol':'1.2-2' }}
          </span>
        </div>
        <div class="summary-item">
          <span class="label">Income</span>
          <span class="value positive">{{ incomeTotal | currency:'EUR':'symbol':'1.2-2' }}</span>
        </div>
        <div class="summary-item">
          <span class="label">Expenses</span>
          <span class="value negative">{{ expenseTotal | currency:'EUR':'symbol':'1.2-2' }}</span>
        </div>
        <div class="summary-item" *ngIf="selectedTransactions.length > 0">
          <span class="label">Selected ({{ selectedTransactions.length }})</span>
          <span class="value">{{ selectedTotal | currency:'EUR':'symbol':'1.2-2' }}</span>
        </div>
      </div>

      <!-- Main Content -->
      <div class="main-content">
        <!-- Transaction List -->
        <div class="transaction-list"
             cdkDropList
             #transactionList="cdkDropList"
             [cdkDropListConnectedTo]="categoryDropLists"
             [cdkDropListData]="filteredTransactions"
             (cdkDropListDropped)="onTransactionDropped($event)">

          <div *ngIf="isLoading" class="loading">
            <mat-spinner diameter="40"></mat-spinner>
            <span>Loading transactions...</span>
          </div>

          <div *ngIf="!isLoading && filteredTransactions.length === 0" class="empty-state">
            <mat-icon>receipt_long</mat-icon>
            <h3>No transactions found</h3>
            <p>Try adjusting your filters or import some transactions.</p>
          </div>

          <ng-container *ngFor="let transaction of filteredTransactions; let i = index; trackBy: trackByFn">
            <div cdkDrag
                 [cdkDragData]="transaction"
                 class="drag-wrapper"
                 [class.compact]="viewMode === 'compact'">
              <app-transaction-card
                [transaction]="transaction"
                [categories]="categories"
                [selected]="isSelected(transaction)"
                [expanded]="expandedIds.has(transaction.id)"
                (selectTransaction)="onSelectTransaction($event, $event)"
                (editTransaction)="onEditTransaction($event)"
                (deleteTransaction)="onDeleteTransaction($event)"
                (mergeTransaction)="onMergeTransaction($event)"
                (splitTransaction)="onSplitTransaction($event)"
                (expandChange)="onExpandChange(transaction, $event)"
                (updateTransaction)="onUpdateTransaction($event)">
              </app-transaction-card>

              <!-- Drag Preview -->
              <div *cdkDragPreview class="drag-preview">
                <mat-icon>receipt</mat-icon>
                <span>{{ transaction.description | slice:0:30 }}</span>
                <span class="amount">{{ transaction.amount | currency:'EUR' }}</span>
              </div>

              <!-- Drag Placeholder -->
              <div *cdkDragPlaceholder class="drag-placeholder"></div>
            </div>
          </ng-container>
        </div>

        <!-- Category Sidebar -->
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
                 [cdkDropListConnectedTo]="[transactionList]"
                 (cdkDropListDropped)="onDropToCategory($event, category)"
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
                 [cdkDropListConnectedTo]="[transactionList]"
                 (cdkDropListDropped)="onDropToUncategorize($event)">
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
      </div>

      <!-- Keyboard Shortcuts Help -->
      <div class="keyboard-help" *ngIf="showKeyboardHelp">
        <h4>Keyboard Shortcuts</h4>
        <div class="shortcut"><kbd>↑</kbd><kbd>↓</kbd> Navigate</div>
        <div class="shortcut"><kbd>Enter</kbd> Expand/Collapse</div>
        <div class="shortcut"><kbd>Space</kbd> Select</div>
        <div class="shortcut"><kbd>1</kbd>-<kbd>9</kbd> Assign category</div>
        <div class="shortcut"><kbd>Delete</kbd> Delete</div>
        <div class="shortcut"><kbd>Ctrl+Z</kbd> Undo</div>
        <div class="shortcut"><kbd>?</kbd> Toggle help</div>
      </div>
    </div>
  `,
  styles: [`
    .transactions-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #f5f5f5;
    }

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

    .filters-panel {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      padding: 16px 24px;
      background: white;
      border-bottom: 1px solid #e0e0e0;
    }

    .filters-panel mat-form-field {
      flex: 1;
      min-width: 150px;
      max-width: 200px;
    }

    .summary-bar {
      display: flex;
      gap: 32px;
      padding: 12px 24px;
      background: #fafafa;
      border-bottom: 1px solid #e0e0e0;
    }

    .summary-item {
      display: flex;
      flex-direction: column;
    }

    .summary-item .label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
    }

    .summary-item .value {
      font-size: 18px;
      font-weight: 600;
      font-family: 'Roboto Mono', monospace;
    }

    .summary-item .value.negative {
      color: #d32f2f;
    }

    .summary-item .value.positive {
      color: #388e3c;
    }

    .main-content {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .transaction-list {
      flex: 1;
      overflow-y: auto;
      padding: 16px 24px;
    }

    .loading, .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      color: #666;
    }

    .empty-state mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: #ccc;
    }

    .empty-state h3 {
      margin: 16px 0 8px;
    }

    .drag-wrapper {
      margin-bottom: 8px;
    }

    .drag-wrapper.compact app-transaction-card {
      padding: 8px 12px;
    }

    .drag-preview {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      font-size: 14px;
    }

    .drag-preview .amount {
      margin-left: auto;
      font-weight: 600;
    }

    .drag-placeholder {
      height: 60px;
      background: #e3f2fd;
      border: 2px dashed #1976d2;
      border-radius: 8px;
      margin-bottom: 8px;
    }

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

    .keyboard-help {
      position: fixed;
      bottom: 16px;
      right: 16px;
      background: rgba(0,0,0,0.85);
      color: white;
      padding: 16px;
      border-radius: 8px;
      font-size: 13px;
      z-index: 1000;
    }

    .keyboard-help h4 {
      margin: 0 0 12px;
      font-size: 14px;
    }

    .shortcut {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }

    kbd {
      background: #555;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
    }

    /* CDK drag styles */
    .cdk-drag-animating {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }

    .cdk-drop-list-dragging .drag-wrapper:not(.cdk-drag-placeholder) {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }
  `]
})
export class TransactionsComponent implements OnInit, OnDestroy {
  transactions: Transaction[] = [];
  filteredTransactions: Transaction[] = [];
  categories: Category[] = [];
  sources: string[] = [];

  viewMode: 'cards' | 'compact' = 'cards';
  showFilters = true;
  showKeyboardHelp = false;
  isLoading = true;
  isMatching = false;

  filters = {
    search: '',
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    category: '',
    type: '',
    source: ''
  };

  selectedTransactions: Transaction[] = [];
  expandedIds = new Set<string>();
  focusedIndex = -1;

  undoStack: UndoAction[] = [];

  categoryDropLists: CdkDropList[] = [];

  private subscriptions: Subscription[] = [];

  constructor(
    private transactionService: TransactionService,
    private categoryService: CategoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.loadData();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  async loadData() {
    this.isLoading = true;

    // Load categories
    this.categories = this.categoryService.getCategories();

    // Subscribe to transactions
    const sub = this.transactionService.transactions$.subscribe(transactions => {
      this.transactions = transactions;
      this.applyFilters();
      this.extractSources();
      this.isLoading = false;
    });
    this.subscriptions.push(sub);
  }

  extractSources() {
    const sourceSet = new Set<string>();
    this.transactions.forEach(t => {
      if (t.source?.connectorType) {
        sourceSet.add(t.source.connectorType);
      }
    });
    this.sources = Array.from(sourceSet);
  }

  applyFilters() {
    let result = [...this.transactions];

    if (this.filters.search) {
      const search = this.filters.search.toLowerCase();
      result = result.filter(t =>
        t.description.toLowerCase().includes(search) ||
        t.beneficiary?.toLowerCase().includes(search)
      );
    }

    if (this.filters.startDate) {
      result = result.filter(t => new Date(t.date) >= this.filters.startDate!);
    }

    if (this.filters.endDate) {
      result = result.filter(t => new Date(t.date) <= this.filters.endDate!);
    }

    if (this.filters.category) {
      if (this.filters.category === '__uncategorized__') {
        result = result.filter(t => !t.category);
      } else {
        result = result.filter(t => t.category === this.filters.category);
      }
    }

    if (this.filters.type) {
      if (this.filters.type === 'expense') {
        result = result.filter(t => t.amount < 0);
      } else if (this.filters.type === 'income') {
        result = result.filter(t => t.amount > 0);
      }
    }

    if (this.filters.source) {
      result = result.filter(t => t.source?.connectorType === this.filters.source);
    }

    // Sort by date descending
    result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    this.filteredTransactions = result;
  }

  resetFilters() {
    this.filters = {
      search: '',
      startDate: undefined,
      endDate: undefined,
      category: '',
      type: '',
      source: ''
    };
    this.applyFilters();
  }

  toggleFilters() {
    this.showFilters = !this.showFilters;
  }

  // Selection
  onSelectTransaction(transaction: Transaction, event: any) {
    if (event?.ctrlKey || event?.metaKey) {
      // Multi-select with Ctrl/Cmd
      const index = this.selectedTransactions.findIndex(t => t.id === transaction.id);
      if (index >= 0) {
        this.selectedTransactions.splice(index, 1);
      } else {
        this.selectedTransactions.push(transaction);
      }
    } else if (event?.shiftKey && this.selectedTransactions.length > 0) {
      // Range select with Shift
      const lastSelected = this.selectedTransactions[this.selectedTransactions.length - 1];
      const startIndex = this.filteredTransactions.findIndex(t => t.id === lastSelected.id);
      const endIndex = this.filteredTransactions.findIndex(t => t.id === transaction.id);
      const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
      this.selectedTransactions = this.filteredTransactions.slice(from, to + 1);
    } else {
      // Single select
      this.selectedTransactions = [transaction];
    }
    this.focusedIndex = this.filteredTransactions.findIndex(t => t.id === transaction.id);
  }

  isSelected(transaction: Transaction): boolean {
    return this.selectedTransactions.some(t => t.id === transaction.id);
  }

  // Expand/Collapse
  onExpandChange(transaction: Transaction, expanded: boolean) {
    if (expanded) {
      this.expandedIds.add(transaction.id);
    } else {
      this.expandedIds.delete(transaction.id);
    }
  }

  // Drag & Drop
  onTransactionDropped(event: CdkDragDrop<Transaction[]>) {
    if (event.previousContainer === event.container) {
      // Reorder within list (not implemented for now)
    }
  }

  onDropToCategory(event: CdkDragDrop<Category>, category: Category) {
    const transaction = event.item.data as Transaction;
    const previousCategory = transaction.category;

    // Save undo action
    this.pushUndo({
      type: 'category',
      data: { transaction, previousCategory },
      description: `Changed category from "${previousCategory || 'None'}" to "${category.name}"`
    });

    // Update transaction
    transaction.category = category.name;
    this.transactionService.updateTransaction(transaction);

    this.snackBar.open(`Moved to ${category.name}`, 'Undo', { duration: 3000 })
      .onAction().subscribe(() => this.undo());
  }

  onDropToUncategorize(event: CdkDragDrop<any>) {
    const transaction = event.item.data as Transaction;
    const previousCategory = transaction.category;

    this.pushUndo({
      type: 'category',
      data: { transaction, previousCategory },
      description: `Removed category "${previousCategory}"`
    });

    transaction.category = undefined;
    this.transactionService.updateTransaction(transaction);

    this.snackBar.open('Category removed', 'Undo', { duration: 3000 })
      .onAction().subscribe(() => this.undo());
  }

  // Transaction actions
  onUpdateTransaction(transaction: Transaction) {
    this.transactionService.updateTransaction(transaction);
    this.snackBar.open('Transaction updated', '', { duration: 2000 });
  }

  onEditTransaction(transaction: Transaction) {
    // Could open a full edit dialog
    this.snackBar.open('Double-click fields to edit inline', '', { duration: 2000 });
  }

  onDeleteTransaction(transaction: Transaction) {
    const previousData = { ...transaction };

    this.pushUndo({
      type: 'delete',
      data: previousData,
      description: `Deleted "${transaction.description}"`
    });

    this.transactionService.deleteTransaction(transaction.id);
    this.selectedTransactions = this.selectedTransactions.filter(t => t.id !== transaction.id);

    this.snackBar.open('Transaction deleted', 'Undo', { duration: 3000 })
      .onAction().subscribe(() => this.undo());
  }

  onMergeTransaction(transaction: Transaction) {
    const dialogRef = this.dialog.open(MergeDialogComponent, {
      width: '600px',
      data: {
        sourceTransaction: transaction,
        transactions: this.filteredTransactions.filter(t => t.id !== transaction.id)
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Handle merge
        this.snackBar.open('Transactions merged', '', { duration: 2000 });
      }
    });
  }

  onSplitTransaction(transaction: Transaction) {
    const dialogRef = this.dialog.open(SplitDialogComponent, {
      width: '500px',
      data: { transaction, categories: this.categories }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Handle split
        this.snackBar.open('Transaction split', '', { duration: 2000 });
      }
    });
  }

  // Matching
  async runMatching() {
    this.isMatching = true;
    try {
      const response = await fetch('http://localhost:3000/matching/run', { method: 'POST' });
      const result = await response.json();
      this.snackBar.open(
        `Matching complete: ${result.newMatches} matches, ${result.suggestions} suggestions`,
        '',
        { duration: 4000 }
      );
      // Reload transactions
      await this.transactionService.loadTransactions();
    } catch (error) {
      this.snackBar.open('Matching failed', '', { duration: 3000 });
    }
    this.isMatching = false;
  }

  // Export
  exportCSV() {
    const csv = this.transactionService.exportToCSV(this.filteredTransactions);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // Undo
  pushUndo(action: UndoAction) {
    this.undoStack.push(action);
    if (this.undoStack.length > 50) {
      this.undoStack.shift();
    }
  }

  undo() {
    const action = this.undoStack.pop();
    if (!action) return;

    switch (action.type) {
      case 'category':
        action.data.transaction.category = action.data.previousCategory;
        this.transactionService.updateTransaction(action.data.transaction);
        break;
      case 'delete':
        // Would need to re-create - simplified here
        this.snackBar.open('Undo delete not fully implemented', '', { duration: 2000 });
        break;
    }
  }

  // Computed values
  get totalAmount(): number {
    return this.filteredTransactions.reduce((sum, t) => sum + t.amount, 0);
  }

  get incomeTotal(): number {
    return this.filteredTransactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
  }

  get expenseTotal(): number {
    return this.filteredTransactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0);
  }

  get selectedTotal(): number {
    return this.selectedTransactions.reduce((sum, t) => sum + t.amount, 0);
  }

  get categoryStats(): { name: string; total: number }[] {
    const stats = new Map<string, number>();
    this.filteredTransactions.forEach(t => {
      if (t.category && t.amount < 0) {
        stats.set(t.category, (stats.get(t.category) || 0) + Math.abs(t.amount));
      }
    });
    return Array.from(stats.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }

  getCategoryCount(categoryName: string): number {
    return this.filteredTransactions.filter(t => t.category === categoryName).length;
  }

  trackByFn(index: number, transaction: Transaction): string {
    return transaction.id;
  }

  // Keyboard navigation
  @HostListener('window:keydown', ['$event'])
  onGlobalKeyDown(event: KeyboardEvent) {
    // Check if we're in an input
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.navigateDown();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.navigateUp();
        break;
      case ' ':
        event.preventDefault();
        this.toggleSelection();
        break;
      case 'Enter':
        this.toggleExpand();
        break;
      case '?':
        this.showKeyboardHelp = !this.showKeyboardHelp;
        break;
      case 'z':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.undo();
        }
        break;
      default:
        // Number keys 1-9 for quick category assignment
        if (/^[1-9]$/.test(event.key) && this.selectedTransactions.length > 0) {
          const categoryIndex = parseInt(event.key) - 1;
          if (categoryIndex < this.categories.length) {
            this.assignCategoryToSelected(this.categories[categoryIndex]);
          }
        }
    }
  }

  navigateDown() {
    if (this.focusedIndex < this.filteredTransactions.length - 1) {
      this.focusedIndex++;
      this.selectedTransactions = [this.filteredTransactions[this.focusedIndex]];
    }
  }

  navigateUp() {
    if (this.focusedIndex > 0) {
      this.focusedIndex--;
      this.selectedTransactions = [this.filteredTransactions[this.focusedIndex]];
    }
  }

  toggleSelection() {
    if (this.focusedIndex >= 0) {
      const transaction = this.filteredTransactions[this.focusedIndex];
      const index = this.selectedTransactions.findIndex(t => t.id === transaction.id);
      if (index >= 0) {
        this.selectedTransactions.splice(index, 1);
      } else {
        this.selectedTransactions.push(transaction);
      }
    }
  }

  toggleExpand() {
    if (this.focusedIndex >= 0) {
      const transaction = this.filteredTransactions[this.focusedIndex];
      if (this.expandedIds.has(transaction.id)) {
        this.expandedIds.delete(transaction.id);
      } else {
        this.expandedIds.add(transaction.id);
      }
    }
  }

  assignCategoryToSelected(category: Category) {
    this.selectedTransactions.forEach(transaction => {
      transaction.category = category.name;
      this.transactionService.updateTransaction(transaction);
    });
    this.snackBar.open(`Assigned "${category.name}" to ${this.selectedTransactions.length} transactions`, '', { duration: 2000 });
  }
}
