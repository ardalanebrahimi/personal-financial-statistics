/**
 * Transaction Matcher
 *
 * Core matching algorithms for linking related transactions across accounts.
 * Identifies patterns like:
 * - PayPal transactions → Sparkasse "PAYPAL" debits
 * - Mastercard purchases → Sparkasse "ADVANZIA" debits
 * - N26 transfers → Sparkasse transfers
 */

// Re-export shared match types
export {
  MatchPatternType,
  MatchSource,
  MatchConfidence
} from '@shared/types';

import type { MatchPatternType, MatchSource, MatchConfidence } from '@shared/types';

// Stored transaction interface (matches server.ts)
export interface StoredTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  timestamp: string;
  beneficiary?: string;
  source?: {
    connectorType: string;
    externalId?: string;
    importedAt: string;
  };
  // Match fields
  matchId?: string;
  matchInfo?: {
    matchId: string;
    isPrimary: boolean;
    patternType: MatchPatternType;
    source: MatchSource;
    confidence: MatchConfidence;
    linkedTransactionIds: string[];
  };
  transactionType?: 'expense' | 'income' | 'transfer' | 'internal';
  excludeFromStats?: boolean;
}

export interface TransactionMatch {
  id: string;
  createdAt: string;
  updatedAt: string;
  patternType: MatchPatternType;
  source: MatchSource;
  confidence: MatchConfidence;
  primaryTransactionId: string;
  linkedTransactionIds: string[];
  matchedAmount: number;
  amountDifference?: number;
  dateDifference?: number;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  notes?: string;
}

export interface MatchSuggestion {
  primaryTransactionId: string;
  suggestedLinkedIds: string[];
  patternType: MatchPatternType;
  confidence: MatchConfidence;
  score: number;
  reason: string;
}

export interface MatchResult {
  newMatches: TransactionMatch[];
  suggestions: MatchSuggestion[];
  stats: {
    totalProcessed: number;
    autoMatched: number;
    suggested: number;
  };
}

// Pattern detection regexes
const PATTERNS = {
  paypal: [/paypal/i, /pp\./i, /pp\s/i],
  mastercard: [/advanzia/i, /gebuhrenfrei/i, /gebührenfrei/i, /mastercard/i],
  n26: [/n26/i, /number26/i],
  transfer: [/umbuchung/i, /überweisung/i, /dauerauftrag/i]
};

/**
 * Main matcher class
 */
export class TransactionMatcher {
  private transactions: StoredTransaction[] = [];
  private existingMatches: TransactionMatch[] = [];

  constructor(transactions: StoredTransaction[], existingMatches: TransactionMatch[] = []) {
    this.transactions = transactions;
    this.existingMatches = existingMatches;
  }

  /**
   * Run all matchers and return results
   */
  runAllMatchers(): MatchResult {
    const results: MatchResult = {
      newMatches: [],
      suggestions: [],
      stats: {
        totalProcessed: this.transactions.length,
        autoMatched: 0,
        suggested: 0
      }
    };

    // Get transactions by source
    const sparkasseTx = this.getBySource('sparkasse');
    const paypalTx = this.getBySource('paypal');
    const mastercardTx = this.getBySource('gebuhrenfrei');
    const n26Tx = this.getBySource('n26');

    // Run PayPal matcher
    const paypalMatches = this.matchPayPalToSparkasse(sparkasseTx, paypalTx);
    results.newMatches.push(...paypalMatches.matches);
    results.suggestions.push(...paypalMatches.suggestions);

    // Run Mastercard matcher
    const mastercardMatches = this.matchMastercardToSparkasse(sparkasseTx, mastercardTx);
    results.newMatches.push(...mastercardMatches.matches);
    results.suggestions.push(...mastercardMatches.suggestions);

    // Run N26 matcher
    const n26Matches = this.matchN26ToSparkasse(sparkasseTx, n26Tx);
    results.newMatches.push(...n26Matches.matches);
    results.suggestions.push(...n26Matches.suggestions);

    // Update stats
    results.stats.autoMatched = results.newMatches.length;
    results.stats.suggested = results.suggestions.length;

    return results;
  }

  /**
   * Match PayPal transactions to Sparkasse debits
   */
  matchPayPalToSparkasse(
    sparkasseTx: StoredTransaction[],
    paypalTx: StoredTransaction[]
  ): { matches: TransactionMatch[]; suggestions: MatchSuggestion[] } {
    const matches: TransactionMatch[] = [];
    const suggestions: MatchSuggestion[] = [];

    // Find Sparkasse transactions that look like PayPal
    const sparkassePaypal = sparkasseTx.filter(tx =>
      !tx.matchId && PATTERNS.paypal.some(p => p.test(tx.description))
    );

    // Find unmatched PayPal transactions
    const unmatchedPaypal = paypalTx.filter(tx => !tx.matchId);

    for (const spkTx of sparkassePaypal) {
      const spkDate = new Date(spkTx.date);
      const spkAmount = Math.abs(spkTx.amount);

      // Find PayPal transactions that could match
      // PayPal batches multiple purchases, so we need to find combinations
      const candidates = unmatchedPaypal.filter(ppTx => {
        const ppDate = new Date(ppTx.date);
        const daysDiff = Math.abs(spkDate.getTime() - ppDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff <= 3 && ppTx.amount < 0; // Within 3 days and is a payment
      });

      // Try to find exact amount match first
      const exactMatch = candidates.find(ppTx =>
        Math.abs(Math.abs(ppTx.amount) - spkAmount) < 0.01
      );

      if (exactMatch) {
        const match = this.createMatch(
          spkTx.id,
          [exactMatch.id],
          'paypal_sparkasse',
          'auto',
          'high',
          spkAmount
        );
        matches.push(match);
        continue;
      }

      // Try to find combination of PayPal transactions that sum to Sparkasse amount
      const combination = this.findAmountCombination(candidates, spkAmount);
      if (combination.length > 0) {
        const totalAmount = combination.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        const diff = Math.abs(totalAmount - spkAmount);

        if (diff < 0.50) { // Allow small difference for fees
          const match = this.createMatch(
            spkTx.id,
            combination.map(tx => tx.id),
            'paypal_sparkasse',
            'auto',
            diff < 0.01 ? 'high' : 'medium',
            spkAmount,
            diff
          );
          matches.push(match);
          continue;
        }
      }

      // If no exact match, suggest potential matches
      if (candidates.length > 0) {
        const suggestion: MatchSuggestion = {
          primaryTransactionId: spkTx.id,
          suggestedLinkedIds: candidates.slice(0, 5).map(tx => tx.id),
          patternType: 'paypal_sparkasse',
          confidence: 'low',
          score: 50,
          reason: `Found ${candidates.length} PayPal transactions within date range`
        };
        suggestions.push(suggestion);
      }
    }

    return { matches, suggestions };
  }

  /**
   * Match Mastercard transactions to Sparkasse debits
   */
  matchMastercardToSparkasse(
    sparkasseTx: StoredTransaction[],
    mastercardTx: StoredTransaction[]
  ): { matches: TransactionMatch[]; suggestions: MatchSuggestion[] } {
    const matches: TransactionMatch[] = [];
    const suggestions: MatchSuggestion[] = [];

    // Find Sparkasse transactions that look like Mastercard payments
    const sparkasseMastercard = sparkasseTx.filter(tx =>
      !tx.matchId && PATTERNS.mastercard.some(p => p.test(tx.description))
    );

    // Find unmatched Mastercard transactions
    const unmatchedMastercard = mastercardTx.filter(tx => !tx.matchId);

    for (const spkTx of sparkasseMastercard) {
      const spkDate = new Date(spkTx.date);
      const spkAmount = Math.abs(spkTx.amount);

      // Mastercard billing: find all purchases from the billing period
      // Typically 30-45 days before the payment date
      const billingStart = new Date(spkDate);
      billingStart.setDate(billingStart.getDate() - 45);

      const candidates = unmatchedMastercard.filter(mcTx => {
        const mcDate = new Date(mcTx.date);
        return mcDate >= billingStart && mcDate <= spkDate;
      });

      // Sum all candidates
      const totalCandidates = candidates.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
      const diff = Math.abs(totalCandidates - spkAmount);

      if (candidates.length > 0 && diff < 1.00) {
        // Good match - all Mastercard purchases sum to payment
        const match = this.createMatch(
          spkTx.id,
          candidates.map(tx => tx.id),
          'mastercard_sparkasse',
          'auto',
          diff < 0.01 ? 'high' : 'medium',
          spkAmount,
          diff
        );
        match.billingPeriodStart = billingStart.toISOString();
        match.billingPeriodEnd = spkDate.toISOString();
        matches.push(match);
      } else if (candidates.length > 0) {
        // Suggest for manual review
        const suggestion: MatchSuggestion = {
          primaryTransactionId: spkTx.id,
          suggestedLinkedIds: candidates.map(tx => tx.id),
          patternType: 'mastercard_sparkasse',
          confidence: 'low',
          score: Math.max(0, 100 - (diff / spkAmount) * 100),
          reason: `${candidates.length} purchases totaling €${totalCandidates.toFixed(2)} (payment: €${spkAmount.toFixed(2)})`
        };
        suggestions.push(suggestion);
      }
    }

    return { matches, suggestions };
  }

  /**
   * Match N26 transfers to Sparkasse
   */
  matchN26ToSparkasse(
    sparkasseTx: StoredTransaction[],
    n26Tx: StoredTransaction[]
  ): { matches: TransactionMatch[]; suggestions: MatchSuggestion[] } {
    const matches: TransactionMatch[] = [];
    const suggestions: MatchSuggestion[] = [];

    // Find Sparkasse transactions that look like N26 transfers
    const sparkasseN26 = sparkasseTx.filter(tx =>
      !tx.matchId && PATTERNS.n26.some(p => p.test(tx.description))
    );

    // Find unmatched N26 transactions
    const unmatchedN26 = n26Tx.filter(tx => !tx.matchId);

    for (const spkTx of sparkasseN26) {
      const spkDate = new Date(spkTx.date);
      const spkAmount = spkTx.amount; // Keep sign for transfer direction

      // Find matching N26 transaction (opposite amount, similar date)
      const candidates = unmatchedN26.filter(n26Tx => {
        const n26Date = new Date(n26Tx.date);
        const daysDiff = Math.abs(spkDate.getTime() - n26Date.getTime()) / (1000 * 60 * 60 * 24);
        // Opposite sign (if Sparkasse is debit, N26 should be credit)
        const oppositeAmount = Math.abs(n26Tx.amount + spkAmount) < 0.01;
        return daysDiff <= 2 && oppositeAmount;
      });

      if (candidates.length === 1) {
        // Exact match found
        const match = this.createMatch(
          spkTx.id,
          [candidates[0].id],
          'n26_sparkasse',
          'auto',
          'high',
          Math.abs(spkAmount)
        );
        matches.push(match);

        // Mark both as internal transfers
        spkTx.transactionType = 'internal';
        candidates[0].transactionType = 'internal';
      } else if (candidates.length > 1) {
        // Multiple candidates - suggest for review
        const suggestion: MatchSuggestion = {
          primaryTransactionId: spkTx.id,
          suggestedLinkedIds: candidates.map(tx => tx.id),
          patternType: 'n26_sparkasse',
          confidence: 'medium',
          score: 70,
          reason: `Found ${candidates.length} potential N26 matches`
        };
        suggestions.push(suggestion);
      }
    }

    return { matches, suggestions };
  }

  /**
   * Get transactions by source connector type
   */
  private getBySource(connectorType: string): StoredTransaction[] {
    return this.transactions.filter(
      tx => tx.source?.connectorType === connectorType
    );
  }

  /**
   * Find combination of transactions that sum to target amount
   */
  private findAmountCombination(
    transactions: StoredTransaction[],
    targetAmount: number,
    tolerance: number = 0.50
  ): StoredTransaction[] {
    // Sort by amount descending for greedy approach
    const sorted = [...transactions].sort(
      (a, b) => Math.abs(b.amount) - Math.abs(a.amount)
    );

    const result: StoredTransaction[] = [];
    let remaining = targetAmount;

    for (const tx of sorted) {
      const txAmount = Math.abs(tx.amount);
      if (txAmount <= remaining + tolerance) {
        result.push(tx);
        remaining -= txAmount;
        if (remaining <= tolerance) {
          break;
        }
      }
    }

    // Check if we found a good combination
    if (Math.abs(remaining) <= tolerance) {
      return result;
    }

    return [];
  }

  /**
   * Create a new match record
   */
  private createMatch(
    primaryId: string,
    linkedIds: string[],
    patternType: MatchPatternType,
    source: MatchSource,
    confidence: MatchConfidence,
    amount: number,
    amountDiff?: number
  ): TransactionMatch {
    const now = new Date().toISOString();
    return {
      id: `match-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
      patternType,
      source,
      confidence,
      primaryTransactionId: primaryId,
      linkedTransactionIds: linkedIds,
      matchedAmount: amount,
      amountDifference: amountDiff
    };
  }
}

/**
 * Apply matches to transactions (updates matchInfo fields)
 */
export function applyMatchesToTransactions(
  transactions: StoredTransaction[],
  matches: TransactionMatch[]
): StoredTransaction[] {
  const txMap = new Map(transactions.map(tx => [tx.id, tx]));

  for (const match of matches) {
    // Update primary transaction
    const primary = txMap.get(match.primaryTransactionId);
    if (primary) {
      primary.matchId = match.id;
      primary.matchInfo = {
        matchId: match.id,
        isPrimary: true,
        patternType: match.patternType,
        source: match.source,
        confidence: match.confidence,
        linkedTransactionIds: match.linkedTransactionIds
      };

      // Mark internal transfers
      if (match.patternType === 'n26_sparkasse' || match.patternType === 'internal_transfer') {
        primary.transactionType = 'internal';
        primary.excludeFromStats = true;
      }
    }

    // Update linked transactions
    for (const linkedId of match.linkedTransactionIds) {
      const linked = txMap.get(linkedId);
      if (linked) {
        linked.matchId = match.id;
        linked.matchInfo = {
          matchId: match.id,
          isPrimary: false,
          patternType: match.patternType,
          source: match.source,
          confidence: match.confidence,
          linkedTransactionIds: [match.primaryTransactionId]
        };

        // Mark internal transfers
        if (match.patternType === 'n26_sparkasse' || match.patternType === 'internal_transfer') {
          linked.transactionType = 'internal';
          linked.excludeFromStats = true;
        }
      }
    }
  }

  return Array.from(txMap.values());
}

export default TransactionMatcher;
