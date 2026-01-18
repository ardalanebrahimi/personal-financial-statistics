/**
 * Trends Data Service
 *
 * Shared data fetching and utilities for trend analysis services.
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, forkJoin, shareReplay } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  beneficiary?: string;
  isContextOnly?: boolean;
  source?: {
    connectorType: string;
  };
}

export interface Category {
  id: string;
  name: string;
  color?: string;
}

export interface TrendsData {
  transactions: Transaction[];
  categories: Category[];
}

@Injectable({
  providedIn: 'root'
})
export class TrendsDataService {
  readonly monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  private readonly defaultColors = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
    '#FF9F40', '#C9CBCF', '#7BC225', '#F87979', '#5D9CEC'
  ];

  constructor(private http: HttpClient) {}

  /**
   * Get all transactions and categories
   * Filters out context-only transactions (e.g., Amazon orders)
   */
  getData(): Observable<TrendsData> {
    return forkJoin({
      transactions: this.http.get<{ transactions: Transaction[] }>(`${environment.apiUrl}/transactions`)
        .pipe(map(res => {
          const allTransactions = res.transactions || [];
          return allTransactions.filter(t => !t.isContextOnly);
        })),
      categories: this.http.get<{ categories: Category[] }>(`${environment.apiUrl}/categories`)
        .pipe(map(res => res.categories || []))
    });
  }

  /**
   * Filter transactions by date range
   */
  filterByDateRange(transactions: Transaction[], startDate: Date, endDate: Date): Transaction[] {
    return transactions.filter(t => {
      const date = new Date(t.date);
      return date >= startDate && date <= endDate;
    });
  }

  /**
   * Get all month keys in a date range
   */
  getMonthsInRange(startDate: Date, endDate: Date): string[] {
    const months: string[] = [];
    const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while (current <= end) {
      months.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`);
      current.setMonth(current.getMonth() + 1);
    }

    return months;
  }

  /**
   * Format month key to label (e.g., "2024-01" -> "Jan 2024")
   */
  formatMonthKey(monthKey: string): string {
    const [year, month] = monthKey.split('-');
    return `${this.monthNames[parseInt(month) - 1]} ${year}`;
  }

  /**
   * Format date to month label
   */
  formatMonthLabel(date: Date): string {
    return `${this.monthNames[date.getMonth()]} ${date.getFullYear()}`;
  }

  /**
   * Build a color map from categories
   */
  buildCategoryColorMap(categories: Category[]): Map<string, string> {
    const colorMap = new Map<string, string>();
    categories.forEach(c => {
      if (c.color) colorMap.set(c.name, c.color);
    });
    return colorMap;
  }

  /**
   * Generate a consistent color for a category name
   */
  generateColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return this.defaultColors[Math.abs(hash) % this.defaultColors.length];
  }

  /**
   * Get category color from map or generate one
   */
  getCategoryColor(category: string, colorMap: Map<string, string>): string {
    return colorMap.get(category) || this.generateColor(category);
  }

  /**
   * Round to 2 decimal places
   */
  round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  /**
   * Convert date to month key (e.g., "2024-01")
   */
  dateToMonthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
}
