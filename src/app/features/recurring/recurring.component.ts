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

export interface RecurringPattern {
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

export interface Category {
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
  templateUrl: './recurring.component.html',
  styleUrl: './recurring.component.scss'
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
