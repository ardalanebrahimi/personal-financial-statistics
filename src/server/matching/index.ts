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
