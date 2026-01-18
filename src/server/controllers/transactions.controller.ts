/**
 * Transactions Controller
 *
 * Handles HTTP requests for transaction management.
 */

import { Request, Response } from 'express';
import * as db from '../database/database';
import { AppError } from '../middleware';
import {
  findDuplicateGroups,
  identifyDuplicatesToRemove,
  extractAmazonOrderNumber
} from '../utils';

/**
 * GET /transactions
 * Get all transactions with optional pagination and sorting.
 */
export async function getAll(req: Request, res: Response): Promise<void> {
  const { page, limit, sort = 'date', order = 'desc' } = req.query;

  let transactions = db.getAllTransactions();

  // Sort transactions
  const sortField = sort.toString();
  const sortOrder = order.toString() === 'asc' ? 1 : -1;
  transactions.sort((a: any, b: any) => {
    if (sortField === 'date') {
      return (new Date(b.date).getTime() - new Date(a.date).getTime()) * sortOrder;
    } else if (sortField === 'amount') {
      return (b.amount - a.amount) * sortOrder;
    }
    return 0;
  });

  // Pagination
  const total = transactions.length;
  if (page && limit) {
    const pageNum = parseInt(page.toString(), 10);
    const limitNum = parseInt(limit.toString(), 10);
    const start = (pageNum - 1) * limitNum;
    transactions = transactions.slice(start, start + limitNum);

    res.json({
      transactions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasMore: start + transactions.length < total
      }
    });
    return;
  }

  res.json({ transactions, total });
}

/**
 * GET /transactions/match
 * Check if a transaction already exists (for duplicate detection during import).
 */
export async function checkMatch(req: Request, res: Response): Promise<void> {
  const { date, amount, description } = req.query;

  if (!date || !amount || !description) {
    throw AppError.badRequest('Missing required parameters: date, amount, description');
  }

  const transactions = db.getAllTransactions();

  const match = transactions.find(t => {
    // Parse and compare dates without time component
    const storedDate = new Date(t.date).toISOString().split('T')[0];
    const queryDate = new Date(date.toString()).toISOString().split('T')[0];
    const sameDate = storedDate === queryDate;

    // Compare amounts with a small tolerance for floating-point differences
    const sameAmount = Math.abs(Number(t.amount) - Number(amount)) < 0.01;

    // Normalize and compare descriptions
    const storedDesc = t.description.toLowerCase().replace(/\s+/g, '');
    const queryDesc = description.toString().toLowerCase().replace(/\s+/g, '');
    const similarDescription = storedDesc.includes(queryDesc) || queryDesc.includes(storedDesc);

    return sameDate && sameAmount && similarDescription;
  });

  if (match) {
    res.json({ exists: true, category: match.category });
  } else {
    res.json({ exists: false });
  }
}

/**
 * GET /transactions/filter
 * Filter transactions by various criteria.
 */
export async function filter(req: Request, res: Response): Promise<void> {
  const { startDate, endDate, category, beneficiary, description } = req.query;
  let transactions = db.getAllTransactions();

  // Filter by date range
  if (startDate) {
    transactions = transactions.filter(t =>
      new Date(t.date) >= new Date(startDate.toString())
    );
  }
  if (endDate) {
    transactions = transactions.filter(t =>
      new Date(t.date) <= new Date(endDate.toString())
    );
  }

  // Filter by category
  if (category) {
    transactions = transactions.filter(t =>
      t.category.toLowerCase().includes(category.toString().toLowerCase())
    );
  }

  // Filter by beneficiary or description
  if (beneficiary || description) {
    transactions = transactions.filter(t => {
      const desc = t.description.toLowerCase();
      const matchBeneficiary = !beneficiary || desc.includes(beneficiary.toString().toLowerCase());
      const matchDescription = !description || desc.includes(description.toString().toLowerCase());
      return matchBeneficiary && matchDescription;
    });
  }

  // Sort by date, latest first
  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  res.json({ transactions });
}

/**
 * POST /transactions
 * Create a new transaction.
 */
export async function create(req: Request, res: Response): Promise<void> {
  const transaction = req.body;

  const existing = db.getTransactionById(transaction.id);
  if (existing) {
    db.updateTransaction({ ...transaction, timestamp: new Date().toISOString() });
  } else {
    db.insertTransaction(transaction);
  }

  res.status(200).json({
    message: 'Transaction saved successfully',
    category: transaction.category,
    autoCategorized: !!transaction.category
  });
}

/**
 * PUT /transactions/:id
 * Update an existing transaction.
 */
export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const existing = db.getTransactionById(id);

  if (!existing) {
    throw AppError.notFound('Transaction not found');
  }

  const updated = { ...existing, ...req.body, timestamp: new Date().toISOString() };
  db.updateTransaction(updated);

  res.json({ success: true, updatedId: id });
}

/**
 * DELETE /transactions/:id
 * Delete a transaction.
 */
export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const deleted = db.deleteTransaction(id);

  if (!deleted) {
    throw AppError.notFound('Transaction not found');
  }

  res.json({ success: true, deletedId: id });
}

/**
 * DELETE /transactions/all
 * Clear all transactions.
 */
export async function clearAll(req: Request, res: Response): Promise<void> {
  const deletedCount = db.clearAllTransactions();
  console.log(`[Transactions] Cleared ${deletedCount} transactions`);
  res.json({ success: true, deletedCount });
}

/**
 * POST /transactions/find-duplicates
 * Find potential duplicate transactions.
 */
export async function findDuplicates(req: Request, res: Response): Promise<void> {
  const transactions = db.getAllTransactions();
  const duplicateGroups = findDuplicateGroups(transactions);

  res.json({
    totalGroups: duplicateGroups.length,
    totalDuplicates: duplicateGroups.reduce((sum, g) => sum + g.transactions.length - 1, 0),
    groups: duplicateGroups.map(g => ({
      key: g.key,
      transactions: g.transactions.map(t => ({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: t.amount,
        beneficiary: t.beneficiary,
        source: t.source?.connectorType,
        category: t.category,
        linkedOrderIds: t.linkedOrderIds
      }))
    }))
  });
}

/**
 * POST /transactions/remove-duplicate/:id
 * Remove a specific duplicate transaction.
 */
export async function removeDuplicate(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  db.deleteTransaction(id);
  res.json({ success: true, removedId: id });
}

/**
 * POST /transactions/remove-duplicates-auto
 * Auto-remove duplicates, keeping the transaction with most information.
 */
export async function removeDuplicatesAuto(req: Request, res: Response): Promise<void> {
  const transactions = db.getAllTransactions();
  const idsToRemove = identifyDuplicatesToRemove(transactions);

  for (const id of idsToRemove) {
    db.deleteTransaction(id);
  }

  res.json({
    success: true,
    removedCount: idsToRemove.length,
    removedIds: idsToRemove
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
