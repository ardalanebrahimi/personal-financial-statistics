/**
 * Transaction Filters Component
 *
 * Reusable filter panel for transactions.
 */

import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';

import { Category } from '../../../core/models/transaction.model';
import { TransactionFilters, TransactionFilterService } from '../services/transaction-filter.service';

@Component({
  selector: 'app-transaction-filters',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatChipsModule,
    MatTooltipModule
  ],
  template: `
    <div class="filters-panel" [class.collapsed]="collapsed">
      <div class="filters-header" (click)="collapsed = !collapsed">
        <mat-icon>{{ collapsed ? 'expand_more' : 'expand_less' }}</mat-icon>
        <span>Filters</span>
        <span class="active-count" *ngIf="activeFilterCount > 0">
          {{ activeFilterCount }} active
        </span>
      </div>

      <div class="filters-content" *ngIf="!collapsed">
        <!-- Search -->
        <mat-form-field appearance="outline" class="filter-field full-width">
          <mat-label>Search</mat-label>
          <input matInput [(ngModel)]="filters.search" (ngModelChange)="onFilterChange()"
                 placeholder="Search description, beneficiary...">
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>

        <!-- Date Range -->
        <div class="filter-row">
          <mat-form-field appearance="outline" class="filter-field">
            <mat-label>Start Date</mat-label>
            <input matInput [matDatepicker]="startPicker" [(ngModel)]="filters.startDate"
                   (ngModelChange)="onFilterChange()">
            <mat-datepicker-toggle matSuffix [for]="startPicker"></mat-datepicker-toggle>
            <mat-datepicker #startPicker></mat-datepicker>
          </mat-form-field>

          <mat-form-field appearance="outline" class="filter-field">
            <mat-label>End Date</mat-label>
            <input matInput [matDatepicker]="endPicker" [(ngModel)]="filters.endDate"
                   (ngModelChange)="onFilterChange()">
            <mat-datepicker-toggle matSuffix [for]="endPicker"></mat-datepicker-toggle>
            <mat-datepicker #endPicker></mat-datepicker>
          </mat-form-field>
        </div>

        <!-- Category & Type -->
        <div class="filter-row">
          <mat-form-field appearance="outline" class="filter-field">
            <mat-label>Category</mat-label>
            <mat-select [(ngModel)]="filters.category" (ngModelChange)="onFilterChange()">
              <mat-option value="">All Categories</mat-option>
              <mat-option value="__uncategorized__">Uncategorized</mat-option>
              <mat-option *ngFor="let cat of categories" [value]="cat.name">
                {{ cat.name }}
              </mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="filter-field">
            <mat-label>Type</mat-label>
            <mat-select [(ngModel)]="filters.type" (ngModelChange)="onFilterChange()">
              <mat-option value="">All Types</mat-option>
              <mat-option value="income">Income</mat-option>
              <mat-option value="expense">Expense</mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <!-- Amount Range -->
        <div class="filter-row">
          <mat-form-field appearance="outline" class="filter-field">
            <mat-label>Min Amount</mat-label>
            <input matInput type="number" [(ngModel)]="filters.amountMin"
                   (ngModelChange)="onFilterChange()">
          </mat-form-field>

          <mat-form-field appearance="outline" class="filter-field">
            <mat-label>Max Amount</mat-label>
            <input matInput type="number" [(ngModel)]="filters.amountMax"
                   (ngModelChange)="onFilterChange()">
          </mat-form-field>
        </div>

        <!-- Source & Platform -->
        <div class="filter-row">
          <mat-form-field appearance="outline" class="filter-field">
            <mat-label>Source</mat-label>
            <mat-select [(ngModel)]="filters.source" (ngModelChange)="onFilterChange()">
              <mat-option value="">All Sources</mat-option>
              <mat-option *ngFor="let source of sources" [value]="source">
                {{ source }}
              </mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="filter-field">
            <mat-label>Platform</mat-label>
            <mat-select [(ngModel)]="filters.platform" (ngModelChange)="onFilterChange()">
              <mat-option value="">All Platforms</mat-option>
              <mat-option value="amazon">Amazon</mat-option>
              <mat-option value="paypal">PayPal</mat-option>
              <mat-option value="amazon-unlinked">Amazon (Unlinked)</mat-option>
              <mat-option value="paypal-unlinked">PayPal (Unlinked)</mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <!-- Match & Context filters -->
        <div class="filter-row">
          <mat-form-field appearance="outline" class="filter-field">
            <mat-label>Has Match</mat-label>
            <mat-select [(ngModel)]="filters.hasMatch" (ngModelChange)="onFilterChange()">
              <mat-option value="">Any</mat-option>
              <mat-option value="yes">Matched</mat-option>
              <mat-option value="no">Unmatched</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="filter-field">
            <mat-label>Context Only</mat-label>
            <mat-select [(ngModel)]="filters.showContextOnly" (ngModelChange)="onFilterChange()">
              <mat-option value="">Hide</mat-option>
              <mat-option value="all">Show All</mat-option>
              <mat-option value="only">Only Context</mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <!-- Actions -->
        <div class="filter-actions">
          <button mat-button color="warn" (click)="resetFilters()"
                  *ngIf="activeFilterCount > 0">
            <mat-icon>clear</mat-icon>
            Clear Filters
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .filters-panel {
      background: white;
      border-radius: 8px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .filters-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      cursor: pointer;
      user-select: none;
    }

    .filters-header:hover {
      background: #f5f5f5;
    }

    .active-count {
      margin-left: auto;
      font-size: 12px;
      color: #1976d2;
      background: #e3f2fd;
      padding: 2px 8px;
      border-radius: 12px;
    }

    .filters-content {
      padding: 16px;
      border-top: 1px solid #e0e0e0;
    }

    .filter-row {
      display: flex;
      gap: 16px;
    }

    .filter-field {
      flex: 1;
    }

    .filter-field.full-width {
      width: 100%;
    }

    .filter-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 8px;
    }

    :host ::ng-deep .mat-mdc-form-field {
      font-size: 14px;
    }
  `]
})
export class TransactionFiltersComponent implements OnInit, OnDestroy {
  @Input() categories: Category[] = [];
  @Input() sources: string[] = [];
  @Output() filtersChange = new EventEmitter<TransactionFilters>();

  filters: TransactionFilters;
  collapsed = false;
  activeFilterCount = 0;

  private subscription?: Subscription;

  constructor(private filterService: TransactionFilterService) {
    this.filters = this.filterService.getDefaultFilters();
  }

  ngOnInit(): void {
    this.subscription = this.filterService.filters$.subscribe(filters => {
      this.filters = { ...filters };
      this.activeFilterCount = this.filterService.getActiveFilterCount(filters);
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  onFilterChange(): void {
    this.filterService.setFilters(this.filters);
    this.filtersChange.emit(this.filters);
  }

  resetFilters(): void {
    this.filterService.resetFilters();
    this.filters = this.filterService.getDefaultFilters();
    this.filtersChange.emit(this.filters);
  }
}
