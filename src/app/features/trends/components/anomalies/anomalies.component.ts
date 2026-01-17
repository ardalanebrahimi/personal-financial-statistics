import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSliderModule } from '@angular/material/slider';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TrendsService, AnomalyData } from '../../services/trends.service';

@Component({
  selector: 'app-anomalies',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSliderModule,
    MatChipsModule,
    MatTooltipModule
  ],
  template: `
    <div class="anomalies-container">
      <!-- Controls -->
      <mat-card class="controls-card">
        <mat-card-content>
          <div class="controls-row">
            <div class="slider-control">
              <label>Anomaly Threshold: {{ threshold }}x average</label>
              <mat-slider min="1.2" max="3" step="0.1" [displayWith]="formatThreshold">
                <input matSliderThumb [(ngModel)]="threshold" (change)="loadData()">
              </mat-slider>
              <span class="threshold-hint">Higher = fewer, more extreme anomalies</span>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Summary -->
      <div class="summary-cards">
        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon class="warning">warning</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Anomalies Found</span>
              <span class="summary-value">{{ anomalies.length }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon class="up">trending_up</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Above Average</span>
              <span class="summary-value negative">{{ spikesCount }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon class="down">trending_down</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Below Average</span>
              <span class="summary-value positive">{{ dropsCount }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <mat-icon>category</mat-icon>
            <div class="summary-info">
              <span class="summary-label">Categories Affected</span>
              <span class="summary-value">{{ affectedCategories }}</span>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Anomalies List -->
      <mat-card class="anomalies-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>bolt</mat-icon>
          <mat-card-title>Spending Anomalies</mat-card-title>
          <mat-card-subtitle>Months with unusual spending patterns</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="loading-container" *ngIf="loading">
            <mat-spinner diameter="40"></mat-spinner>
            <span>Analyzing spending patterns...</span>
          </div>

          <div class="empty-state" *ngIf="!loading && anomalies.length === 0">
            <mat-icon>check_circle</mat-icon>
            <p>No anomalies detected!</p>
            <span class="empty-hint">Your spending has been consistent. Try lowering the threshold to detect smaller variations.</span>
          </div>

          <div class="anomalies-list" *ngIf="!loading && anomalies.length > 0">
            <div *ngFor="let anomaly of anomalies" class="anomaly-item"
                 [class.spike]="anomaly.deviation > 1"
                 [class.drop]="anomaly.deviation < 1">
              <div class="anomaly-icon">
                <mat-icon *ngIf="anomaly.deviation > 1">arrow_upward</mat-icon>
                <mat-icon *ngIf="anomaly.deviation < 1">arrow_downward</mat-icon>
              </div>
              <div class="anomaly-info">
                <div class="anomaly-header">
                  <span class="color-dot" [style.background-color]="anomaly.color"></span>
                  <span class="category-name">{{ anomaly.category }}</span>
                  <mat-chip class="month-chip">{{ anomaly.label }}</mat-chip>
                </div>
                <div class="anomaly-details">
                  <span class="detail">
                    <strong>Actual:</strong> {{ anomaly.amount | currency:'EUR' }}
                  </span>
                  <span class="detail">
                    <strong>Average:</strong> {{ anomaly.average | currency:'EUR' }}
                  </span>
                  <span class="detail deviation" [class.spike]="anomaly.deviation > 1" [class.drop]="anomaly.deviation < 1">
                    <strong>{{ anomaly.deviation > 1 ? '+' : '' }}{{ ((anomaly.deviation - 1) * 100) | number:'1.0-0' }}%</strong>
                    {{ anomaly.deviation > 1 ? 'above' : 'below' }} average
                  </span>
                </div>
              </div>
              <div class="anomaly-bar">
                <div class="bar-average" [matTooltip]="'Average: €' + anomaly.average"></div>
                <div class="bar-actual"
                     [style.width.%]="getBarWidth(anomaly)"
                     [class.spike]="anomaly.deviation > 1"
                     [class.drop]="anomaly.deviation < 1"
                     [matTooltip]="'Actual: €' + anomaly.amount">
                </div>
              </div>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Info Card -->
      <mat-card class="info-card">
        <mat-card-content>
          <div class="info-content">
            <mat-icon>lightbulb</mat-icon>
            <div>
              <h4>How Anomalies are Detected</h4>
              <p>An anomaly is flagged when spending in a category for a specific month is significantly different from its average:</p>
              <ul>
                <li><strong>Spike:</strong> Spending is {{ threshold }}x or more above the category's average</li>
                <li><strong>Drop:</strong> Spending is {{ (1/threshold) | number:'1.2-2' }}x or less of the category's average</li>
              </ul>
              <p>This helps identify one-time purchases, seasonal expenses, or changes in spending habits.</p>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .anomalies-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .controls-card mat-card-content {
      padding: 1rem !important;
    }

    .controls-row {
      display: flex;
      gap: 2rem;
      align-items: center;
    }

    .slider-control {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 300px;
    }

    .slider-control label {
      font-weight: 500;
    }

    .threshold-hint {
      font-size: 12px;
      color: #666;
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
    }

    .summary-card mat-icon.warning { color: #ff9800; }
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

    .anomalies-card {
      width: 100%;
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
      color: #4caf50;
    }

    .empty-hint {
      font-size: 13px;
      color: #999;
    }

    .anomalies-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1rem;
    }

    .anomaly-item {
      display: flex;
      gap: 1rem;
      padding: 1rem;
      border-radius: 8px;
      background: #fafafa;
      align-items: center;
    }

    .anomaly-item.spike {
      border-left: 4px solid #f44336;
    }

    .anomaly-item.drop {
      border-left: 4px solid #4caf50;
    }

    .anomaly-icon {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .anomaly-item.spike .anomaly-icon {
      background: #ffebee;
      color: #f44336;
    }

    .anomaly-item.drop .anomaly-icon {
      background: #e8f5e9;
      color: #4caf50;
    }

    .anomaly-info {
      flex: 1;
      min-width: 0;
    }

    .anomaly-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 0.5rem;
    }

    .color-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .category-name {
      font-weight: 500;
    }

    .month-chip {
      font-size: 11px;
      min-height: 24px;
      padding: 0 8px;
    }

    .anomaly-details {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      font-size: 13px;
      color: #666;
    }

    .deviation.spike { color: #f44336; }
    .deviation.drop { color: #4caf50; }

    .anomaly-bar {
      width: 120px;
      height: 24px;
      background: #e0e0e0;
      border-radius: 4px;
      position: relative;
      flex-shrink: 0;
    }

    .bar-average {
      position: absolute;
      left: 50%;
      top: 0;
      bottom: 0;
      width: 2px;
      background: #666;
      z-index: 1;
    }

    .bar-actual {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      border-radius: 4px;
      min-width: 4px;
    }

    .bar-actual.spike { background: #f44336; }
    .bar-actual.drop { background: #4caf50; }

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

    .info-content p, .info-content ul {
      margin: 0.5rem 0;
      color: #666;
      font-size: 14px;
    }

    .info-content ul {
      padding-left: 1.5rem;
    }

    @media (max-width: 768px) {
      .anomaly-bar {
        display: none;
      }
    }
  `]
})
export class AnomaliesComponent implements OnInit, OnChanges {
  @Input() startDate!: Date;
  @Input() endDate!: Date;

  loading = false;
  threshold = 1.5;
  anomalies: AnomalyData[] = [];
  spikesCount = 0;
  dropsCount = 0;
  affectedCategories = 0;

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
    this.trendsService.getAnomalyData(this.startDate, this.endDate, this.threshold).subscribe({
      next: (data) => {
        this.anomalies = data;
        this.calculateStats();
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load anomaly data:', err);
        this.loading = false;
      }
    });
  }

  private calculateStats(): void {
    this.spikesCount = this.anomalies.filter(a => a.deviation > 1).length;
    this.dropsCount = this.anomalies.filter(a => a.deviation < 1).length;
    this.affectedCategories = new Set(this.anomalies.map(a => a.category)).size;
  }

  getBarWidth(anomaly: AnomalyData): number {
    // Scale bar width based on deviation, with 50% being the average
    const width = (anomaly.deviation / 2) * 100;
    return Math.min(Math.max(width, 5), 100);
  }

  formatThreshold(value: number): string {
    return `${value}x`;
  }
}
