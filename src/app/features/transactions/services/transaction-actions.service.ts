/**
 * Transaction Actions Service
 *
 * Handles transaction operations like categorization, matching, and maintenance.
 */

import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TransactionService } from '../../../services/transaction.service';
import { CategoryService } from '../../../services/category.service';
import { CategorizationService } from '../../../services/categorization.service';
import { Transaction } from '../../../core/models/transaction.model';

export interface MatchingResult {
  totalMatches: number;
  totalSuggestions: number;
}

export interface DuplicatesFindResult {
  groups: any[];
  totalDuplicates: number;
  totalGroups: number;
}

@Injectable({
  providedIn: 'root'
})
export class TransactionActionsService {
  constructor(
    private transactionService: TransactionService,
    private categoryService: CategoryService,
    private categorizationService: CategorizationService,
    private snackBar: MatSnackBar
  ) {}

  /**
   * Run all matching algorithms.
   */
  async runMatching(): Promise<MatchingResult> {
    const [matchingResponse, orderMatchingResponse, paypalMatchingResponse] = await Promise.all([
      fetch('http://localhost:3000/matching/run', { method: 'POST' }),
      fetch('http://localhost:3000/order-matching/run', { method: 'POST' }),
      fetch('http://localhost:3000/paypal-matching/run', { method: 'POST' })
    ]);

    const matchingResult = await matchingResponse.json();
    const orderMatchingResult = await orderMatchingResponse.json();
    const paypalMatchingResult = await paypalMatchingResponse.json();

    const totalMatches = (matchingResult.newMatches || 0) +
      (orderMatchingResult.autoMatched || 0) +
      (paypalMatchingResult.autoMatched || 0);
    const totalSuggestions = (matchingResult.suggestions || 0) +
      (orderMatchingResult.suggestions || 0) +
      (paypalMatchingResult.suggestions || 0);

    return { totalMatches, totalSuggestions };
  }

  /**
   * Start categorization job for transactions.
   */
  async startCategorization(
    transactions: Transaction[],
    includeAlreadyCategorized = false
  ): Promise<any> {
    const transactionIds = transactions.map(t => t.id);
    return this.categorizationService.startCategorization({
      transactionIds,
      includeAlreadyCategorized
    });
  }

  /**
   * Cleanup generic categories.
   */
  async cleanupCategories(): Promise<{ categoriesRemoved: string[]; transactionsReset: number }> {
    const response = await fetch('http://localhost:3000/categories/cleanup', { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      await this.categoryService.loadCategories();
      await this.transactionService.loadTransactions();
    }

    return {
      categoriesRemoved: result.categoriesRemoved || [],
      transactionsReset: result.transactionsReset || 0
    };
  }

  /**
   * Find duplicate transactions.
   */
  async findDuplicates(): Promise<DuplicatesFindResult> {
    const response = await fetch('http://localhost:3000/transactions/find-duplicates', { method: 'POST' });
    const result = await response.json();
    return {
      groups: result.groups || [],
      totalDuplicates: result.totalDuplicates || 0,
      totalGroups: result.totalGroups || 0
    };
  }

  /**
   * Auto-remove duplicate transactions.
   */
  async removeDuplicatesAuto(): Promise<{ success: boolean; removedCount: number }> {
    const response = await fetch('http://localhost:3000/transactions/remove-duplicates-auto', { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      await this.transactionService.loadTransactions();
    }

    return {
      success: result.success || false,
      removedCount: result.removedCount || 0
    };
  }

  /**
   * Export transactions to CSV.
   */
  exportToCSV(transactions: Transaction[]): void {
    const csv = this.transactionService.exportToCSV(transactions);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  }
}
