/**
 * Transaction Matching Module
 *
 * Exports matching algorithms and utilities for linking
 * related transactions across different financial sources.
 */

export {
  TransactionMatcher,
  applyMatchesToTransactions,
  type StoredTransaction,
  type TransactionMatch,
  type MatchSuggestion,
  type MatchResult,
  type MatchPatternType,
  type MatchSource,
  type MatchConfidence
} from './matcher';

// Order matching (Amazon orders → Bank transactions)
export {
  OrderMatcher,
  applyOrderMatches,
  getLinkedOrderDetails,
  type OrderMatchResult,
  type OrderMatchSuggestion,
  type OrderMatchingResult,
  type OrderMatchConfidence,
  type OrderMatchType,
  type MatchableTransaction
} from './order-matcher';

// PayPal matching (PayPal transactions → Bank transactions)
export {
  PayPalMatcher,
  applyPayPalMatches,
  getLinkedPayPalDetails,
  type PayPalMatchingResult
} from './paypal-matcher';
