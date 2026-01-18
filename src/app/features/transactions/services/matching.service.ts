/**
 * Matching Service
 *
 * Handles API calls and data management for transaction matching.
 */

import { Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';

export interface MatchingSuggestion {
  bankTransactionId: string;
  contextIds: string[];
  confidence: 'high' | 'medium' | 'low';
  totalAmount: number;
  amountDiff: number;
}

export interface TransactionData {
  id: string;
  date: string;
  description: string;
  amount: number;
  beneficiary?: string;
  category?: string;
  source?: {
    connectorType: string;
  };
  isContextOnly?: boolean;
  linkedOrderIds?: string[];
}

export interface PlatformStats {
  totalBankCharges: number;
  linkedBankCharges: number;
  unlinkedBankCharges: number;
  totalOrders?: number;
  unlinkedOrders?: number;
  totalImports?: number;
  unlinkedImports?: number;
  suggestionCount: number;
}

export interface PlatformData {
  bankUnlinked: TransactionData[];
  ordersUnlinked?: TransactionData[];
  importsUnlinked?: TransactionData[];
  bankLinked: TransactionData[];
  suggestions: MatchingSuggestion[];
  stats: PlatformStats;
}

export interface MatchingOverviewData {
  amazon: PlatformData;
  paypal: PlatformData;
}

export type PlatformType = 'amazon' | 'paypal';

@Injectable({
  providedIn: 'root'
})
export class MatchingService {
  private cachedData: MatchingOverviewData | null = null;

  /**
   * Load matching overview data from API.
   */
  async loadOverviewData(): Promise<MatchingOverviewData | null> {
    try {
      const response = await fetch(`${environment.apiUrl}/matching/overview`);
      if (!response.ok) throw new Error('Failed to load');
      this.cachedData = await response.json();
      return this.cachedData;
    } catch (error) {
      console.error('Error loading matching data:', error);
      return null;
    }
  }

  /**
   * Get platform data.
   */
  getPlatformData(data: MatchingOverviewData | null, platform: PlatformType): PlatformData | null {
    if (!data) return null;
    return data[platform] || null;
  }

  /**
   * Get stats for platform.
   */
  getStats(data: MatchingOverviewData | null, platform: PlatformType): PlatformStats {
    const defaultStats: PlatformStats = {
      totalBankCharges: 0,
      linkedBankCharges: 0,
      unlinkedBankCharges: 0,
      suggestionCount: 0
    };
    if (!data) return defaultStats;
    return data[platform]?.stats || defaultStats;
  }

  /**
   * Get suggestions for platform.
   */
  getSuggestions(data: MatchingOverviewData | null, platform: PlatformType): MatchingSuggestion[] {
    if (!data) return [];
    return data[platform]?.suggestions || [];
  }

  /**
   * Get unlinked bank transactions for platform.
   */
  getBankUnlinked(data: MatchingOverviewData | null, platform: PlatformType): TransactionData[] {
    if (!data) return [];
    return data[platform]?.bankUnlinked || [];
  }

  /**
   * Get unlinked context transactions (orders/imports) for platform.
   */
  getContextUnlinked(data: MatchingOverviewData | null, platform: PlatformType): TransactionData[] {
    if (!data) return [];
    if (platform === 'amazon') {
      return data.amazon?.ordersUnlinked || [];
    }
    return data.paypal?.importsUnlinked || [];
  }

  /**
   * Check if a bank transaction has a suggestion.
   */
  hasSuggestionFor(data: MatchingOverviewData | null, platform: PlatformType, bankTxId: string): boolean {
    return this.getSuggestions(data, platform).some(s => s.bankTransactionId === bankTxId);
  }

  /**
   * Get suggestion for a bank transaction.
   */
  getSuggestionFor(data: MatchingOverviewData | null, platform: PlatformType, bankTxId: string): MatchingSuggestion | undefined {
    return this.getSuggestions(data, platform).find(s => s.bankTransactionId === bankTxId);
  }

  /**
   * Link transactions.
   */
  async linkTransactions(
    platform: PlatformType,
    bankTransactionId: string,
    contextIds: string[]
  ): Promise<{ success: boolean; error?: string }> {
    const endpoint = platform === 'amazon'
      ? '/order-matching/link'
      : '/paypal-matching/link';

    const body = platform === 'amazon'
      ? { bankTransactionId, orderIds: contextIds }
      : { bankTransactionId, paypalIds: contextIds };

    try {
      const response = await fetch(`${environment.apiUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        return { success: false, error: 'Link failed' };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Auto-match all high-confidence suggestions.
   */
  async autoMatchAll(
    data: MatchingOverviewData | null,
    platform: PlatformType
  ): Promise<{ successCount: number; errorCount: number }> {
    const suggestions = this.getSuggestions(data, platform).filter(s => s.confidence === 'high');

    let successCount = 0;
    let errorCount = 0;

    for (const suggestion of suggestions) {
      const result = await this.linkTransactions(
        platform,
        suggestion.bankTransactionId,
        suggestion.contextIds
      );

      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    return { successCount, errorCount };
  }

  /**
   * Get platform that should be selected by default.
   */
  getDefaultPlatform(data: MatchingOverviewData | null): PlatformType {
    if (!data) return 'amazon';
    const amazonUnlinked = data.amazon?.stats?.unlinkedBankCharges || 0;
    const paypalUnlinked = data.paypal?.stats?.unlinkedBankCharges || 0;
    return amazonUnlinked >= paypalUnlinked ? 'amazon' : 'paypal';
  }

  /**
   * Calculate if amounts match (within threshold).
   */
  isAmountMatch(bankAmount: number, selectedAmount: number): boolean {
    return Math.abs(Math.abs(bankAmount) - Math.abs(selectedAmount)) < 0.05;
  }

  /**
   * Calculate if amounts are close match.
   */
  isCloseMatch(bankAmount: number, selectedAmount: number): boolean {
    const diff = Math.abs(Math.abs(bankAmount) - Math.abs(selectedAmount));
    return diff >= 0.05 && diff < 5.0;
  }

  /**
   * Get high-confidence suggestion count.
   */
  getHighConfidenceSuggestionCount(data: MatchingOverviewData | null, platform: PlatformType): number {
    return this.getSuggestions(data, platform).filter(s => s.confidence === 'high').length;
  }
}
