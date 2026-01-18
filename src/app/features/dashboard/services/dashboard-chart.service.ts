/**
 * Dashboard Chart Service
 *
 * Handles chart data calculation and formatting.
 */

import { Injectable } from '@angular/core';
import { ChartData, ChartConfiguration } from 'chart.js';

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category?: string;
}

export interface Category {
  id: string;
  name: string;
  color?: string;
}

export interface CategoryBreakdown {
  name: string;
  total: number;
  percentage: number;
  count: number;
  color: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardChartService {
  private readonly defaultColors = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
    '#FF9F40', '#FF6384', '#C9CBCF', '#7BC225', '#F87979'
  ];

  readonly pieChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: true,
        position: 'right'
      }
    }
  };

  readonly lineChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: true,
        position: 'top'
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };

  /**
   * Calculate category breakdown from transactions.
   */
  calculateCategoryBreakdown(
    transactions: Transaction[],
    categories: Category[],
    dateRange: DateRange
  ): CategoryBreakdown[] {
    const filteredTransactions = transactions.filter(t => {
      const date = new Date(t.date);
      return date >= dateRange.start && date <= dateRange.end && t.amount < 0;
    });

    const categoryTotals = new Map<string, { total: number; count: number }>();
    filteredTransactions.forEach(t => {
      const category = t.category || 'Uncategorized';
      const existing = categoryTotals.get(category) || { total: 0, count: 0 };
      categoryTotals.set(category, {
        total: existing.total + Math.abs(t.amount),
        count: existing.count + 1
      });
    });

    const sorted = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1].total - a[1].total);

    const totalSpending = sorted.reduce((sum, [, data]) => sum + data.total, 0);

    return sorted.map(([name, data], index) => ({
      name,
      total: data.total,
      percentage: totalSpending > 0 ? (data.total / totalSpending) * 100 : 0,
      count: data.count,
      color: categories.find(c => c.name === name)?.color ||
             this.defaultColors[index % this.defaultColors.length]
    }));
  }

  /**
   * Build chart data from category breakdown.
   */
  buildCategoryChartData(breakdown: CategoryBreakdown[]): ChartData<'pie' | 'bar'> {
    return {
      labels: breakdown.map(c => c.name),
      datasets: [{
        data: breakdown.map(c => c.total),
        backgroundColor: breakdown.map(c => c.color)
      }]
    };
  }

  /**
   * Build monthly trend chart data.
   */
  buildMonthlyTrendData(
    transactions: Transaction[],
    dateRange: DateRange
  ): ChartData<'line'> {
    const filteredTransactions = transactions.filter(t => {
      const date = new Date(t.date);
      return date >= dateRange.start && date <= dateRange.end && t.amount < 0;
    });

    const monthlyTotals = new Map<string, number>();
    filteredTransactions.forEach(t => {
      const date = new Date(t.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + Math.abs(t.amount));
    });

    const sortedMonths = Array.from(monthlyTotals.entries())
      .sort((a, b) => a[0].localeCompare(b[0]));

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const labels = sortedMonths.map(([key]) => {
      const [year, month] = key.split('-');
      return `${monthNames[parseInt(month) - 1]} ${year}`;
    });

    return {
      labels,
      datasets: [{
        label: 'Spending',
        data: sortedMonths.map(([, total]) => total),
        borderColor: '#1976d2',
        backgroundColor: 'rgba(25, 118, 210, 0.1)',
        fill: true,
        tension: 0.4
      }]
    };
  }

  /**
   * Get date range for preset.
   */
  getDatePreset(preset: string): DateRange {
    const now = new Date();
    let start: Date;
    let end: Date;

    switch (preset) {
      case 'thisMonth':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'lastMonth':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'last3Months':
        start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'thisYear':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    return { start, end };
  }

  /**
   * Get default date range (this month).
   */
  getDefaultDateRange(): DateRange {
    return this.getDatePreset('thisMonth');
  }
}
