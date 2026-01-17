import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { TrendsService, RollingAverageData } from '../../services/trends.service';

@Component({
  selector: 'app-rolling-average',
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
    <div class="rolling-average-container">
      <!-- Summary Cards -->
      <div class="summary-cards">
        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon>show_chart</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Current 3-Mo Avg</span>
              <span class="summary-value">{{ current3MonthAvg | currency:'EUR' }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon>timeline</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Current 6-Mo Avg</span>
              <span class="summary-value">{{ current6MonthAvg | currency:'EUR' }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon [class.positive]="trend3Mo < 0" [class.negative]="trend3Mo > 0">
              {{ trend3Mo <= 0 ? 'trending_down' : 'trending_up' }}
            </mat-icon>
            <div class="summary-info">
              <span class="summary-label">3-Mo Trend</span>
              <span class="summary-value" [class.positive]="trend3Mo < 0" [class.negative]="trend3Mo > 0">
                {{ trend3Mo > 0 ? '+' : '' }}{{ trend3Mo | number:'1.1-1' }}%
              </span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon>calculate</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Period Average</span>
              <span class="summary-value">{{ periodAverage | currency:'EUR' }}</span>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Chart -->
      <mat-card class="chart-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>auto_graph</mat-icon>
          <mat-card-title>Rolling Averages</mat-card-title>
          <mat-card-subtitle>Smooth out spending noise with moving averages</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="legend-chips">
            <mat-chip-set>
              <mat-chip class="actual-chip">Actual Spending</mat-chip>
              <mat-chip class="avg3-chip">3-Month Average</mat-chip>
              <mat-chip class="avg6-chip">6-Month Average</mat-chip>
            </mat-chip-set>
          </div>

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
          <div class="empty-state" *ngIf="!loading && (!rollingData || rollingData.length === 0)">
            <mat-icon>info</mat-icon>
            <p>No data available for the selected period</p>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Explanation Card -->
      <mat-card class="info-card">
        <mat-card-content>
          <div class="info-content">
            <mat-icon>lightbulb</mat-icon>
            <div>
              <h4>Understanding Rolling Averages</h4>
              <p>Rolling averages smooth out short-term fluctuations and highlight longer-term trends:</p>
              <ul>
                <li><strong>3-Month Average:</strong> Shows recent spending trends, useful for spotting quick changes</li>
                <li><strong>6-Month Average:</strong> Shows medium-term patterns, filters out seasonal variations</li>
              </ul>
              <p>When actual spending is above the rolling average, spending is increasing. When below, it's decreasing.</p>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .rolling-average-container {
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

    .chart-card {
      width: 100%;
    }

    .legend-chips {
      padding: 0 1rem;
    }

    .actual-chip { background: rgba(244, 67, 54, 0.2) !important; }
    .avg3-chip { background: rgba(25, 118, 210, 0.2) !important; }
    .avg6-chip { background: rgba(76, 175, 80, 0.2) !important; }

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

    .info-card mat-card-content {
      padding: 1rem !important;
    }

    .info-content {
      display: flex;
      gap: 1rem;
    }

    .info-content mat-icon {
      color: #ff9800;
      flex-shrink: 0;
    }

    .info-content h4 {
      margin: 0 0 0.5rem;
    }

    .info-content p {
      margin: 0.5rem 0;
      color: #666;
      font-size: 14px;
    }

    .info-content ul {
      margin: 0.5rem 0;
      padding-left: 1.5rem;
      color: #666;
      font-size: 14px;
    }

    .info-content li {
      margin: 0.25rem 0;
    }
  `]
})
export class RollingAverageComponent implements OnInit, OnChanges {
  @Input() startDate!: Date;
  @Input() endDate!: Date;

  loading = false;
  rollingData: RollingAverageData[] = [];
  current3MonthAvg = 0;
  current6MonthAvg = 0;
  trend3Mo = 0;
  periodAverage = 0;

  chartData: ChartData<'line'> | undefined;

  chartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index'
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.raw as number;
            return value !== null
              ? `${context.dataset.label}: €${value.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`
              : '';
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
    this.trendsService.getRollingAverageData(this.startDate, this.endDate).subscribe({
      next: (data) => {
        this.rollingData = data;
        this.calculateStats();
        this.buildChart();
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load rolling average data:', err);
        this.loading = false;
      }
    });
  }

  private calculateStats(): void {
    if (this.rollingData.length === 0) return;

    const last = this.rollingData[this.rollingData.length - 1];
    this.current3MonthAvg = last.rollingAvg3 || 0;
    this.current6MonthAvg = last.rollingAvg6 || 0;

    // Calculate trend (compare last 3-month avg to 3 months ago)
    if (this.rollingData.length >= 4) {
      const prev = this.rollingData[this.rollingData.length - 4];
      if (prev.rollingAvg3 && last.rollingAvg3) {
        this.trend3Mo = ((last.rollingAvg3 - prev.rollingAvg3) / prev.rollingAvg3) * 100;
      }
    }

    this.periodAverage = this.rollingData.reduce((s, d) => s + d.actual, 0) / this.rollingData.length;
  }

  private buildChart(): void {
    this.chartData = {
      labels: this.rollingData.map(d => d.label),
      datasets: [
        {
          label: 'Actual Spending',
          data: this.rollingData.map(d => d.actual),
          borderColor: '#f44336',
          backgroundColor: 'rgba(244, 67, 54, 0.1)',
          borderWidth: 1,
          pointRadius: 3,
          tension: 0,
          fill: false
        },
        {
          label: '3-Month Average',
          data: this.rollingData.map(d => d.rollingAvg3),
          borderColor: '#1976d2',
          backgroundColor: 'rgba(25, 118, 210, 0.1)',
          borderWidth: 3,
          pointRadius: 0,
          tension: 0.4,
          fill: false
        },
        {
          label: '6-Month Average',
          data: this.rollingData.map(d => d.rollingAvg6),
          borderColor: '#4caf50',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          borderWidth: 3,
          pointRadius: 0,
          tension: 0.4,
          fill: false
        }
      ]
    };
  }
}
