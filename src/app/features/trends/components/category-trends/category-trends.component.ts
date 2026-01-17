import { Component, Input, OnInit, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { BaseChartDirective, NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { TrendsService, CategoryMonthlyData } from '../../services/trends.service';

@Component({
  selector: 'app-category-trends',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule,
    MatChipsModule,
    MatCheckboxModule,
    NgChartsModule
  ],
  template: `
    <div class="category-trends-container">
      <!-- Controls -->
      <mat-card class="controls-card">
        <mat-card-content>
          <div class="controls-row">
            <mat-form-field appearance="outline">
              <mat-label>Show Top Categories</mat-label>
              <mat-select [(ngModel)]="topN" (selectionChange)="loadData()">
                <mat-option [value]="5">Top 5</mat-option>
                <mat-option [value]="10">Top 10</mat-option>
                <mat-option [value]="15">Top 15</mat-option>
                <mat-option [value]="0">All</mat-option>
              </mat-select>
            </mat-form-field>

            <div class="category-toggles" *ngIf="categoryData.length > 0">
              <span class="toggles-label">Toggle categories:</span>
              <div class="toggles-list">
                <mat-checkbox
                  *ngFor="let cat of categoryData"
                  [checked]="visibleCategories.has(cat.category)"
                  (change)="toggleCategory(cat.category)"
                  [style.color]="cat.color">
                  <span class="category-chip" [style.background-color]="cat.color + '20'" [style.border-color]="cat.color">
                    {{ cat.category }}
                  </span>
                </mat-checkbox>
              </div>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Chart -->
      <mat-card class="chart-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>show_chart</mat-icon>
          <mat-card-title>Category Spending Trends</mat-card-title>
          <mat-card-subtitle>Track spending patterns by category over time</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="chart-container" *ngIf="!loading && chartData">
            <canvas baseChart
              type="line"
              [data]="chartData"
              [options]="chartOptions">
            </canvas>
          </div>
          <div class="loading-container" *ngIf="loading">
            <mat-spinner diameter="40"></mat-spinner>
            <span>Loading data...</span>
          </div>
          <div class="empty-state" *ngIf="!loading && (!categoryData || categoryData.length === 0)">
            <mat-icon>info</mat-icon>
            <p>No category data available for the selected period</p>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Category Summary Table -->
      <mat-card class="summary-card" *ngIf="categoryData && categoryData.length > 0">
        <mat-card-header>
          <mat-icon mat-card-avatar>leaderboard</mat-icon>
          <mat-card-title>Category Summary</mat-card-title>
          <mat-card-subtitle>Total spending by category for the selected period</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="summary-table">
            <div class="summary-header">
              <span class="col-rank">#</span>
              <span class="col-category">Category</span>
              <span class="col-total">Total</span>
              <span class="col-avg">Monthly Avg</span>
              <span class="col-percent">% of Total</span>
            </div>
            <div *ngFor="let cat of categoryData; let i = index" class="summary-row"
                 [class.hidden]="!visibleCategories.has(cat.category)">
              <span class="col-rank">{{ i + 1 }}</span>
              <span class="col-category">
                <span class="color-dot" [style.background-color]="cat.color"></span>
                {{ cat.category }}
              </span>
              <span class="col-total">{{ cat.total | currency:'EUR' }}</span>
              <span class="col-avg">{{ getMonthlyAvg(cat) | currency:'EUR' }}</span>
              <span class="col-percent">{{ getPercentage(cat) | number:'1.1-1' }}%</span>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .category-trends-container {
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
      align-items: flex-start;
    }

    .controls-row mat-form-field {
      width: 180px;
    }

    .category-toggles {
      flex: 1;
    }

    .toggles-label {
      font-size: 12px;
      color: #666;
      display: block;
      margin-bottom: 0.5rem;
    }

    .toggles-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .toggles-list mat-checkbox {
      margin-right: 0.5rem;
    }

    .category-chip {
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      border: 1px solid;
    }

    .chart-card, .summary-card {
      width: 100%;
    }

    .chart-container {
      position: relative;
      min-height: 400px;
      padding: 1rem;
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

    .summary-table {
      width: 100%;
    }

    .summary-header {
      display: flex;
      padding: 0.75rem 0;
      border-bottom: 2px solid #e0e0e0;
      font-weight: 500;
      color: #666;
    }

    .summary-row {
      display: flex;
      padding: 0.75rem 0;
      border-bottom: 1px solid #f0f0f0;
      align-items: center;
    }

    .summary-row:hover {
      background: #fafafa;
    }

    .summary-row.hidden {
      opacity: 0.4;
    }

    .col-rank {
      width: 40px;
      text-align: center;
      color: #999;
    }

    .col-category {
      flex: 2;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .col-total, .col-avg, .col-percent {
      flex: 1;
      text-align: right;
    }

    .col-total {
      font-weight: 500;
    }

    .col-avg, .col-percent {
      color: #666;
    }

    .color-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    @media (max-width: 768px) {
      .controls-row {
        flex-direction: column;
      }

      .controls-row mat-form-field {
        width: 100%;
      }

      .col-avg {
        display: none;
      }
    }
  `]
})
export class CategoryTrendsComponent implements OnInit, OnChanges {
  @Input() startDate!: Date;
  @Input() endDate!: Date;

  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

  loading = false;
  topN = 10;
  categoryData: CategoryMonthlyData[] = [];
  visibleCategories = new Set<string>();
  totalSpending = 0;

  chartData: ChartData<'line'> | undefined;

  chartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index'
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          boxWidth: 8
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.raw as number;
            return `${context.dataset.label}: €${value.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        }
      },
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => `€${value.toLocaleString('de-DE')}`
        }
      }
    }
  };

  constructor(private trendsService: TrendsService) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['startDate'] || changes['endDate']) && !changes['startDate']?.firstChange) {
      this.loadData();
    }
  }

  loadData(): void {
    if (!this.startDate || !this.endDate) return;

    this.loading = true;
    const topNValue = this.topN === 0 ? undefined : this.topN;

    this.trendsService.getCategoryMonthlyData(this.startDate, this.endDate, topNValue).subscribe({
      next: (data) => {
        this.categoryData = data;
        this.totalSpending = data.reduce((sum, cat) => sum + cat.total, 0);

        // Initialize all categories as visible
        this.visibleCategories = new Set(data.map(d => d.category));

        this.buildChart();
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load category trends data:', err);
        this.loading = false;
      }
    });
  }

  toggleCategory(category: string): void {
    if (this.visibleCategories.has(category)) {
      this.visibleCategories.delete(category);
    } else {
      this.visibleCategories.add(category);
    }
    this.buildChart();
  }

  getMonthlyAvg(cat: CategoryMonthlyData): number {
    const monthsWithData = cat.data.filter(d => d.amount > 0).length;
    return monthsWithData > 0 ? cat.total / monthsWithData : 0;
  }

  getPercentage(cat: CategoryMonthlyData): number {
    return this.totalSpending > 0 ? (cat.total / this.totalSpending) * 100 : 0;
  }

  private buildChart(): void {
    if (!this.categoryData || this.categoryData.length === 0) {
      this.chartData = undefined;
      return;
    }

    // Get labels from first category (all should have same months)
    const labels = this.categoryData[0]?.data.map(d => d.label) || [];

    // Build datasets for visible categories only
    const datasets = this.categoryData
      .filter(cat => this.visibleCategories.has(cat.category))
      .map(cat => ({
        label: cat.category,
        data: cat.data.map(d => d.amount),
        borderColor: cat.color,
        backgroundColor: cat.color + '20',
        borderWidth: 2,
        pointBackgroundColor: cat.color,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: false,
        tension: 0.3
      }));

    this.chartData = { labels, datasets };

    // Trigger chart update
    if (this.chart) {
      this.chart.update();
    }
  }
}
