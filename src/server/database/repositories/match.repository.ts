/**
 * Match Repository
 *
 * Database operations for transaction matches.
 */

import { db } from '../connection';
import type { MatchPatternType, MatchSource, MatchConfidence } from '../../matching/matcher';

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
  notes?: string;
}

export function getAllMatches(): TransactionMatch[] {
  const rows = db.prepare(`SELECT * FROM matches`).all() as any[];
  return rows.map(row => ({
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    patternType: row.pattern_type,
    source: row.source,
    confidence: row.confidence,
    primaryTransactionId: row.primary_transaction_id,
    linkedTransactionIds: JSON.parse(row.linked_transaction_ids),
    matchedAmount: row.matched_amount || 0,
    notes: row.notes || undefined
  }));
}

export function insertMatch(match: TransactionMatch): void {
  db.prepare(`
    INSERT INTO matches (id, created_at, updated_at, pattern_type, source, confidence,
                        primary_transaction_id, linked_transaction_ids, matched_amount, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    match.id,
    match.createdAt,
    match.updatedAt,
    match.patternType,
    match.source,
    match.confidence,
    match.primaryTransactionId,
    JSON.stringify(match.linkedTransactionIds),
    match.matchedAmount || null,
    match.notes || null
  );
}

export function deleteMatch(id: string): boolean {
  const result = db.prepare(`DELETE FROM matches WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function saveMatches(matches: TransactionMatch[]): void {
  const save = db.transaction((ms: TransactionMatch[]) => {
    db.prepare(`DELETE FROM matches`).run();
    for (const match of ms) {
      insertMatch(match);
    }
  });
  save(matches);
}
