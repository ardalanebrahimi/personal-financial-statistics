/**
 * Transaction Filter Service
 *
 * Handles filtering logic for transactions, extracted from TransactionsComponent.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Transaction } from '../../../core/models/transaction.model';

export interface TransactionFilters {
  search: string;
  startDate: Date | undefined;
  endDate: Date | undefined;
  category: string;
  type: string;
  source: string;
  amountMin: number | undefined;
  amountMax: number | undefined;
  beneficiary: string;
  hasMatch: '' | 'yes' | 'no';
  showContextOnly: '' | 'all' | 'only';
  platform: '' | 'amazon' | 'paypal' | 'amazon-unlinked' | 'paypal-unlinked';
}

@Injectable({
  providedIn: 'root'
})
export class TransactionFilterService {
  // Platform detection patterns
  private readonly AMAZON_PATTERNS = [
    /amazon/i, /amzn/i, /amazon\.de/i, /amazon\s+payments/i,
    /amazon\s+eu/i, /amz\*|amzn\*/i, /amazon\s+prime/i, /prime\s+video/i
  ];
  private readonly PAYPAL_PATTERNS = [
    /paypal/i, /pp\s*\*/i, /paypal\s*\(europe\)/i, /paypal\s*pte/i, /paypal\s*europe/i
  ];

  private _filters = new BehaviorSubject<TransactionFilters>(this.getDefaultFilters());
  filters$ = this._filters.asObservable();

  getDefaultFilters(): TransactionFilters {
    return {
      search: '',
      startDate: undefined,
      endDate: undefined,
      category: '',
      type: '',
      source: '',
      amountMin: undefined,
      amountMax: undefined,
      beneficiary: '',
      hasMatch: '',
      showContextOnly: '',
      platform: ''
    };
  }

  getFilters(): TransactionFilters {
    return this._filters.value;
  }

  setFilters(filters: Partial<TransactionFilters>): void {
    this._filters.next({ ...this._filters.value, ...filters });
  }

  resetFilters(): void {
    this._filters.next(this.getDefaultFilters());
  }

  /**
   * Apply all filters to a list of transactions.
   */
  applyFilters(transactions: Transaction[], filters: TransactionFilters): Transaction[] {
    let result = [...transactions];

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(t =>
        t.description?.toLowerCase().includes(searchLower) ||
        t.beneficiary?.toLowerCase().includes(searchLower) ||
        t.category?.toLowerCase().includes(searchLower)
      );
    }

    // Date filters
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      startDate.setHours(0, 0, 0, 0);
      result = result.filter(t => new Date(t.date) >= startDate);
    }

    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      result = result.filter(t => new Date(t.date) <= endDate);
    }

    // Category filter
    if (filters.category) {
      if (filters.category === '__uncategorized__') {
        result = result.filter(t => !t.category);
      } else {
        result = result.filter(t => t.category === filters.category);
      }
    }

    // Type filter (income/expense)
    if (filters.type === 'income') {
      result = result.filter(t => t.amount > 0);
    } else if (filters.type === 'expense') {
      result = result.filter(t => t.amount < 0);
    }

    // Source filter
    if (filters.source) {
      result = result.filter(t => t.source?.connectorType === filters.source);
    }

    // Amount filters
    if (filters.amountMin !== undefined) {
      result = result.filter(t => Math.abs(t.amount) >= filters.amountMin!);
    }

    if (filters.amountMax !== undefined) {
      result = result.filter(t => Math.abs(t.amount) <= filters.amountMax!);
    }

    // Beneficiary filter
    if (filters.beneficiary) {
      const beneficiaryLower = filters.beneficiary.toLowerCase();
      result = result.filter(t =>
        t.beneficiary?.toLowerCase().includes(beneficiaryLower)
      );
    }

    // Match filter
    if (filters.hasMatch === 'yes') {
      result = result.filter(t => t.matchInfo || (t.linkedOrderIds && t.linkedOrderIds.length > 0));
    } else if (filters.hasMatch === 'no') {
      result = result.filter(t => !t.matchInfo && (!t.linkedOrderIds || t.linkedOrderIds.length === 0));
    }

    // Context-only filter
    if (filters.showContextOnly === 'only') {
      result = result.filter(t => t.isContextOnly);
    } else if (filters.showContextOnly === 'all') {
      // Show all - no filter needed
    } else {
      // Default: hide context-only transactions
      result = result.filter(t => !t.isContextOnly);
    }

    // Platform filter
    if (filters.platform) {
      result = this.applyPlatformFilter(result, filters.platform);
    }

    return result;
  }

  /**
   * Apply platform-specific filter.
   */
  private applyPlatformFilter(
    transactions: Transaction[],
    platform: string
  ): Transaction[] {
    switch (platform) {
      case 'amazon':
        return transactions.filter(t =>
          this.isAmazonTransaction(t) || t.source?.connectorType === 'amazon'
        );

      case 'paypal':
        return transactions.filter(t =>
          this.isPayPalTransaction(t) || t.source?.connectorType === 'paypal'
        );

      case 'amazon-unlinked':
        return transactions.filter(t =>
          (this.isAmazonTransaction(t) || t.source?.connectorType === 'amazon') &&
          !t.isContextOnly &&
          (!t.linkedOrderIds || t.linkedOrderIds.length === 0)
        );

      case 'paypal-unlinked':
        return transactions.filter(t =>
          (this.isPayPalTransaction(t) || t.source?.connectorType === 'paypal') &&
          !t.isContextOnly &&
          (!t.linkedOrderIds || t.linkedOrderIds.length === 0)
        );

      default:
        return transactions;
    }
  }

  /**
   * Check if transaction is from Amazon.
   */
  isAmazonTransaction(transaction: Transaction): boolean {
    const searchText = `${transaction.description || ''} ${transaction.beneficiary || ''}`;
    return this.AMAZON_PATTERNS.some(p => p.test(searchText));
  }

  /**
   * Check if transaction is from PayPal.
   */
  isPayPalTransaction(transaction: Transaction): boolean {
    const searchText = `${transaction.description || ''} ${transaction.beneficiary || ''}`;
    return this.PAYPAL_PATTERNS.some(p => p.test(searchText));
  }

  /**
   * Check if any filters are active.
   */
  hasActiveFilters(filters: TransactionFilters): boolean {
    return !!(
      filters.search ||
      filters.startDate ||
      filters.endDate ||
      filters.category ||
      filters.type ||
      filters.source ||
      filters.amountMin !== undefined ||
      filters.amountMax !== undefined ||
      filters.beneficiary ||
      filters.hasMatch ||
      filters.showContextOnly ||
      filters.platform
    );
  }

  /**
   * Get count of active filters.
   */
  getActiveFilterCount(filters: TransactionFilters): number {
    let count = 0;
    if (filters.search) count++;
    if (filters.startDate || filters.endDate) count++;
    if (filters.category) count++;
    if (filters.type) count++;
    if (filters.source) count++;
    if (filters.amountMin !== undefined || filters.amountMax !== undefined) count++;
    if (filters.beneficiary) count++;
    if (filters.hasMatch) count++;
    if (filters.showContextOnly) count++;
    if (filters.platform) count++;
    return count;
  }
}
