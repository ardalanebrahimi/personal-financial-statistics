import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, forkJoin } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  beneficiary?: string;
}

export interface Category {
  id: string;
  name: string;
  color?: string;
}

export interface MonthlyData {
  month: string;        // "2024-01"
  label: string;        // "Jan 2024"
  income: number;
  expenses: number;
  net: number;
}

export interface CategoryMonthlyData {
  category: string;
  color: string;
  data: { month: string; label: string; amount: number }[];
  total: number;
}

export interface MonthComparison {
  category: string;
  color: string;
  thisMonth: number;
  lastMonth: number;
  change: number;
  percentChange: number | null;
}

export interface SavingsRateData {
  month: string;
  label: string;
  income: number;
  expenses: number;
  savings: number;
  savingsRate: number;
}

export interface RollingAverageData {
  month: string;
  label: string;
  actual: number;
  rollingAvg3: number | null;
  rollingAvg6: number | null;
}

export interface HeatMapData {
  categories: string[];
  months: string[];
  monthLabels: string[];
  data: { category: string; month: string; amount: number; color: string }[];
  maxAmount: number;
  categoryColors: Map<string, string>;
}

export interface AnomalyData {
  month: string;
  label: string;
  category: string;
  color: string;
  amount: number;
  average: number;
  deviation: number;
  isAnomaly: boolean;
}

export interface IncomeSourceData {
  source: string;
  color: string;
  data: { month: string; label: string; amount: number }[];
  total: number;
}

export interface CumulativeSpendingData {
  month: string;
  label: string;
  dailyData: { day: number; cumulative: number }[];
  totalSpending: number;
}

export interface YearOverYearData {
  month: number;
  monthLabel: string;
  years: { year: number; amount: number }[];
}

@Injectable({
  providedIn: 'root'
})
export class TrendsService {
  private readonly monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  constructor(private http: HttpClient) {}

  /**
   * Get all transactions and categories
   */
  private getData(): Observable<{ transactions: Transaction[]; categories: Category[] }> {
    return forkJoin({
      transactions: this.http.get<{ transactions: Transaction[] }>(`${environment.apiUrl}/transactions`)
        .pipe(map(res => res.transactions || [])),
      categories: this.http.get<{ categories: Category[] }>(`${environment.apiUrl}/categories`)
        .pipe(map(res => res.categories || []))
    });
  }

  /**
   * Get monthly cash flow data (income vs expenses)
   */
  getMonthlyData(startDate: Date, endDate: Date): Observable<MonthlyData[]> {
    return this.getData().pipe(
      map(({ transactions }) => {
        const filtered = this.filterByDateRange(transactions, startDate, endDate);
        return this.aggregateByMonth(filtered);
      })
    );
  }

  /**
   * Get category spending trends over time
   */
  getCategoryMonthlyData(startDate: Date, endDate: Date, topN?: number): Observable<CategoryMonthlyData[]> {
    return this.getData().pipe(
      map(({ transactions, categories }) => {
        const filtered = this.filterByDateRange(transactions, startDate, endDate)
          .filter(t => t.amount < 0); // Only expenses

        return this.aggregateByCategoryAndMonth(filtered, categories, startDate, endDate, topN);
      })
    );
  }

  /**
   * Get month-over-month comparison
   */
  getMonthComparison(currentMonth: Date): Observable<{ comparisons: MonthComparison[]; thisMonthLabel: string; lastMonthLabel: string }> {
    return this.getData().pipe(
      map(({ transactions, categories }) => {
        const thisMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const thisMonthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

        const lastMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
        const lastMonthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 0);

        const thisMonthTx = this.filterByDateRange(transactions, thisMonthStart, thisMonthEnd)
          .filter(t => t.amount < 0);
        const lastMonthTx = this.filterByDateRange(transactions, lastMonthStart, lastMonthEnd)
          .filter(t => t.amount < 0);

        const comparisons = this.calculateComparison(thisMonthTx, lastMonthTx, categories);

        return {
          comparisons,
          thisMonthLabel: this.formatMonthLabel(thisMonthStart),
          lastMonthLabel: this.formatMonthLabel(lastMonthStart)
        };
      })
    );
  }

  /**
   * Filter transactions by date range
   */
  private filterByDateRange(transactions: Transaction[], startDate: Date, endDate: Date): Transaction[] {
    return transactions.filter(t => {
      const date = new Date(t.date);
      return date >= startDate && date <= endDate;
    });
  }

  /**
   * Aggregate transactions by month for cash flow
   */
  private aggregateByMonth(transactions: Transaction[]): MonthlyData[] {
    const monthMap = new Map<string, { income: number; expenses: number }>();

    transactions.forEach(t => {
      const date = new Date(t.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      const existing = monthMap.get(monthKey) || { income: 0, expenses: 0 };
      if (t.amount > 0) {
        existing.income += t.amount;
      } else {
        existing.expenses += Math.abs(t.amount);
      }
      monthMap.set(monthKey, existing);
    });

    // Sort by month and convert to array
    return Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => ({
        month,
        label: this.formatMonthKey(month),
        income: Math.round(data.income * 100) / 100,
        expenses: Math.round(data.expenses * 100) / 100,
        net: Math.round((data.income - data.expenses) * 100) / 100
      }));
  }

  /**
   * Aggregate by category and month for trend lines
   */
  private aggregateByCategoryAndMonth(
    transactions: Transaction[],
    categories: Category[],
    startDate: Date,
    endDate: Date,
    topN?: number
  ): CategoryMonthlyData[] {
    // Get all months in range
    const months = this.getMonthsInRange(startDate, endDate);

    // Build category map with colors
    const categoryColorMap = new Map<string, string>();
    categories.forEach(c => {
      if (c.color) categoryColorMap.set(c.name, c.color);
    });

    // Aggregate by category
    const categoryMap = new Map<string, Map<string, number>>();
    const categoryTotals = new Map<string, number>();

    transactions.forEach(t => {
      const category = t.category || 'Uncategorized';
      const date = new Date(t.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const amount = Math.abs(t.amount);

      if (!categoryMap.has(category)) {
        categoryMap.set(category, new Map());
      }
      const monthData = categoryMap.get(category)!;
      monthData.set(monthKey, (monthData.get(monthKey) || 0) + amount);

      categoryTotals.set(category, (categoryTotals.get(category) || 0) + amount);
    });

    // Convert to array and sort by total
    let result: CategoryMonthlyData[] = Array.from(categoryMap.entries())
      .map(([category, monthData]) => ({
        category,
        color: categoryColorMap.get(category) || this.generateColor(category),
        total: categoryTotals.get(category) || 0,
        data: months.map(month => ({
          month,
          label: this.formatMonthKey(month),
          amount: Math.round((monthData.get(month) || 0) * 100) / 100
        }))
      }))
      .sort((a, b) => b.total - a.total);

    // Limit to top N if specified
    if (topN && topN > 0) {
      result = result.slice(0, topN);
    }

    return result;
  }

  /**
   * Calculate month-over-month comparison
   */
  private calculateComparison(
    thisMonthTx: Transaction[],
    lastMonthTx: Transaction[],
    categories: Category[]
  ): MonthComparison[] {
    const categoryColorMap = new Map<string, string>();
    categories.forEach(c => {
      if (c.color) categoryColorMap.set(c.name, c.color);
    });

    // Aggregate this month by category
    const thisMonthMap = new Map<string, number>();
    thisMonthTx.forEach(t => {
      const category = t.category || 'Uncategorized';
      thisMonthMap.set(category, (thisMonthMap.get(category) || 0) + Math.abs(t.amount));
    });

    // Aggregate last month by category
    const lastMonthMap = new Map<string, number>();
    lastMonthTx.forEach(t => {
      const category = t.category || 'Uncategorized';
      lastMonthMap.set(category, (lastMonthMap.get(category) || 0) + Math.abs(t.amount));
    });

    // Get all categories from both months
    const allCategories = new Set([...thisMonthMap.keys(), ...lastMonthMap.keys()]);

    // Build comparison
    const comparisons: MonthComparison[] = Array.from(allCategories).map(category => {
      const thisMonth = thisMonthMap.get(category) || 0;
      const lastMonth = lastMonthMap.get(category) || 0;
      const change = thisMonth - lastMonth;
      const percentChange = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;

      return {
        category,
        color: categoryColorMap.get(category) || this.generateColor(category),
        thisMonth: Math.round(thisMonth * 100) / 100,
        lastMonth: Math.round(lastMonth * 100) / 100,
        change: Math.round(change * 100) / 100,
        percentChange: percentChange !== null ? Math.round(percentChange * 10) / 10 : null
      };
    });

    // Sort by absolute change (largest changes first)
    return comparisons.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  }

  /**
   * Get all month keys in a date range
   */
  private getMonthsInRange(startDate: Date, endDate: Date): string[] {
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
  private formatMonthKey(monthKey: string): string {
    const [year, month] = monthKey.split('-');
    return `${this.monthNames[parseInt(month) - 1]} ${year}`;
  }

  /**
   * Format date to month label
   */
  private formatMonthLabel(date: Date): string {
    return `${this.monthNames[date.getMonth()]} ${date.getFullYear()}`;
  }

  /**
   * Generate a consistent color for a category name
   */
  private generateColor(name: string): string {
    const colors = [
      '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
      '#FF9F40', '#C9CBCF', '#7BC225', '#F87979', '#5D9CEC'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  // ============ NEW METHODS FOR REMAINING REPORTS ============

  /**
   * Get savings rate data per month
   */
  getSavingsRateData(startDate: Date, endDate: Date): Observable<SavingsRateData[]> {
    return this.getMonthlyData(startDate, endDate).pipe(
      map(monthlyData => monthlyData.map(m => ({
        month: m.month,
        label: m.label,
        income: m.income,
        expenses: m.expenses,
        savings: m.net,
        savingsRate: m.income > 0 ? (m.net / m.income) * 100 : 0
      })))
    );
  }

  /**
   * Get rolling average data for expenses
   */
  getRollingAverageData(startDate: Date, endDate: Date): Observable<RollingAverageData[]> {
    return this.getMonthlyData(startDate, endDate).pipe(
      map(monthlyData => {
        const result: RollingAverageData[] = [];

        for (let i = 0; i < monthlyData.length; i++) {
          const m = monthlyData[i];

          // Calculate 3-month rolling average
          let rollingAvg3: number | null = null;
          if (i >= 2) {
            const sum3 = monthlyData.slice(i - 2, i + 1).reduce((s, d) => s + d.expenses, 0);
            rollingAvg3 = Math.round((sum3 / 3) * 100) / 100;
          }

          // Calculate 6-month rolling average
          let rollingAvg6: number | null = null;
          if (i >= 5) {
            const sum6 = monthlyData.slice(i - 5, i + 1).reduce((s, d) => s + d.expenses, 0);
            rollingAvg6 = Math.round((sum6 / 6) * 100) / 100;
          }

          result.push({
            month: m.month,
            label: m.label,
            actual: m.expenses,
            rollingAvg3,
            rollingAvg6
          });
        }

        return result;
      })
    );
  }

  /**
   * Get heat map data for category spending by month
   */
  getHeatMapData(startDate: Date, endDate: Date, topN: number = 10): Observable<HeatMapData> {
    return this.getData().pipe(
      map(({ transactions, categories }) => {
        const filtered = this.filterByDateRange(transactions, startDate, endDate)
          .filter(t => t.amount < 0);

        const months = this.getMonthsInRange(startDate, endDate);
        const monthLabels = months.map(m => this.formatMonthKey(m));

        // Build category color map
        const categoryColorMap = new Map<string, string>();
        categories.forEach(c => {
          if (c.color) categoryColorMap.set(c.name, c.color);
        });

        // Aggregate by category and month
        const dataMap = new Map<string, Map<string, number>>();
        const categoryTotals = new Map<string, number>();

        filtered.forEach(t => {
          const category = t.category || 'Uncategorized';
          const date = new Date(t.date);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const amount = Math.abs(t.amount);

          if (!dataMap.has(category)) {
            dataMap.set(category, new Map());
          }
          const monthData = dataMap.get(category)!;
          monthData.set(monthKey, (monthData.get(monthKey) || 0) + amount);
          categoryTotals.set(category, (categoryTotals.get(category) || 0) + amount);
        });

        // Get top N categories by total
        const sortedCategories = Array.from(categoryTotals.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, topN)
          .map(([cat]) => cat);

        // Build heat map data
        const data: { category: string; month: string; amount: number; color: string }[] = [];
        let maxAmount = 0;

        sortedCategories.forEach(category => {
          const monthData = dataMap.get(category);
          const color = categoryColorMap.get(category) || this.generateColor(category);

          months.forEach(month => {
            const amount = Math.round((monthData?.get(month) || 0) * 100) / 100;
            maxAmount = Math.max(maxAmount, amount);
            data.push({ category, month, amount, color });
          });
        });

        return {
          categories: sortedCategories,
          months,
          monthLabels,
          data,
          maxAmount,
          categoryColors: categoryColorMap
        };
      })
    );
  }

  /**
   * Get anomaly data - months where spending is significantly different from average
   */
  getAnomalyData(startDate: Date, endDate: Date, threshold: number = 1.5): Observable<AnomalyData[]> {
    return this.getData().pipe(
      map(({ transactions, categories }) => {
        const filtered = this.filterByDateRange(transactions, startDate, endDate)
          .filter(t => t.amount < 0);

        const categoryColorMap = new Map<string, string>();
        categories.forEach(c => {
          if (c.color) categoryColorMap.set(c.name, c.color);
        });

        // Aggregate by category and month
        const categoryMonthMap = new Map<string, Map<string, number>>();

        filtered.forEach(t => {
          const category = t.category || 'Uncategorized';
          const date = new Date(t.date);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const amount = Math.abs(t.amount);

          if (!categoryMonthMap.has(category)) {
            categoryMonthMap.set(category, new Map());
          }
          const monthData = categoryMonthMap.get(category)!;
          monthData.set(monthKey, (monthData.get(monthKey) || 0) + amount);
        });

        // Calculate averages and find anomalies
        const anomalies: AnomalyData[] = [];

        categoryMonthMap.forEach((monthData, category) => {
          const amounts = Array.from(monthData.values());
          const average = amounts.reduce((s, a) => s + a, 0) / amounts.length;
          const color = categoryColorMap.get(category) || this.generateColor(category);

          monthData.forEach((amount, month) => {
            const deviation = average > 0 ? amount / average : 0;
            const isAnomaly = deviation >= threshold || (average > 0 && deviation <= 1 / threshold);

            anomalies.push({
              month,
              label: this.formatMonthKey(month),
              category,
              color,
              amount: Math.round(amount * 100) / 100,
              average: Math.round(average * 100) / 100,
              deviation: Math.round(deviation * 100) / 100,
              isAnomaly
            });
          });
        });

        // Sort by deviation (most anomalous first), then filter to only anomalies
        return anomalies
          .filter(a => a.isAnomaly)
          .sort((a, b) => Math.abs(b.deviation - 1) - Math.abs(a.deviation - 1));
      })
    );
  }

  /**
   * Get income sources breakdown
   */
  getIncomeSourcesData(startDate: Date, endDate: Date): Observable<IncomeSourceData[]> {
    return this.getData().pipe(
      map(({ transactions }) => {
        const filtered = this.filterByDateRange(transactions, startDate, endDate)
          .filter(t => t.amount > 0);

        const months = this.getMonthsInRange(startDate, endDate);

        // Group by category (as income source)
        const sourceMap = new Map<string, Map<string, number>>();
        const sourceTotals = new Map<string, number>();

        filtered.forEach(t => {
          const source = t.category || 'Other Income';
          const date = new Date(t.date);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

          if (!sourceMap.has(source)) {
            sourceMap.set(source, new Map());
          }
          const monthData = sourceMap.get(source)!;
          monthData.set(monthKey, (monthData.get(monthKey) || 0) + t.amount);
          sourceTotals.set(source, (sourceTotals.get(source) || 0) + t.amount);
        });

        // Convert to array and sort by total
        const incomeColors = ['#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800'];

        return Array.from(sourceMap.entries())
          .map(([source, monthData], index) => ({
            source,
            color: incomeColors[index % incomeColors.length],
            total: sourceTotals.get(source) || 0,
            data: months.map(month => ({
              month,
              label: this.formatMonthKey(month),
              amount: Math.round((monthData.get(month) || 0) * 100) / 100
            }))
          }))
          .sort((a, b) => b.total - a.total);
      })
    );
  }

  /**
   * Get cumulative spending data for comparing spending patterns within months
   */
  getCumulativeSpendingData(startDate: Date, endDate: Date): Observable<CumulativeSpendingData[]> {
    return this.getData().pipe(
      map(({ transactions }) => {
        const filtered = this.filterByDateRange(transactions, startDate, endDate)
          .filter(t => t.amount < 0);

        const months = this.getMonthsInRange(startDate, endDate);
        const result: CumulativeSpendingData[] = [];

        months.forEach(monthKey => {
          const [year, month] = monthKey.split('-').map(Number);
          const daysInMonth = new Date(year, month, 0).getDate();

          // Get transactions for this month
          const monthTransactions = filtered.filter(t => {
            const date = new Date(t.date);
            return date.getFullYear() === year && date.getMonth() === month - 1;
          });

          // Build daily cumulative data
          const dailyTotals = new Map<number, number>();
          monthTransactions.forEach(t => {
            const day = new Date(t.date).getDate();
            dailyTotals.set(day, (dailyTotals.get(day) || 0) + Math.abs(t.amount));
          });

          let cumulative = 0;
          const dailyData: { day: number; cumulative: number }[] = [];

          for (let day = 1; day <= daysInMonth; day++) {
            cumulative += dailyTotals.get(day) || 0;
            dailyData.push({
              day,
              cumulative: Math.round(cumulative * 100) / 100
            });
          }

          result.push({
            month: monthKey,
            label: this.formatMonthKey(monthKey),
            dailyData,
            totalSpending: Math.round(cumulative * 100) / 100
          });
        });

        return result;
      })
    );
  }

  /**
   * Get year-over-year comparison data
   */
  getYearOverYearData(startDate: Date, endDate: Date): Observable<YearOverYearData[]> {
    return this.getData().pipe(
      map(({ transactions }) => {
        const filtered = this.filterByDateRange(transactions, startDate, endDate)
          .filter(t => t.amount < 0);

        // Group by year and month
        const yearMonthMap = new Map<number, Map<number, number>>();
        const years = new Set<number>();

        filtered.forEach(t => {
          const date = new Date(t.date);
          const year = date.getFullYear();
          const month = date.getMonth();

          years.add(year);

          if (!yearMonthMap.has(year)) {
            yearMonthMap.set(year, new Map());
          }
          const monthData = yearMonthMap.get(year)!;
          monthData.set(month, (monthData.get(month) || 0) + Math.abs(t.amount));
        });

        // Build result for each month (0-11)
        const sortedYears = Array.from(years).sort();
        const result: YearOverYearData[] = [];

        for (let month = 0; month < 12; month++) {
          const yearData = sortedYears.map(year => ({
            year,
            amount: Math.round((yearMonthMap.get(year)?.get(month) || 0) * 100) / 100
          }));

          // Only include if at least one year has data
          if (yearData.some(y => y.amount > 0)) {
            result.push({
              month,
              monthLabel: this.monthNames[month],
              years: yearData
            });
          }
        }

        return result;
      })
    );
  }
}
