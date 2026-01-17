import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TrendsService, HeatMapData } from '../../services/trends.service';

@Component({
  selector: 'app-heat-map',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTooltipModule
  ],
  template: `
    <div class="heat-map-container">
      <!-- Controls -->
      <mat-card class="controls-card">
        <mat-card-content>
          <mat-form-field appearance="outline">
            <mat-label>Show Top Categories</mat-label>
            <mat-select [(ngModel)]="topN" (selectionChange)="loadData()">
              <mat-option [value]="5">Top 5</mat-option>
              <mat-option [value]="10">Top 10</mat-option>
              <mat-option [value]="15">Top 15</mat-option>
            </mat-select>
          </mat-form-field>
        </mat-card-content>
      </mat-card>

      <!-- Heat Map -->
      <mat-card class="heatmap-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>grid_on</mat-icon>
          <mat-card-title>Category Spending Heat Map</mat-card-title>
          <mat-card-subtitle>Visualize spending intensity across categories and months</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="loading-container" *ngIf="loading">
            <mat-spinner diameter="40"></mat-spinner>
            <span>Loading data...</span>
          </div>

          <div class="empty-state" *ngIf="!loading && (!heatMapData || heatMapData.categories.length === 0)">
            <mat-icon>info</mat-icon>
            <p>No data available for the selected period</p>
          </div>

          <div class="heatmap-wrapper" *ngIf="!loading && heatMapData && heatMapData.categories.length > 0">
            <!-- Legend -->
            <div class="legend">
              <span class="legend-label">Low</span>
              <div class="legend-gradient"></div>
              <span class="legend-label">High</span>
            </div>

            <!-- Heat Map Grid -->
            <div class="heatmap-grid">
              <!-- Header Row -->
              <div class="heatmap-row header-row">
                <div class="category-cell header-cell"></div>
                <div *ngFor="let month of heatMapData.monthLabels" class="month-cell header-cell">
                  {{ month }}
                </div>
              </div>

              <!-- Data Rows -->
              <div *ngFor="let category of heatMapData.categories" class="heatmap-row">
                <div class="category-cell" [matTooltip]="category">
                  <span class="color-dot" [style.background-color]="getCategoryColor(category)"></span>
                  {{ category | slice:0:20 }}{{ category.length > 20 ? '...' : '' }}
                </div>
                <div *ngFor="let month of heatMapData.months"
                     class="data-cell"
                     [style.background-color]="getCellColor(category, month)"
                     [matTooltip]="getCellTooltip(category, month)">
                  <span class="cell-value" *ngIf="getCellAmount(category, month) > 0">
                    {{ getCellAmount(category, month) | number:'1.0-0' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Summary -->
      <mat-card class="summary-card" *ngIf="heatMapData && heatMapData.categories.length > 0">
        <mat-card-header>
          <mat-icon mat-card-avatar>insights</mat-icon>
          <mat-card-title>Insights</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="insights-grid">
            <div class="insight">
              <mat-icon>local_fire_department</mat-icon>
              <div>
                <span class="insight-label">Hottest Category</span>
                <span class="insight-value">{{ hottestCategory }}</span>
              </div>
            </div>
            <div class="insight">
              <mat-icon>calendar_month</mat-icon>
              <div>
                <span class="insight-label">Highest Month</span>
                <span class="insight-value">{{ highestMonth }}</span>
              </div>
            </div>
            <div class="insight">
              <mat-icon>euro</mat-icon>
              <div>
                <span class="insight-label">Max Single Cell</span>
                <span class="insight-value">{{ heatMapData.maxAmount | currency:'EUR' }}</span>
              </div>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .heat-map-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .controls-card mat-card-content {
      padding: 1rem !important;
    }

    .heatmap-card {
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
    }

    .heatmap-wrapper {
      padding: 1rem;
      overflow-x: auto;
    }

    .legend {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
      justify-content: flex-end;
    }

    .legend-label {
      font-size: 12px;
      color: #666;
    }

    .legend-gradient {
      width: 150px;
      height: 16px;
      border-radius: 4px;
      background: linear-gradient(to right, #e3f2fd, #1976d2, #0d47a1);
    }

    .heatmap-grid {
      display: flex;
      flex-direction: column;
      min-width: fit-content;
    }

    .heatmap-row {
      display: flex;
    }

    .header-row {
      position: sticky;
      top: 0;
      background: white;
      z-index: 1;
    }

    .category-cell {
      width: 180px;
      min-width: 180px;
      padding: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 13px;
      border-bottom: 1px solid #e0e0e0;
      background: #fafafa;
    }

    .header-cell {
      font-weight: 500;
      color: #666;
      background: #f5f5f5;
    }

    .month-cell {
      width: 70px;
      min-width: 70px;
      text-align: center;
      padding: 0.5rem 0.25rem;
      font-size: 11px;
      border-bottom: 1px solid #e0e0e0;
    }

    .data-cell {
      width: 70px;
      min-width: 70px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #e0e0e0;
      cursor: pointer;
      transition: transform 0.1s;
    }

    .data-cell:hover {
      transform: scale(1.1);
      z-index: 2;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }

    .cell-value {
      font-size: 10px;
      font-weight: 500;
      color: white;
      text-shadow: 0 0 2px rgba(0,0,0,0.5);
    }

    .color-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .summary-card mat-card-content {
      padding: 1rem !important;
    }

    .insights-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }

    .insight {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: #fafafa;
      border-radius: 8px;
    }

    .insight mat-icon {
      color: #ff9800;
      font-size: 28px;
      width: 28px;
      height: 28px;
    }

    .insight-label {
      font-size: 12px;
      color: #666;
      display: block;
    }

    .insight-value {
      font-weight: 500;
      font-size: 14px;
    }
  `]
})
export class HeatMapComponent implements OnInit, OnChanges {
  @Input() startDate!: Date;
  @Input() endDate!: Date;

  loading = false;
  topN = 10;
  heatMapData: HeatMapData | null = null;
  hottestCategory = '';
  highestMonth = '';

  private dataMap = new Map<string, number>();

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
    this.trendsService.getHeatMapData(this.startDate, this.endDate, this.topN).subscribe({
      next: (data) => {
        this.heatMapData = data;
        this.buildDataMap();
        this.calculateInsights();
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load heat map data:', err);
        this.loading = false;
      }
    });
  }

  private buildDataMap(): void {
    this.dataMap.clear();
    if (!this.heatMapData) return;

    this.heatMapData.data.forEach(d => {
      this.dataMap.set(`${d.category}|${d.month}`, d.amount);
    });
  }

  private calculateInsights(): void {
    if (!this.heatMapData || this.heatMapData.data.length === 0) return;

    // Find hottest category (highest total)
    const categoryTotals = new Map<string, number>();
    this.heatMapData.data.forEach(d => {
      categoryTotals.set(d.category, (categoryTotals.get(d.category) || 0) + d.amount);
    });
    const sortedCategories = Array.from(categoryTotals.entries()).sort((a, b) => b[1] - a[1]);
    this.hottestCategory = sortedCategories[0]?.[0] || '';

    // Find highest month
    const monthTotals = new Map<string, number>();
    this.heatMapData.data.forEach(d => {
      monthTotals.set(d.month, (monthTotals.get(d.month) || 0) + d.amount);
    });
    const sortedMonths = Array.from(monthTotals.entries()).sort((a, b) => b[1] - a[1]);
    if (sortedMonths[0]) {
      const [year, month] = sortedMonths[0][0].split('-');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      this.highestMonth = `${monthNames[parseInt(month) - 1]} ${year}`;
    }
  }

  getCellAmount(category: string, month: string): number {
    return this.dataMap.get(`${category}|${month}`) || 0;
  }

  getCellColor(category: string, month: string): string {
    const amount = this.getCellAmount(category, month);
    if (!this.heatMapData || amount === 0) return '#f5f5f5';

    const intensity = Math.min(amount / this.heatMapData.maxAmount, 1);
    // Gradient from light blue to dark blue
    const r = Math.round(227 - intensity * 214);
    const g = Math.round(242 - intensity * 171);
    const b = Math.round(253 - intensity * 92);
    return `rgb(${r}, ${g}, ${b})`;
  }

  getCellTooltip(category: string, month: string): string {
    const amount = this.getCellAmount(category, month);
    const [year, monthNum] = month.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthLabel = `${monthNames[parseInt(monthNum) - 1]} ${year}`;
    return `${category}\n${monthLabel}: €${amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`;
  }

  getCategoryColor(category: string): string {
    return this.heatMapData?.categoryColors.get(category) || '#999';
  }
}
