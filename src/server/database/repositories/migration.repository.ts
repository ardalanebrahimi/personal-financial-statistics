/**
 * Migration Repository
 *
 * Handles migration from JSON files to SQLite.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { db } from '../connection';
import { insertTransaction, StoredTransaction } from './transaction.repository';
import { saveCategories, Category } from './category.repository';
import { insertConnector, ConnectorConfig } from './connector.repository';
import { saveMatches, TransactionMatch } from './match.repository';
import { saveRules, Rule } from './rule.repository';
import { saveAutomationConfig, AutomationConfig } from './automation.repository';

const ASSETS_DIR = join(__dirname, '../../../assets');

export function migrateFromJson(): { migrated: boolean; stats: any } {
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
