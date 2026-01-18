/**
 * Database Schema
 *
 * SQL schema definitions for all tables.
 */

import { db } from './connection';

export const SCHEMA = `
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
  is_context_only INTEGER DEFAULT 0,
  linked_order_ids TEXT DEFAULT '[]',

  -- Platform detection
  detected_platform TEXT CHECK(detected_platform IS NULL OR detected_platform IN ('amazon', 'paypal')),

  -- Categorization tracking
  subcategory TEXT,
  category_confidence INTEGER,
  categorized_at TEXT,
  categorized_by TEXT CHECK(categorized_by IS NULL OR categorized_by IN ('ai', 'user', 'rule'))
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT,
  keywords TEXT,
  parent_id TEXT,
  is_subcategory INTEGER DEFAULT 0
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
  linked_transaction_ids TEXT NOT NULL,
  matched_amount REAL,
  notes TEXT,
  FOREIGN KEY (primary_transaction_id) REFERENCES transactions(id)
);

-- Rules table (for AI categorization)
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  conditions TEXT NOT NULL,
  actions TEXT NOT NULL,
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

-- Background jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  progress INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  processed INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  error_details TEXT DEFAULT '[]',
  result TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  file_name TEXT,
  file_path TEXT
);

-- Categorization jobs table
CREATE TABLE IF NOT EXISTS categorization_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'paused', 'completed', 'failed', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  transaction_ids TEXT NOT NULL DEFAULT '[]',
  include_already_categorized INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  applied_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  corrected_count INTEGER DEFAULT 0,
  results TEXT DEFAULT '[]',
  conversation_history TEXT DEFAULT '[]',
  errors TEXT DEFAULT '[]'
);

-- Recurring patterns table
CREATE TABLE IF NOT EXISTS recurring_patterns (
  id TEXT PRIMARY KEY,
  beneficiary TEXT NOT NULL,
  average_amount REAL NOT NULL,
  frequency TEXT NOT NULL CHECK(frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly', 'irregular')),
  average_interval_days INTEGER NOT NULL,
  confidence TEXT NOT NULL CHECK(confidence IN ('high', 'medium', 'low')),
  transaction_ids TEXT NOT NULL,
  first_occurrence TEXT NOT NULL,
  last_occurrence TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL,
  category TEXT,
  is_active INTEGER DEFAULT 1,
  next_expected_date TEXT,
  amount_variance REAL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source_connector_type);
CREATE INDEX IF NOT EXISTS idx_transactions_match ON transactions(match_id);
CREATE INDEX IF NOT EXISTS idx_transactions_context ON transactions(is_context_only);
CREATE INDEX IF NOT EXISTS idx_matches_primary ON matches(primary_transaction_id);
CREATE INDEX IF NOT EXISTS idx_rules_enabled ON rules(enabled, priority);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_recurring_beneficiary ON recurring_patterns(beneficiary);
CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_patterns(is_active);
CREATE INDEX IF NOT EXISTS idx_categorization_jobs_status ON categorization_jobs(status);
`;

export function initializeSchema(): void {
  db.exec(SCHEMA);
}
