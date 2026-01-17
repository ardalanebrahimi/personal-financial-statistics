/**
 * Order Matcher Service
 *
 * Links context-only transactions (Amazon orders) to actual bank transactions.
 * This allows AI categorization to use detailed order information when
 * categorizing generic bank transactions like "AMAZON.DE".
 *
 * Match Patterns:
 * - 1:1 - Single order matches single bank transaction (exact amount)
 * - Many:1 - Multiple orders combined into one bank charge
 * - 1:Many - One large order split across multiple charges (rare)
 */

export type OrderMatchConfidence = 'high' | 'medium' | 'low';
export type OrderMatchType = '1:1' | 'many:1' | '1:many';

export interface OrderMatchResult {
  bankTransactionId: string;
  matchedOrderIds: string[];
  matchType: OrderMatchType;
  confidence: OrderMatchConfidence;
  totalOrderAmount: number;
  bankAmount: number;
  amountDifference: number;
  dateDifferenceInDays: number;
}

export interface OrderMatchSuggestion {
  bankTransactionId: string;
  suggestedOrderIds: string[];
  matchType: OrderMatchType;
  confidence: OrderMatchConfidence;
  score: number;
  reason: string;
  totalOrderAmount: number;
  bankAmount: number;
}

export interface OrderMatchingResult {
  autoMatches: OrderMatchResult[];
  suggestions: OrderMatchSuggestion[];
  stats: {
    bankTransactionsProcessed: number;
    ordersProcessed: number;
    autoMatched: number;
    suggestionsGenerated: number;
    unmatchedBankTransactions: number;
    unmatchedOrders: number;
  };
}

// Transaction interfaces
export interface MatchableTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category?: string;
  beneficiary?: string;
  source?: {
    connectorType: string;
    externalId?: string;
  };
  isContextOnly?: boolean;
  linkedOrderIds?: string[];
}

// Configuration for matching
const MATCH_CONFIG = {
  // Maximum days between order date and bank charge
  maxDateDifferenceInDays: 5,
  // Amount tolerance for exact match (in currency units)
  exactMatchTolerance: 0.05,
  // Amount tolerance for sum matching (% of total)
  sumMatchTolerancePercent: 0.02,
  // Patterns to identify Amazon bank transactions
  amazonBankPatterns: [
    /amazon/i,
    /amzn/i,
    /amazon\.de/i,
    /amazon\s+payments/i,
    /amazon\s+eu/i,
    /amz\*|amzn\*/i
  ]
};

/**
 * Order Matcher class
 * Links Amazon orders to bank transactions for better AI categorization
 */
export class OrderMatcher {
  private bankTransactions: MatchableTransaction[] = [];
  private orders: MatchableTransaction[] = [];

  constructor(transactions: MatchableTransaction[]) {
    // Separate bank transactions from orders (context-only)
    this.bankTransactions = transactions.filter(
      tx => !tx.isContextOnly && this.isAmazonBankTransaction(tx)
    );
    this.orders = transactions.filter(
      tx => tx.isContextOnly && tx.source?.connectorType === 'amazon'
    );
  }

  /**
   * Check if a transaction looks like an Amazon bank charge
   */
  private isAmazonBankTransaction(tx: MatchableTransaction): boolean {
    return MATCH_CONFIG.amazonBankPatterns.some(pattern =>
      pattern.test(tx.description) || pattern.test(tx.beneficiary || '')
    );
  }

  /**
   * Run the order matching algorithm
   */
  runMatching(): OrderMatchingResult {
    const result: OrderMatchingResult = {
      autoMatches: [],
      suggestions: [],
      stats: {
        bankTransactionsProcessed: this.bankTransactions.length,
        ordersProcessed: this.orders.length,
        autoMatched: 0,
        suggestionsGenerated: 0,
        unmatchedBankTransactions: 0,
        unmatchedOrders: 0
      }
    };

    // Skip if no transactions to match
    if (this.bankTransactions.length === 0 || this.orders.length === 0) {
      result.stats.unmatchedBankTransactions = this.bankTransactions.length;
      result.stats.unmatchedOrders = this.orders.length;
      return result;
    }

    // Track which orders have been matched
    const matchedOrderIds = new Set<string>();
    const matchedBankIds = new Set<string>();

    // Sort bank transactions by date (newest first)
    const sortedBankTx = [...this.bankTransactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Sort orders by date (newest first)
    const sortedOrders = [...this.orders].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Pass 1: Find exact 1:1 matches (highest confidence)
    for (const bankTx of sortedBankTx) {
      if (matchedBankIds.has(bankTx.id)) continue;
      if (bankTx.linkedOrderIds && bankTx.linkedOrderIds.length > 0) continue; // Already linked

      const bankDate = new Date(bankTx.date);
      const bankAmount = Math.abs(bankTx.amount);

      // Find orders within date range
      const candidateOrders = sortedOrders.filter(order => {
        if (matchedOrderIds.has(order.id)) return false;

        const orderDate = new Date(order.date);
        const daysDiff = Math.abs(
          (bankDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        return daysDiff <= MATCH_CONFIG.maxDateDifferenceInDays;
      });

      // Look for exact amount match
      const exactMatch = candidateOrders.find(order => {
        const orderAmount = Math.abs(order.amount);
        return Math.abs(orderAmount - bankAmount) <= MATCH_CONFIG.exactMatchTolerance;
      });

      if (exactMatch) {
        const orderDate = new Date(exactMatch.date);
        const daysDiff = Math.abs(
          (bankDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        const match: OrderMatchResult = {
          bankTransactionId: bankTx.id,
          matchedOrderIds: [exactMatch.id],
          matchType: '1:1',
          confidence: daysDiff <= 2 ? 'high' : 'medium',
          totalOrderAmount: Math.abs(exactMatch.amount),
          bankAmount: bankAmount,
          amountDifference: Math.abs(Math.abs(exactMatch.amount) - bankAmount),
          dateDifferenceInDays: daysDiff
        };

        result.autoMatches.push(match);
        matchedOrderIds.add(exactMatch.id);
        matchedBankIds.add(bankTx.id);
      }
    }

    // Pass 2: Find many:1 matches (multiple orders → one bank charge)
    for (const bankTx of sortedBankTx) {
      if (matchedBankIds.has(bankTx.id)) continue;
      if (bankTx.linkedOrderIds && bankTx.linkedOrderIds.length > 0) continue;

      const bankDate = new Date(bankTx.date);
      const bankAmount = Math.abs(bankTx.amount);

      // Find unmatched orders within date range
      const candidateOrders = sortedOrders.filter(order => {
        if (matchedOrderIds.has(order.id)) return false;

        const orderDate = new Date(order.date);
        const daysDiff = Math.abs(
          (bankDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        return daysDiff <= MATCH_CONFIG.maxDateDifferenceInDays;
      });

      if (candidateOrders.length < 2) continue; // Need multiple orders for many:1

      // Try to find combination of orders that sum to bank amount
      const combination = this.findOrderCombination(candidateOrders, bankAmount);

      if (combination.orders.length > 0) {
        const totalOrderAmount = combination.total;
        const amountDiff = Math.abs(totalOrderAmount - bankAmount);
        const toleranceAmount = bankAmount * MATCH_CONFIG.sumMatchTolerancePercent;

        if (amountDiff <= toleranceAmount || amountDiff <= 1.00) {
          // Good match found
          const maxDaysDiff = Math.max(
            ...combination.orders.map(order => {
              const orderDate = new Date(order.date);
              return Math.abs(
                (bankDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24)
              );
            })
          );

          const match: OrderMatchResult = {
            bankTransactionId: bankTx.id,
            matchedOrderIds: combination.orders.map(o => o.id),
            matchType: 'many:1',
            confidence: amountDiff <= MATCH_CONFIG.exactMatchTolerance ? 'high' : 'medium',
            totalOrderAmount: totalOrderAmount,
            bankAmount: bankAmount,
            amountDifference: amountDiff,
            dateDifferenceInDays: maxDaysDiff
          };

          result.autoMatches.push(match);
          combination.orders.forEach(o => matchedOrderIds.add(o.id));
          matchedBankIds.add(bankTx.id);
        } else {
          // Close but not exact - suggest for review
          const suggestion: OrderMatchSuggestion = {
            bankTransactionId: bankTx.id,
            suggestedOrderIds: combination.orders.map(o => o.id),
            matchType: 'many:1',
            confidence: 'low',
            score: Math.max(0, 100 - (amountDiff / bankAmount) * 100),
            reason: `${combination.orders.length} orders totaling €${totalOrderAmount.toFixed(2)} (bank: €${bankAmount.toFixed(2)}, diff: €${amountDiff.toFixed(2)})`,
            totalOrderAmount: totalOrderAmount,
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

      // Find any orders within extended date range for suggestions
      const candidateOrders = sortedOrders.filter(order => {
        if (matchedOrderIds.has(order.id)) return false;

        const orderDate = new Date(order.date);
        const daysDiff = Math.abs(
          (bankDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Extended range for suggestions
        return daysDiff <= MATCH_CONFIG.maxDateDifferenceInDays * 2;
      });

      if (candidateOrders.length > 0) {
        const totalOrderAmount = candidateOrders.reduce(
          (sum, o) => sum + Math.abs(o.amount), 0
        );

        const suggestion: OrderMatchSuggestion = {
          bankTransactionId: bankTx.id,
          suggestedOrderIds: candidateOrders.slice(0, 10).map(o => o.id), // Limit to 10
          matchType: candidateOrders.length === 1 ? '1:1' : 'many:1',
          confidence: 'low',
          score: 30,
          reason: `Found ${candidateOrders.length} order(s) within date range for manual review`,
          totalOrderAmount: totalOrderAmount,
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
    result.stats.unmatchedOrders = sortedOrders.filter(
      o => !matchedOrderIds.has(o.id)
    ).length;

    return result;
  }

  /**
   * Find a combination of orders that sum to the target amount
   * Uses a greedy approach with backtracking
   */
  private findOrderCombination(
    orders: MatchableTransaction[],
    targetAmount: number
  ): { orders: MatchableTransaction[]; total: number } {
    // Sort by amount descending
    const sorted = [...orders].sort(
      (a, b) => Math.abs(b.amount) - Math.abs(a.amount)
    );

    const tolerance = targetAmount * MATCH_CONFIG.sumMatchTolerancePercent;

    // Try greedy approach first
    const greedy = this.greedySelect(sorted, targetAmount, tolerance);
    if (greedy.orders.length > 0) {
      return greedy;
    }

    // If greedy fails, try subset sum for small number of orders
    if (sorted.length <= 8) {
      return this.subsetSum(sorted, targetAmount, tolerance);
    }

    return { orders: [], total: 0 };
  }

  /**
   * Greedy selection of orders
   */
  private greedySelect(
    orders: MatchableTransaction[],
    targetAmount: number,
    tolerance: number
  ): { orders: MatchableTransaction[]; total: number } {
    const result: MatchableTransaction[] = [];
    let remaining = targetAmount;

    for (const order of orders) {
      const orderAmount = Math.abs(order.amount);

      if (orderAmount <= remaining + tolerance) {
        result.push(order);
        remaining -= orderAmount;

        if (Math.abs(remaining) <= tolerance) {
          break;
        }
      }
    }

    const total = result.reduce((sum, o) => sum + Math.abs(o.amount), 0);

    if (Math.abs(total - targetAmount) <= tolerance || Math.abs(total - targetAmount) <= 1.00) {
      return { orders: result, total };
    }

    return { orders: [], total: 0 };
  }

  /**
   * Subset sum approach for finding exact combinations
   */
  private subsetSum(
    orders: MatchableTransaction[],
    targetAmount: number,
    tolerance: number
  ): { orders: MatchableTransaction[]; total: number } {
    const n = orders.length;
    let bestMatch: { orders: MatchableTransaction[]; total: number; diff: number } = {
      orders: [],
      total: 0,
      diff: Infinity
    };

    // Try all subsets (2^n combinations)
    for (let mask = 1; mask < (1 << n); mask++) {
      const subset: MatchableTransaction[] = [];
      let total = 0;

      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          subset.push(orders[i]);
          total += Math.abs(orders[i].amount);
        }
      }

      const diff = Math.abs(total - targetAmount);

      if (diff <= tolerance || diff <= 1.00) {
        if (diff < bestMatch.diff) {
          bestMatch = { orders: subset, total, diff };
        }
      }
    }

    return { orders: bestMatch.orders, total: bestMatch.total };
  }
}

/**
 * Apply order matches to transactions
 * Updates the linkedOrderIds field on bank transactions
 */
export function applyOrderMatches(
  transactions: MatchableTransaction[],
  matches: OrderMatchResult[]
): MatchableTransaction[] {
  const txMap = new Map(transactions.map(tx => [tx.id, tx]));

  for (const match of matches) {
    const bankTx = txMap.get(match.bankTransactionId);
    if (bankTx) {
      bankTx.linkedOrderIds = match.matchedOrderIds;
    }
  }

  return Array.from(txMap.values());
}

/**
 * Get linked order details for a bank transaction
 */
export function getLinkedOrderDetails(
  bankTransactionId: string,
  transactions: MatchableTransaction[]
): MatchableTransaction[] {
  const bankTx = transactions.find(tx => tx.id === bankTransactionId);
  if (!bankTx || !bankTx.linkedOrderIds || bankTx.linkedOrderIds.length === 0) {
    return [];
  }

  return transactions.filter(tx => bankTx.linkedOrderIds!.includes(tx.id));
}

export default OrderMatcher;
