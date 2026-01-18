/**
 * Dashboard Stats Service
 *
 * Calculates dashboard statistics from transactions.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category?: string;
  beneficiary?: string;
  source?: {
    connectorType: string;
  };
  matchId?: string;
  isContextOnly?: boolean;
}

export interface DashboardStats {
  totalTransactions: number;
  totalSpending: number;
  totalIncome: number;
  netBalance: number;
  uncategorizedCount: number;
  unmatchedCount: number;
  thisMonthSpending: number;
  lastMonthSpending: number;
  spendingChange: number;
  topCategories: CategoryStat[];
  monthlyTrend: MonthlyData[];
}

export interface CategoryStat {
  name: string;
  total: number;
  count: number;
  color?: string;
  percentage?: number;
}

export interface MonthlyData {
  month: string;
  year: number;
  monthIndex: number;
  income: number;
  spending: number;
  net: number;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardStatsService {
  private _stats = new BehaviorSubject<DashboardStats>(this.getDefaultStats());
  stats$ = this._stats.asObservable();

  getDefaultStats(): DashboardStats {
    return {
      totalTransactions: 0,
      totalSpending: 0,
      totalIncome: 0,
      netBalance: 0,
      uncategorizedCount: 0,
      unmatchedCount: 0,
      thisMonthSpending: 0,
      lastMonthSpending: 0,
      spendingChange: 0,
      topCategories: [],
      monthlyTrend: []
    };
  }

  /**
   * Calculate all dashboard statistics from transactions.
   */
  calculateStats(
    transactions: Transaction[],
    categories: { name: string; color?: string }[]
  ): DashboardStats {
    // Filter out context-only transactions for stats
    const realTransactions = transactions.filter(t => !t.isContextOnly);

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

    // Basic stats
    const totalTransactions = realTransactions.length;
    const expenses = realTransactions.filter(t => t.amount < 0);
    const income = realTransactions.filter(t => t.amount > 0);

    const totalSpending = Math.abs(expenses.reduce((sum, t) => sum + t.amount, 0));
    const totalIncome = income.reduce((sum, t) => sum + t.amount, 0);
    const netBalance = totalIncome - totalSpending;

    // Uncategorized and unmatched counts
    const uncategorizedCount = realTransactions.filter(t => !t.category).length;
    const unmatchedCount = realTransactions.filter(t => !t.matchId).length;

    // This month stats
    const thisMonthTx = realTransactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    const thisMonthSpending = Math.abs(
      thisMonthTx.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
    );

    // Last month stats
    const lastMonthTx = realTransactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    });
    const lastMonthSpending = Math.abs(
      lastMonthTx.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
    );

    // Spending change percentage
    let spendingChange = 0;
    if (lastMonthSpending > 0) {
      spendingChange = Math.round(
        ((thisMonthSpending - lastMonthSpending) / lastMonthSpending) * 100
      );
    }

    // Top categories
    const topCategories = this.calculateCategoryStats(expenses, categories);

    // Monthly trend
    const monthlyTrend = this.calculateMonthlyTrend(realTransactions);

    const stats: DashboardStats = {
      totalTransactions,
      totalSpending,
      totalIncome,
      netBalance,
      uncategorizedCount,
      unmatchedCount,
      thisMonthSpending,
      lastMonthSpending,
      spendingChange,
      topCategories,
      monthlyTrend
    };

    this._stats.next(stats);
    return stats;
  }

  /**
   * Calculate category statistics from expenses.
   */
  private calculateCategoryStats(
    expenses: Transaction[],
    categories: { name: string; color?: string }[]
  ): CategoryStat[] {
    const categoryMap = new Map<string, { total: number; count: number }>();

    expenses.forEach(t => {
      const cat = t.category || 'Uncategorized';
      const existing = categoryMap.get(cat) || { total: 0, count: 0 };
      existing.total += Math.abs(t.amount);
      existing.count++;
      categoryMap.set(cat, existing);
    });

    const totalExpenses = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const stats: CategoryStat[] = [];
    categoryMap.forEach((value, name) => {
      const categoryInfo = categories.find(c => c.name === name);
      stats.push({
        name,
        total: value.total,
        count: value.count,
        color: categoryInfo?.color,
        percentage: totalExpenses > 0 ? (value.total / totalExpenses) * 100 : 0
      });
    });

    // Sort by total descending
    stats.sort((a, b) => b.total - a.total);

    return stats.slice(0, 10); // Top 10
  }

  /**
   * Calculate monthly trend data for charts.
   */
  private calculateMonthlyTrend(transactions: Transaction[]): MonthlyData[] {
    const monthlyMap = new Map<string, MonthlyData>();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Get last 12 months
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      monthlyMap.set(key, {
        month: monthNames[date.getMonth()],
        year: date.getFullYear(),
        monthIndex: date.getMonth(),
        income: 0,
        spending: 0,
        net: 0
      });
    }

    // Aggregate transactions
    transactions.forEach(t => {
      const date = new Date(t.date);
      const key = `${date.getFullYear()}-${date.getMonth()}`;

      const monthData = monthlyMap.get(key);
      if (monthData) {
        if (t.amount > 0) {
          monthData.income += t.amount;
        } else {
          monthData.spending += Math.abs(t.amount);
        }
        monthData.net = monthData.income - monthData.spending;
      }
    });

    return Array.from(monthlyMap.values());
  }

  /**
   * Get chart data for pie/doughnut chart.
   */
  getCategoryChartData(stats: DashboardStats): {
    labels: string[];
    data: number[];
    colors: string[];
  } {
    const labels = stats.topCategories.map(c => c.name);
    const data = stats.topCategories.map(c => c.total);
    const colors = stats.topCategories.map(c =>
      c.color || this.getRandomColor(c.name)
    );

    return { labels, data, colors };
  }

  /**
   * Get chart data for monthly trend line chart.
   */
  getMonthlyChartData(stats: DashboardStats): {
    labels: string[];
    income: number[];
    spending: number[];
    net: number[];
  } {
    return {
      labels: stats.monthlyTrend.map(m => `${m.month} ${m.year}`),
      income: stats.monthlyTrend.map(m => m.income),
      spending: stats.monthlyTrend.map(m => m.spending),
      net: stats.monthlyTrend.map(m => m.net)
    };
  }

  /**
   * Generate consistent color for a category name.
   */
  private getRandomColor(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }

    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 60%, 50%)`;
  }

  /**
   * Format currency value.
   */
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  }
}
