/**
 * Anomaly Service
 *
 * Handles anomaly detection and cumulative spending analysis.
 */

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { TrendsDataService } from './trends-data.service';

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

export interface CumulativeSpendingData {
  month: string;
  label: string;
  dailyData: { day: number; cumulative: number }[];
  totalSpending: number;
}

@Injectable({
  providedIn: 'root'
})
export class AnomalyService {
  constructor(private dataService: TrendsDataService) {}

  /**
   * Get anomaly data - months where spending is significantly different from average
   */
  getAnomalyData(startDate: Date, endDate: Date, threshold: number = 1.5): Observable<AnomalyData[]> {
    return this.dataService.getData().pipe(
      map(({ transactions, categories }) => {
        const filtered = this.dataService.filterByDateRange(transactions, startDate, endDate)
          .filter(t => t.amount < 0);

        const categoryColorMap = this.dataService.buildCategoryColorMap(categories);

        // Aggregate by category and month
        const categoryMonthMap = new Map<string, Map<string, number>>();

        filtered.forEach(t => {
          const category = t.category || 'Uncategorized';
          const monthKey = this.dataService.dateToMonthKey(new Date(t.date));
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
          const color = this.dataService.getCategoryColor(category, categoryColorMap);

          monthData.forEach((amount, month) => {
            const deviation = average > 0 ? amount / average : 0;
            const isAnomaly = deviation >= threshold || (average > 0 && deviation <= 1 / threshold);

            anomalies.push({
              month,
              label: this.dataService.formatMonthKey(month),
              category,
              color,
              amount: this.dataService.round(amount),
              average: this.dataService.round(average),
              deviation: this.dataService.round(deviation),
              isAnomaly
            });
          });
        });

        // Sort by deviation (most anomalous first), filter to only anomalies
        return anomalies
          .filter(a => a.isAnomaly)
          .sort((a, b) => Math.abs(b.deviation - 1) - Math.abs(a.deviation - 1));
      })
    );
  }

  /**
   * Get cumulative spending data for comparing spending patterns within months
   */
  getCumulativeSpendingData(startDate: Date, endDate: Date): Observable<CumulativeSpendingData[]> {
    return this.dataService.getData().pipe(
      map(({ transactions }) => {
        const filtered = this.dataService.filterByDateRange(transactions, startDate, endDate)
          .filter(t => t.amount < 0);

        const months = this.dataService.getMonthsInRange(startDate, endDate);
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
              cumulative: this.dataService.round(cumulative)
            });
          }

          result.push({
            month: monthKey,
            label: this.dataService.formatMonthKey(monthKey),
            dailyData,
            totalSpending: this.dataService.round(cumulative)
          });
        });

        return result;
      })
    );
  }
}
