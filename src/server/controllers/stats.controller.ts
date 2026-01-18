/**
 * Stats Controller
 *
 * Handles HTTP requests for system statistics.
 */

import { Request, Response } from 'express';
import * as db from '../database/database';
import { getRulesEngine } from './rules.controller';

/**
 * GET /stats
 * Get overall system statistics.
 */
export async function getStats(req: Request, res: Response): Promise<void> {
  const transactions = db.getAllTransactions();
  const categories = db.getAllCategories();
  const matches = db.getAllMatches();

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const totalTransactions = transactions.length;
  const totalSpending = Math.abs(
    transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
  );
  const totalIncome = transactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  const thisMonthTx = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });
  const thisMonthSpending = Math.abs(
    thisMonthTx.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
  );

  const uncategorizedCount = transactions.filter(
    t => !t.category || t.category === '' || t.category === 'Uncategorized'
  ).length;

  const matchedCount = transactions.filter(t => t.matchId).length;

  // Category breakdown
  const categoryTotals = new Map<string, number>();
  transactions.filter(t => t.amount < 0).forEach(t => {
    const cat = t.category || 'Uncategorized';
    categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + Math.abs(t.amount));
  });

  const topCategories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, total]) => {
      const category = categories.find((c: any) => c.name === name);
      return { name, total, color: category?.color };
    });

  // Source breakdown
  const sourceCounts = new Map<string, number>();
  transactions.forEach(t => {
    const source = t.source?.connectorType || 'manual';
    sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
  });

  res.json({
    transactions: {
      total: totalTransactions,
      uncategorized: uncategorizedCount,
      matched: matchedCount
    },
    financial: {
      totalSpending,
      totalIncome,
      netBalance: totalIncome - totalSpending,
      thisMonthSpending
    },
    categories: {
      total: categories.length,
      topCategories
    },
    sources: Object.fromEntries(sourceCounts),
    matches: {
      total: matches.length
    },
    rules: getRulesEngine().getStats()
  });
}
