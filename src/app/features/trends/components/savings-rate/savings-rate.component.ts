import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { TrendsService, SavingsRateData } from '../../services/trends.service';

@Component({
  selector: 'app-savings-rate',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    NgChartsModule
  ],
  template: `
    <div class="savings-rate-container">
      <!-- Summary Cards -->
      <div class="summary-cards">
        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon [class.positive]="avgSavingsRate >= 0" [class.negative]="avgSavingsRate < 0">
              {{ avgSavingsRate >= 0 ? 'savings' : 'warning' }}
            </mat-icon>
            <div class="summary-info">
              <span class="summary-label">Avg Savings Rate</span>
              <span class="summary-value" [class.positive]="avgSavingsRate >= 0" [class.negative]="avgSavingsRate < 0">
                {{ avgSavingsRate | number:'1.1-1' }}%
              </span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon class="positive">trending_up</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Best Month</span>
              <span class="summary-value positive">
                {{ bestMonth?.savingsRate | number:'1.1-1' }}%
              </span>
              <span class="summary-sublabel">{{ bestMonth?.label }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon class="negative">trending_down</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Worst Month</span>
              <span class="summary-value negative">
                {{ worstMonth?.savingsRate | number:'1.1-1' }}%
              </span>
              <span class="summary-sublabel">{{ worstMonth?.label }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon>account_balance_wallet</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Total Saved</span>
              <span class="summary-value" [class.positive]="totalSavings >= 0" [class.negative]="totalSavings < 0">
                {{ totalSavings | currency:'EUR' }}
              </span>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Chart -->
      <mat-card class="chart-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>savings</mat-icon>
          <mat-card-title>Savings Rate Trend</mat-card-title>
          <mat-card-subtitle>Percentage of income saved each month</mat-card-subtitle>
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
          <div class="empty-state" *ngIf="!loading && (!savingsData || savingsData.length === 0)">
            <mat-icon>info</mat-icon>
            <p>No data available for the selected period</p>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Data Table -->
      <mat-card class="table-card" *ngIf="savingsData && savingsData.length > 0">
        <mat-card-header>
          <mat-icon mat-card-avatar>table_chart</mat-icon>
          <mat-card-title>Monthly Details</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="data-table">
            <div class="table-header">
              <span class="col-month">Month</span>
              <span class="col-income">Income</span>
              <span class="col-expenses">Expenses</span>
              <span class="col-savings">Savings</span>
              <span class="col-rate">Rate</span>
            </div>
            <div *ngFor="let row of savingsData" class="table-row">
              <span class="col-month">{{ row.label }}</span>
              <span class="col-income positive">{{ row.income | currency:'EUR' }}</span>
              <span class="col-expenses negative">{{ row.expenses | currency:'EUR' }}</span>
              <span class="col-savings" [class.positive]="row.savings >= 0" [class.negative]="row.savings < 0">
                {{ row.savings >= 0 ? '+' : '' }}{{ row.savings | currency:'EUR' }}
              </span>
              <span class="col-rate" [class.positive]="row.savingsRate >= 0" [class.negative]="row.savingsRate < 0">
                {{ row.savingsRate | number:'1.1-1' }}%
              </span>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .savings-rate-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }

    .summary-card mat-card-content {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem !important;
    }

    .summary-card mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #1976d2;
    }

    .summary-card mat-icon.positive { color: #4caf50; }
    .summary-card mat-icon.negative { color: #f44336; }

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

    .summary-sublabel {
      font-size: 11px;
      color: #999;
    }

    .positive { color: #4caf50; }
    .negative { color: #f44336; }

    .chart-card, .table-card {
      width: 100%;
    }

    .chart-container {
      position: relative;
      min-height: 300px;
      padding: 1rem;
    }

    .loading-container, .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 200px;
      gap: 1rem;
      color: #666;
    }

    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
    }

    .data-table {
      width: 100%;
      overflow-x: auto;
    }

    .table-header {
      display: flex;
      padding: 0.75rem 0;
      border-bottom: 2px solid #e0e0e0;
      font-weight: 500;
      color: #666;
      min-width: 500px;
    }

    .table-row {
      display: flex;
      padding: 0.75rem 0;
      border-bottom: 1px solid #f0f0f0;
      min-width: 500px;
    }

    .table-row:hover {
      background: #fafafa;
    }

    .col-month { flex: 1.5; }
    .col-income, .col-expenses, .col-savings { flex: 1; text-align: right; }
    .col-rate { flex: 0.8; text-align: right; font-weight: 500; }
  `]
})
export class SavingsRateComponent implements OnInit, OnChanges {
  @Input() startDate!: Date;
  @Input() endDate!: Date;

  loading = false;
  savingsData: SavingsRateData[] = [];
  avgSavingsRate = 0;
  totalSavings = 0;
  bestMonth: SavingsRateData | null = null;
  worstMonth: SavingsRateData | null = null;

  chartData: ChartData<'line'> | undefined;

  chartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `Savings Rate: ${(context.raw as number).toFixed(1)}%`
        }
      }
    },
    scales: {
      y: {
        ticks: {
          callback: (value) => `${value}%`
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

  private loadData(): void {
    if (!this.startDate || !this.endDate) return;

    this.loading = true;
    this.trendsService.getSavingsRateData(this.startDate, this.endDate).subscribe({
      next: (data) => {
        this.savingsData = data;
        this.calculateStats();
        this.buildChart();
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load savings rate data:', err);
        this.loading = false;
      }
    });
  }

  private calculateStats(): void {
    if (this.savingsData.length === 0) return;

    const monthsWithIncome = this.savingsData.filter(d => d.income > 0);
    this.avgSavingsRate = monthsWithIncome.length > 0
      ? monthsWithIncome.reduce((s, d) => s + d.savingsRate, 0) / monthsWithIncome.length
      : 0;

    this.totalSavings = this.savingsData.reduce((s, d) => s + d.savings, 0);

    const sorted = [...monthsWithIncome].sort((a, b) => b.savingsRate - a.savingsRate);
    this.bestMonth = sorted[0] || null;
    this.worstMonth = sorted[sorted.length - 1] || null;
  }

  private buildChart(): void {
    this.chartData = {
      labels: this.savingsData.map(d => d.label),
      datasets: [{
        data: this.savingsData.map(d => d.savingsRate),
        borderColor: '#1976d2',
        backgroundColor: 'rgba(25, 118, 210, 0.1)',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: this.savingsData.map(d =>
          d.savingsRate >= 0 ? '#4caf50' : '#f44336'
        ),
        pointRadius: 5,
        pointHoverRadius: 7
      }]
    };
  }
}
