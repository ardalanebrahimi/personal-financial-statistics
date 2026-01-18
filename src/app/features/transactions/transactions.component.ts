/**
 * Transactions Component
 *
 * Main container component for transaction management.
 * Orchestrates sub-components for toolbar, filters, list, and sidebar.
 */

import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';

import { TransactionService } from '../../services/transaction.service';
import { CategoryService } from '../../services/category.service';
import { AIContextService } from '../../services/ai-context.service';
import { Transaction, Category } from '../../core/models/transaction.model';
import {
  TransactionFilterService,
  TransactionFilters,
  TransactionSelectionService,
  TransactionUndoService,
  TransactionActionsService,
  TransactionKeyboardService
} from './services';

import { TransactionCardComponent } from './transaction-card.component';
import { MergeDialogComponent } from './merge-dialog.component';
import { SplitDialogComponent } from './split-dialog.component';
import { TransactionDetailDialogComponent, TransactionDetailDialogResult } from './transaction-detail-dialog.component';
import { ImportDialogComponent, ImportDialogResult } from './import-dialog.component';
import { DuplicatesDialogComponent, DuplicatesDialogResult } from './duplicates-dialog.component';
import { MatchingOverviewDialogComponent } from './matching-overview-dialog.component';
import { CategorizationDialogComponent } from './categorization-dialog.component';

import {
  TransactionToolbarComponent,
  TransactionFiltersComponent,
  SelectionBarComponent,
  SummaryBarComponent,
  CategorySidebarComponent,
  KeyboardHelpComponent,
  CategoryStat
} from './components';

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatSnackBarModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
    DragDropModule,
    TransactionCardComponent,
    TransactionToolbarComponent,
    TransactionFiltersComponent,
    SelectionBarComponent,
    SummaryBarComponent,
    CategorySidebarComponent,
    KeyboardHelpComponent
  ],
  templateUrl: './transactions.component.html',
  styleUrl: './transactions.component.scss'
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
  isCategorizing = false;
  categorizationProgress = { current: 0, total: 0 };

  pageSize = 50;
  pageIndex = 0;
  pageSizeOptions = [25, 50, 100, 250];

  selectedTransactions: Transaction[] = [];
  expandedIds = new Set<string>();
  focusedIndex = -1;

  private subscriptions: Subscription[] = [];
  private currentFilters: TransactionFilters;

  constructor(
    private transactionService: TransactionService,
    private categoryService: CategoryService,
    public aiContextService: AIContextService,
    private filterService: TransactionFilterService,
    private selectionService: TransactionSelectionService,
    private undoService: TransactionUndoService,
    public actionsService: TransactionActionsService,
    private keyboardService: TransactionKeyboardService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.currentFilters = this.filterService.getDefaultFilters();
  }

  ngOnInit(): void {
    this.loadData();
    this.subscriptions.push(
      this.keyboardService.action$.subscribe(event => this.handleKeyboardAction(event))
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    this.subscriptions.push(
      this.categoryService.categories$.subscribe(c => this.categories = c),
      this.transactionService.transactions$.subscribe(t => {
        this.transactions = t;
        this.applyFilters();
        this.extractSources();
        this.isLoading = false;
      })
    );
  }

  private extractSources(): void {
    const sourceSet = new Set<string>();
    this.transactions.forEach(t => t.source?.connectorType && sourceSet.add(t.source.connectorType));
    this.sources = Array.from(sourceSet);
  }

  // Filters
  onFiltersChange(filters: TransactionFilters): void {
    this.currentFilters = filters;
    this.applyFilters();
  }

  private applyFilters(): void {
    this.filteredTransactions = this.filterService.applyFilters(this.transactions, this.currentFilters);
    this.filteredTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    this.pageIndex = 0;
  }

  // Pagination
  get paginatedTransactions(): Transaction[] {
    const start = this.pageIndex * this.pageSize;
    return this.filteredTransactions.slice(start, start + this.pageSize);
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
  }

  // Selection
  get allVisibleSelected(): boolean {
    return this.paginatedTransactions.length > 0 && this.paginatedTransactions.every(t => this.isSelected(t));
  }

  get someVisibleSelected(): boolean {
    return this.paginatedTransactions.some(t => this.isSelected(t));
  }

  isSelected(transaction: Transaction): boolean {
    return this.selectedTransactions.some(t => t.id === transaction.id);
  }

  onSelectTransaction(transaction: Transaction, event: any): void {
    if (event?.ctrlKey || event?.metaKey) {
      const idx = this.selectedTransactions.findIndex(t => t.id === transaction.id);
      idx >= 0 ? this.selectedTransactions.splice(idx, 1) : this.selectedTransactions.push(transaction);
    } else if (event?.shiftKey && this.selectedTransactions.length > 0) {
      const last = this.selectedTransactions[this.selectedTransactions.length - 1];
      const startIdx = this.filteredTransactions.findIndex(t => t.id === last.id);
      const endIdx = this.filteredTransactions.findIndex(t => t.id === transaction.id);
      const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
      this.selectedTransactions = this.filteredTransactions.slice(from, to + 1);
    } else {
      this.selectedTransactions = [transaction];
    }
    this.focusedIndex = this.filteredTransactions.findIndex(t => t.id === transaction.id);
  }

  onToggleSelect(event: { transaction: Transaction; selected: boolean }): void {
    if (event.selected && !this.isSelected(event.transaction)) {
      this.selectedTransactions.push(event.transaction);
    } else if (!event.selected) {
      this.selectedTransactions = this.selectedTransactions.filter(t => t.id !== event.transaction.id);
    }
  }

  toggleSelectAll(selected: boolean): void {
    if (selected) {
      this.paginatedTransactions.forEach(t => !this.isSelected(t) && this.selectedTransactions.push(t));
    } else {
      const visibleIds = new Set(this.paginatedTransactions.map(t => t.id));
      this.selectedTransactions = this.selectedTransactions.filter(t => !visibleIds.has(t.id));
    }
  }

  clearSelection(): void { this.selectedTransactions = []; }

  // Computed values
  get totalAmount(): number { return this.filteredTransactions.reduce((sum, t) => sum + t.amount, 0); }
  get incomeTotal(): number { return this.filteredTransactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0); }
  get expenseTotal(): number { return this.filteredTransactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0); }
  get selectedTotal(): number { return this.selectedTransactions.reduce((sum, t) => sum + t.amount, 0); }
  get uncategorizedCount(): number { return this.filteredTransactions.filter(t => !t.category && !t.isContextOnly).length; }

  get categoryStats(): CategoryStat[] {
    const stats = new Map<string, number>();
    this.filteredTransactions.forEach(t => {
      if (t.category && t.amount < 0) stats.set(t.category, (stats.get(t.category) || 0) + Math.abs(t.amount));
    });
    return Array.from(stats.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  }

  onExpandChange(transaction: Transaction, expanded: boolean): void {
    expanded ? this.expandedIds.add(transaction.id) : this.expandedIds.delete(transaction.id);
  }

  // Drag & Drop
  onDropToCategory(transaction: Transaction, category: Category): void {
    this.undoService.recordCategoryChange(transaction, transaction.category, category.name);
    transaction.category = category.name;
    this.transactionService.updateTransaction(transaction);
    this.snackBar.open(`Moved to ${category.name}`, 'Undo', { duration: 3000 }).onAction().subscribe(() => this.undo());
  }

  onDropToUncategorize(transaction: Transaction): void {
    if (transaction.category) this.undoService.recordCategoryChange(transaction, transaction.category, '');
    transaction.category = undefined;
    this.transactionService.updateTransaction(transaction);
    this.snackBar.open('Category removed', 'Undo', { duration: 3000 }).onAction().subscribe(() => this.undo());
  }

  // Transaction actions
  onUpdateTransaction(transaction: Transaction): void {
    this.transactionService.updateTransaction(transaction);
    this.snackBar.open('Transaction updated', '', { duration: 2000 });
  }

  onEditTransaction(transaction: Transaction): void {
    const linkedTransactions = transaction.matchInfo?.linkedTransactionIds
      ? this.transactions.filter(t => transaction.matchInfo!.linkedTransactionIds.includes(t.id)) : [];
    const linkedOrders = transaction.linkedOrderIds?.length
      ? this.transactions.filter(t => transaction.linkedOrderIds!.includes(t.id)) : [];

    this.dialog.open(TransactionDetailDialogComponent, {
      width: '800px', maxWidth: '95vw', maxHeight: '90vh',
      data: { transaction, categories: this.categories, linkedTransactions, linkedOrders }
    }).afterClosed().subscribe((result: TransactionDetailDialogResult) => {
      if (!result) return;
      if (result.action === 'save' && result.transaction) {
        this.transactionService.updateTransaction(result.transaction);
        this.snackBar.open('Transaction updated', '', { duration: 2000 });
      } else if (result.action === 'delete') this.onDeleteTransaction(transaction);
      else if (result.action === 'split') this.onSplitTransaction(transaction);
      else if (result.action === 'merge') this.onMergeTransaction(transaction);
      else if (result.action === 'askAI') this.aiContextService.askAboutTransaction(transaction);
    });
  }

  onDeleteTransaction(transaction: Transaction): void {
    this.undoService.recordDelete(transaction);
    this.transactionService.deleteTransaction(transaction.id);
    this.selectedTransactions = this.selectedTransactions.filter(t => t.id !== transaction.id);
    this.snackBar.open('Transaction deleted', 'Undo', { duration: 3000 }).onAction().subscribe(() => this.undo());
  }

  onMergeTransaction(transaction: Transaction): void {
    this.dialog.open(MergeDialogComponent, {
      width: '600px',
      data: { sourceTransaction: transaction, transactions: this.filteredTransactions.filter(t => t.id !== transaction.id) }
    }).afterClosed().subscribe(r => r && this.snackBar.open('Transactions merged', '', { duration: 2000 }));
  }

  onSplitTransaction(transaction: Transaction): void {
    this.dialog.open(SplitDialogComponent, {
      width: '500px', data: { transaction, categories: this.categories }
    }).afterClosed().subscribe(r => r && this.snackBar.open('Transaction split', '', { duration: 2000 }));
  }

  // Undo
  undo(): void {
    const action = this.undoService.popUndo();
    if (!action) return;
    if (action.type === 'category') {
      const tx = this.transactions.find(t => t.id === action.data.transactionId);
      if (tx) { tx.category = action.data.oldCategory; this.transactionService.updateTransaction(tx); }
    } else if (action.type === 'delete') {
      this.snackBar.open('Undo delete not fully implemented', '', { duration: 2000 });
    }
  }

  // Matching
  async runMatching(): Promise<void> {
    this.isMatching = true;
    try {
      const result = await this.actionsService.runMatching();
      this.snackBar.open(`Matching complete: ${result.totalMatches} auto-matches, ${result.totalSuggestions} suggestions`, '', { duration: 4000 });
      await this.transactionService.loadTransactions();
    } catch (error) {
      this.snackBar.open('Matching failed', '', { duration: 3000 });
    }
    this.isMatching = false;
  }

  openMatchingOverview(): void {
    this.dialog.open(MatchingOverviewDialogComponent, {
      width: '90vw', maxWidth: '1600px', height: '90vh', maxHeight: '90vh',
      data: { transactions: this.transactions }
    }).afterClosed().subscribe(() => this.transactionService.loadTransactions());
  }

  openImportDialog(type: 'csv' | 'amazon' | 'paypal'): void {
    this.dialog.open(ImportDialogComponent, {
      width: '700px', maxHeight: '90vh', data: { initialTab: type, categories: this.categories }
    }).afterClosed().subscribe((result: ImportDialogResult) => {
      if (result?.imported) {
        this.snackBar.open(`Imported ${result.count} transaction(s)`, '', { duration: 3000 });
        this.transactionService.loadTransactions();
      }
    });
  }

  // Categorization
  onCategorize(type: 'selected' | 'uncategorized' | 'filtered'): void {
    if (type === 'selected') this.categorizeSelected();
    else if (type === 'uncategorized') this.categorizeUncategorized();
    else if (type === 'filtered') this.categorizeFiltered();
  }

  async categorizeSelected(): Promise<void> {
    if (this.selectedTransactions.length === 0) return;
    const uncategorized = this.selectedTransactions.filter(t => !t.category && !t.isContextOnly);
    if (uncategorized.length === 0) { this.snackBar.open('All selected transactions already have categories', '', { duration: 2000 }); return; }
    await this.startCategorization(uncategorized);
  }

  async categorizeUncategorized(): Promise<void> {
    const uncategorized = this.filteredTransactions.filter(t => !t.category && !t.isContextOnly);
    if (uncategorized.length === 0) { this.snackBar.open('No uncategorized transactions found', '', { duration: 2000 }); return; }
    await this.startCategorization(uncategorized);
  }

  async categorizeFiltered(): Promise<void> {
    const toCategorize = this.filteredTransactions.filter(t => !t.isContextOnly);
    if (toCategorize.length === 0) { this.snackBar.open('No transactions to categorize', '', { duration: 2000 }); return; }
    await this.startCategorization(toCategorize, true);
  }

  private async startCategorization(transactions: Transaction[], includeAlreadyCategorized = false): Promise<void> {
    try {
      await this.actionsService.startCategorization(transactions, includeAlreadyCategorized);
      this.snackBar.open(`Started categorization of ${transactions.length} transactions`, 'View Progress', { duration: 5000 })
        .onAction().subscribe(() => this.openCategorizationDialog());
      this.openCategorizationDialog();
    } catch (error: any) {
      this.snackBar.open(error?.error?.error || 'Failed to start categorization', '', { duration: 3000 });
    }
  }

  openCategorizationDialog(): void {
    this.dialog.open(CategorizationDialogComponent, { width: '800px', maxHeight: '90vh', disableClose: false })
      .afterClosed().subscribe(() => this.transactionService.loadTransactions());
  }

  // Maintenance
  onMaintenance(action: 'cleanup' | 'find-duplicates' | 'remove-duplicates'): void {
    if (action === 'cleanup') this.cleanupCategories();
    else if (action === 'find-duplicates') this.findDuplicates();
    else if (action === 'remove-duplicates') this.removeDuplicates();
  }

  async cleanupCategories(): Promise<void> {
    try {
      const result = await this.actionsService.cleanupCategories();
      this.snackBar.open(`Removed ${result.categoriesRemoved.length} categories, reset ${result.transactionsReset} transactions`, '', { duration: 4000 });
    } catch { this.snackBar.open('Failed to cleanup categories', '', { duration: 3000 }); }
  }

  async findDuplicates(): Promise<void> {
    try {
      const result = await this.actionsService.findDuplicates();
      this.dialog.open(DuplicatesDialogComponent, {
        width: '900px', maxWidth: '95vw', maxHeight: '90vh',
        data: { groups: result.groups, totalDuplicates: result.totalDuplicates }
      }).afterClosed().subscribe((r: DuplicatesDialogResult | undefined) => {
        if (r?.removedIds?.length) {
          this.snackBar.open(`Removed ${r.removedIds.length} duplicate transaction(s)`, '', { duration: 4000 });
          this.transactionService.loadTransactions();
        }
      });
    } catch { this.snackBar.open('Failed to find duplicates', '', { duration: 3000 }); }
  }

  async removeDuplicates(): Promise<void> {
    try {
      const findResult = await this.actionsService.findDuplicates();
      if (findResult.totalDuplicates === 0) { this.snackBar.open('No duplicates found', '', { duration: 3000 }); return; }
      if (!confirm(`Found ${findResult.totalDuplicates} duplicates in ${findResult.totalGroups} groups.\n\nDo you want to auto-remove the duplicates?`)) return;
      const result = await this.actionsService.removeDuplicatesAuto();
      if (result.success) this.snackBar.open(`Removed ${result.removedCount} duplicate transactions`, '', { duration: 4000 });
    } catch { this.snackBar.open('Failed to remove duplicates', '', { duration: 3000 }); }
  }

  // Keyboard handling
  @HostListener('window:keydown', ['$event'])
  onGlobalKeyDown(event: KeyboardEvent): void {
    this.keyboardService.processKeyEvent(event);
  }

  private handleKeyboardAction(event: { action: string; categoryIndex?: number }): void {
    switch (event.action) {
      case 'navigateDown':
        if (this.focusedIndex < this.filteredTransactions.length - 1) {
          this.focusedIndex++;
          this.selectedTransactions = [this.filteredTransactions[this.focusedIndex]];
        }
        break;
      case 'navigateUp':
        if (this.focusedIndex > 0) {
          this.focusedIndex--;
          this.selectedTransactions = [this.filteredTransactions[this.focusedIndex]];
        }
        break;
      case 'toggleSelection':
        if (this.focusedIndex >= 0) {
          const tx = this.filteredTransactions[this.focusedIndex];
          const idx = this.selectedTransactions.findIndex(t => t.id === tx.id);
          idx >= 0 ? this.selectedTransactions.splice(idx, 1) : this.selectedTransactions.push(tx);
        }
        break;
      case 'toggleExpand':
        if (this.focusedIndex >= 0) {
          const tx = this.filteredTransactions[this.focusedIndex];
          this.expandedIds.has(tx.id) ? this.expandedIds.delete(tx.id) : this.expandedIds.add(tx.id);
        }
        break;
      case 'toggleHelp':
        this.showKeyboardHelp = !this.showKeyboardHelp;
        break;
      case 'undo':
        this.undo();
        break;
      case 'assignCategory':
        if (event.categoryIndex !== undefined && event.categoryIndex < this.categories.length && this.selectedTransactions.length > 0) {
          const category = this.categories[event.categoryIndex];
          this.undoService.recordBulkCategoryChange(this.selectedTransactions, category.name);
          this.selectedTransactions.forEach(t => { t.category = category.name; this.transactionService.updateTransaction(t); });
          this.snackBar.open(`Assigned "${category.name}" to ${this.selectedTransactions.length} transactions`, '', { duration: 2000 });
        }
        break;
    }
  }

  trackByFn(index: number, transaction: Transaction): string { return transaction.id; }
}
