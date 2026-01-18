/**
 * Cash Flow Service
 *
 * Handles cash flow analysis: income vs expenses, savings rates, rolling averages.
 */

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { TrendsDataService, Transaction } from './trends-data.service';

export interface MonthlyData {
  month: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
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

@Injectable({
  providedIn: 'root'
})
export class CashFlowService {
  constructor(private dataService: TrendsDataService) {}

  /**
   * Get monthly cash flow data (income vs expenses)
   */
  getMonthlyData(startDate: Date, endDate: Date): Observable<MonthlyData[]> {
    return this.dataService.getData().pipe(
      map(({ transactions }) => {
        const filtered = this.dataService.filterByDateRange(transactions, startDate, endDate);
        return this.aggregateByMonth(filtered);
      })
    );
  }

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
            rollingAvg3 = this.dataService.round(sum3 / 3);
          }

          // Calculate 6-month rolling average
          let rollingAvg6: number | null = null;
          if (i >= 5) {
            const sum6 = monthlyData.slice(i - 5, i + 1).reduce((s, d) => s + d.expenses, 0);
            rollingAvg6 = this.dataService.round(sum6 / 6);
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
   * Aggregate transactions by month for cash flow
   */
  private aggregateByMonth(transactions: Transaction[]): MonthlyData[] {
    const monthMap = new Map<string, { income: number; expenses: number }>();

    transactions.forEach(t => {
      const monthKey = this.dataService.dateToMonthKey(new Date(t.date));
      const existing = monthMap.get(monthKey) || { income: 0, expenses: 0 };

      if (t.amount > 0) {
        existing.income += t.amount;
      } else {
        existing.expenses += Math.abs(t.amount);
      }
      monthMap.set(monthKey, existing);
    });

    return Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => ({
        month,
        label: this.dataService.formatMonthKey(month),
        income: this.dataService.round(data.income),
        expenses: this.dataService.round(data.expenses),
        net: this.dataService.round(data.income - data.expenses)
      }));
  }
}
