/**
 * Database Migrations
 *
 * Handles database schema migrations for existing tables.
 */

import { db } from './connection';

export function runMigrations(): void {
  // Check if credentials columns exist in connectors table
  const connectorColumns = db.prepare(`PRAGMA table_info(connectors)`).all() as any[];
  const connectorColumnNames = connectorColumns.map((c: any) => c.name);

  if (!connectorColumnNames.includes('credentials_encrypted')) {
    console.log('[Database] Running migration: Adding credentials columns to connectors table...');
    db.exec(`
      ALTER TABLE connectors ADD COLUMN credentials_encrypted TEXT;
      ALTER TABLE connectors ADD COLUMN credentials_saved_at TEXT;
      ALTER TABLE connectors ADD COLUMN auto_connect INTEGER DEFAULT 0;
    `);
    console.log('[Database] Migration complete: credentials columns added');
  }

  // Check if context/order linking columns exist in transactions table
  const transactionColumns = db.prepare(`PRAGMA table_info(transactions)`).all() as any[];
  const txColumnNames = transactionColumns.map((c: any) => c.name);

  if (!txColumnNames.includes('is_context_only')) {
    console.log('[Database] Running migration: Adding context/order linking columns to transactions table...');
    db.exec(`
      ALTER TABLE transactions ADD COLUMN is_context_only INTEGER DEFAULT 0;
      ALTER TABLE transactions ADD COLUMN linked_order_ids TEXT DEFAULT '[]';
    `);
    console.log('[Database] Migration complete: context/order linking columns added');

    // Mark existing Amazon transactions as context-only
    const amazonUpdated = db.prepare(`
      UPDATE transactions SET is_context_only = 1
      WHERE source_connector_type = 'amazon'
    `).run();
    console.log(`[Database] Marked ${amazonUpdated.changes} Amazon transactions as context-only`);
  }

  // Migration: Add detected_platform column
  if (!txColumnNames.includes('detected_platform')) {
    console.log('[Database] Running migration: Adding detected_platform column to transactions table...');
    db.exec(`
      ALTER TABLE transactions ADD COLUMN detected_platform TEXT;
    `);
    console.log('[Database] Migration complete: detected_platform column added');
  }

  // Migration: Add subcategory and categorization tracking fields
  if (!txColumnNames.includes('subcategory')) {
    console.log('[Database] Running migration: Adding categorization fields to transactions table...');
    db.exec(`
      ALTER TABLE transactions ADD COLUMN subcategory TEXT;
      ALTER TABLE transactions ADD COLUMN category_confidence INTEGER;
      ALTER TABLE transactions ADD COLUMN categorized_at TEXT;
      ALTER TABLE transactions ADD COLUMN categorized_by TEXT CHECK(categorized_by IS NULL OR categorized_by IN ('ai', 'user', 'rule'));
    `);
    console.log('[Database] Migration complete: categorization fields added');
  }

  // Migration: Add hierarchy fields to categories table
  const categoryColumns = db.prepare(`PRAGMA table_info(categories)`).all() as any[];
  const catColumnNames = categoryColumns.map((c: any) => c.name);

  if (!catColumnNames.includes('parent_id')) {
    console.log('[Database] Running migration: Adding hierarchy fields to categories table...');
    db.exec(`
      ALTER TABLE categories ADD COLUMN parent_id TEXT;
      ALTER TABLE categories ADD COLUMN is_subcategory INTEGER DEFAULT 0;
    `);
    console.log('[Database] Migration complete: category hierarchy fields added');
  }
}

export function checkAndRunMigrations(): void {
  try {
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as any[];
    const tableNames = tables.map(t => t.name);

    if (tableNames.includes('connectors') || tableNames.includes('transactions')) {
      runMigrations();
    }
  } catch (error) {
    console.error('[Database] Migration error:', error);
  }
}
