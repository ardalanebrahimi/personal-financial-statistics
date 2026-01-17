import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { TrendsService, YearOverYearData } from '../../services/trends.service';

@Component({
  selector: 'app-year-over-year',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    NgChartsModule
  ],
  template: `
    <div class="year-over-year-container">
      <!-- Summary Cards -->
      <div class="summary-cards">
        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon>calendar_month</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Years Compared</span>
              <span class="summary-value">{{ years.length }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon [class.positive]="yoyChange < 0" [class.negative]="yoyChange > 0">
              {{ yoyChange <= 0 ? 'trending_down' : 'trending_up' }}
            </mat-icon>
            <div class="summary-info">
              <span class="summary-label">YoY Change</span>
              <span class="summary-value" [class.positive]="yoyChange < 0" [class.negative]="yoyChange > 0">
                {{ yoyChange > 0 ? '+' : '' }}{{ yoyChange | number:'1.1-1' }}%
              </span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon>local_fire_department</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Highest Spending Month</span>
              <span class="summary-value">{{ highestMonth }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon>ac_unit</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Lowest Spending Month</span>
              <span class="summary-value">{{ lowestMonth }}</span>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Year Legend -->
      <mat-card class="legend-card" *ngIf="years.length > 0">
        <mat-card-content>
          <div class="year-legend">
            <span class="legend-label">Years:</span>
            <mat-chip-set>
              <mat-chip *ngFor="let year of years; let i = index"
                       [style.background-color]="yearColors[i] + '30'"
                       [style.border-color]="yearColors[i]">
                {{ year }}
              </mat-chip>
            </mat-chip-set>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Chart -->
      <mat-card class="chart-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>compare</mat-icon>
          <mat-card-title>Year-over-Year Comparison</mat-card-title>
          <mat-card-subtitle>Compare spending for the same month across different years</mat-card-subtitle>
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
          <div class="empty-state" *ngIf="!loading && yoyData.length === 0">
            <mat-icon>info</mat-icon>
            <p>No year-over-year data available</p>
            <span class="empty-hint">You need at least 2 years of data for comparison</span>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Detailed Table -->
      <mat-card class="table-card" *ngIf="yoyData.length > 0">
        <mat-card-header>
          <mat-icon mat-card-avatar>table_chart</mat-icon>
          <mat-card-title>Monthly Breakdown by Year</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="data-table">
            <div class="table-header">
              <span class="col-month">Month</span>
              <span *ngFor="let year of years" class="col-year">{{ year }}</span>
              <span class="col-change" *ngIf="years.length >= 2">Change</span>
            </div>
            <div *ngFor="let row of yoyData" class="table-row">
              <span class="col-month">{{ row.monthLabel }}</span>
              <span *ngFor="let yearData of row.years" class="col-year">
                {{ yearData.amount > 0 ? (yearData.amount | currency:'EUR') : '-' }}
              </span>
              <span class="col-change" *ngIf="years.length >= 2"
                    [class.positive]="(getChange(row) ?? 0) < 0"
                    [class.negative]="(getChange(row) ?? 0) > 0">
                {{ getChange(row) !== null ? (((getChange(row) ?? 0) > 0 ? '+' : '') + (getChange(row) | number:'1.0-0') + '%') : '-' }}
              </span>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Seasonal Patterns -->
      <mat-card class="patterns-card" *ngIf="yoyData.length > 0">
        <mat-card-header>
          <mat-icon mat-card-avatar>wb_sunny</mat-icon>
          <mat-card-title>Seasonal Patterns</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="patterns-grid">
            <div class="pattern" *ngFor="let pattern of seasonalPatterns">
              <mat-icon [style.color]="pattern.color">{{ pattern.icon }}</mat-icon>
              <div>
                <span class="pattern-label">{{ pattern.season }}</span>
                <span class="pattern-value">{{ pattern.avgSpending | currency:'EUR' }}</span>
                <span class="pattern-hint">{{ pattern.months }}</span>
              </div>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .year-over-year-container {
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

    .positive { color: #4caf50; }
    .negative { color: #f44336; }

    .legend-card mat-card-content {
      padding: 1rem !important;
    }

    .year-legend {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .legend-label {
      font-weight: 500;
      color: #666;
    }

    .chart-card, .table-card, .patterns-card {
      width: 100%;
    }

    .chart-container {
      position: relative;
      min-height: 350px;
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

    .empty-hint {
      font-size: 13px;
      color: #999;
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

    .col-month { flex: 1; font-weight: 500; }
    .col-year { flex: 1; text-align: right; }
    .col-change { flex: 0.8; text-align: right; font-weight: 500; }

    .patterns-card mat-card-content {
      padding: 1rem !important;
    }

    .patterns-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }

    .pattern {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: #fafafa;
      border-radius: 8px;
    }

    .pattern mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
    }

    .pattern-label {
      font-size: 12px;
      color: #666;
      display: block;
      text-transform: uppercase;
    }

    .pattern-value {
      font-weight: 500;
      font-size: 16px;
      display: block;
    }

    .pattern-hint {
      font-size: 11px;
      color: #999;
    }
  `]
})
export class YearOverYearComponent implements OnInit, OnChanges {
  @Input() startDate!: Date;
  @Input() endDate!: Date;

  loading = false;
  yoyData: YearOverYearData[] = [];
  years: number[] = [];
  yoyChange = 0;
  highestMonth = '';
  lowestMonth = '';

  yearColors = ['#1976d2', '#f44336', '#4caf50', '#ff9800', '#9c27b0'];

  chartData: ChartData<'bar'> | undefined;

  seasonalPatterns: { season: string; months: string; avgSpending: number; icon: string; color: string }[] = [];

  chartOptions: ChartConfiguration<'bar'>['options'] = {
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
    this.trendsService.getYearOverYearData(this.startDate, this.endDate).subscribe({
      next: (data) => {
        this.yoyData = data;
        this.extractYears();
        this.calculateStats();
        this.calculateSeasonalPatterns();
        this.buildChart();
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load year-over-year data:', err);
        this.loading = false;
      }
    });
  }

  private extractYears(): void {
    const yearSet = new Set<number>();
    this.yoyData.forEach(d => d.years.forEach(y => yearSet.add(y.year)));
    this.years = Array.from(yearSet).sort();
  }

  private calculateStats(): void {
    if (this.years.length < 2 || this.yoyData.length === 0) {
      this.yoyChange = 0;
      return;
    }

    const lastYear = this.years[this.years.length - 1];
    const prevYear = this.years[this.years.length - 2];

    let lastYearTotal = 0;
    let prevYearTotal = 0;

    this.yoyData.forEach(d => {
      const lastYearData = d.years.find(y => y.year === lastYear);
      const prevYearData = d.years.find(y => y.year === prevYear);
      lastYearTotal += lastYearData?.amount || 0;
      prevYearTotal += prevYearData?.amount || 0;
    });

    this.yoyChange = prevYearTotal > 0
      ? ((lastYearTotal - prevYearTotal) / prevYearTotal) * 100
      : 0;

    // Find highest and lowest months
    const monthTotals = this.yoyData.map(d => ({
      month: d.monthLabel,
      total: d.years.reduce((s, y) => s + y.amount, 0)
    }));

    const sorted = monthTotals.filter(m => m.total > 0).sort((a, b) => b.total - a.total);
    this.highestMonth = sorted[0]?.month || '';
    this.lowestMonth = sorted[sorted.length - 1]?.month || '';
  }

  private calculateSeasonalPatterns(): void {
    const seasons = [
      { season: 'Winter', months: 'Dec-Feb', monthIndices: [11, 0, 1], icon: 'ac_unit', color: '#2196f3' },
      { season: 'Spring', months: 'Mar-May', monthIndices: [2, 3, 4], icon: 'local_florist', color: '#4caf50' },
      { season: 'Summer', months: 'Jun-Aug', monthIndices: [5, 6, 7], icon: 'wb_sunny', color: '#ff9800' },
      { season: 'Fall', months: 'Sep-Nov', monthIndices: [8, 9, 10], icon: 'eco', color: '#795548' }
    ];

    this.seasonalPatterns = seasons.map(s => {
      let total = 0;
      let count = 0;

      this.yoyData
        .filter(d => s.monthIndices.includes(d.month))
        .forEach(d => {
          d.years.forEach(y => {
            if (y.amount > 0) {
              total += y.amount;
              count++;
            }
          });
        });

      return {
        ...s,
        avgSpending: count > 0 ? total / count : 0
      };
    });
  }

  private buildChart(): void {
    if (this.yoyData.length === 0 || this.years.length === 0) {
      this.chartData = undefined;
      return;
    }

    const labels = this.yoyData.map(d => d.monthLabel);

    this.chartData = {
      labels,
      datasets: this.years.map((year, idx) => ({
        label: String(year),
        data: this.yoyData.map(d => d.years.find(y => y.year === year)?.amount || 0),
        backgroundColor: this.yearColors[idx % this.yearColors.length] + 'cc',
        borderColor: this.yearColors[idx % this.yearColors.length],
        borderWidth: 1
      }))
    };
  }

  getChange(row: YearOverYearData): number | null {
    if (this.years.length < 2) return null;

    const lastYear = this.years[this.years.length - 1];
    const prevYear = this.years[this.years.length - 2];

    const lastYearAmount = row.years.find(y => y.year === lastYear)?.amount || 0;
    const prevYearAmount = row.years.find(y => y.year === prevYear)?.amount || 0;

    if (prevYearAmount === 0) return null;
    return ((lastYearAmount - prevYearAmount) / prevYearAmount) * 100;
  }
}
