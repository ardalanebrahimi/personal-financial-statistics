import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule } from '@angular/material/sort';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { environment } from '../../../environments/environment';
import { PatternTransactionsDialogComponent } from './pattern-transactions-dialog.component';

interface RecurringPattern {
  id: string;
  beneficiary: string;
  averageAmount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'irregular';
  averageIntervalDays: number;
  confidence: 'high' | 'medium' | 'low';
  transactionIds: string[];
  firstOccurrence: string;
  lastOccurrence: string;
  occurrenceCount: number;
  category?: string;
  isActive: boolean;
  nextExpectedDate?: string;
  amountVariance: number;
  description?: string;
}

interface Category {
  id: string;
  name: string;
  color?: string;
}

@Component({
  selector: 'app-recurring',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatMenuModule,
    MatSelectModule,
    MatFormFieldModule,
    MatExpansionModule,
    MatDividerModule,
    MatBadgeModule,
    MatTableModule,
    MatSortModule,
    MatDialogModule
  ],
  template: `
    <div class="recurring-container">
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <h1>
            <mat-icon>repeat</mat-icon>
            Recurring Transactions
          </h1>
          <p class="subtitle">Track subscriptions, bills, and regular payments</p>
        </div>
        <div class="header-actions">
          <button mat-stroked-button (click)="runDetection()" [disabled]="isDetecting">
            <mat-icon>search</mat-icon>
            {{ isDetecting ? 'Detecting...' : 'Run Detection' }}
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-state" *ngIf="isLoading">
        <mat-spinner diameter="48"></mat-spinner>
        <p>Loading recurring patterns...</p>
      </div>

      <!-- Stats Cards -->
      <div class="stats-row" *ngIf="!isLoading">
        <mat-card class="stat-card">
          <div class="stat-icon total">
            <mat-icon>repeat</mat-icon>
          </div>
          <div class="stat-content">
            <span class="stat-value">{{ patterns.length }}</span>
            <span class="stat-label">Patterns Detected</span>
          </div>
        </mat-card>

        <mat-card class="stat-card">
          <div class="stat-icon active">
            <mat-icon>check_circle</mat-icon>
          </div>
          <div class="stat-content">
            <span class="stat-value">{{ activePatterns.length }}</span>
            <span class="stat-label">Active</span>
          </div>
        </mat-card>

        <mat-card class="stat-card">
          <div class="stat-icon monthly">
            <mat-icon>calendar_month</mat-icon>
          </div>
          <div class="stat-content">
            <span class="stat-value">{{ getMonthlyTotal() | currency:'EUR':'symbol':'1.2-2' }}</span>
            <span class="stat-label">Monthly Total</span>
          </div>
        </mat-card>

        <mat-card class="stat-card">
          <div class="stat-icon upcoming">
            <mat-icon>schedule</mat-icon>
          </div>
          <div class="stat-content">
            <span class="stat-value">{{ getUpcomingCount() }}</span>
            <span class="stat-label">Due This Week</span>
          </div>
        </mat-card>
      </div>

      <!-- Filter Bar -->
      <div class="filter-bar" *ngIf="!isLoading && patterns.length > 0">
        <mat-form-field appearance="outline">
          <mat-label>Status</mat-label>
          <mat-select [(ngModel)]="filterStatus" (selectionChange)="applyFilters()">
            <mat-option value="all">All</mat-option>
            <mat-option value="active">Active Only</mat-option>
            <mat-option value="inactive">Inactive Only</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Frequency</mat-label>
          <mat-select [(ngModel)]="filterFrequency" (selectionChange)="applyFilters()">
            <mat-option value="all">All Frequencies</mat-option>
            <mat-option value="weekly">Weekly</mat-option>
            <mat-option value="biweekly">Bi-weekly</mat-option>
            <mat-option value="monthly">Monthly</mat-option>
            <mat-option value="quarterly">Quarterly</mat-option>
            <mat-option value="yearly">Yearly</mat-option>
            <mat-option value="irregular">Irregular</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Confidence</mat-label>
          <mat-select [(ngModel)]="filterConfidence" (selectionChange)="applyFilters()">
            <mat-option value="all">All</mat-option>
            <mat-option value="high">High</mat-option>
            <mat-option value="medium">Medium</mat-option>
            <mat-option value="low">Low</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <!-- Empty State -->
      <div class="empty-state" *ngIf="!isLoading && patterns.length === 0">
        <mat-icon>repeat</mat-icon>
        <h2>No Recurring Patterns Found</h2>
        <p>Click "Run Detection" to analyze your transactions for recurring patterns like subscriptions and bills.</p>
        <button mat-raised-button color="primary" (click)="runDetection()" [disabled]="isDetecting">
          <mat-icon>search</mat-icon>
          Run Detection
        </button>
      </div>

      <!-- Patterns List -->
      <div class="patterns-list" *ngIf="!isLoading && filteredPatterns.length > 0">
        <mat-accordion multi>
          <mat-expansion-panel *ngFor="let pattern of filteredPatterns" [class.inactive]="!pattern.isActive">
            <mat-expansion-panel-header collapsedHeight="auto" expandedHeight="auto">
              <mat-panel-title>
                <div class="pattern-header">
                  <div class="status-indicator" [class.active]="pattern.isActive" [class.inactive]="!pattern.isActive">
                    <mat-icon>{{ pattern.isActive ? 'check_circle' : 'pause_circle' }}</mat-icon>
                  </div>
                  <div class="pattern-main">
                    <span class="beneficiary" [matTooltip]="pattern.beneficiary">{{ pattern.beneficiary }}</span>
                    <span class="description" *ngIf="pattern.description" [matTooltip]="pattern.description">{{ pattern.description }}</span>
                  </div>
                </div>
              </mat-panel-title>
              <mat-panel-description>
                <div class="pattern-summary">
                  <mat-chip class="frequency-chip" [class]="pattern.frequency">
                    {{ getFrequencyLabel(pattern.frequency) }}
                  </mat-chip>
                  <span class="amount">{{ -pattern.averageAmount | currency:'EUR':'symbol':'1.2-2' }}</span>
                  <mat-chip class="confidence-chip" [class]="pattern.confidence">
                    {{ pattern.confidence }}
                  </mat-chip>
                </div>
              </mat-panel-description>
            </mat-expansion-panel-header>

            <!-- Expanded Content -->
            <div class="pattern-details">
              <!-- Total Value Highlight -->
              <div class="total-value-card">
                <div class="total-label">Total Spent</div>
                <div class="total-amount">{{ getTotalValue(pattern) | currency:'EUR':'symbol':'1.2-2' }}</div>
                <div class="total-note">Across {{ pattern.occurrenceCount }} transactions</div>
              </div>

              <div class="details-grid">
                <div class="detail-item">
                  <span class="label">Occurrences</span>
                  <span class="value">{{ pattern.occurrenceCount }} times</span>
                </div>
                <div class="detail-item">
                  <span class="label">First Payment</span>
                  <span class="value">{{ pattern.firstOccurrence | date:'dd.MM.yyyy' }}</span>
                </div>
                <div class="detail-item">
                  <span class="label">Last Payment</span>
                  <span class="value">{{ pattern.lastOccurrence | date:'dd.MM.yyyy' }}</span>
                </div>
                <div class="detail-item" *ngIf="pattern.nextExpectedDate">
                  <span class="label">Next Expected</span>
                  <span class="value" [class.soon]="isDueSoon(pattern)">
                    {{ pattern.nextExpectedDate | date:'dd.MM.yyyy' }}
                    <span class="days-away">({{ getDaysUntil(pattern.nextExpectedDate) }})</span>
                  </span>
                </div>
                <div class="detail-item">
                  <span class="label">Avg. Interval</span>
                  <span class="value">{{ pattern.averageIntervalDays }} days</span>
                </div>
                <div class="detail-item">
                  <span class="label">Amount Variance</span>
                  <span class="value">{{ pattern.amountVariance | currency:'EUR':'symbol':'1.2-2' }}</span>
                </div>
              </div>

              <mat-divider></mat-divider>

              <div class="pattern-actions">
                <mat-form-field appearance="outline" class="category-select">
                  <mat-label>Category</mat-label>
                  <mat-select [value]="pattern.category" (selectionChange)="updateCategory(pattern, $event.value)">
                    <mat-option [value]="null">Uncategorized</mat-option>
                    <mat-option *ngFor="let cat of categories" [value]="cat.name">
                      {{ cat.name }}
                    </mat-option>
                  </mat-select>
                </mat-form-field>

                <button mat-stroked-button (click)="viewTransactions(pattern)">
                  <mat-icon>visibility</mat-icon>
                  View Transactions ({{ pattern.occurrenceCount }})
                </button>

                <button mat-stroked-button color="warn" (click)="deletePattern(pattern)">
                  <mat-icon>delete</mat-icon>
                  Remove Pattern
                </button>
              </div>
            </div>
          </mat-expansion-panel>
        </mat-accordion>
      </div>

      <!-- Upcoming Payments Section -->
      <div class="upcoming-section" *ngIf="!isLoading && getUpcomingPatterns().length > 0">
        <h2>
          <mat-icon>event</mat-icon>
          Upcoming Payments
        </h2>
        <div class="upcoming-list">
          <div class="upcoming-item" *ngFor="let pattern of getUpcomingPatterns()">
            <div class="upcoming-date">
              <span class="day">{{ pattern.nextExpectedDate | date:'dd' }}</span>
              <span class="month">{{ pattern.nextExpectedDate | date:'MMM' }}</span>
            </div>
            <div class="upcoming-info">
              <span class="name">{{ pattern.beneficiary }}</span>
              <span class="frequency">{{ getFrequencyLabel(pattern.frequency) }}</span>
            </div>
            <span class="upcoming-amount">{{ -pattern.averageAmount | currency:'EUR':'symbol':'1.2-2' }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .recurring-container {
      padding: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
    }

    .header-left h1 {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 0;
      font-size: 28px;
      font-weight: 500;
    }

    .header-left h1 mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #1976d2;
    }

    .subtitle {
      margin: 4px 0 0 44px;
      color: #666;
      font-size: 14px;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px;
      color: #666;
    }

    .loading-state p {
      margin-top: 16px;
    }

    .stats-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px;
    }

    .stat-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .stat-icon mat-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
      color: white;
    }

    .stat-icon.total { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    .stat-icon.active { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
    .stat-icon.monthly { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
    .stat-icon.upcoming { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }

    .stat-content {
      display: flex;
      flex-direction: column;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 600;
      color: #333;
    }

    .stat-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .filter-bar {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
    }

    .filter-bar mat-form-field {
      width: 160px;
    }

    .empty-state {
      text-align: center;
      padding: 64px;
      background: #fafafa;
      border-radius: 12px;
    }

    .empty-state mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: #ccc;
      margin-bottom: 16px;
    }

    .empty-state h2 {
      margin: 0 0 8px 0;
      color: #333;
    }

    .empty-state p {
      color: #666;
      margin-bottom: 24px;
    }

    .patterns-list {
      margin-bottom: 32px;
    }

    mat-expansion-panel {
      margin-bottom: 8px;
    }

    mat-expansion-panel.inactive {
      opacity: 0.7;
    }

    ::ng-deep .mat-expansion-panel-header {
      height: auto !important;
      min-height: 64px;
      padding: 12px 24px !important;
    }

    ::ng-deep .mat-expansion-panel-header-title {
      flex: 1;
      margin-right: 16px;
    }

    ::ng-deep .mat-expansion-panel-header-description {
      flex: 0 0 auto;
      margin-right: 0;
    }

    .pattern-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      width: 100%;
    }

    .status-indicator {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      padding-top: 2px;
    }

    .status-indicator.active mat-icon {
      color: #4caf50;
    }

    .status-indicator.inactive mat-icon {
      color: #9e9e9e;
    }

    .pattern-main {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }

    .beneficiary {
      font-weight: 500;
      font-size: 14px;
      word-wrap: break-word;
      overflow-wrap: break-word;
      white-space: normal;
      line-height: 1.4;
    }

    .description {
      font-size: 12px;
      color: #666;
      word-wrap: break-word;
      overflow-wrap: break-word;
      white-space: normal;
      line-height: 1.4;
      margin-top: 4px;
    }

    .pattern-summary {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .amount {
      font-weight: 600;
      font-family: 'Roboto Mono', monospace;
      color: #d32f2f;
      white-space: nowrap;
    }

    .total-value-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      padding: 16px 24px;
      color: white;
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }

    .total-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.9;
    }

    .total-amount {
      font-size: 28px;
      font-weight: 600;
      font-family: 'Roboto Mono', monospace;
      margin: 4px 0;
    }

    .total-note {
      font-size: 12px;
      opacity: 0.8;
    }

    .frequency-chip {
      font-size: 11px;
      min-height: 24px;
      padding: 0 8px;
    }

    .frequency-chip.weekly { background: #e3f2fd !important; color: #1976d2 !important; }
    .frequency-chip.biweekly { background: #e8f5e9 !important; color: #388e3c !important; }
    .frequency-chip.monthly { background: #fff3e0 !important; color: #f57c00 !important; }
    .frequency-chip.quarterly { background: #fce4ec !important; color: #c2185b !important; }
    .frequency-chip.yearly { background: #f3e5f5 !important; color: #7b1fa2 !important; }
    .frequency-chip.irregular { background: #eceff1 !important; color: #607d8b !important; }

    .confidence-chip {
      font-size: 10px;
      min-height: 20px;
      padding: 0 6px;
    }

    .confidence-chip.high { background: #c8e6c9 !important; color: #2e7d32 !important; }
    .confidence-chip.medium { background: #fff9c4 !important; color: #f9a825 !important; }
    .confidence-chip.low { background: #ffcdd2 !important; color: #c62828 !important; }

    .pattern-details {
      padding: 16px 0;
    }

    .details-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 16px;
    }

    .detail-item {
      display: flex;
      flex-direction: column;
    }

    .detail-item .label {
      font-size: 11px;
      color: #666;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .detail-item .value {
      font-size: 14px;
      font-weight: 500;
    }

    .detail-item .value.soon {
      color: #f57c00;
    }

    .days-away {
      font-size: 12px;
      color: #666;
      font-weight: normal;
    }

    .pattern-actions {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-top: 16px;
    }

    .category-select {
      width: 200px;
    }

    .upcoming-section {
      margin-top: 32px;
    }

    .upcoming-section h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 18px;
      font-weight: 500;
      margin-bottom: 16px;
    }

    .upcoming-section h2 mat-icon {
      color: #1976d2;
    }

    .upcoming-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .upcoming-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 16px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .upcoming-date {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 48px;
      padding: 8px;
      background: #e3f2fd;
      border-radius: 8px;
    }

    .upcoming-date .day {
      font-size: 18px;
      font-weight: 600;
      color: #1976d2;
    }

    .upcoming-date .month {
      font-size: 11px;
      color: #1976d2;
      text-transform: uppercase;
    }

    .upcoming-info {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .upcoming-info .name {
      font-weight: 500;
    }

    .upcoming-info .frequency {
      font-size: 12px;
      color: #666;
    }

    .upcoming-amount {
      font-weight: 600;
      font-family: 'Roboto Mono', monospace;
      color: #d32f2f;
    }

    @media (max-width: 768px) {
      .stats-row {
        grid-template-columns: repeat(2, 1fr);
      }

      .details-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .filter-bar {
        flex-wrap: wrap;
      }

      .pattern-actions {
        flex-wrap: wrap;
      }
    }
  `]
})
export class RecurringComponent implements OnInit {
  patterns: RecurringPattern[] = [];
  filteredPatterns: RecurringPattern[] = [];
  categories: Category[] = [];
  isLoading = true;
  isDetecting = false;

  // Filters
  filterStatus = 'all';
  filterFrequency = 'all';
  filterConfidence = 'all';

  constructor(
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.loadPatterns();
    this.loadCategories();
  }

  get activePatterns(): RecurringPattern[] {
    return this.patterns.filter(p => p.isActive);
  }

  async loadPatterns() {
    this.isLoading = true;
    try {
      const response = await fetch(`${environment.apiUrl}/recurring/patterns`);
      const data = await response.json();
      this.patterns = data.patterns || [];
      this.applyFilters();
    } catch (error) {
      console.error('Error loading patterns:', error);
      this.snackBar.open('Failed to load recurring patterns', '', { duration: 3000 });
    }
    this.isLoading = false;
  }

  async loadCategories() {
    try {
      const response = await fetch(`${environment.apiUrl}/categories`);
      this.categories = await response.json();
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  }

  async runDetection() {
    this.isDetecting = true;
    try {
      const response = await fetch(`${environment.apiUrl}/recurring/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saveResults: true })
      });
      const result = await response.json();

      this.snackBar.open(
        `Detected ${result.patterns?.length || 0} recurring patterns`,
        '',
        { duration: 3000 }
      );

      await this.loadPatterns();
    } catch (error) {
      console.error('Error running detection:', error);
      this.snackBar.open('Detection failed', '', { duration: 3000 });
    }
    this.isDetecting = false;
  }

  applyFilters() {
    let result = [...this.patterns];

    if (this.filterStatus === 'active') {
      result = result.filter(p => p.isActive);
    } else if (this.filterStatus === 'inactive') {
      result = result.filter(p => !p.isActive);
    }

    if (this.filterFrequency !== 'all') {
      result = result.filter(p => p.frequency === this.filterFrequency);
    }

    if (this.filterConfidence !== 'all') {
      result = result.filter(p => p.confidence === this.filterConfidence);
    }

    // Sort by next expected date (upcoming first), then by last occurrence
    result.sort((a, b) => {
      if (a.nextExpectedDate && b.nextExpectedDate) {
        return new Date(a.nextExpectedDate).getTime() - new Date(b.nextExpectedDate).getTime();
      }
      if (a.nextExpectedDate) return -1;
      if (b.nextExpectedDate) return 1;
      return new Date(b.lastOccurrence).getTime() - new Date(a.lastOccurrence).getTime();
    });

    this.filteredPatterns = result;
  }

  getFrequencyLabel(frequency: string): string {
    const labels: Record<string, string> = {
      weekly: 'Weekly',
      biweekly: 'Bi-weekly',
      monthly: 'Monthly',
      quarterly: 'Quarterly',
      yearly: 'Yearly',
      irregular: 'Irregular'
    };
    return labels[frequency] || frequency;
  }

  getMonthlyTotal(): number {
    return this.activePatterns.reduce((sum, p) => {
      let monthlyAmount = Math.abs(p.averageAmount);
      switch (p.frequency) {
        case 'weekly': monthlyAmount *= 4.33; break;
        case 'biweekly': monthlyAmount *= 2.17; break;
        case 'quarterly': monthlyAmount /= 3; break;
        case 'yearly': monthlyAmount /= 12; break;
      }
      return sum + monthlyAmount;
    }, 0);
  }

  getUpcomingCount(): number {
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);

    return this.patterns.filter(p =>
      p.nextExpectedDate &&
      new Date(p.nextExpectedDate) <= oneWeekFromNow
    ).length;
  }

  getUpcomingPatterns(): RecurringPattern[] {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    return this.patterns
      .filter(p => p.nextExpectedDate && new Date(p.nextExpectedDate) <= thirtyDaysFromNow)
      .sort((a, b) =>
        new Date(a.nextExpectedDate!).getTime() - new Date(b.nextExpectedDate!).getTime()
      )
      .slice(0, 5);
  }

  isDueSoon(pattern: RecurringPattern): boolean {
    if (!pattern.nextExpectedDate) return false;
    const daysUntil = (new Date(pattern.nextExpectedDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysUntil <= 7;
  }

  getDaysUntil(dateStr: string): string {
    const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `in ${days}d`;
  }

  async updateCategory(pattern: RecurringPattern, category: string | null) {
    try {
      await fetch(`${environment.apiUrl}/recurring/patterns/${pattern.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category })
      });

      pattern.category = category || undefined;
      this.snackBar.open('Category updated', '', { duration: 2000 });
    } catch (error) {
      console.error('Error updating category:', error);
      this.snackBar.open('Failed to update category', '', { duration: 3000 });
    }
  }

  viewTransactions(pattern: RecurringPattern) {
    this.dialog.open(PatternTransactionsDialogComponent, {
      width: '90vw',
      maxWidth: '1200px',
      maxHeight: '90vh',
      data: {
        pattern,
        categories: this.categories
      }
    });
  }

  getTotalValue(pattern: RecurringPattern): number {
    // Total = average amount * occurrence count
    return Math.abs(pattern.averageAmount) * pattern.occurrenceCount;
  }

  async deletePattern(pattern: RecurringPattern) {
    if (!confirm(`Remove pattern for "${pattern.beneficiary}"?`)) return;

    try {
      await fetch(`${environment.apiUrl}/recurring/patterns/${pattern.id}`, {
        method: 'DELETE'
      });

      this.patterns = this.patterns.filter(p => p.id !== pattern.id);
      this.applyFilters();
      this.snackBar.open('Pattern removed', '', { duration: 2000 });
    } catch (error) {
      console.error('Error deleting pattern:', error);
      this.snackBar.open('Failed to remove pattern', '', { duration: 3000 });
    }
  }
}
