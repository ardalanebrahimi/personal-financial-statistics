/**
 * Category Repository
 *
 * Database operations for categories.
 */

import { db } from '../connection';

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
    db.prepare(`DELETE FROM categories`).run();

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

export function initializeDefaultCategories(): void {
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
}
