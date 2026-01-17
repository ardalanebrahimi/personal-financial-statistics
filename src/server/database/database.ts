/**
 * SQLite Database Service
 *
 * Handles all database operations for the personal finance application.
 * Uses better-sqlite3 for synchronous, fast SQLite access.
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import type { MatchPatternType, MatchSource, MatchConfidence } from '../matching/matcher';
import type { ConnectorType } from '../connectors/connector-manager';
import type { RuleCondition, RuleAction } from '../ai/rules-engine';

// Database file location (outside of assets, in a data folder)
const DB_PATH = join(__dirname, '../../data/finance.db');
const DATA_DIR = join(__dirname, '../../data');

// Ensure data directory exists
import { mkdirSync } from 'fs';
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database connection
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Better performance for concurrent reads

// ==================== MIGRATIONS ====================

function runMigrations(): void {
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
}

// Run migrations before schema (in case table exists but missing columns)
try {
  // Check if tables exist and run migrations
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as any[];
  const tableNames = tables.map(t => t.name);

  if (tableNames.includes('connectors') || tableNames.includes('transactions')) {
    runMigrations();
  }
} catch (error) {
  console.error('[Database] Migration error:', error);
}

// ==================== SCHEMA ====================

const SCHEMA = `
-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT DEFAULT '',
  beneficiary TEXT,
  timestamp TEXT NOT NULL,

  -- Source information (for imported transactions)
  source_connector_type TEXT,
  source_external_id TEXT,
  source_imported_at TEXT,

  -- Matching information
  match_id TEXT,
  match_is_primary INTEGER,
  match_pattern_type TEXT,
  match_source TEXT,
  match_confidence TEXT,
  match_linked_ids TEXT, -- JSON array of linked transaction IDs

  -- Transaction classification
  transaction_type TEXT CHECK(transaction_type IN ('expense', 'income', 'transfer', 'internal')),
  exclude_from_stats INTEGER DEFAULT 0,

  -- Context/Order linking
  is_context_only INTEGER DEFAULT 0,  -- True for items that provide context but aren't real bank transactions (e.g., Amazon orders)
  linked_order_ids TEXT DEFAULT '[]'  -- JSON array of IDs of context-only transactions linked to this bank transaction
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT,
  keywords TEXT -- JSON array
);

-- Connectors table
CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  bank_code TEXT,
  account_id TEXT,
  last_sync_at TEXT,
  last_sync_status TEXT CHECK(last_sync_status IN ('success', 'partial', 'failed')),
  last_sync_error TEXT,
  -- Encrypted credentials storage
  credentials_encrypted TEXT,
  credentials_saved_at TEXT,
  auto_connect INTEGER DEFAULT 0
);

-- Matches table
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  pattern_type TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence TEXT NOT NULL,
  primary_transaction_id TEXT NOT NULL,
  linked_transaction_ids TEXT NOT NULL, -- JSON array
  matched_amount REAL,
  notes TEXT,
  FOREIGN KEY (primary_transaction_id) REFERENCES transactions(id)
);

-- Rules table (for AI categorization)
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  conditions TEXT NOT NULL, -- JSON object
  actions TEXT NOT NULL, -- JSON object
  priority INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT CHECK(source IN ('auto', 'manual', 'correction')),
  confidence REAL DEFAULT 0.5,
  times_applied INTEGER DEFAULT 0,
  last_applied_at TEXT
);

-- Automation config table
CREATE TABLE IF NOT EXISTS automation_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source_connector_type);
CREATE INDEX IF NOT EXISTS idx_transactions_match ON transactions(match_id);
CREATE INDEX IF NOT EXISTS idx_transactions_context ON transactions(is_context_only);
CREATE INDEX IF NOT EXISTS idx_matches_primary ON matches(primary_transaction_id);
CREATE INDEX IF NOT EXISTS idx_rules_enabled ON rules(enabled, priority);
`;

// Initialize schema
db.exec(SCHEMA);

// ==================== TRANSACTION OPERATIONS ====================

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
  // Context/Order linking fields
  isContextOnly?: boolean;     // True for items that provide context but aren't real bank transactions
  linkedOrderIds?: string[];   // IDs of context-only transactions (orders) linked to this bank transaction
}

export function getAllTransactions(): StoredTransaction[] {
  const rows = db.prepare(`
    SELECT * FROM transactions ORDER BY date DESC
  `).all() as any[];

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
      is_context_only, linked_order_ids
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?
    )
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
    tx.linkedOrderIds ? JSON.stringify(tx.linkedOrderIds) : '[]'
  );
}

export function updateTransaction(tx: StoredTransaction): void {
  const stmt = db.prepare(`
    UPDATE transactions SET
      date = ?, description = ?, amount = ?, category = ?, beneficiary = ?,
      source_connector_type = ?, source_external_id = ?, source_imported_at = ?,
      match_id = ?, match_is_primary = ?, match_pattern_type = ?, match_source = ?,
      match_confidence = ?, match_linked_ids = ?, transaction_type = ?, exclude_from_stats = ?,
      is_context_only = ?, linked_order_ids = ?,
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
    new Date().toISOString(),
    tx.id
  );
}

export function deleteTransaction(id: string): boolean {
  const result = db.prepare(`DELETE FROM transactions WHERE id = ?`).run(id);
  return result.changes > 0;
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

  if (row.transaction_type) {
    tx.transactionType = row.transaction_type;
  }

  if (row.exclude_from_stats) {
    tx.excludeFromStats = row.exclude_from_stats === 1;
  }

  // Context/Order linking fields
  if (row.is_context_only) {
    tx.isContextOnly = row.is_context_only === 1;
  }

  if (row.linked_order_ids) {
    try {
      tx.linkedOrderIds = JSON.parse(row.linked_order_ids);
    } catch {
      tx.linkedOrderIds = [];
    }
  }

  return tx;
}

// ==================== CATEGORY OPERATIONS ====================

export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  keywords?: string[];
}

export function getAllCategories(): Category[] {
  const rows = db.prepare(`SELECT * FROM categories ORDER BY name`).all() as any[];
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    color: row.color || undefined,
    keywords: row.keywords ? JSON.parse(row.keywords) : undefined
  }));
}

export function saveCategories(categories: Category[]): void {
  const upsert = db.transaction((cats: Category[]) => {
    // Clear existing
    db.prepare(`DELETE FROM categories`).run();

    // Insert all
    const stmt = db.prepare(`
      INSERT INTO categories (id, name, description, color, keywords)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const cat of cats) {
      stmt.run(
        cat.id,
        cat.name,
        cat.description || null,
        cat.color || null,
        cat.keywords ? JSON.stringify(cat.keywords) : null
      );
    }
  });
  upsert(categories);
}

// ==================== CONNECTOR OPERATIONS ====================

export interface ConnectorConfig {
  id: string;
  type: ConnectorType;
  name: string;
  enabled: boolean;
  bankCode?: string;
  accountId?: string;
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'partial' | 'failed';
  lastSyncError?: string;
  // Credential storage
  credentialsEncrypted?: string;
  credentialsSavedAt?: string;
  autoConnect?: boolean;
}

function rowToConnector(row: any): ConnectorConfig {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    enabled: row.enabled === 1,
    bankCode: row.bank_code || undefined,
    accountId: row.account_id || undefined,
    lastSyncAt: row.last_sync_at || undefined,
    lastSyncStatus: row.last_sync_status || undefined,
    lastSyncError: row.last_sync_error || undefined,
    credentialsEncrypted: row.credentials_encrypted || undefined,
    credentialsSavedAt: row.credentials_saved_at || undefined,
    autoConnect: row.auto_connect === 1
  };
}

export function getAllConnectors(): ConnectorConfig[] {
  const rows = db.prepare(`SELECT * FROM connectors`).all() as any[];
  return rows.map(rowToConnector);
}

export function getConnectorById(id: string): ConnectorConfig | null {
  const row = db.prepare(`SELECT * FROM connectors WHERE id = ?`).get(id) as any;
  if (!row) return null;
  return rowToConnector(row);
}

export function getConnectorsWithCredentials(): ConnectorConfig[] {
  const rows = db.prepare(`
    SELECT * FROM connectors
    WHERE credentials_encrypted IS NOT NULL AND auto_connect = 1
  `).all() as any[];
  return rows.map(rowToConnector);
}

export function insertConnector(connector: ConnectorConfig): void {
  db.prepare(`
    INSERT INTO connectors (id, type, name, enabled, bank_code, account_id,
      last_sync_at, last_sync_status, last_sync_error,
      credentials_encrypted, credentials_saved_at, auto_connect)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    connector.id,
    connector.type,
    connector.name,
    connector.enabled ? 1 : 0,
    connector.bankCode || null,
    connector.accountId || null,
    connector.lastSyncAt || null,
    connector.lastSyncStatus || null,
    connector.lastSyncError || null,
    connector.credentialsEncrypted || null,
    connector.credentialsSavedAt || null,
    connector.autoConnect ? 1 : 0
  );
}

export function updateConnector(connector: ConnectorConfig): void {
  db.prepare(`
    UPDATE connectors SET
      type = ?, name = ?, enabled = ?, bank_code = ?, account_id = ?,
      last_sync_at = ?, last_sync_status = ?, last_sync_error = ?,
      credentials_encrypted = ?, credentials_saved_at = ?, auto_connect = ?
    WHERE id = ?
  `).run(
    connector.type,
    connector.name,
    connector.enabled ? 1 : 0,
    connector.bankCode || null,
    connector.accountId || null,
    connector.lastSyncAt || null,
    connector.lastSyncStatus || null,
    connector.lastSyncError || null,
    connector.credentialsEncrypted || null,
    connector.credentialsSavedAt || null,
    connector.autoConnect ? 1 : 0,
    connector.id
  );
}

export function deleteConnector(id: string): boolean {
  const result = db.prepare(`DELETE FROM connectors WHERE id = ?`).run(id);
  return result.changes > 0;
}

// ==================== MATCH OPERATIONS ====================

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

// ==================== RULE OPERATIONS ====================

export interface Rule {
  id: string;
  createdAt: string;
  updatedAt: string;
  conditions: RuleCondition[];
  conditionOperator: 'AND' | 'OR';
  action: RuleAction;
  source: 'auto' | 'manual' | 'correction';
  confidence: number;
  usageCount: number;
  lastUsedAt?: string;
  enabled: boolean;
  correctionHistory?: {
    originalCategory?: string;
    correctedCategory: string;
    transactionId: string;
    timestamp: string;
  }[];
}

export function getAllRules(): Rule[] {
  const rows = db.prepare(`SELECT * FROM rules ORDER BY priority DESC, confidence DESC`).all() as any[];
  return rows.map(row => {
    const conditionsData = JSON.parse(row.conditions);
    const actionsData = JSON.parse(row.actions);
    return {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      conditions: conditionsData.conditions || conditionsData,
      conditionOperator: conditionsData.operator || 'AND',
      action: actionsData.action || actionsData,
      source: row.source,
      confidence: row.confidence,
      usageCount: row.times_applied,
      lastUsedAt: row.last_applied_at || undefined,
      enabled: row.enabled === 1,
      correctionHistory: actionsData.correctionHistory
    };
  });
}

export function insertRule(rule: Rule): void {
  const conditionsData = { conditions: rule.conditions, operator: rule.conditionOperator };
  const actionsData = { action: rule.action, correctionHistory: rule.correctionHistory };
  db.prepare(`
    INSERT INTO rules (id, name, conditions, actions, priority, enabled,
                      created_at, updated_at, source, confidence, times_applied, last_applied_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    rule.id,
    '',  // name not in new interface, store empty
    JSON.stringify(conditionsData),
    JSON.stringify(actionsData),
    0,   // priority not in new interface, default to 0
    rule.enabled ? 1 : 0,
    rule.createdAt,
    rule.updatedAt,
    rule.source,
    rule.confidence,
    rule.usageCount,
    rule.lastUsedAt || null
  );
}

export function updateRule(rule: Rule): void {
  const conditionsData = { conditions: rule.conditions, operator: rule.conditionOperator };
  const actionsData = { action: rule.action, correctionHistory: rule.correctionHistory };
  db.prepare(`
    UPDATE rules SET
      name = ?, conditions = ?, actions = ?, priority = ?, enabled = ?,
      updated_at = ?, source = ?, confidence = ?, times_applied = ?, last_applied_at = ?
    WHERE id = ?
  `).run(
    '',  // name not in new interface
    JSON.stringify(conditionsData),
    JSON.stringify(actionsData),
    0,   // priority not in new interface
    rule.enabled ? 1 : 0,
    rule.updatedAt,
    rule.source,
    rule.confidence,
    rule.usageCount,
    rule.lastUsedAt || null,
    rule.id
  );
}

export function deleteRule(id: string): boolean {
  const result = db.prepare(`DELETE FROM rules WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function saveRules(rules: Rule[]): void {
  const save = db.transaction((rs: Rule[]) => {
    db.prepare(`DELETE FROM rules`).run();
    for (const rule of rs) {
      insertRule(rule);
    }
  });
  save(rules);
}

// ==================== AUTOMATION CONFIG ====================

export interface AutomationConfig {
  autoCategorize: boolean;
  autoMatch: boolean;
  scheduledSync: {
    enabled: boolean;
    intervalMinutes: number;
  };
  notifyOnNewTransactions: boolean;
}

const DEFAULT_AUTOMATION_CONFIG: AutomationConfig = {
  autoCategorize: true,
  autoMatch: true,
  scheduledSync: { enabled: false, intervalMinutes: 60 },
  notifyOnNewTransactions: true
};

export function getAutomationConfig(): AutomationConfig {
  const row = db.prepare(`SELECT value FROM automation_config WHERE key = 'config'`).get() as any;
  if (row) {
    return JSON.parse(row.value);
  }
  return DEFAULT_AUTOMATION_CONFIG;
}

export function saveAutomationConfig(config: AutomationConfig): void {
  db.prepare(`
    INSERT OR REPLACE INTO automation_config (key, value)
    VALUES ('config', ?)
  `).run(JSON.stringify(config));
}

// ==================== MIGRATION FROM JSON ====================

export function migrateFromJson(): { migrated: boolean; stats: any } {
  const ASSETS_DIR = join(__dirname, '../../assets');
  const stats = {
    transactions: 0,
    categories: 0,
    connectors: 0,
    matches: 0,
    rules: 0
  };

  // Check if migration is needed (database empty and JSON files exist)
  const txCount = (db.prepare(`SELECT COUNT(*) as count FROM transactions`).get() as any).count;
  if (txCount > 0) {
    console.log('[Database] Data already exists, skipping migration');
    return { migrated: false, stats };
  }

  console.log('[Database] Starting migration from JSON files...');

  const migrate = db.transaction(() => {
    // Migrate transactions
    const txFile = join(ASSETS_DIR, 'transactions.json');
    if (existsSync(txFile)) {
      try {
        const transactions = JSON.parse(readFileSync(txFile, 'utf8'));
        for (const tx of transactions) {
          insertTransaction(tx);
          stats.transactions++;
        }
        console.log(`[Database] Migrated ${stats.transactions} transactions`);
      } catch (e) {
        console.error('[Database] Failed to migrate transactions:', e);
      }
    }

    // Migrate categories
    const catFile = join(ASSETS_DIR, 'categories.json');
    if (existsSync(catFile)) {
      try {
        const data = JSON.parse(readFileSync(catFile, 'utf8'));
        const categories = data.categories || [];
        saveCategories(categories);
        stats.categories = categories.length;
        console.log(`[Database] Migrated ${stats.categories} categories`);
      } catch (e) {
        console.error('[Database] Failed to migrate categories:', e);
      }
    }

    // Migrate connectors
    const connFile = join(ASSETS_DIR, 'connectors.json');
    if (existsSync(connFile)) {
      try {
        const data = JSON.parse(readFileSync(connFile, 'utf8'));
        const connectors = data.connectors || [];
        for (const conn of connectors) {
          insertConnector(conn);
          stats.connectors++;
        }
        console.log(`[Database] Migrated ${stats.connectors} connectors`);
      } catch (e) {
        console.error('[Database] Failed to migrate connectors:', e);
      }
    }

    // Migrate matches
    const matchFile = join(ASSETS_DIR, 'matches.json');
    if (existsSync(matchFile)) {
      try {
        const data = JSON.parse(readFileSync(matchFile, 'utf8'));
        const matches = data.matches || [];
        saveMatches(matches);
        stats.matches = matches.length;
        console.log(`[Database] Migrated ${stats.matches} matches`);
      } catch (e) {
        console.error('[Database] Failed to migrate matches:', e);
      }
    }

    // Migrate rules
    const rulesFile = join(ASSETS_DIR, 'rules.json');
    if (existsSync(rulesFile)) {
      try {
        const data = JSON.parse(readFileSync(rulesFile, 'utf8'));
        const rules = data.rules || [];
        saveRules(rules);
        stats.rules = rules.length;
        console.log(`[Database] Migrated ${stats.rules} rules`);
      } catch (e) {
        console.error('[Database] Failed to migrate rules:', e);
      }
    }

    // Migrate automation config
    const autoFile = join(ASSETS_DIR, 'automation-config.json');
    if (existsSync(autoFile)) {
      try {
        const config = JSON.parse(readFileSync(autoFile, 'utf8'));
        saveAutomationConfig(config);
        console.log('[Database] Migrated automation config');
      } catch (e) {
        console.error('[Database] Failed to migrate automation config:', e);
      }
    }
  });

  migrate();

  console.log('[Database] Migration complete!', stats);
  return { migrated: true, stats };
}

// ==================== DATABASE UTILITIES ====================

export function getDatabase(): Database.Database {
  return db;
}

export function closeDatabase(): void {
  db.close();
}

// Initialize default categories if none exist
const categoryCount = (db.prepare(`SELECT COUNT(*) as count FROM categories`).get() as any).count;
if (categoryCount === 0) {
  console.log('[Database] Initializing default categories...');
  const defaultCategories: Category[] = [
    { id: '1', name: 'Groceries', description: 'Food and household items', color: '#4CAF50' },
    { id: '2', name: 'Transportation', description: 'Public transit, gas, car expenses', color: '#2196F3' },
    { id: '3', name: 'Utilities', description: 'Electricity, water, internet', color: '#FF9800' },
    { id: '4', name: 'Entertainment', description: 'Movies, games, subscriptions', color: '#9C27B0' },
    { id: '5', name: 'Housing', description: 'Rent, mortgage, repairs', color: '#795548' },
    { id: '6', name: 'Insurance', description: 'Health, car, home insurance', color: '#607D8B' },
    { id: '7', name: 'Savings', description: 'Transfers to savings accounts', color: '#00BCD4' },
    { id: '8', name: 'Income', description: 'Salary, freelance, dividends', color: '#8BC34A' },
    { id: '9', name: 'Shopping', description: 'Clothing, electronics, online purchases', color: '#E91E63' },
    { id: '10', name: 'Dining', description: 'Restaurants, cafes, takeout', color: '#FF5722' }
  ];
  saveCategories(defaultCategories);
  console.log('[Database] Default categories created');
}

console.log('[Database] SQLite database initialized at:', DB_PATH);
