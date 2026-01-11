import { ConnectorType } from './connector.model';

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

export interface Transaction {
  id: string;
  date: Date;
  description: string;
  amount: number;
  category?: string;
  beneficiary?: string;
  // Source tracking fields
  source?: TransactionSource;
  // Merge/split tracking
  mergedFrom?: string[];  // IDs of transactions merged into this one
  splitFrom?: string;     // ID of parent transaction if this was split
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  keywords?: string[];
}
