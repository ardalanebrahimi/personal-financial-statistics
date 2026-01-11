import { Injectable } from '@angular/core';
import { TransactionService } from './transaction.service';
import { ChartData } from 'chart.js';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ChartService {
  constructor(private transactionService: TransactionService) {}

  async getChartData(): Promise<ChartData<'pie' | 'bar'>> {
    try {
      const transactions = await firstValueFrom(this.transactionService.transactions$);
      const categoryTotals = new Map<string, number>();

      // Only include expenses (negative amounts)
      transactions?.filter(t => t.amount < 0).forEach(t => {
        const category = t.category || 'Uncategorized';
        // Use absolute value for better visualization
        categoryTotals.set(category, (categoryTotals.get(category) || 0) + Math.abs(t.amount));
      });

      return {
        labels: Array.from(categoryTotals.keys()),
        datasets: [{
          data: Array.from(categoryTotals.values()),
          backgroundColor: [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'
          ]
        }]
      };
    } catch (error) {
      console.error('Failed to load chart data:', error);
      return {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: []
        }]
      };
    }
  }
}
