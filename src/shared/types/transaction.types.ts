/**
 * Shared Transaction Types
 *
 * Types shared between frontend and backend for transactions and categories.
 */

import { ConnectorType } from './connector.types';

/**
 * Source/origin of a transaction
 */
export type TransactionSource = 'bank' | 'amazon' | 'paypal' | 'manual' | 'import';

/**
 * Type of transaction
 */
export type TransactionType = 'expense' | 'income' | 'transfer' | 'refund';

/**
 * Base transaction interface
 * Note: timestamps are strings for JSON serialization compatibility
 */
export interface BaseTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category?: string;
  beneficiary?: string;
  externalId?: string;
  source?: TransactionSource;
  connectorType?: ConnectorType;
}

/**
 * Stored transaction in the database
 */
export interface StoredTransaction extends BaseTransaction {
  timestamp: string;
  type?: TransactionType;
  matchId?: string;
  mergedFrom?: string[];
  splitFrom?: string;
  linkedOrderId?: string;
  aiCategorized?: boolean;
  aiConfidence?: number;
  userVerified?: boolean;
}

/**
 * Transaction with UI-specific fields (for frontend)
 */
export interface Transaction extends StoredTransaction {
  // UI state (not persisted)
  isSelected?: boolean;
  isExpanded?: boolean;
  isHighlighted?: boolean;
}

/**
 * Category definition
 */
export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  keywords?: string[];
  parentId?: string;
  isSubcategory?: boolean;
}

/**
 * Transaction filter criteria
 */
export interface TransactionFilter {
  startDate?: string;
  endDate?: string;
  categories?: string[];
  sources?: TransactionSource[];
  types?: TransactionType[];
  minAmount?: number;
  maxAmount?: number;
  searchText?: string;
  beneficiary?: string;
  hasMatch?: boolean;
  uncategorized?: boolean;
}

/**
 * Transaction statistics
 */
export interface TransactionStats {
  totalCount: number;
  totalAmount: number;
  incomeAmount: number;
  expenseAmount: number;
  averageAmount: number;
  byCategory: Record<string, { count: number; amount: number }>;
  bySource: Record<TransactionSource, number>;
  byMonth: Record<string, { income: number; expense: number }>;
}

/**
 * Paginated transaction response
 */
export interface PaginatedTransactions {
  transactions: StoredTransaction[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
