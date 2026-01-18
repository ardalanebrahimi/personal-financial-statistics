/**
 * Recurring Pattern Repository
 *
 * Database operations for recurring transaction patterns.
 */

import { db } from '../connection';

export interface RecurringPattern {
  id: string;
  beneficiary: string;
  averageAmount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'irregular';
  averageIntervalDays: number;
  confidence: 'high' | 'medium' | 'low';
  transactionIds: string[];
  firstOccurrence: string;
  lastOccurrence: string;
  occurrenceCount: number;
  category?: string;
  isActive: boolean;
  nextExpectedDate?: string;
  amountVariance: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

function rowToRecurringPattern(row: any): RecurringPattern {
  return {
    id: row.id,
    beneficiary: row.beneficiary,
    averageAmount: row.average_amount,
    frequency: row.frequency,
    averageIntervalDays: row.average_interval_days,
    confidence: row.confidence,
    transactionIds: JSON.parse(row.transaction_ids || '[]'),
    firstOccurrence: row.first_occurrence,
    lastOccurrence: row.last_occurrence,
    occurrenceCount: row.occurrence_count,
    category: row.category,
    isActive: row.is_active === 1,
    nextExpectedDate: row.next_expected_date,
    amountVariance: row.amount_variance,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function getAllRecurringPatterns(): RecurringPattern[] {
  const rows = db.prepare(`
    SELECT * FROM recurring_patterns ORDER BY is_active DESC, last_occurrence DESC
  `).all() as any[];
  return rows.map(rowToRecurringPattern);
}

export function getActiveRecurringPatterns(): RecurringPattern[] {
  const rows = db.prepare(`
    SELECT * FROM recurring_patterns WHERE is_active = 1 ORDER BY last_occurrence DESC
  `).all() as any[];
  return rows.map(rowToRecurringPattern);
}

export function getRecurringPatternById(id: string): RecurringPattern | null {
  const row = db.prepare(`SELECT * FROM recurring_patterns WHERE id = ?`).get(id) as any;
  return row ? rowToRecurringPattern(row) : null;
}

export function saveRecurringPattern(pattern: RecurringPattern): void {
  const now = new Date().toISOString();
  const existing = getRecurringPatternById(pattern.id);

  if (existing) {
    db.prepare(`
      UPDATE recurring_patterns SET
        beneficiary = ?, average_amount = ?, frequency = ?, average_interval_days = ?,
        confidence = ?, transaction_ids = ?, first_occurrence = ?, last_occurrence = ?,
        occurrence_count = ?, category = ?, is_active = ?, next_expected_date = ?,
        amount_variance = ?, description = ?, updated_at = ?
      WHERE id = ?
    `).run(
      pattern.beneficiary,
      pattern.averageAmount,
      pattern.frequency,
      pattern.averageIntervalDays,
      pattern.confidence,
      JSON.stringify(pattern.transactionIds),
      pattern.firstOccurrence,
      pattern.lastOccurrence,
      pattern.occurrenceCount,
      pattern.category || null,
      pattern.isActive ? 1 : 0,
      pattern.nextExpectedDate || null,
      pattern.amountVariance,
      pattern.description || null,
      now,
      pattern.id
    );
  } else {
    db.prepare(`
      INSERT INTO recurring_patterns (
        id, beneficiary, average_amount, frequency, average_interval_days,
        confidence, transaction_ids, first_occurrence, last_occurrence,
        occurrence_count, category, is_active, next_expected_date,
        amount_variance, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      pattern.id,
      pattern.beneficiary,
      pattern.averageAmount,
      pattern.frequency,
      pattern.averageIntervalDays,
      pattern.confidence,
      JSON.stringify(pattern.transactionIds),
      pattern.firstOccurrence,
      pattern.lastOccurrence,
      pattern.occurrenceCount,
      pattern.category || null,
      pattern.isActive ? 1 : 0,
      pattern.nextExpectedDate || null,
      pattern.amountVariance,
      pattern.description || null,
      now,
      now
    );
  }
}

export function saveRecurringPatterns(patterns: RecurringPattern[]): void {
  const insertMany = db.transaction(() => {
    for (const pattern of patterns) {
      saveRecurringPattern(pattern);
    }
  });
  insertMany();
}

export function deleteRecurringPattern(id: string): void {
  db.prepare(`DELETE FROM recurring_patterns WHERE id = ?`).run(id);
}

export function clearRecurringPatterns(): void {
  db.prepare(`DELETE FROM recurring_patterns`).run();
}
