/**
 * Trends Service
 *
 * Facade service that provides a unified API for trend analysis.
 * Delegates to specialized services for specific functionality.
 *
 * For new code, consider using the specialized services directly:
 * - CashFlowService: Income vs expenses, savings rates, rolling averages
 * - CategoryTrendsService: Category spending trends, comparisons, heat maps
 * - AnomalyService: Anomaly detection, cumulative spending
 */

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

// Re-export types for backward compatibility
export { Transaction, Category } from './trends-data.service';
export { MonthlyData, SavingsRateData, RollingAverageData } from './cash-flow.service';
export { CategoryMonthlyData, MonthComparison, HeatMapData, IncomeSourceData, YearOverYearData } from './category-trends.service';
export { AnomalyData, CumulativeSpendingData } from './anomaly.service';

import { CashFlowService, MonthlyData, SavingsRateData, RollingAverageData } from './cash-flow.service';
import { CategoryTrendsService, CategoryMonthlyData, MonthComparison, HeatMapData, IncomeSourceData, YearOverYearData } from './category-trends.service';
import { AnomalyService, AnomalyData, CumulativeSpendingData } from './anomaly.service';

@Injectable({
  providedIn: 'root'
})
export class TrendsService {
  constructor(
    private cashFlowService: CashFlowService,
    private categoryTrendsService: CategoryTrendsService,
    private anomalyService: AnomalyService
  ) {}

  // ============ Cash Flow Methods ============

  /**
   * Get monthly cash flow data (income vs expenses)
   */
  getMonthlyData(startDate: Date, endDate: Date): Observable<MonthlyData[]> {
    return this.cashFlowService.getMonthlyData(startDate, endDate);
  }

  /**
   * Get savings rate data per month
   */
  getSavingsRateData(startDate: Date, endDate: Date): Observable<SavingsRateData[]> {
    return this.cashFlowService.getSavingsRateData(startDate, endDate);
  }

  /**
   * Get rolling average data for expenses
   */
  getRollingAverageData(startDate: Date, endDate: Date): Observable<RollingAverageData[]> {
    return this.cashFlowService.getRollingAverageData(startDate, endDate);
  }

  // ============ Category Trends Methods ============

  /**
   * Get category spending trends over time
   */
  getCategoryMonthlyData(startDate: Date, endDate: Date, topN?: number): Observable<CategoryMonthlyData[]> {
    return this.categoryTrendsService.getCategoryMonthlyData(startDate, endDate, topN);
  }

  /**
   * Get month-over-month comparison
   */
  getMonthComparison(currentMonth: Date): Observable<{ comparisons: MonthComparison[]; thisMonthLabel: string; lastMonthLabel: string }> {
    return this.categoryTrendsService.getMonthComparison(currentMonth);
  }

  /**
   * Get heat map data for category spending by month
   */
  getHeatMapData(startDate: Date, endDate: Date, topN: number = 10): Observable<HeatMapData> {
    return this.categoryTrendsService.getHeatMapData(startDate, endDate, topN);
  }

  /**
   * Get income sources breakdown
   */
  getIncomeSourcesData(startDate: Date, endDate: Date): Observable<IncomeSourceData[]> {
    return this.categoryTrendsService.getIncomeSourcesData(startDate, endDate);
  }

  /**
   * Get year-over-year comparison data
   */
  getYearOverYearData(startDate: Date, endDate: Date): Observable<YearOverYearData[]> {
    return this.categoryTrendsService.getYearOverYearData(startDate, endDate);
  }

  // ============ Anomaly Detection Methods ============

  /**
   * Get anomaly data - months where spending is significantly different from average
   */
  getAnomalyData(startDate: Date, endDate: Date, threshold: number = 1.5): Observable<AnomalyData[]> {
    return this.anomalyService.getAnomalyData(startDate, endDate, threshold);
  }

  /**
   * Get cumulative spending data for comparing spending patterns within months
   */
  getCumulativeSpendingData(startDate: Date, endDate: Date): Observable<CumulativeSpendingData[]> {
    return this.anomalyService.getCumulativeSpendingData(startDate, endDate);
  }
}
