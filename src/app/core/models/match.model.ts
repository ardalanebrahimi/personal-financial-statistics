/**
 * Transaction Matching Models
 *
 * Used to link related transactions across different accounts:
 * - PayPal transactions → Sparkasse "PAYPAL" debits
 * - Mastercard purchases → Sparkasse "ADVANZIA" debits
 * - N26 transfers → Sparkasse transfers
 */

/**
 * Type of transaction for financial tracking
 */
export type TransactionType = 'expense' | 'income' | 'transfer' | 'internal';

/**
 * How the match was created
 */
export type MatchSource = 'auto' | 'manual' | 'suggested';

/**
 * Confidence level for automatic matches
 */
export type MatchConfidence = 'high' | 'medium' | 'low';

/**
 * Match pattern types
 */
export type MatchPatternType =
  | 'paypal_sparkasse'      // PayPal transaction matched to Sparkasse PAYPAL debit
  | 'mastercard_sparkasse'  // Mastercard purchase matched to Sparkasse ADVANZIA debit
  | 'n26_sparkasse'         // N26 transfer matched to Sparkasse transfer
  | 'internal_transfer'     // Transfer between own accounts
  | 'refund'                // Refund matched to original purchase
  | 'custom';               // Manual/custom match

/**
 * A match between two or more related transactions
 */
export interface TransactionMatch {
  id: string;
  createdAt: Date;
  updatedAt: Date;

  // Match metadata
  patternType: MatchPatternType;
  source: MatchSource;
  confidence: MatchConfidence;

  // Primary transaction (usually the bank statement entry)
  primaryTransactionId: string;

  // Linked transactions (detail transactions)
  linkedTransactionIds: string[];

  // Match details
  matchedAmount: number;         // Total amount matched
  amountDifference?: number;     // Difference (e.g., fees)
  dateDifference?: number;       // Days between transactions

  // For Mastercard billing: the billing period
  billingPeriodStart?: Date;
  billingPeriodEnd?: Date;

  // User notes
  notes?: string;
}

/**
 * Summary of a match for display purposes
 */
export interface MatchSummary {
  matchId: string;
  patternType: MatchPatternType;
  source: MatchSource;
  confidence: MatchConfidence;

  // Primary transaction info
  primaryDescription: string;
  primaryAmount: number;
  primaryDate: Date;
  primarySource: string;

  // Linked transactions summary
  linkedCount: number;
  linkedTotalAmount: number;
  linkedDescriptions: string[];

  // Derived info for PayPal/Mastercard
  merchantNames?: string[];
}

/**
 * Match suggestion from the automatic matcher
 */
export interface MatchSuggestion {
  primaryTransactionId: string;
  suggestedLinkedIds: string[];
  patternType: MatchPatternType;
  confidence: MatchConfidence;
  score: number;  // 0-100 match score
  reason: string; // Human-readable explanation
}

/**
 * Criteria for finding potential matches
 */
export interface MatchCriteria {
  // Amount matching
  amountTolerance?: number;      // Absolute difference allowed (default: 0.01)
  amountTolerancePercent?: number; // Percentage difference allowed

  // Date matching
  maxDaysDifference?: number;    // Max days between transactions (default: 3)

  // Description patterns
  descriptionPatterns?: string[]; // Regex patterns to match

  // Source filtering
  primarySources?: string[];     // Sources for primary transactions
  linkedSources?: string[];      // Sources for linked transactions
}

/**
 * Result of running the matcher on a transaction set
 */
export interface MatchResult {
  newMatches: TransactionMatch[];
  suggestions: MatchSuggestion[];
  unmatched: {
    primaryIds: string[];        // Bank transactions without matches
    orphanedIds: string[];       // Detail transactions without parent
  };
  stats: {
    totalProcessed: number;
    autoMatched: number;
    suggested: number;
    unmatchedPrimary: number;
    unmatchedOrphaned: number;
  };
}

/**
 * Matching patterns for automatic detection
 */
export const MATCH_PATTERNS = {
  // Sparkasse descriptions that indicate PayPal
  paypal: [
    /paypal/i,
    /pp\./i,
    /pp\s/i
  ],

  // Sparkasse descriptions that indicate Advanzia/Mastercard
  mastercard: [
    /advanzia/i,
    /gebuhrenfrei/i,
    /gebührenfrei/i,
    /mastercard/i
  ],

  // Sparkasse descriptions that indicate N26 transfers
  n26: [
    /n26/i,
    /number26/i,
    /n\s?26/i
  ],

  // Internal transfer indicators
  transfer: [
    /umbuchung/i,
    /überweisung/i,
    /transfer/i,
    /eigen/i
  ]
};
