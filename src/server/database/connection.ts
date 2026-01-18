/**
 * Database Connection
 *
 * Initializes and manages the SQLite database connection.
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Database file location
const DB_PATH = join(__dirname, '../../data/finance.db');
const DATA_DIR = join(__dirname, '../../data');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database connection
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Better performance for concurrent reads

export function getDatabase(): Database.Database {
  return db;
}

export function closeDatabase(): void {
  db.close();
}

export { db, DB_PATH };
