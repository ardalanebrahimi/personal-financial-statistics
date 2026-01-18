/**
 * Category Trends Service
 *
 * Handles category-based trend analysis: spending by category, comparisons, heat maps.
 */

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { TrendsDataService, Transaction, Category } from './trends-data.service';

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

export interface HeatMapData {
  categories: string[];
  months: string[];
  monthLabels: string[];
  data: { category: string; month: string; amount: number; color: string }[];
  maxAmount: number;
  categoryColors: Map<string, string>;
}

export interface IncomeSourceData {
  source: string;
  color: string;
  data: { month: string; label: string; amount: number }[];
  total: number;
}

export interface YearOverYearData {
  month: number;
  monthLabel: string;
  years: { year: number; amount: number }[];
}

@Injectable({
  providedIn: 'root'
})
export class CategoryTrendsService {
  private readonly incomeColors = ['#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800'];

  constructor(private dataService: TrendsDataService) {}

  /**
   * Get category spending trends over time
   */
  getCategoryMonthlyData(startDate: Date, endDate: Date, topN?: number): Observable<CategoryMonthlyData[]> {
    return this.dataService.getData().pipe(
      map(({ transactions, categories }) => {
        const filtered = this.dataService.filterByDateRange(transactions, startDate, endDate)
          .filter(t => t.amount < 0);
        return this.aggregateByCategoryAndMonth(filtered, categories, startDate, endDate, topN);
      })
    );
  }

  /**
   * Get month-over-month comparison
   */
  getMonthComparison(currentMonth: Date): Observable<{ comparisons: MonthComparison[]; thisMonthLabel: string; lastMonthLabel: string }> {
    return this.dataService.getData().pipe(
      map(({ transactions, categories }) => {
        const thisMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const thisMonthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
        const lastMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
        const lastMonthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 0);

        const thisMonthTx = this.dataService.filterByDateRange(transactions, thisMonthStart, thisMonthEnd)
          .filter(t => t.amount < 0);
        const lastMonthTx = this.dataService.filterByDateRange(transactions, lastMonthStart, lastMonthEnd)
          .filter(t => t.amount < 0);

        const comparisons = this.calculateComparison(thisMonthTx, lastMonthTx, categories);

        return {
          comparisons,
          thisMonthLabel: this.dataService.formatMonthLabel(thisMonthStart),
          lastMonthLabel: this.dataService.formatMonthLabel(lastMonthStart)
        };
      })
    );
  }

  /**
   * Get heat map data for category spending by month
   */
  getHeatMapData(startDate: Date, endDate: Date, topN: number = 10): Observable<HeatMapData> {
    return this.dataService.getData().pipe(
      map(({ transactions, categories }) => {
        const filtered = this.dataService.filterByDateRange(transactions, startDate, endDate)
          .filter(t => t.amount < 0);

        const months = this.dataService.getMonthsInRange(startDate, endDate);
        const monthLabels = months.map(m => this.dataService.formatMonthKey(m));
        const categoryColorMap = this.dataService.buildCategoryColorMap(categories);

        // Aggregate by category and month
        const dataMap = new Map<string, Map<string, number>>();
        const categoryTotals = new Map<string, number>();

        filtered.forEach(t => {
          const category = t.category || 'Uncategorized';
          const monthKey = this.dataService.dateToMonthKey(new Date(t.date));
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
          const color = this.dataService.getCategoryColor(category, categoryColorMap);

          months.forEach(month => {
            const amount = this.dataService.round(monthData?.get(month) || 0);
            maxAmount = Math.max(maxAmount, amount);
            data.push({ category, month, amount, color });
          });
        });

        return { categories: sortedCategories, months, monthLabels, data, maxAmount, categoryColors: categoryColorMap };
      })
    );
  }

  /**
   * Get income sources breakdown
   */
  getIncomeSourcesData(startDate: Date, endDate: Date): Observable<IncomeSourceData[]> {
    return this.dataService.getData().pipe(
      map(({ transactions }) => {
        const filtered = this.dataService.filterByDateRange(transactions, startDate, endDate)
          .filter(t => t.amount > 0);

        const months = this.dataService.getMonthsInRange(startDate, endDate);
        const sourceMap = new Map<string, Map<string, number>>();
        const sourceTotals = new Map<string, number>();

        filtered.forEach(t => {
          const source = t.category || 'Other Income';
          const monthKey = this.dataService.dateToMonthKey(new Date(t.date));

          if (!sourceMap.has(source)) {
            sourceMap.set(source, new Map());
          }
          const monthData = sourceMap.get(source)!;
          monthData.set(monthKey, (monthData.get(monthKey) || 0) + t.amount);
          sourceTotals.set(source, (sourceTotals.get(source) || 0) + t.amount);
        });

        return Array.from(sourceMap.entries())
          .map(([source, monthData], index) => ({
            source,
            color: this.incomeColors[index % this.incomeColors.length],
            total: sourceTotals.get(source) || 0,
            data: months.map(month => ({
              month,
              label: this.dataService.formatMonthKey(month),
              amount: this.dataService.round(monthData.get(month) || 0)
            }))
          }))
          .sort((a, b) => b.total - a.total);
      })
    );
  }

  /**
   * Get year-over-year comparison data
   */
  getYearOverYearData(startDate: Date, endDate: Date): Observable<YearOverYearData[]> {
    return this.dataService.getData().pipe(
      map(({ transactions }) => {
        const filtered = this.dataService.filterByDateRange(transactions, startDate, endDate)
          .filter(t => t.amount < 0);

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

        const sortedYears = Array.from(years).sort();
        const result: YearOverYearData[] = [];

        for (let month = 0; month < 12; month++) {
          const yearData = sortedYears.map(year => ({
            year,
            amount: this.dataService.round(yearMonthMap.get(year)?.get(month) || 0)
          }));

          if (yearData.some(y => y.amount > 0)) {
            result.push({
              month,
              monthLabel: this.dataService.monthNames[month],
              years: yearData
            });
          }
        }

        return result;
      })
    );
  }

  private aggregateByCategoryAndMonth(
    transactions: Transaction[],
    categories: Category[],
    startDate: Date,
    endDate: Date,
    topN?: number
  ): CategoryMonthlyData[] {
    const months = this.dataService.getMonthsInRange(startDate, endDate);
    const categoryColorMap = this.dataService.buildCategoryColorMap(categories);

    const categoryMap = new Map<string, Map<string, number>>();
    const categoryTotals = new Map<string, number>();

    transactions.forEach(t => {
      const category = t.category || 'Uncategorized';
      const monthKey = this.dataService.dateToMonthKey(new Date(t.date));
      const amount = Math.abs(t.amount);

      if (!categoryMap.has(category)) {
        categoryMap.set(category, new Map());
      }
      const monthData = categoryMap.get(category)!;
      monthData.set(monthKey, (monthData.get(monthKey) || 0) + amount);
      categoryTotals.set(category, (categoryTotals.get(category) || 0) + amount);
    });

    let result: CategoryMonthlyData[] = Array.from(categoryMap.entries())
      .map(([category, monthData]) => ({
        category,
        color: this.dataService.getCategoryColor(category, categoryColorMap),
        total: categoryTotals.get(category) || 0,
        data: months.map(month => ({
          month,
          label: this.dataService.formatMonthKey(month),
          amount: this.dataService.round(monthData.get(month) || 0)
        }))
      }))
      .sort((a, b) => b.total - a.total);

    if (topN && topN > 0) {
      result = result.slice(0, topN);
    }

    return result;
  }

  private calculateComparison(
    thisMonthTx: Transaction[],
    lastMonthTx: Transaction[],
    categories: Category[]
  ): MonthComparison[] {
    const categoryColorMap = this.dataService.buildCategoryColorMap(categories);

    const thisMonthMap = new Map<string, number>();
    thisMonthTx.forEach(t => {
      const category = t.category || 'Uncategorized';
      thisMonthMap.set(category, (thisMonthMap.get(category) || 0) + Math.abs(t.amount));
    });

    const lastMonthMap = new Map<string, number>();
    lastMonthTx.forEach(t => {
      const category = t.category || 'Uncategorized';
      lastMonthMap.set(category, (lastMonthMap.get(category) || 0) + Math.abs(t.amount));
    });

    const allCategories = new Set([...thisMonthMap.keys(), ...lastMonthMap.keys()]);

    const comparisons: MonthComparison[] = Array.from(allCategories).map(category => {
      const thisMonth = thisMonthMap.get(category) || 0;
      const lastMonth = lastMonthMap.get(category) || 0;
      const change = thisMonth - lastMonth;
      const percentChange = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;

      return {
        category,
        color: this.dataService.getCategoryColor(category, categoryColorMap),
        thisMonth: this.dataService.round(thisMonth),
        lastMonth: this.dataService.round(lastMonth),
        change: this.dataService.round(change),
        percentChange: percentChange !== null ? Math.round(percentChange * 10) / 10 : null
      };
    });

    return comparisons.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  }
}
