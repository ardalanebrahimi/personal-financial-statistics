import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { TrendsService, IncomeSourceData } from '../../services/trends.service';

@Component({
  selector: 'app-income-sources',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    NgChartsModule
  ],
  template: `
    <div class="income-sources-container">
      <!-- Summary Cards -->
      <div class="summary-cards">
        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon>account_balance_wallet</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Total Income</span>
              <span class="summary-value positive">{{ totalIncome | currency:'EUR' }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon>source</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Income Sources</span>
              <span class="summary-value">{{ incomeSources.length }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon>stars</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Primary Source</span>
              <span class="summary-value">{{ primarySource }}</span>
              <span class="summary-sublabel">{{ primarySourcePercent | number:'1.0-0' }}% of income</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon>calculate</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Monthly Average</span>
              <span class="summary-value positive">{{ monthlyAverage | currency:'EUR' }}</span>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Stacked Area Chart -->
      <mat-card class="chart-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>stacked_line_chart</mat-icon>
          <mat-card-title>Income Sources Over Time</mat-card-title>
          <mat-card-subtitle>Track your income streams by source</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="chart-container" *ngIf="!loading && areaChartData">
            <canvas baseChart
              type="line"
              [data]="areaChartData"
              [options]="areaChartOptions">
            </canvas>
          </div>
          <div class="loading-container" *ngIf="loading">
            <mat-spinner diameter="40"></mat-spinner>
            <span>Loading data...</span>
          </div>
          <div class="empty-state" *ngIf="!loading && incomeSources.length === 0">
            <mat-icon>info</mat-icon>
            <p>No income data available for the selected period</p>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Pie Chart -->
      <div class="charts-row" *ngIf="incomeSources.length > 0">
        <mat-card class="chart-card">
          <mat-card-header>
            <mat-icon mat-card-avatar>pie_chart</mat-icon>
            <mat-card-title>Income Distribution</mat-card-title>
            <mat-card-subtitle>Breakdown by source</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="chart-container pie-container" *ngIf="pieChartData">
              <canvas baseChart
                type="doughnut"
                [data]="pieChartData"
                [options]="pieChartOptions">
              </canvas>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Sources Table -->
        <mat-card class="table-card">
          <mat-card-header>
            <mat-icon mat-card-avatar>table_chart</mat-icon>
            <mat-card-title>Income by Source</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="sources-table">
              <div class="table-header">
                <span class="col-source">Source</span>
                <span class="col-total">Total</span>
                <span class="col-avg">Monthly Avg</span>
                <span class="col-percent">%</span>
              </div>
              <div *ngFor="let source of incomeSources" class="table-row">
                <span class="col-source">
                  <span class="color-dot" [style.background-color]="source.color"></span>
                  {{ source.source }}
                </span>
                <span class="col-total positive">{{ source.total | currency:'EUR' }}</span>
                <span class="col-avg">{{ getMonthlyAvg(source) | currency:'EUR' }}</span>
                <span class="col-percent">{{ getPercent(source) | number:'1.1-1' }}%</span>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .income-sources-container {
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
      color: #4caf50;
    }

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

    .chart-card, .table-card {
      width: 100%;
    }

    .charts-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
    }

    @media (max-width: 900px) {
      .charts-row {
        grid-template-columns: 1fr;
      }
    }

    .chart-container {
      position: relative;
      min-height: 300px;
      padding: 1rem;
    }

    .pie-container {
      max-width: 350px;
      margin: 0 auto;
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

    .sources-table {
      width: 100%;
    }

    .table-header {
      display: flex;
      padding: 0.75rem 0;
      border-bottom: 2px solid #e0e0e0;
      font-weight: 500;
      color: #666;
    }

    .table-row {
      display: flex;
      padding: 0.75rem 0;
      border-bottom: 1px solid #f0f0f0;
      align-items: center;
    }

    .table-row:hover {
      background: #fafafa;
    }

    .col-source {
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

    .color-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }
  `]
})
export class IncomeSourcesComponent implements OnInit, OnChanges {
  @Input() startDate!: Date;
  @Input() endDate!: Date;

  loading = false;
  incomeSources: IncomeSourceData[] = [];
  totalIncome = 0;
  monthlyAverage = 0;
  primarySource = '';
  primarySourcePercent = 0;
  monthCount = 0;

  areaChartData: ChartData<'line'> | undefined;
  pieChartData: ChartData<'doughnut'> | undefined;

  areaChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
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
      x: { stacked: true },
      y: {
        stacked: true,
        ticks: {
          callback: (value) => `€${value.toLocaleString('de-DE')}`
        }
      }
    }
  };

  pieChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: true,
        position: 'bottom'
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
    this.trendsService.getIncomeSourcesData(this.startDate, this.endDate).subscribe({
      next: (data) => {
        this.incomeSources = data;
        this.calculateStats();
        this.buildCharts();
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load income sources data:', err);
        this.loading = false;
      }
    });
  }

  private calculateStats(): void {
    this.totalIncome = this.incomeSources.reduce((s, src) => s + src.total, 0);

    if (this.incomeSources.length > 0) {
      this.monthCount = this.incomeSources[0].data.filter(d => d.amount > 0).length || 1;
      this.monthlyAverage = this.totalIncome / Math.max(this.monthCount, 1);

      this.primarySource = this.incomeSources[0]?.source || '';
      this.primarySourcePercent = this.totalIncome > 0
        ? (this.incomeSources[0]?.total / this.totalIncome) * 100
        : 0;
    }
  }

  private buildCharts(): void {
    if (this.incomeSources.length === 0) return;

    const labels = this.incomeSources[0]?.data.map(d => d.label) || [];

    // Area chart
    this.areaChartData = {
      labels,
      datasets: this.incomeSources.map(src => ({
        label: src.source,
        data: src.data.map(d => d.amount),
        borderColor: src.color,
        backgroundColor: src.color + '80',
        fill: true,
        tension: 0.3
      }))
    };

    // Pie chart
    this.pieChartData = {
      labels: this.incomeSources.map(s => s.source),
      datasets: [{
        data: this.incomeSources.map(s => s.total),
        backgroundColor: this.incomeSources.map(s => s.color)
      }]
    };
  }

  getMonthlyAvg(source: IncomeSourceData): number {
    const monthsWithIncome = source.data.filter(d => d.amount > 0).length;
    return monthsWithIncome > 0 ? source.total / monthsWithIncome : 0;
  }

  getPercent(source: IncomeSourceData): number {
    return this.totalIncome > 0 ? (source.total / this.totalIncome) * 100 : 0;
  }
}
