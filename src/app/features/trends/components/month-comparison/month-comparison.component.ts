import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatSortModule, Sort } from '@angular/material/sort';
import { TrendsService, MonthComparison } from '../../services/trends.service';

interface MonthOption {
  value: Date;
  label: string;
}

@Component({
  selector: 'app-month-comparison',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule,
    MatButtonModule,
    MatSortModule
  ],
  templateUrl: './month-comparison.component.html',
  styleUrl: './month-comparison.component.scss'
})
export class MonthComparisonComponent implements OnInit {
  loading = false;
  selectedMonth: Date;
  availableMonths: MonthOption[] = [];
  comparisons: MonthComparison[] = [];
  thisMonthLabel = '';
  lastMonthLabel = '';

  // Totals
  totalThisMonth = 0;
  totalLastMonth = 0;
  totalChange = 0;
  totalPercentChange: number | null = null;
  categoriesUp = 0;
  categoriesDown = 0;

  // Sorting
  sortColumn: 'change' | 'percent' | null = 'change';
  sortDirection: 'asc' | 'desc' = 'desc';

  private readonly monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  constructor(private trendsService: TrendsService) {
    // Default to current month
    const now = new Date();
    this.selectedMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    this.buildAvailableMonths();
  }

  ngOnInit(): void {
    this.loadData();
  }

  get sortedComparisons(): MonthComparison[] {
    if (!this.sortColumn) return this.comparisons;

    return [...this.comparisons].sort((a, b) => {
      let aVal: number, bVal: number;

      if (this.sortColumn === 'change') {
        aVal = Math.abs(a.change);
        bVal = Math.abs(b.change);
      } else {
        aVal = a.percentChange !== null ? Math.abs(a.percentChange) : -1;
        bVal = b.percentChange !== null ? Math.abs(b.percentChange) : -1;
      }

      return this.sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }

  private buildAvailableMonths(): void {
    const now = new Date();
    const months: MonthOption[] = [];

    // Go back 24 months
    for (let i = 0; i < 24; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        value: date,
        label: `${this.monthNames[date.getMonth()]} ${date.getFullYear()}`
      });
    }

    this.availableMonths = months;
  }

  loadData(): void {
    if (!this.selectedMonth) return;

    this.loading = true;
    this.trendsService.getMonthComparison(this.selectedMonth).subscribe({
      next: (result) => {
        this.comparisons = result.comparisons;
        this.thisMonthLabel = result.thisMonthLabel;
        this.lastMonthLabel = result.lastMonthLabel;
        this.calculateTotals();
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load comparison data:', err);
        this.loading = false;
      }
    });
  }

  private calculateTotals(): void {
    this.totalThisMonth = this.comparisons.reduce((sum, c) => sum + c.thisMonth, 0);
    this.totalLastMonth = this.comparisons.reduce((sum, c) => sum + c.lastMonth, 0);
    this.totalChange = this.totalThisMonth - this.totalLastMonth;
    this.totalPercentChange = this.totalLastMonth > 0
      ? ((this.totalThisMonth - this.totalLastMonth) / this.totalLastMonth) * 100
      : null;

    this.categoriesUp = this.comparisons.filter(c => c.change > 0).length;
    this.categoriesDown = this.comparisons.filter(c => c.change < 0).length;
  }

  sortBy(column: 'change' | 'percent'): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'desc' ? 'asc' : 'desc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'desc';
    }
  }
}
