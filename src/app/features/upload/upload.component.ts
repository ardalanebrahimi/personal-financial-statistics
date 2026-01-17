import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatSortModule } from '@angular/material/sort';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TransactionService } from '../../services/transaction.service';
import { CategoryService } from '../../services/category.service';
import { AIService } from '../../services/ai.service';
import { Transaction, Category } from '../../core/models/transaction.model';

@Component({
  selector: 'app-upload',
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>Upload Transactions</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <div class="upload-container">
          <input type="file" #fileInput hidden (change)="onFileSelected($event)" accept=".csv,.xlsx,.xls">
          <button mat-raised-button color="primary" (click)="fileInput.click()">
            Select File
          </button>
          <p *ngIf="selectedFile">Selected: {{selectedFile.name}}</p>
        </div>
        <div class="preview-container">
          <div class="actions">
            <button mat-button (click)="exportTransactions()">Export</button>
          </div>

          <!-- Categorization Toolbar -->
          <div class="categorization-toolbar" *ngIf="previewData?.length">
            <div class="selection-info">
              <mat-checkbox
                [checked]="isAllSelected()"
                [indeterminate]="isIndeterminate()"
                (change)="toggleSelectAll()">
                Select All
              </mat-checkbox>
              <span class="selection-count" *ngIf="selectedTransactions.size > 0">
                ({{ selectedTransactions.size }} selected)
              </span>
            </div>
            <div class="categorization-actions">
              <button mat-raised-button color="primary"
                      (click)="categorizeAllUncategorized()"
                      [disabled]="isCategorizingInProgress || getUncategorizedCount() === 0">
                Categorize Uncategorized ({{ getUncategorizedCount() }})
              </button>
              <button mat-raised-button color="accent"
                      (click)="categorizeSelected()"
                      [disabled]="isCategorizingInProgress || selectedTransactions.size === 0">
                Categorize Selected
              </button>
              <button mat-stroked-button
                      (click)="categorizeOneByOne()"
                      [disabled]="isCategorizingInProgress || getUncategorizedCount() === 0">
                One by One
              </button>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="progress-container" *ngIf="isCategorizingInProgress">
            <mat-progress-bar mode="determinate" [value]="getProgressPercent()"></mat-progress-bar>
            <span class="progress-text">
              Categorizing: {{ categorizationProgress.current }} / {{ categorizationProgress.total }}
            </span>
          </div>

          <div class="filters-summary">
            <div class="summary" *ngIf="previewData?.length">
              Total: {{ getFilteredTotal() | currency }}
              ({{ previewData?.length??0 }} transactions)
            </div>
            <button mat-button color="warn" (click)="resetFilters()">Reset Filters</button>
          </div>

          <div class="filters">
            <mat-form-field>
              <mat-label>Start Date</mat-label>
              <input matInput [matDatepicker]="startPicker" [(ngModel)]="filterControls.startDate" (dateChange)="applyFilters()">
              <mat-datepicker-toggle matSuffix [for]="startPicker"></mat-datepicker-toggle>
              <mat-datepicker #startPicker></mat-datepicker>
            </mat-form-field>

            <mat-form-field>
              <mat-label>End Date</mat-label>
              <input matInput [matDatepicker]="endPicker" [(ngModel)]="filterControls.endDate" (dateChange)="applyFilters()">
              <mat-datepicker-toggle matSuffix [for]="endPicker"></mat-datepicker-toggle>
              <mat-datepicker #endPicker></mat-datepicker>
            </mat-form-field>

            <mat-form-field>
              <mat-label>Category</mat-label>
              <mat-select [(ngModel)]="filterControls.category" (selectionChange)="applyFilters()">
                <mat-option [value]="''">All</mat-option>
                <mat-option *ngFor="let cat of categories" [value]="cat.name">{{cat.name}}</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field>
              <mat-label>Beneficiary</mat-label>
              <input matInput [(ngModel)]="filterControls.beneficiary" (input)="applyFilters()">
            </mat-form-field>

            <mat-form-field>
              <mat-label>Description</mat-label>
              <input matInput [(ngModel)]="filterControls.description" (input)="applyFilters()">
            </mat-form-field>
          </div>

          <table *ngIf="previewData?.length">
            <thead>
              <tr>
                <th class="checkbox-col">
                  <mat-checkbox
                    [checked]="isAllSelected()"
                    [indeterminate]="isIndeterminate()"
                    (change)="toggleSelectAll()">
                  </mat-checkbox>
                </th>
                <th (click)="sortBy('date')" class="sortable">
                  Date
                  <span class="sort-indicator">
                    {{ sortField === 'date' ? (sortOrder === 'asc' ? '↑' : '↓') : '' }}
                  </span>
                </th>
                <th>Description</th>
                <th (click)="sortBy('amount')" class="sortable">
                  Amount
                  <span class="sort-indicator">
                    {{ sortField === 'amount' ? (sortOrder === 'asc' ? '↑' : '↓') : '' }}
                  </span>
                </th>
                <th>Beneficiary</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of sortedTransactions"
                  [class.selected]="isSelected(item.id)"
                  [class.uncategorized]="!item.category">
                <td class="checkbox-col">
                  <mat-checkbox
                    [checked]="isSelected(item.id)"
                    (change)="toggleSelection(item.id)">
                  </mat-checkbox>
                </td>
                <td>{{item.date | date}}</td>
                <td>{{item.description}}</td>
                <td>{{item.amount | currency}}</td>
                <td>{{item.beneficiary}}</td>
                <td>
                  <mat-select [(ngModel)]="item.category"
                             (selectionChange)="updateTransaction(item)"
                             [style.color]="getCategoryColor(item.category)"
                             [placeholder]="'Select category'">
                    <mat-option value="">-- None --</mat-option>
                    <mat-option *ngFor="let cat of categories" [value]="cat.name">
                      {{cat.name}}
                    </mat-option>
                  </mat-select>
                </td>
              </tr>
            </tbody>
          </table>

          <div *ngIf="!previewData?.length" class="no-data">
            No transactions found matching the current filters.
          </div>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .upload-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 2rem;
    }
    .preview-container {
      margin-top: 2rem;
    }
    .actions {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 0.5rem;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    td mat-select {
      width: 150px;
    }
    .current-category {
      font-weight: 500;
    }
    .filters-summary {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      padding: 0.5rem;
      background: #f5f5f5;
      border-radius: 4px;
    }
    .summary {
      font-weight: 500;
      color: #666;
    }
    .no-data {
      text-align: center;
      padding: 2rem;
      color: #666;
    }
    .sortable {
      cursor: pointer;
      user-select: none;
    }
    .sortable:hover {
      background-color: #f5f5f5;
    }
    .sort-indicator {
      margin-left: 4px;
      color: #666;
    }
    .categorization-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      background: #e3f2fd;
      border-radius: 4px;
      margin-bottom: 1rem;
    }
    .selection-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .selection-count {
      color: #1976d2;
      font-weight: 500;
    }
    .categorization-actions {
      display: flex;
      gap: 0.5rem;
    }
    .progress-container {
      margin-bottom: 1rem;
      padding: 0.5rem;
      background: #fff3e0;
      border-radius: 4px;
    }
    .progress-text {
      display: block;
      text-align: center;
      margin-top: 0.5rem;
      color: #e65100;
      font-weight: 500;
    }
    .checkbox-col {
      width: 50px;
      text-align: center;
    }
    tr.selected {
      background-color: #e3f2fd;
    }
    tr.uncategorized {
      background-color: #fff8e1;
    }
    tr.selected.uncategorized {
      background-color: #c8e6c9;
    }
  `],
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatDialogModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatInputModule,
    FormsModule,
    MatSortModule,
    MatCheckboxModule,
    MatProgressBarModule,
    MatSnackBarModule
  ],
  standalone: true
})
export class UploadComponent implements OnInit {
  selectedFile: File | null = null;
  previewData?: Transaction[]  = [];
  categories: Category[] = [];
  bulkCategory: string = '';
  searchTerm: string = '';
  filterCategory: string = '';
  filterControls = {
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    category: undefined as string | undefined,
    beneficiary: undefined as string | undefined,
    description: undefined as string | undefined
  };
  sortField: 'date' | 'amount' | null = null;
  sortOrder: 'asc' | 'desc' = 'desc';

  // Selection state
  selectedTransactions = new Set<string>();

  // Categorization progress state
  isCategorizingInProgress = false;
  categorizationProgress = { current: 0, total: 0 };

  constructor(
    private transactionService: TransactionService,
    private categoryService: CategoryService,
    private aiService: AIService,
    private snackBar: MatSnackBar
  ) {
    this.categories = this.categoryService.getCategories();
  }

  ngOnInit() {
    // Load transactions on component initialization
    this.loadTransactions();
  }

  async loadTransactions() {
    try {
      await this.transactionService.transactions$.subscribe((data) => {
        this.previewData = data;
      });
    } catch (error) {
      console.error('Failed to load transactions:', error);
    }
  }

  async onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.selectedFile = file;
      await this.transactionService.parseFile(file);
      // Reload transactions after uploading a new file
      this.loadTransactions();
    }
  }

  get sortedTransactions() {
    let data = this.previewData?.filter(t => 
      (!this.searchTerm || t.description.toLowerCase().includes(this.searchTerm.toLowerCase())) &&
      (!this.filterCategory || t.category === this.filterCategory)
    ) || [];

    if (this.sortField) {
      data = [...data].sort((a, b) => {
        const aValue = this.sortField === 'date' ? new Date(a.date).getTime() : a.amount;
        const bValue = this.sortField === 'date' ? new Date(b.date).getTime() : b.amount;
        return (aValue - bValue) * (this.sortOrder === 'asc' ? 1 : -1);
      });
    }

    return data;
  }

  sortBy(field: 'date' | 'amount') {
    if (this.sortField === field) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortOrder = 'desc';
    }
  }

  updateTransaction(transaction: Transaction) {
    this.transactionService.updateTransaction(transaction);
  }

  applyBulkCategory() {
    if (this.bulkCategory) {
      this.previewData?.forEach(t => {
        t.category = this.bulkCategory;
        this.updateTransaction(t);
      });
    }
  }

  exportTransactions() {
    const csv = this.transactionService.exportToCSV(this.previewData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  }

  getCategoryColor(categoryName?: string): string {
    const category = this.categories.find(c => c.name === categoryName);
    return category?.color || 'inherit';
  }

  async applyFilters() {
    const filters = {
      ...(this.filterControls.startDate && { startDate: this.filterControls.startDate }),
      ...(this.filterControls.endDate && { endDate: this.filterControls.endDate }),
      ...(this.filterControls.category && { category: this.filterControls.category }),
      ...(this.filterControls.beneficiary && { beneficiary: this.filterControls.beneficiary }),
      ...(this.filterControls.description && { description: this.filterControls.description })
    };
    await this.transactionService.filterTransactions(filters);
  }

  getFilteredTotal(): number {
    return this.previewData?.reduce((sum, t) => sum + t.amount, 0) || 0;
  }

  resetFilters() {
    this.filterControls = {
      startDate: undefined,
      endDate: undefined,
      category: undefined,
      beneficiary: undefined,
      description: undefined
    };
    this.sortField = null;
    this.sortOrder = 'desc';
    this.loadTransactions();
  }

  // Selection methods
  toggleSelection(id: string) {
    if (this.selectedTransactions.has(id)) {
      this.selectedTransactions.delete(id);
    } else {
      this.selectedTransactions.add(id);
    }
  }

  toggleSelectAll() {
    if (this.isAllSelected()) {
      this.selectedTransactions.clear();
    } else {
      this.sortedTransactions.forEach(t => this.selectedTransactions.add(t.id));
    }
  }

  isSelected(id: string): boolean {
    return this.selectedTransactions.has(id);
  }

  isAllSelected(): boolean {
    return this.sortedTransactions.length > 0 &&
           this.sortedTransactions.every(t => this.selectedTransactions.has(t.id));
  }

  isIndeterminate(): boolean {
    return this.selectedTransactions.size > 0 && !this.isAllSelected();
  }

  // Categorization helper methods
  getUncategorizedCount(): number {
    return this.previewData?.filter(t => !t.category || t.category === '').length || 0;
  }

  getProgressPercent(): number {
    if (this.categorizationProgress.total === 0) return 0;
    return (this.categorizationProgress.current / this.categorizationProgress.total) * 100;
  }

  // Categorization methods
  async categorizeAllUncategorized() {
    const uncategorized = this.previewData?.filter(t => !t.category || t.category === '') || [];
    if (uncategorized.length === 0) return;
    await this.categorizeTransactions(uncategorized);
  }

  async categorizeSelected() {
    const selected = this.previewData?.filter(t => this.selectedTransactions.has(t.id)) || [];
    if (selected.length === 0) return;
    await this.categorizeTransactions(selected);
  }

  async categorizeOneByOne() {
    const uncategorized = this.previewData?.filter(t => !t.category || t.category === '') || [];
    if (uncategorized.length === 0) return;
    await this.categorizeTransactions(uncategorized, true);
  }

  private async categorizeTransactions(transactions: Transaction[], showProgress = true) {
    this.isCategorizingInProgress = true;
    this.categorizationProgress = { current: 0, total: transactions.length };

    try {
      for (const transaction of transactions) {
        try {
          const category = await this.aiService.suggestCategory(transaction.description);
          transaction.category = category;
          await this.transactionService.updateTransaction(transaction);

          this.categorizationProgress.current++;

          if (showProgress) {
            // Small delay to make progress visible for one-by-one mode
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error(`Failed to categorize transaction ${transaction.id}:`, error);
        }
      }

      this.snackBar.open(
        `Categorized ${this.categorizationProgress.current} transaction(s)`,
        'Close',
        { duration: 3000 }
      );
    } finally {
      this.isCategorizingInProgress = false;
      this.categorizationProgress = { current: 0, total: 0 };
      this.selectedTransactions.clear();
      // Refresh categories in case new ones were created
      this.categories = this.categoryService.getCategories();
    }
  }
}
