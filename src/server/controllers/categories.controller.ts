/**
 * Categories Controller
 *
 * Handles HTTP requests for category management.
 */

import { Request, Response } from 'express';
import * as db from '../database/database';
import { AppError } from '../middleware';

const FORBIDDEN_CATEGORIES = [
  'online shopping', 'new category', 'uncategorized', 'other',
  'misc', 'miscellaneous', 'general', 'shopping'
];

/**
 * GET /categories
 * Retrieve all categories.
 */
export async function getAll(req: Request, res: Response): Promise<void> {
  const categories = db.getAllCategories();
  res.json({ categories });
}

/**
 * PUT /categories
 * Save/update categories list.
 */
export async function save(req: Request, res: Response): Promise<void> {
  if (!Array.isArray(req.body)) {
    throw AppError.badRequest('Request body must be an array of categories');
  }
  db.saveCategories(req.body);
  res.sendStatus(200);
}

/**
 * POST /categories/cleanup
 * Remove forbidden/meaningless categories and reset affected transactions.
 */
export async function cleanup(req: Request, res: Response): Promise<void> {
  // Get all categories and filter out forbidden ones
  const allCategories = db.getAllCategories();
  const categoriesToRemove = allCategories.filter(c =>
    FORBIDDEN_CATEGORIES.includes(c.name.toLowerCase())
  );
  const categoriesToKeep = allCategories.filter(c =>
    !FORBIDDEN_CATEGORIES.includes(c.name.toLowerCase())
  );

  // Get transactions with forbidden categories and reset them
  const transactions = db.getAllTransactions();
  let resetCount = 0;

  for (const tx of transactions) {
    if (tx.category && FORBIDDEN_CATEGORIES.includes(tx.category.toLowerCase())) {
      tx.category = '';
      db.updateTransaction(tx);
      resetCount++;
    }
  }

  // Save the cleaned categories
  db.saveCategories(categoriesToKeep);

  res.json({
    success: true,
    categoriesRemoved: categoriesToRemove.map(c => c.name),
    transactionsReset: resetCount,
    remainingCategories: categoriesToKeep.length
  });
}

/**
 * GET /transactions/category/:description
 * Get category for a transaction by description.
 */
export async function getCategoryByDescription(req: Request, res: Response): Promise<void> {
  const transactions = db.getAllTransactions();
  const match = transactions.find(t =>
    t.description.toLowerCase() === req.params['description'].toLowerCase()
  );
  res.json({ category: match?.category || null });
}
