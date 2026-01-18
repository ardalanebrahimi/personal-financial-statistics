/**
 * PayPal Transaction Matcher
 *
 * Links PayPal transactions (imported from text export) to bank transactions.
 * This allows AI categorization to use detailed PayPal merchant info when
 * categorizing generic bank transactions like "PayPal".
 *
 * Match Patterns:
 * - 1:1 - Single PayPal transaction matches single bank transaction (exact amount)
 * - Many:1 - Multiple PayPal transactions combined into one bank charge (rare for PayPal)
 */

import { MatchableTransaction, OrderMatchResult, OrderMatchSuggestion, OrderMatchConfidence, OrderMatchType } from './order-matcher';

export interface PayPalMatchingResult {
  autoMatches: OrderMatchResult[];
  suggestions: OrderMatchSuggestion[];
  stats: {
    bankTransactionsProcessed: number;
    paypalTransactionsProcessed: number;
    autoMatched: number;
    suggestionsGenerated: number;
    unmatchedBankTransactions: number;
    unmatchedPayPalTransactions: number;
  };
}

// Configuration for matching
const MATCH_CONFIG = {
  // Maximum days between PayPal date and bank charge
  maxDateDifferenceInDays: 3,
  // Amount tolerance for exact match (in currency units)
  exactMatchTolerance: 0.05,
  // Amount tolerance for sum matching (% of total)
  sumMatchTolerancePercent: 0.02,
  // Patterns to identify PayPal bank transactions
  paypalBankPatterns: [
    /paypal/i,
    /pp\s*\*/i,
    /paypal\s*\(europe\)/i,
    /paypal\s*pte/i
  ]
};

/**
 * PayPal Matcher class
 * Links PayPal transactions to bank transactions for better AI categorization
 */
export class PayPalMatcher {
  private bankTransactions: MatchableTransaction[] = [];
  private paypalTransactions: MatchableTransaction[] = [];

  constructor(transactions: MatchableTransaction[]) {
    // Separate bank transactions from PayPal transactions (context-only)
    this.bankTransactions = transactions.filter(
      tx => !tx.isContextOnly && this.isPayPalBankTransaction(tx)
    );
    this.paypalTransactions = transactions.filter(
      tx => tx.isContextOnly && tx.source?.connectorType === 'paypal'
    );
  }

  /**
   * Check if a transaction looks like a PayPal bank charge
   */
  private isPayPalBankTransaction(tx: MatchableTransaction): boolean {
    return MATCH_CONFIG.paypalBankPatterns.some(pattern =>
      pattern.test(tx.description) || pattern.test(tx.beneficiary || '')
    );
  }

  /**
   * Run the PayPal matching algorithm
   */
  runMatching(): PayPalMatchingResult {
    const result: PayPalMatchingResult = {
      autoMatches: [],
      suggestions: [],
      stats: {
        bankTransactionsProcessed: this.bankTransactions.length,
        paypalTransactionsProcessed: this.paypalTransactions.length,
        autoMatched: 0,
        suggestionsGenerated: 0,
        unmatchedBankTransactions: 0,
        unmatchedPayPalTransactions: 0
      }
    };

    // Skip if no transactions to match
    if (this.bankTransactions.length === 0 || this.paypalTransactions.length === 0) {
      result.stats.unmatchedBankTransactions = this.bankTransactions.length;
      result.stats.unmatchedPayPalTransactions = this.paypalTransactions.length;
      return result;
    }

    // Track which transactions have been matched
    const matchedPayPalIds = new Set<string>();
    const matchedBankIds = new Set<string>();

    // Sort transactions by date (newest first)
    const sortedBankTx = [...this.bankTransactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const sortedPayPalTx = [...this.paypalTransactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Pass 1: Find exact 1:1 matches (highest confidence)
    for (const bankTx of sortedBankTx) {
      if (matchedBankIds.has(bankTx.id)) continue;
      if (bankTx.linkedOrderIds && bankTx.linkedOrderIds.length > 0) continue;

      const bankDate = new Date(bankTx.date);
      const bankAmount = Math.abs(bankTx.amount);

      // Find PayPal transactions within date range
      const candidatePayPal = sortedPayPalTx.filter(pp => {
        if (matchedPayPalIds.has(pp.id)) return false;

        const ppDate = new Date(pp.date);
        const daysDiff = Math.abs(
          (bankDate.getTime() - ppDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        return daysDiff <= MATCH_CONFIG.maxDateDifferenceInDays;
      });

      // Look for exact amount match
      const exactMatch = candidatePayPal.find(pp => {
        const ppAmount = Math.abs(pp.amount);
        return Math.abs(ppAmount - bankAmount) <= MATCH_CONFIG.exactMatchTolerance;
      });

      if (exactMatch) {
        const ppDate = new Date(exactMatch.date);
        const daysDiff = Math.abs(
          (bankDate.getTime() - ppDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        const match: OrderMatchResult = {
          bankTransactionId: bankTx.id,
          matchedOrderIds: [exactMatch.id],
          matchType: '1:1',
          confidence: daysDiff <= 1 ? 'high' : 'medium',
          totalOrderAmount: Math.abs(exactMatch.amount),
          bankAmount: bankAmount,
          amountDifference: Math.abs(Math.abs(exactMatch.amount) - bankAmount),
          dateDifferenceInDays: daysDiff
        };

        result.autoMatches.push(match);
        matchedPayPalIds.add(exactMatch.id);
        matchedBankIds.add(bankTx.id);
      }
    }

    // Pass 2: Find many:1 matches (multiple PayPal → one bank charge)
    // This is less common for PayPal but can happen
    for (const bankTx of sortedBankTx) {
      if (matchedBankIds.has(bankTx.id)) continue;
      if (bankTx.linkedOrderIds && bankTx.linkedOrderIds.length > 0) continue;

      const bankDate = new Date(bankTx.date);
      const bankAmount = Math.abs(bankTx.amount);

      // Find unmatched PayPal transactions within date range
      const candidatePayPal = sortedPayPalTx.filter(pp => {
        if (matchedPayPalIds.has(pp.id)) return false;

        const ppDate = new Date(pp.date);
        const daysDiff = Math.abs(
          (bankDate.getTime() - ppDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        return daysDiff <= MATCH_CONFIG.maxDateDifferenceInDays;
      });

      if (candidatePayPal.length < 2) continue;

      // Try to find combination that sums to bank amount
      const combination = this.findCombination(candidatePayPal, bankAmount);

      if (combination.transactions.length > 0) {
        const totalAmount = combination.total;
        const amountDiff = Math.abs(totalAmount - bankAmount);
        const toleranceAmount = bankAmount * MATCH_CONFIG.sumMatchTolerancePercent;

        if (amountDiff <= toleranceAmount || amountDiff <= 1.00) {
          const maxDaysDiff = Math.max(
            ...combination.transactions.map(pp => {
              const ppDate = new Date(pp.date);
              return Math.abs(
                (bankDate.getTime() - ppDate.getTime()) / (1000 * 60 * 60 * 24)
              );
            })
          );

          const match: OrderMatchResult = {
            bankTransactionId: bankTx.id,
            matchedOrderIds: combination.transactions.map(pp => pp.id),
            matchType: 'many:1',
            confidence: amountDiff <= MATCH_CONFIG.exactMatchTolerance ? 'high' : 'medium',
            totalOrderAmount: totalAmount,
            bankAmount: bankAmount,
            amountDifference: amountDiff,
            dateDifferenceInDays: maxDaysDiff
          };

          result.autoMatches.push(match);
          combination.transactions.forEach(pp => matchedPayPalIds.add(pp.id));
          matchedBankIds.add(bankTx.id);
        } else {
          // Close but not exact - suggest for review
          const suggestion: OrderMatchSuggestion = {
            bankTransactionId: bankTx.id,
            suggestedOrderIds: combination.transactions.map(pp => pp.id),
            matchType: 'many:1',
            confidence: 'low',
            score: Math.max(0, 100 - (amountDiff / bankAmount) * 100),
            reason: `${combination.transactions.length} PayPal transactions totaling €${totalAmount.toFixed(2)} (bank: €${bankAmount.toFixed(2)}, diff: €${amountDiff.toFixed(2)})`,
            totalOrderAmount: totalAmount,
            bankAmount: bankAmount
          };
          result.suggestions.push(suggestion);
        }
      }
    }

    // Pass 3: Generate suggestions for remaining unmatched bank transactions
    for (const bankTx of sortedBankTx) {
      if (matchedBankIds.has(bankTx.id)) continue;
      if (bankTx.linkedOrderIds && bankTx.linkedOrderIds.length > 0) continue;

      const bankDate = new Date(bankTx.date);
      const bankAmount = Math.abs(bankTx.amount);

      // Find any PayPal transactions within extended date range
      const candidatePayPal = sortedPayPalTx.filter(pp => {
        if (matchedPayPalIds.has(pp.id)) return false;

        const ppDate = new Date(pp.date);
        const daysDiff = Math.abs(
          (bankDate.getTime() - ppDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        return daysDiff <= MATCH_CONFIG.maxDateDifferenceInDays * 2;
      });

      if (candidatePayPal.length > 0) {
        const totalAmount = candidatePayPal.reduce(
          (sum, pp) => sum + Math.abs(pp.amount), 0
        );

        const suggestion: OrderMatchSuggestion = {
          bankTransactionId: bankTx.id,
          suggestedOrderIds: candidatePayPal.slice(0, 10).map(pp => pp.id),
          matchType: candidatePayPal.length === 1 ? '1:1' : 'many:1',
          confidence: 'low',
          score: 30,
          reason: `Found ${candidatePayPal.length} PayPal transaction(s) within date range for manual review`,
          totalOrderAmount: totalAmount,
          bankAmount: bankAmount
        };
        result.suggestions.push(suggestion);
      }
    }

    // Update stats
    result.stats.autoMatched = result.autoMatches.length;
    result.stats.suggestionsGenerated = result.suggestions.length;
    result.stats.unmatchedBankTransactions = sortedBankTx.filter(
      tx => !matchedBankIds.has(tx.id) && !(tx.linkedOrderIds && tx.linkedOrderIds.length > 0)
    ).length;
    result.stats.unmatchedPayPalTransactions = sortedPayPalTx.filter(
      pp => !matchedPayPalIds.has(pp.id)
    ).length;

    return result;
  }

  /**
   * Find a combination of PayPal transactions that sum to the target amount
   */
  private findCombination(
    transactions: MatchableTransaction[],
    targetAmount: number
  ): { transactions: MatchableTransaction[]; total: number } {
    const sorted = [...transactions].sort(
      (a, b) => Math.abs(b.amount) - Math.abs(a.amount)
    );

    const tolerance = targetAmount * MATCH_CONFIG.sumMatchTolerancePercent;

    // Try greedy approach first
    const greedy = this.greedySelect(sorted, targetAmount, tolerance);
    if (greedy.transactions.length > 0) {
      return greedy;
    }

    // If greedy fails, try subset sum for small number of transactions
    if (sorted.length <= 8) {
      return this.subsetSum(sorted, targetAmount, tolerance);
    }

    return { transactions: [], total: 0 };
  }

  private greedySelect(
    transactions: MatchableTransaction[],
    targetAmount: number,
    tolerance: number
  ): { transactions: MatchableTransaction[]; total: number } {
    const result: MatchableTransaction[] = [];
    let remaining = targetAmount;

    for (const tx of transactions) {
      const txAmount = Math.abs(tx.amount);

      if (txAmount <= remaining + tolerance) {
        result.push(tx);
        remaining -= txAmount;

        if (Math.abs(remaining) <= tolerance) {
          break;
        }
      }
    }

    const total = result.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    if (Math.abs(total - targetAmount) <= tolerance || Math.abs(total - targetAmount) <= 1.00) {
      return { transactions: result, total };
    }

    return { transactions: [], total: 0 };
  }

  private subsetSum(
    transactions: MatchableTransaction[],
    targetAmount: number,
    tolerance: number
  ): { transactions: MatchableTransaction[]; total: number } {
    const n = transactions.length;
    let bestMatch: { transactions: MatchableTransaction[]; total: number; diff: number } = {
      transactions: [],
      total: 0,
      diff: Infinity
    };

    // Try all subsets (2^n combinations)
    for (let mask = 1; mask < (1 << n); mask++) {
      const subset: MatchableTransaction[] = [];
      let total = 0;

      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          subset.push(transactions[i]);
          total += Math.abs(transactions[i].amount);
        }
      }

      const diff = Math.abs(total - targetAmount);

      if (diff <= tolerance || diff <= 1.00) {
        if (diff < bestMatch.diff) {
          bestMatch = { transactions: subset, total, diff };
        }
      }
    }

    return { transactions: bestMatch.transactions, total: bestMatch.total };
  }
}

/**
 * Apply PayPal matches to transactions
 * Updates the linkedOrderIds field on bank transactions
 */
export function applyPayPalMatches(
  transactions: MatchableTransaction[],
  matches: OrderMatchResult[]
): MatchableTransaction[] {
  const txMap = new Map(transactions.map(tx => [tx.id, tx]));

  for (const match of matches) {
    const bankTx = txMap.get(match.bankTransactionId);
    if (bankTx) {
      bankTx.linkedOrderIds = [
        ...(bankTx.linkedOrderIds || []),
        ...match.matchedOrderIds
      ];
    }
  }

  return Array.from(txMap.values());
}

/**
 * Get linked PayPal transaction details for a bank transaction
 */
export function getLinkedPayPalDetails(
  bankTransactionId: string,
  transactions: MatchableTransaction[]
): MatchableTransaction[] {
  const bankTx = transactions.find(tx => tx.id === bankTransactionId);
  if (!bankTx || !bankTx.linkedOrderIds || bankTx.linkedOrderIds.length === 0) {
    return [];
  }

  return transactions.filter(tx =>
    bankTx.linkedOrderIds!.includes(tx.id) &&
    tx.source?.connectorType === 'paypal'
  );
}

export default PayPalMatcher;
