/**
 * Export Controller
 *
 * Handles HTTP requests for data export and import.
 */

import { Request, Response } from 'express';
import * as db from '../database/database';
import { getRulesEngine } from './rules.controller';
import { Rule } from '../ai/rules-engine';

/**
 * GET /export
 * Export all data for backup.
 */
export async function exportData(req: Request, res: Response): Promise<void> {
  const transactions = db.getAllTransactions();
  const categories = db.getAllCategories();
  const rules = db.getAllRules();
  const matches = db.getAllMatches();

  const exportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    transactions,
    categories,
    rules,
    matches
  };

  res.json(exportData);
}

/**
 * POST /import
 * Import data from backup.
 */
export async function importData(req: Request, res: Response): Promise<void> {
  const { transactions, categories, rules, matches, merge = false } = req.body;

  if (merge) {
    // Merge with existing data
    const existingTransactions = db.getAllTransactions();
    const existingCategories = db.getAllCategories();
    const existingRules = db.getAllRules();
    const existingMatches = db.getAllMatches();

    // Merge transactions (avoid duplicates by ID)
    const existingIds = new Set(existingTransactions.map(t => t.id));
    const newTransactions = transactions?.filter((t: any) => !existingIds.has(t.id)) || [];
    const mergedTransactions = [...existingTransactions, ...newTransactions];

    // Merge categories (avoid duplicates by name)
    const existingCategoryNames = new Set(existingCategories.map((c: any) => c.name.toLowerCase()));
    const newCategories = categories?.filter((c: any) => !existingCategoryNames.has(c.name.toLowerCase())) || [];
    const mergedCategories = [...existingCategories, ...newCategories];

    // Merge rules (avoid duplicates by ID)
    const existingRuleIds = new Set(existingRules.map((r: any) => r.id));
    const newRules = rules?.filter((r: any) => !existingRuleIds.has(r.id)) || [];
    const mergedRules = [...existingRules, ...newRules];

    // Merge matches (avoid duplicates by ID)
    const existingMatchIds = new Set(existingMatches.map(m => m.id));
    const newMatches = matches?.filter((m: any) => !existingMatchIds.has(m.id)) || [];
    const mergedMatches = [...existingMatches, ...newMatches];

    // Save merged data
    db.bulkUpdateTransactions(mergedTransactions);
    db.saveCategories(mergedCategories);
    db.saveRules(mergedRules);
    db.saveMatches(mergedMatches);

    // Reload rules into engine
    getRulesEngine().setRules(mergedRules as Rule[]);

    res.json({
      success: true,
      message: 'Data merged successfully',
      stats: {
        transactions: { existing: existingTransactions.length, new: newTransactions.length, total: mergedTransactions.length },
        categories: { existing: existingCategories.length, new: newCategories.length, total: mergedCategories.length },
        rules: { existing: existingRules.length, new: newRules.length, total: mergedRules.length },
        matches: { existing: existingMatches.length, new: newMatches.length, total: mergedMatches.length }
      }
    });
  } else {
    // Replace all data
    db.bulkUpdateTransactions(transactions || []);
    db.saveCategories(categories || []);
    db.saveRules(rules || []);
    db.saveMatches(matches || []);

    // Reload rules into engine
    getRulesEngine().setRules(rules || []);

    res.json({
      success: true,
      message: 'Data imported successfully',
      stats: {
        transactions: transactions?.length || 0,
        categories: categories?.length || 0,
        rules: rules?.length || 0,
        matches: matches?.length || 0
      }
    });
  }
}
