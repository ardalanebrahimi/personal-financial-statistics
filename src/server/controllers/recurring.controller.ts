/**
 * Recurring Controller
 *
 * Handles HTTP requests for recurring transaction pattern detection.
 */

import { Request, Response } from 'express';
import * as db from '../database/database';
import { AppError } from '../middleware';
import { RecurringDetector, predictNextOccurrences } from '../recurring/recurring-detector';

/**
 * POST /recurring/detect
 * Detect recurring transaction patterns.
 */
export async function detect(req: Request, res: Response): Promise<void> {
  const { saveResults } = req.body;
  const transactions = db.getAllTransactions();

  const detectableTransactions = transactions.map(tx => ({
    id: tx.id,
    date: tx.date,
    description: tx.description,
    amount: tx.amount,
    beneficiary: tx.beneficiary,
    category: tx.category,
    isContextOnly: tx.isContextOnly
  }));

  const detector = new RecurringDetector(detectableTransactions);
  const result = detector.detectPatterns();

  if (saveResults && result.patterns.length > 0) {
    const now = new Date().toISOString();
    const dbPatterns: db.RecurringPattern[] = result.patterns.map(p => ({
      id: p.id,
      beneficiary: p.beneficiary,
      averageAmount: p.averageAmount,
      frequency: p.frequency,
      averageIntervalDays: p.averageIntervalDays,
      confidence: p.confidence,
      transactionIds: p.transactionIds,
      firstOccurrence: p.firstOccurrence,
      lastOccurrence: p.lastOccurrence,
      occurrenceCount: p.occurrenceCount,
      category: p.category,
      isActive: p.isActive,
      nextExpectedDate: p.nextExpectedDate,
      amountVariance: p.amountVariance,
      description: p.description,
      createdAt: now,
      updatedAt: now
    }));

    db.clearRecurringPatterns();
    db.saveRecurringPatterns(dbPatterns);
  }

  res.json({
    success: true,
    patterns: result.patterns,
    stats: result.stats,
    saved: saveResults === true
  });
}

/**
 * GET /recurring/patterns
 * Get all saved recurring patterns.
 */
export async function getPatterns(req: Request, res: Response): Promise<void> {
  const activeOnly = req.query['active'] === 'true';
  const patterns = activeOnly
    ? db.getActiveRecurringPatterns()
    : db.getAllRecurringPatterns();

  res.json({
    patterns,
    total: patterns.length,
    active: patterns.filter(p => p.isActive).length
  });
}

/**
 * GET /recurring/patterns/:id
 * Get a specific recurring pattern.
 */
export async function getPatternById(req: Request, res: Response): Promise<void> {
  const patternId = req.params['id'];
  const pattern = db.getRecurringPatternById(patternId);

  if (!pattern) {
    throw AppError.notFound('Pattern not found');
  }

  const transactions = db.getAllTransactions();
  const patternTransactions = transactions.filter(tx =>
    pattern.transactionIds.includes(tx.id)
  );

  const predictions = predictNextOccurrences(pattern as any, 3);

  res.json({
    pattern,
    transactions: patternTransactions,
    predictions: predictions.map(d => d.toISOString())
  });
}

/**
 * PUT /recurring/patterns/:id
 * Update a recurring pattern.
 */
export async function updatePattern(req: Request, res: Response): Promise<void> {
  const patternId = req.params['id'];
  const updates = req.body;

  const existing = db.getRecurringPatternById(patternId);
  if (!existing) {
    throw AppError.notFound('Pattern not found');
  }

  const updated: db.RecurringPattern = {
    ...existing,
    ...updates,
    id: patternId,
    updatedAt: new Date().toISOString()
  };

  db.saveRecurringPattern(updated);

  res.json({
    success: true,
    pattern: updated
  });
}

/**
 * DELETE /recurring/patterns/:id
 * Delete a recurring pattern.
 */
export async function deletePattern(req: Request, res: Response): Promise<void> {
  const patternId = req.params['id'];

  const existing = db.getRecurringPatternById(patternId);
  if (!existing) {
    throw AppError.notFound('Pattern not found');
  }

  db.deleteRecurringPattern(patternId);

  res.json({
    success: true,
    deletedId: patternId
  });
}

/**
 * POST /recurring/patterns/:id/categorize
 * Apply category to all transactions in pattern.
 */
export async function categorizePattern(req: Request, res: Response): Promise<void> {
  const patternId = req.params['id'];
  const { category } = req.body;

  if (!category) {
    throw AppError.badRequest('Category is required');
  }

  const pattern = db.getRecurringPatternById(patternId);
  if (!pattern) {
    throw AppError.notFound('Pattern not found');
  }

  const transactions = db.getAllTransactions();
  let updatedCount = 0;

  for (const txId of pattern.transactionIds) {
    const tx = transactions.find(t => t.id === txId);
    if (tx) {
      tx.category = category;
      db.updateTransaction(tx);
      updatedCount++;
    }
  }

  db.saveRecurringPattern({
    ...pattern,
    category,
    updatedAt: new Date().toISOString()
  });

  res.json({
    success: true,
    updatedTransactions: updatedCount,
    category
  });
}

/**
 * GET /recurring/summary
 * Get summary of recurring patterns.
 */
export async function getSummary(req: Request, res: Response): Promise<void> {
  const patterns = db.getAllRecurringPatterns();
  const active = patterns.filter(p => p.isActive);

  const byFrequency: Record<string, { count: number; totalAmount: number }> = {};
  for (const p of active) {
    if (!byFrequency[p.frequency]) {
      byFrequency[p.frequency] = { count: 0, totalAmount: 0 };
    }
    byFrequency[p.frequency].count++;
    byFrequency[p.frequency].totalAmount += p.averageAmount;
  }

  const frequencyMultipliers: Record<string, number> = {
    weekly: 4.33,
    biweekly: 2.17,
    monthly: 1,
    quarterly: 0.33,
    yearly: 0.083,
    irregular: 0
  };

  let monthlyEstimate = 0;
  for (const p of active) {
    monthlyEstimate += p.averageAmount * (frequencyMultipliers[p.frequency] || 0);
  }

  res.json({
    totalPatterns: patterns.length,
    activePatterns: active.length,
    byFrequency,
    monthlyEstimate: Math.round(monthlyEstimate * 100) / 100,
    yearlyEstimate: Math.round(monthlyEstimate * 12 * 100) / 100
  });
}
