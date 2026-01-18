/**
 * Transaction Repository
 *
 * Database operations for transactions.
 */

import { db } from '../connection';
import type { MatchPatternType, MatchSource, MatchConfidence } from '../../matching/matcher';

export interface StoredTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  beneficiary?: string;
  timestamp: string;
  source?: {
    connectorType: string;
    externalId?: string;
    importedAt: string;
  };
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
  isContextOnly?: boolean;
  linkedOrderIds?: string[];
  detectedPlatform?: 'amazon' | 'paypal' | null;
  subcategory?: string;
  categoryConfidence?: number;
  categorizedAt?: string;
  categorizedBy?: 'ai' | 'user' | 'rule';
}

function rowToTransaction(row: any): StoredTransaction {
  const tx: StoredTransaction = {
    id: row.id,
    date: row.date,
    description: row.description,
    amount: row.amount,
    category: row.category || '',
    beneficiary: row.beneficiary || undefined,
    timestamp: row.timestamp
  };

  if (row.source_connector_type) {
    tx.source = {
      connectorType: row.source_connector_type,
      externalId: row.source_external_id || undefined,
      importedAt: row.source_imported_at
    };
  }

  if (row.match_id) {
    tx.matchId = row.match_id;
    tx.matchInfo = {
      matchId: row.match_id,
      isPrimary: row.match_is_primary === 1,
      patternType: row.match_pattern_type,
      source: row.match_source,
      confidence: row.match_confidence,
      linkedTransactionIds: row.match_linked_ids ? JSON.parse(row.match_linked_ids) : []
    };
  }

  if (row.transaction_type) tx.transactionType = row.transaction_type;
  if (row.exclude_from_stats) tx.excludeFromStats = row.exclude_from_stats === 1;
  if (row.is_context_only) tx.isContextOnly = row.is_context_only === 1;

  if (row.linked_order_ids) {
    try {
      tx.linkedOrderIds = JSON.parse(row.linked_order_ids);
    } catch {
      tx.linkedOrderIds = [];
    }
  }

  if (row.detected_platform) tx.detectedPlatform = row.detected_platform;
  if (row.subcategory) tx.subcategory = row.subcategory;
  if (row.category_confidence !== null && row.category_confidence !== undefined) {
    tx.categoryConfidence = row.category_confidence;
  }
  if (row.categorized_at) tx.categorizedAt = row.categorized_at;
  if (row.categorized_by) tx.categorizedBy = row.categorized_by;

  return tx;
}

export function getAllTransactions(): StoredTransaction[] {
  const rows = db.prepare(`SELECT * FROM transactions ORDER BY date DESC`).all() as any[];
  return rows.map(rowToTransaction);
}

export function getTransactionById(id: string): StoredTransaction | null {
  const row = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id) as any;
  return row ? rowToTransaction(row) : null;
}

export function getTransactionsByDateRange(startDate: string, endDate: string): StoredTransaction[] {
  const rows = db.prepare(`
    SELECT * FROM transactions
    WHERE date >= ? AND date <= ?
    ORDER BY date DESC
  `).all(startDate, endDate) as any[];
  return rows.map(rowToTransaction);
}

export function insertTransaction(tx: Omit<StoredTransaction, 'timestamp'>): void {
  const stmt = db.prepare(`
    INSERT INTO transactions (
      id, date, description, amount, category, beneficiary, timestamp,
      source_connector_type, source_external_id, source_imported_at,
      match_id, match_is_primary, match_pattern_type, match_source,
      match_confidence, match_linked_ids, transaction_type, exclude_from_stats,
      is_context_only, linked_order_ids, detected_platform,
      subcategory, category_confidence, categorized_at, categorized_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    tx.id,
    tx.date,
    tx.description,
    tx.amount,
    tx.category || '',
    tx.beneficiary || null,
    new Date().toISOString(),
    tx.source?.connectorType || null,
    tx.source?.externalId || null,
    tx.source?.importedAt || null,
    tx.matchId || null,
    tx.matchInfo?.isPrimary ? 1 : 0,
    tx.matchInfo?.patternType || null,
    tx.matchInfo?.source || null,
    tx.matchInfo?.confidence || null,
    tx.matchInfo?.linkedTransactionIds ? JSON.stringify(tx.matchInfo.linkedTransactionIds) : null,
    tx.transactionType || null,
    tx.excludeFromStats ? 1 : 0,
    tx.isContextOnly ? 1 : 0,
    tx.linkedOrderIds ? JSON.stringify(tx.linkedOrderIds) : '[]',
    tx.detectedPlatform || null,
    tx.subcategory || null,
    tx.categoryConfidence || null,
    tx.categorizedAt || null,
    tx.categorizedBy || null
  );
}

export function updateTransaction(tx: StoredTransaction): void {
  const stmt = db.prepare(`
    UPDATE transactions SET
      date = ?, description = ?, amount = ?, category = ?, beneficiary = ?,
      source_connector_type = ?, source_external_id = ?, source_imported_at = ?,
      match_id = ?, match_is_primary = ?, match_pattern_type = ?, match_source = ?,
      match_confidence = ?, match_linked_ids = ?, transaction_type = ?, exclude_from_stats = ?,
      is_context_only = ?, linked_order_ids = ?, detected_platform = ?,
      subcategory = ?, category_confidence = ?, categorized_at = ?, categorized_by = ?,
      timestamp = ?
    WHERE id = ?
  `);

  stmt.run(
    tx.date,
    tx.description,
    tx.amount,
    tx.category || '',
    tx.beneficiary || null,
    tx.source?.connectorType || null,
    tx.source?.externalId || null,
    tx.source?.importedAt || null,
    tx.matchId || null,
    tx.matchInfo?.isPrimary ? 1 : 0,
    tx.matchInfo?.patternType || null,
    tx.matchInfo?.source || null,
    tx.matchInfo?.confidence || null,
    tx.matchInfo?.linkedTransactionIds ? JSON.stringify(tx.matchInfo.linkedTransactionIds) : null,
    tx.transactionType || null,
    tx.excludeFromStats ? 1 : 0,
    tx.isContextOnly ? 1 : 0,
    tx.linkedOrderIds ? JSON.stringify(tx.linkedOrderIds) : '[]',
    tx.detectedPlatform || null,
    tx.subcategory || null,
    tx.categoryConfidence || null,
    tx.categorizedAt || null,
    tx.categorizedBy || null,
    new Date().toISOString(),
    tx.id
  );
}

export function deleteTransaction(id: string): boolean {
  const result = db.prepare(`DELETE FROM transactions WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function clearAllTransactions(keepContextOnly: boolean = true): number {
  if (keepContextOnly) {
    const result = db.prepare(`DELETE FROM transactions WHERE is_context_only = 0 OR is_context_only IS NULL`).run();
    return result.changes;
  } else {
    const result = db.prepare(`DELETE FROM transactions`).run();
    return result.changes;
  }
}

export function bulkUpdateTransactions(transactions: StoredTransaction[]): void {
  const update = db.transaction((txs: StoredTransaction[]) => {
    for (const tx of txs) {
      updateTransaction(tx);
    }
  });
  update(transactions);
}

export function checkDuplicateByExternalId(connectorType: string, externalId: string): boolean {
  const row = db.prepare(`
    SELECT 1 FROM transactions
    WHERE source_connector_type = ? AND source_external_id = ?
    LIMIT 1
  `).get(connectorType, externalId);
  return !!row;
}

export function checkDuplicateBySignature(date: string, amount: number, descriptionPrefix: string): boolean {
  const dateKey = date.split('T')[0];
  const row = db.prepare(`
    SELECT 1 FROM transactions
    WHERE date LIKE ? AND ABS(amount - ?) < 0.01 AND description LIKE ?
    LIMIT 1
  `).get(`${dateKey}%`, amount, `${descriptionPrefix}%`);
  return !!row;
}
