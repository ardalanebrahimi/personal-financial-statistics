import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatSortModule, Sort } from '@angular/material/sort';
import { TrendsService, MonthComparison } from '../../services/trends.service';

interface MonthOption {
  value: Date;
  label: string;
}

@Component({
  selector: 'app-month-comparison',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule,
    MatButtonModule,
    MatSortModule
  ],
  template: `
    <div class="month-comparison-container">
      <!-- Month Selector -->
      <mat-card class="controls-card">
        <mat-card-content>
          <div class="controls-row">
            <mat-form-field appearance="outline">
              <mat-label>Compare Month</mat-label>
              <mat-select [(ngModel)]="selectedMonth" (selectionChange)="loadData()">
                <mat-option *ngFor="let month of availableMonths" [value]="month.value">
                  {{ month.label }}
                </mat-option>
              </mat-select>
            </mat-form-field>

            <div class="comparison-info" *ngIf="thisMonthLabel && lastMonthLabel">
              <mat-icon>compare_arrows</mat-icon>
              <span>{{ thisMonthLabel }} vs {{ lastMonthLabel }}</span>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Summary Cards -->
      <div class="summary-cards" *ngIf="!loading && comparisons.length > 0">
        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon [class.positive]="totalChange < 0" [class.negative]="totalChange > 0">
              {{ totalChange <= 0 ? 'trending_down' : 'trending_up' }}
            </mat-icon>
            <div class="summary-info">
              <span class="summary-label">Total Change</span>
              <span class="summary-value" [class.positive]="totalChange < 0" [class.negative]="totalChange > 0">
                {{ totalChange > 0 ? '+' : '' }}{{ totalChange | currency:'EUR' }}
              </span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon>pie_chart</mat-icon>
            <div class="summary-info">
              <span class="summary-label">% Change</span>
              <span class="summary-value" [class.positive]="totalPercentChange !== null && totalPercentChange < 0"
                    [class.negative]="totalPercentChange !== null && totalPercentChange > 0">
                {{ totalPercentChange !== null ? (totalPercentChange > 0 ? '+' : '') + (totalPercentChange | number:'1.1-1') + '%' : 'N/A' }}
              </span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon class="up">arrow_upward</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Categories Up</span>
              <span class="summary-value negative">{{ categoriesUp }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon class="down">arrow_downward</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Categories Down</span>
              <span class="summary-value positive">{{ categoriesDown }}</span>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Comparison Table -->
      <mat-card class="comparison-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>compare_arrows</mat-icon>
          <mat-card-title>Month-over-Month Comparison</mat-card-title>
          <mat-card-subtitle *ngIf="thisMonthLabel && lastMonthLabel">
            {{ thisMonthLabel }} compared to {{ lastMonthLabel }}
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="loading-container" *ngIf="loading">
            <mat-spinner diameter="40"></mat-spinner>
            <span>Loading data...</span>
          </div>

          <div class="empty-state" *ngIf="!loading && comparisons.length === 0">
            <mat-icon>info</mat-icon>
            <p>No comparison data available</p>
          </div>

          <div class="comparison-table" *ngIf="!loading && comparisons.length > 0">
            <div class="table-header">
              <span class="col-category">Category</span>
              <span class="col-this-month">{{ thisMonthLabel }}</span>
              <span class="col-last-month">{{ lastMonthLabel }}</span>
              <span class="col-change clickable" (click)="sortBy('change')">
                Change
                <mat-icon *ngIf="sortColumn === 'change'">{{ sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward' }}</mat-icon>
              </span>
              <span class="col-percent clickable" (click)="sortBy('percent')">
                %
                <mat-icon *ngIf="sortColumn === 'percent'">{{ sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward' }}</mat-icon>
              </span>
              <span class="col-indicator"></span>
            </div>

            <div *ngFor="let row of sortedComparisons" class="table-row">
              <span class="col-category">
                <span class="color-dot" [style.background-color]="row.color"></span>
                {{ row.category }}
              </span>
              <span class="col-this-month">{{ row.thisMonth | currency:'EUR' }}</span>
              <span class="col-last-month">{{ row.lastMonth | currency:'EUR' }}</span>
              <span class="col-change" [class.positive]="row.change < 0" [class.negative]="row.change > 0">
                {{ row.change > 0 ? '+' : '' }}{{ row.change | currency:'EUR' }}
              </span>
              <span class="col-percent" [class.positive]="row.percentChange !== null && row.percentChange < 0"
                    [class.negative]="row.percentChange !== null && row.percentChange > 0">
                {{ row.percentChange !== null ? (row.percentChange > 0 ? '+' : '') + (row.percentChange | number:'1.1-1') + '%' : 'New' }}
              </span>
              <span class="col-indicator">
                <mat-icon *ngIf="row.change > 0" class="indicator-up">arrow_upward</mat-icon>
                <mat-icon *ngIf="row.change < 0" class="indicator-down">arrow_downward</mat-icon>
                <mat-icon *ngIf="row.change === 0" class="indicator-same">remove</mat-icon>
              </span>
            </div>

            <!-- Totals Row -->
            <div class="table-row totals-row">
              <span class="col-category"><strong>TOTAL</strong></span>
              <span class="col-this-month"><strong>{{ totalThisMonth | currency:'EUR' }}</strong></span>
              <span class="col-last-month"><strong>{{ totalLastMonth | currency:'EUR' }}</strong></span>
              <span class="col-change" [class.positive]="totalChange < 0" [class.negative]="totalChange > 0">
                <strong>{{ totalChange > 0 ? '+' : '' }}{{ totalChange | currency:'EUR' }}</strong>
              </span>
              <span class="col-percent" [class.positive]="totalPercentChange !== null && totalPercentChange < 0"
                    [class.negative]="totalPercentChange !== null && totalPercentChange > 0">
                <strong>{{ totalPercentChange !== null ? (totalPercentChange > 0 ? '+' : '') + (totalPercentChange | number:'1.1-1') + '%' : 'N/A' }}</strong>
              </span>
              <span class="col-indicator"></span>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .month-comparison-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .controls-card mat-card-content {
      padding: 1rem !important;
    }

    .controls-row {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      align-items: center;
    }

    .controls-row mat-form-field {
      width: 200px;
    }

    .comparison-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #666;
      font-size: 14px;
    }

    .comparison-info mat-icon {
      color: #1976d2;
    }

    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
    }

    .summary-card mat-card-content {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem !important;
    }

    .summary-card mat-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
      color: #666;
    }

    .summary-card mat-icon.positive { color: #4caf50; }
    .summary-card mat-icon.negative { color: #f44336; }
    .summary-card mat-icon.up { color: #f44336; }
    .summary-card mat-icon.down { color: #4caf50; }

    .summary-info {
      display: flex;
      flex-direction: column;
    }

    .summary-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
    }

    .summary-value {
      font-size: 1.25rem;
      font-weight: 500;
    }

    .summary-value.positive { color: #4caf50; }
    .summary-value.negative { color: #f44336; }

    .comparison-card {
      width: 100%;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 200px;
      gap: 1rem;
      color: #666;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 200px;
      color: #666;
    }

    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 1rem;
    }

    .comparison-table {
      width: 100%;
      overflow-x: auto;
    }

    .table-header {
      display: flex;
      padding: 0.75rem 0;
      border-bottom: 2px solid #e0e0e0;
      font-weight: 500;
      color: #666;
      min-width: 600px;
    }

    .table-row {
      display: flex;
      padding: 0.75rem 0;
      border-bottom: 1px solid #f0f0f0;
      align-items: center;
      min-width: 600px;
    }

    .table-row:hover {
      background: #fafafa;
    }

    .totals-row {
      background: #f5f5f5;
      border-top: 2px solid #e0e0e0;
    }

    .totals-row:hover {
      background: #f5f5f5;
    }

    .col-category {
      flex: 2;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .col-this-month, .col-last-month {
      flex: 1;
      text-align: right;
    }

    .col-change {
      flex: 1;
      text-align: right;
      font-weight: 500;
    }

    .col-percent {
      flex: 0.8;
      text-align: right;
    }

    .col-indicator {
      width: 40px;
      text-align: center;
    }

    .clickable {
      cursor: pointer;
      user-select: none;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 4px;
    }

    .clickable mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .clickable:hover {
      color: #1976d2;
    }

    .color-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .positive { color: #4caf50; }
    .negative { color: #f44336; }

    .indicator-up {
      color: #f44336;
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .indicator-down {
      color: #4caf50;
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .indicator-same {
      color: #9e9e9e;
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    @media (max-width: 768px) {
      .controls-row {
        flex-direction: column;
        align-items: stretch;
      }

      .controls-row mat-form-field {
        width: 100%;
      }

      .col-last-month {
        display: none;
      }
    }
  `]
})
export class MonthComparisonComponent implements OnInit {
  loading = false;
  selectedMonth: Date;
  availableMonths: MonthOption[] = [];
  comparisons: MonthComparison[] = [];
  thisMonthLabel = '';
  lastMonthLabel = '';

  // Totals
  totalThisMonth = 0;
  totalLastMonth = 0;
  totalChange = 0;
  totalPercentChange: number | null = null;
  categoriesUp = 0;
  categoriesDown = 0;

  // Sorting
  sortColumn: 'change' | 'percent' | null = 'change';
  sortDirection: 'asc' | 'desc' = 'desc';

  private readonly monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  constructor(private trendsService: TrendsService) {
    // Default to current month
    const now = new Date();
    this.selectedMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    this.buildAvailableMonths();
  }

  ngOnInit(): void {
    this.loadData();
  }

  get sortedComparisons(): MonthComparison[] {
    if (!this.sortColumn) return this.comparisons;

    return [...this.comparisons].sort((a, b) => {
      let aVal: number, bVal: number;

      if (this.sortColumn === 'change') {
        aVal = Math.abs(a.change);
        bVal = Math.abs(b.change);
      } else {
        aVal = a.percentChange !== null ? Math.abs(a.percentChange) : -1;
        bVal = b.percentChange !== null ? Math.abs(b.percentChange) : -1;
      }

      return this.sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }

  private buildAvailableMonths(): void {
    const now = new Date();
    const months: MonthOption[] = [];

    // Go back 24 months
    for (let i = 0; i < 24; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        value: date,
        label: `${this.monthNames[date.getMonth()]} ${date.getFullYear()}`
      });
    }

    this.availableMonths = months;
  }

  loadData(): void {
    if (!this.selectedMonth) return;

    this.loading = true;
    this.trendsService.getMonthComparison(this.selectedMonth).subscribe({
      next: (result) => {
        this.comparisons = result.comparisons;
        this.thisMonthLabel = result.thisMonthLabel;
        this.lastMonthLabel = result.lastMonthLabel;
        this.calculateTotals();
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load comparison data:', err);
        this.loading = false;
      }
    });
  }

  private calculateTotals(): void {
    this.totalThisMonth = this.comparisons.reduce((sum, c) => sum + c.thisMonth, 0);
    this.totalLastMonth = this.comparisons.reduce((sum, c) => sum + c.lastMonth, 0);
    this.totalChange = this.totalThisMonth - this.totalLastMonth;
    this.totalPercentChange = this.totalLastMonth > 0
      ? ((this.totalThisMonth - this.totalLastMonth) / this.totalLastMonth) * 100
      : null;

    this.categoriesUp = this.comparisons.filter(c => c.change > 0).length;
    this.categoriesDown = this.comparisons.filter(c => c.change < 0).length;
  }

  sortBy(column: 'change' | 'percent'): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'desc' ? 'asc' : 'desc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'desc';
    }
  }
}
