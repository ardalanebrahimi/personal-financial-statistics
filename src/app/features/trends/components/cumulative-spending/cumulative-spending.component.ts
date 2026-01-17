import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { TrendsService, CumulativeSpendingData } from '../../services/trends.service';

@Component({
  selector: 'app-cumulative-spending',
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
    <div class="cumulative-spending-container">
      <!-- Controls -->
      <mat-card class="controls-card">
        <mat-card-content>
          <div class="controls-row">
            <span class="controls-label">Select months to compare:</span>
            <div class="month-toggles">
              <mat-checkbox
                *ngFor="let month of cumulativeData; let i = index"
                [checked]="visibleMonths.has(month.month)"
                (change)="toggleMonth(month.month)"
                [style.color]="getMonthColor(i)">
                {{ month.label }}
              </mat-checkbox>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Chart -->
      <mat-card class="chart-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>timeline</mat-icon>
          <mat-card-title>Cumulative Spending Curves</mat-card-title>
          <mat-card-subtitle>Compare spending patterns through each month</mat-card-subtitle>
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
          <div class="empty-state" *ngIf="!loading && (!cumulativeData || cumulativeData.length === 0)">
            <mat-icon>info</mat-icon>
            <p>No data available for the selected period</p>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Insights -->
      <mat-card class="insights-card" *ngIf="cumulativeData.length > 0">
        <mat-card-header>
          <mat-icon mat-card-avatar>insights</mat-icon>
          <mat-card-title>Spending Pattern Insights</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="insights-grid">
            <div class="insight">
              <mat-icon>calendar_today</mat-icon>
              <div>
                <span class="insight-label">Fastest Spending Month</span>
                <span class="insight-value">{{ fastestMonth?.label }}</span>
                <span class="insight-detail">{{ fastestMonthMidpoint | number:'1.0-0' }}% spent by day 15</span>
              </div>
            </div>
            <div class="insight">
              <mat-icon>speed</mat-icon>
              <div>
                <span class="insight-label">Average Daily Spending</span>
                <span class="insight-value">{{ avgDailySpending | currency:'EUR' }}</span>
              </div>
            </div>
            <div class="insight">
              <mat-icon>trending_up</mat-icon>
              <div>
                <span class="insight-label">Highest Total Month</span>
                <span class="insight-value">{{ highestMonth?.label }}</span>
                <span class="insight-detail">{{ highestMonth?.totalSpending | currency:'EUR' }}</span>
              </div>
            </div>
          </div>

          <div class="pattern-analysis">
            <h4>Pattern Analysis</h4>
            <p *ngIf="spendingPattern === 'early'">
              <mat-icon>warning</mat-icon>
              You tend to spend more in the first half of the month. Consider budgeting more carefully early on.
            </p>
            <p *ngIf="spendingPattern === 'late'">
              <mat-icon>info</mat-icon>
              Your spending is concentrated toward the end of the month, which could indicate bill payments or payday shopping.
            </p>
            <p *ngIf="spendingPattern === 'even'">
              <mat-icon>check_circle</mat-icon>
              Your spending is relatively evenly distributed throughout the month - good budget discipline!
            </p>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .cumulative-spending-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .controls-card mat-card-content {
      padding: 1rem !important;
    }

    .controls-row {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .controls-label {
      font-weight: 500;
      color: #666;
    }

    .month-toggles {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .chart-card {
      width: 100%;
    }

    .chart-container {
      position: relative;
      min-height: 400px;
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

    .insights-card mat-card-content {
      padding: 1rem !important;
    }

    .insights-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .insight {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      padding: 1rem;
      background: #fafafa;
      border-radius: 8px;
    }

    .insight mat-icon {
      color: #1976d2;
      flex-shrink: 0;
    }

    .insight-label {
      font-size: 12px;
      color: #666;
      display: block;
    }

    .insight-value {
      font-weight: 500;
      font-size: 16px;
      display: block;
    }

    .insight-detail {
      font-size: 12px;
      color: #999;
    }

    .pattern-analysis {
      background: #f5f5f5;
      padding: 1rem;
      border-radius: 8px;
    }

    .pattern-analysis h4 {
      margin: 0 0 0.5rem;
    }

    .pattern-analysis p {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
      color: #666;
    }

    .pattern-analysis mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .pattern-analysis mat-icon[class*="warning"] { color: #ff9800; }
    .pattern-analysis mat-icon[class*="info"] { color: #2196f3; }
    .pattern-analysis mat-icon[class*="check"] { color: #4caf50; }
  `]
})
export class CumulativeSpendingComponent implements OnInit, OnChanges {
  @Input() startDate!: Date;
  @Input() endDate!: Date;

  loading = false;
  cumulativeData: CumulativeSpendingData[] = [];
  visibleMonths = new Set<string>();

  chartData: ChartData<'line'> | undefined;

  // Insights
  fastestMonth: CumulativeSpendingData | null = null;
  fastestMonthMidpoint = 0;
  avgDailySpending = 0;
  highestMonth: CumulativeSpendingData | null = null;
  spendingPattern: 'early' | 'late' | 'even' = 'even';

  private readonly monthColors = [
    '#1976d2', '#f44336', '#4caf50', '#ff9800', '#9c27b0',
    '#00bcd4', '#e91e63', '#8bc34a', '#ffc107', '#673ab7',
    '#03a9f4', '#cddc39'
  ];

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
        position: 'top'
      },
      tooltip: {
        callbacks: {
          title: (items) => `Day ${items[0].label}`,
          label: (context) => {
            const value = context.raw as number;
            return `${context.dataset.label}: €${value.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`;
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Day of Month'
        }
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Cumulative Spending'
        },
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
    this.trendsService.getCumulativeSpendingData(this.startDate, this.endDate).subscribe({
      next: (data) => {
        this.cumulativeData = data;

        // Show last 3 months by default
        this.visibleMonths = new Set(data.slice(-3).map(d => d.month));

        this.calculateInsights();
        this.buildChart();
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load cumulative spending data:', err);
        this.loading = false;
      }
    });
  }

  private calculateInsights(): void {
    if (this.cumulativeData.length === 0) return;

    // Highest total month
    this.highestMonth = this.cumulativeData.reduce((max, curr) =>
      curr.totalSpending > (max?.totalSpending || 0) ? curr : max, this.cumulativeData[0]);

    // Average daily spending
    const totalDays = this.cumulativeData.reduce((sum, m) => sum + m.dailyData.length, 0);
    const totalSpending = this.cumulativeData.reduce((sum, m) => sum + m.totalSpending, 0);
    this.avgDailySpending = totalDays > 0 ? totalSpending / totalDays : 0;

    // Fastest spending month (highest % by day 15)
    let maxMidpointPercent = 0;
    this.cumulativeData.forEach(month => {
      if (month.totalSpending > 0 && month.dailyData.length >= 15) {
        const midpointSpending = month.dailyData[14]?.cumulative || 0;
        const percent = (midpointSpending / month.totalSpending) * 100;
        if (percent > maxMidpointPercent) {
          maxMidpointPercent = percent;
          this.fastestMonth = month;
          this.fastestMonthMidpoint = percent;
        }
      }
    });

    // Determine spending pattern
    const avgMidpointPercent = this.cumulativeData
      .filter(m => m.totalSpending > 0 && m.dailyData.length >= 15)
      .reduce((sum, m) => {
        const midpoint = m.dailyData[14]?.cumulative || 0;
        return sum + (midpoint / m.totalSpending);
      }, 0) / this.cumulativeData.filter(m => m.totalSpending > 0).length;

    if (avgMidpointPercent > 0.55) {
      this.spendingPattern = 'early';
    } else if (avgMidpointPercent < 0.45) {
      this.spendingPattern = 'late';
    } else {
      this.spendingPattern = 'even';
    }
  }

  toggleMonth(month: string): void {
    if (this.visibleMonths.has(month)) {
      this.visibleMonths.delete(month);
    } else {
      this.visibleMonths.add(month);
    }
    this.buildChart();
  }

  getMonthColor(index: number): string {
    return this.monthColors[index % this.monthColors.length];
  }

  private buildChart(): void {
    const visibleData = this.cumulativeData.filter(d => this.visibleMonths.has(d.month));

    if (visibleData.length === 0) {
      this.chartData = undefined;
      return;
    }

    // Labels are days 1-31
    const maxDays = Math.max(...visibleData.map(d => d.dailyData.length));
    const labels = Array.from({ length: maxDays }, (_, i) => String(i + 1));

    this.chartData = {
      labels,
      datasets: visibleData.map((month, idx) => {
        const originalIdx = this.cumulativeData.indexOf(month);
        return {
          label: month.label,
          data: month.dailyData.map(d => d.cumulative),
          borderColor: this.getMonthColor(originalIdx),
          backgroundColor: this.getMonthColor(originalIdx) + '20',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.1,
          fill: false
        };
      })
    };
  }
}
