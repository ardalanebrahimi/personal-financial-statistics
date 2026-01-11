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
import { TransactionService } from '../../services/transaction.service';
import { CategoryService } from '../../services/category.service';
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
                <th>Current Category</th>
                <th>New Category</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of sortedTransactions">
                <td>{{item.date | date}}</td>
                <td>{{item.description}}</td>
                <td>{{item.amount | currency}}</td>
                <td>{{item.beneficiary}}</td>
                <td>{{item.category}}</td>
                <td>
                  <mat-select [(ngModel)]="item.category" 
                             (selectionChange)="updateTransaction(item)"
                             [style.color]="getCategoryColor(item.category)">
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
    MatSortModule
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

  constructor(
    private transactionService: TransactionService,
    private categoryService: CategoryService
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
}
