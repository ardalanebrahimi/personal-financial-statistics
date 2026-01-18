/**
 * SQLite Database Service
 *
 * Main entry point for database operations.
 * Re-exports all repositories for backward compatibility.
 */

import { db, DB_PATH, getDatabase, closeDatabase } from './connection';
import { initializeSchema } from './schema';
import { checkAndRunMigrations } from './migrations';
import { initializeDefaultCategories } from './repositories/category.repository';

// Run migrations before schema (in case table exists but missing columns)
checkAndRunMigrations();

// Initialize schema
initializeSchema();

// Initialize default categories if none exist
initializeDefaultCategories();

console.log('[Database] SQLite database initialized at:', DB_PATH);

// Re-export everything for backward compatibility
export { db, getDatabase, closeDatabase } from './connection';
export { SCHEMA, initializeSchema } from './schema';
export { runMigrations, checkAndRunMigrations } from './migrations';

// Re-export all repositories
export * from './repositories';
