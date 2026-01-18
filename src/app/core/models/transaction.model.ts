import { ConnectorType } from './connector.model';
import { TransactionType, MatchSource, MatchConfidence, MatchPatternType } from './match.model';

/**
 * Transaction source tracking
 */
export interface TransactionSource {
  connectorType: ConnectorType | 'manual' | 'csv_import';
  externalId?: string; // Original ID from the source system
  accountId?: string;  // Account identifier within the source
  importedAt: Date;
  rawData?: Record<string, unknown>; // Original data for debugging
}

/**
 * Match information attached to a transaction
 */
export interface TransactionMatchInfo {
  matchId: string;              // ID of the TransactionMatch record
  isPrimary: boolean;           // Is this the primary (bank) transaction?
  patternType: MatchPatternType;
  source: MatchSource;
  confidence: MatchConfidence;
  linkedTransactionIds: string[]; // IDs of related transactions
}

export interface Transaction {
  id: string;
  date: Date;
  description: string;
  amount: number;
  category?: string;
  beneficiary?: string;

  // Source tracking fields
  source?: TransactionSource;

  // Transaction type for financial tracking
  transactionType?: TransactionType;

  // Matching fields
  matchInfo?: TransactionMatchInfo;

  // Merge/split tracking
  mergedFrom?: string[];  // IDs of transactions merged into this one
  splitFrom?: string;     // ID of parent transaction if this was split

  // Flags
  excludeFromStats?: boolean;  // Exclude from spending calculations (e.g., internal transfers)
  isReconciled?: boolean;      // User has verified this transaction
  isContextOnly?: boolean;     // True for items that provide context but aren't real bank transactions (e.g., Amazon orders)

  // Order linking - for connecting bank transactions to detailed order information
  linkedOrderIds?: string[];   // IDs of context-only transactions (orders) linked to this bank transaction

  // Auto-detected payment platform based on description/beneficiary patterns
  detectedPlatform?: 'amazon' | 'paypal' | null;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  keywords?: string[];
}
