/**
 * Shared Match Types
 *
 * Types shared between frontend and backend for transaction matching.
 */

/**
 * Source of a match
 */
export type MatchSource = 'auto' | 'manual' | 'suggested';

/**
 * Confidence level of a match
 */
export type MatchConfidence = 'high' | 'medium' | 'low';

/**
 * Pattern type used to identify a match
 */
export type MatchPatternType =
  | 'paypal_sparkasse'
  | 'mastercard_sparkasse'
  | 'n26_sparkasse'
  | 'internal_transfer'
  | 'refund'
  | 'custom';

/**
 * A matched pair of transactions
 * Note: timestamps are strings for JSON serialization compatibility
 */
export interface TransactionMatch {
  id: string;
  bankTransactionId: string;
  contextTransactionId: string;
  patternType: MatchPatternType;
  confidence: MatchConfidence;
  source: MatchSource;
  metadata?: {
    amountDifference?: number;
    daysDifference?: number;
    matchedFields?: string[];
    notes?: string;
  };
  createdAt: string;
  updatedAt?: string;
}

/**
 * A suggested match for review
 */
export interface MatchSuggestion {
  bankTransactionId: string;
  contextTransactionId: string;
  patternType: MatchPatternType;
  confidence: MatchConfidence;
  score: number;
  reason: string;
}

/**
 * Result of running the matching algorithm
 */
export interface MatchingResult {
  matched: number;
  suggestions: number;
  errors: string[];
  newMatches?: TransactionMatch[];
  newSuggestions?: MatchSuggestion[];
}

/**
 * Statistics about existing matches
 */
export interface MatchStats {
  totalMatches: number;
  byPattern: Record<MatchPatternType, number>;
  byConfidence: Record<MatchConfidence, number>;
  bySource: Record<MatchSource, number>;
}
