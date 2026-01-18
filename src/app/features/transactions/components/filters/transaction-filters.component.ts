/**
 * Transaction Filters Component
 *
 * Filter panel for transactions with search, date range, category, and more.
 */

import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { Subscription } from 'rxjs';
import { Category } from '../../../../core/models/transaction.model';
import { TransactionFilters, TransactionFilterService } from '../../services/transaction-filter.service';

@Component({
  selector: 'app-transaction-filters',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule
  ],
  template: `
    <div class="filters-panel">
      <!-- Row 1: Basic filters -->
      <div class="filter-row">
        <mat-form-field appearance="outline">
          <mat-label>Search</mat-label>
          <input matInput [(ngModel)]="filters.search" (input)="onFiltersChange()" placeholder="Description...">
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Start Date</mat-label>
          <input matInput [matDatepicker]="startPicker" [(ngModel)]="filters.startDate" (dateChange)="onFiltersChange()">
          <mat-datepicker-toggle matSuffix [for]="startPicker"></mat-datepicker-toggle>
          <mat-datepicker #startPicker></mat-datepicker>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>End Date</mat-label>
          <input matInput [matDatepicker]="endPicker" [(ngModel)]="filters.endDate" (dateChange)="onFiltersChange()">
          <mat-datepicker-toggle matSuffix [for]="endPicker"></mat-datepicker-toggle>
          <mat-datepicker #endPicker></mat-datepicker>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Category</mat-label>
          <mat-select [(ngModel)]="filters.category" (selectionChange)="onFiltersChange()">
            <mat-option [value]="''">All Categories</mat-option>
            <mat-option value="__uncategorized__">Uncategorized</mat-option>
            <mat-option *ngFor="let cat of categories" [value]="cat.name">{{ cat.name }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Type</mat-label>
          <mat-select [(ngModel)]="filters.type" (selectionChange)="onFiltersChange()">
            <mat-option [value]="''">All</mat-option>
            <mat-option value="expense">Expenses</mat-option>
            <mat-option value="income">Income</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Source</mat-label>
          <mat-select [(ngModel)]="filters.source" (selectionChange)="onFiltersChange()">
            <mat-option [value]="''">All Sources</mat-option>
            <mat-option *ngFor="let source of sources" [value]="source">{{ source }}</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <!-- Row 2: Enhanced filters -->
      <div class="filter-row">
        <mat-form-field appearance="outline" class="amount-field">
          <mat-label>Min Amount</mat-label>
          <input matInput type="number" [(ngModel)]="filters.amountMin" (input)="onFiltersChange()" placeholder="0">
          <span matTextPrefix>€&nbsp;</span>
        </mat-form-field>

        <mat-form-field appearance="outline" class="amount-field">
          <mat-label>Max Amount</mat-label>
          <input matInput type="number" [(ngModel)]="filters.amountMax" (input)="onFiltersChange()" placeholder="∞">
          <span matTextPrefix>€&nbsp;</span>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Beneficiary</mat-label>
          <input matInput [(ngModel)]="filters.beneficiary" (input)="onFiltersChange()" placeholder="Filter by beneficiary...">
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Linked</mat-label>
          <mat-select [(ngModel)]="filters.hasMatch" (selectionChange)="onFiltersChange()">
            <mat-option [value]="''">All</mat-option>
            <mat-option value="yes">Has Links</mat-option>
            <mat-option value="no">No Links</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>External Data</mat-label>
          <mat-select [(ngModel)]="filters.showContextOnly" (selectionChange)="onFiltersChange()">
            <mat-option [value]="''">Hide External</mat-option>
            <mat-option value="all">Show All</mat-option>
            <mat-option value="only">Only External</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Platform</mat-label>
          <mat-select [(ngModel)]="filters.platform" (selectionChange)="onFiltersChange()">
            <mat-option [value]="''">All Platforms</mat-option>
            <mat-divider></mat-divider>
            <mat-option value="amazon">
              <mat-icon class="amazon-icon">shopping_cart</mat-icon> Amazon (All)
            </mat-option>
            <mat-option value="amazon-unlinked">
              <mat-icon class="warning-icon">warning</mat-icon> Amazon Unlinked
            </mat-option>
            <mat-divider></mat-divider>
            <mat-option value="paypal">
              <mat-icon class="paypal-icon">account_balance_wallet</mat-icon> PayPal (All)
            </mat-option>
            <mat-option value="paypal-unlinked">
              <mat-icon class="warning-icon">warning</mat-icon> PayPal Unlinked
            </mat-option>
          </mat-select>
        </mat-form-field>

        <button mat-stroked-button (click)="resetFilters()">
          <mat-icon>clear</mat-icon>
          Reset
        </button>
      </div>

      <!-- Row 3: Quick date buttons -->
      <div class="quick-dates">
        <span class="quick-dates-label">Quick:</span>
        <button mat-stroked-button (click)="setQuickDateFilter('thisMonth')" [class.active]="isQuickDateActive('thisMonth')">
          This Month
        </button>
        <button mat-stroked-button (click)="setQuickDateFilter('lastMonth')" [class.active]="isQuickDateActive('lastMonth')">
          Last Month
        </button>
        <button mat-stroked-button (click)="setQuickDateFilter('thisYear')" [class.active]="isQuickDateActive('thisYear')">
          This Year
        </button>
        <button mat-stroked-button (click)="setQuickDateFilter('lastYear')" [class.active]="isQuickDateActive('lastYear')">
          Last Year
        </button>
        <button mat-stroked-button (click)="setQuickDateFilter('all')" [class.active]="isQuickDateActive('all')">
          All Time
        </button>
      </div>
    </div>
  `,
  styles: [`
    .filters-panel {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px 24px;
      background: white;
      border-bottom: 1px solid #e0e0e0;
    }

    .filter-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
    }

    .filter-row mat-form-field {
      flex: 1;
      min-width: 140px;
      max-width: 180px;
    }

    .filter-row .amount-field {
      max-width: 120px;
    }

    .quick-dates {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .quick-dates-label {
      font-size: 13px;
      color: #666;
      margin-right: 4px;
    }

    .quick-dates button {
      font-size: 12px;
    }

    .quick-dates button.active {
      background-color: #1976d2;
      color: white;
    }

    .amazon-icon { color: #ff9800 !important; }
    .paypal-icon { color: #0070ba !important; }
    .warning-icon { color: #ff9800 !important; }
  `]
})
export class TransactionFiltersComponent implements OnInit, OnDestroy {
  @Input() categories: Category[] = [];
  @Input() sources: string[] = [];

  @Output() filtersChange = new EventEmitter<TransactionFilters>();

  filters: TransactionFilters;
  private subscription?: Subscription;

  constructor(private filterService: TransactionFilterService) {
    this.filters = this.filterService.getDefaultFilters();
  }

  ngOnInit(): void {
    this.subscription = this.filterService.filters$.subscribe(filters => {
      this.filters = { ...filters };
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  onFiltersChange(): void {
    this.filterService.setFilters(this.filters);
    this.filtersChange.emit(this.filters);
  }

  resetFilters(): void {
    this.filterService.resetFilters();
    this.filters = this.filterService.getDefaultFilters();
    this.filtersChange.emit(this.filters);
  }

  setQuickDateFilter(period: 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'all'): void {
    const now = new Date();
    switch (period) {
      case 'thisMonth':
        this.filters.startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        this.filters.endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'lastMonth':
        this.filters.startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        this.filters.endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'thisYear':
        this.filters.startDate = new Date(now.getFullYear(), 0, 1);
        this.filters.endDate = new Date(now.getFullYear(), 11, 31);
        break;
      case 'lastYear':
        this.filters.startDate = new Date(now.getFullYear() - 1, 0, 1);
        this.filters.endDate = new Date(now.getFullYear() - 1, 11, 31);
        break;
      case 'all':
        this.filters.startDate = undefined;
        this.filters.endDate = undefined;
        break;
    }
    this.onFiltersChange();
  }

  isQuickDateActive(period: 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'all'): boolean {
    if (!this.filters.startDate && !this.filters.endDate) {
      return period === 'all';
    }
    if (!this.filters.startDate || !this.filters.endDate) {
      return false;
    }
    const now = new Date();
    const start = this.filters.startDate;
    const end = this.filters.endDate;

    switch (period) {
      case 'thisMonth':
        return start.getMonth() === now.getMonth() && start.getFullYear() === now.getFullYear() &&
               end.getMonth() === now.getMonth() && end.getFullYear() === now.getFullYear();
      case 'lastMonth':
        const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        return start.getMonth() === lastMonth && start.getFullYear() === lastMonthYear;
      case 'thisYear':
        return start.getFullYear() === now.getFullYear() && start.getMonth() === 0 &&
               end.getFullYear() === now.getFullYear() && end.getMonth() === 11;
      case 'lastYear':
        return start.getFullYear() === now.getFullYear() - 1 && start.getMonth() === 0 &&
               end.getFullYear() === now.getFullYear() - 1 && end.getMonth() === 11;
      default:
        return false;
    }
  }
}
