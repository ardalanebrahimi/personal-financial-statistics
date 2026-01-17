import { Component, Input, OnInit, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { BaseChartDirective, NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { TrendsService, MonthlyData } from '../../services/trends.service';

@Component({
  selector: 'app-cash-flow',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    NgChartsModule
  ],
  template: `
    <div class="cash-flow-container">
      <!-- Summary Cards -->
      <div class="summary-cards">
        <mat-card class="summary-card income">
          <mat-card-content>
            <mat-icon>trending_up</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Total Income</span>
              <span class="summary-value">{{ totalIncome | currency:'EUR' }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card expenses">
          <mat-card-content>
            <mat-icon>trending_down</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Total Expenses</span>
              <span class="summary-value">{{ totalExpenses | currency:'EUR' }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card net" [class.positive]="totalNet >= 0" [class.negative]="totalNet < 0">
          <mat-card-content>
            <mat-icon>{{ totalNet >= 0 ? 'savings' : 'warning' }}</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Net Balance</span>
              <span class="summary-value">{{ totalNet >= 0 ? '+' : '' }}{{ totalNet | currency:'EUR' }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card average">
          <mat-card-content>
            <mat-icon>calculate</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Avg Monthly Net</span>
              <span class="summary-value" [class.positive]="avgMonthlyNet >= 0" [class.negative]="avgMonthlyNet < 0">
                {{ avgMonthlyNet >= 0 ? '+' : '' }}{{ avgMonthlyNet | currency:'EUR' }}
              </span>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Chart -->
      <mat-card class="chart-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>bar_chart</mat-icon>
          <mat-card-title>Monthly Cash Flow</mat-card-title>
          <mat-card-subtitle>Income vs Expenses with Net Balance</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="chart-container" *ngIf="!loading && chartData">
            <canvas baseChart
              type="bar"
              [data]="chartData"
              [options]="chartOptions">
            </canvas>
          </div>
          <div class="loading-container" *ngIf="loading">
            <mat-spinner diameter="40"></mat-spinner>
            <span>Loading data...</span>
          </div>
          <div class="empty-state" *ngIf="!loading && (!monthlyData || monthlyData.length === 0)">
            <mat-icon>info</mat-icon>
            <p>No data available for the selected period</p>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Monthly Breakdown Table -->
      <mat-card class="breakdown-card" *ngIf="monthlyData && monthlyData.length > 0">
        <mat-card-header>
          <mat-icon mat-card-avatar>table_chart</mat-icon>
          <mat-card-title>Monthly Breakdown</mat-card-title>
          <mat-card-subtitle>Detailed monthly figures</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="breakdown-table">
            <div class="breakdown-header">
              <span class="col-month">Month</span>
              <span class="col-income">Income</span>
              <span class="col-expenses">Expenses</span>
              <span class="col-net">Net</span>
            </div>
            <div *ngFor="let month of monthlyData" class="breakdown-row">
              <span class="col-month">{{ month.label }}</span>
              <span class="col-income positive">{{ month.income | currency:'EUR' }}</span>
              <span class="col-expenses negative">{{ month.expenses | currency:'EUR' }}</span>
              <span class="col-net" [class.positive]="month.net >= 0" [class.negative]="month.net < 0">
                {{ month.net >= 0 ? '+' : '' }}{{ month.net | currency:'EUR' }}
              </span>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .cash-flow-container {
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
    }

    .summary-card.income mat-icon { color: #4caf50; }
    .summary-card.expenses mat-icon { color: #f44336; }
    .summary-card.net.positive mat-icon { color: #4caf50; }
    .summary-card.net.negative mat-icon { color: #ff9800; }
    .summary-card.average mat-icon { color: #1976d2; }

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

    .chart-card, .breakdown-card {
      width: 100%;
    }

    .chart-container {
      position: relative;
      min-height: 350px;
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

    .breakdown-table {
      width: 100%;
    }

    .breakdown-header {
      display: flex;
      padding: 0.75rem 0;
      border-bottom: 2px solid #e0e0e0;
      font-weight: 500;
      color: #666;
    }

    .breakdown-row {
      display: flex;
      padding: 0.75rem 0;
      border-bottom: 1px solid #f0f0f0;
    }

    .breakdown-row:hover {
      background: #fafafa;
    }

    .col-month { flex: 1.5; }
    .col-income, .col-expenses, .col-net {
      flex: 1;
      text-align: right;
    }

    .positive { color: #4caf50; }
    .negative { color: #f44336; }
  `]
})
export class CashFlowComponent implements OnInit, OnChanges {
  @Input() startDate!: Date;
  @Input() endDate!: Date;

  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

  loading = false;
  monthlyData: MonthlyData[] = [];

  totalIncome = 0;
  totalExpenses = 0;
  totalNet = 0;
  avgMonthlyNet = 0;

  chartData: ChartData<'bar'> | undefined;

  chartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index'
    },
    plugins: {
      legend: {
        display: true,
        position: 'top'
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

  private loadData(): void {
    if (!this.startDate || !this.endDate) return;

    this.loading = true;
    this.trendsService.getMonthlyData(this.startDate, this.endDate).subscribe({
      next: (data) => {
        this.monthlyData = data;
        this.calculateTotals();
        this.buildChart();
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load cash flow data:', err);
        this.loading = false;
      }
    });
  }

  private calculateTotals(): void {
    this.totalIncome = this.monthlyData.reduce((sum, m) => sum + m.income, 0);
    this.totalExpenses = this.monthlyData.reduce((sum, m) => sum + m.expenses, 0);
    this.totalNet = this.totalIncome - this.totalExpenses;
    this.avgMonthlyNet = this.monthlyData.length > 0
      ? this.totalNet / this.monthlyData.length
      : 0;
  }

  private buildChart(): void {
    const labels = this.monthlyData.map(m => m.label);
    const incomeData = this.monthlyData.map(m => m.income);
    const expenseData = this.monthlyData.map(m => m.expenses);
    const netData = this.monthlyData.map(m => m.net);

    this.chartData = {
      labels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          backgroundColor: 'rgba(76, 175, 80, 0.8)',
          borderColor: '#4caf50',
          borderWidth: 1,
          borderRadius: 4,
          order: 2
        },
        {
          label: 'Expenses',
          data: expenseData,
          backgroundColor: 'rgba(244, 67, 54, 0.8)',
          borderColor: '#f44336',
          borderWidth: 1,
          borderRadius: 4,
          order: 2
        },
        {
          label: 'Net Balance',
          data: netData,
          type: 'line',
          borderColor: '#1976d2',
          backgroundColor: 'rgba(25, 118, 210, 0.1)',
          borderWidth: 3,
          pointBackgroundColor: '#1976d2',
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: false,
          tension: 0.3,
          order: 1
        } as any
      ]
    };
  }
}
