/**
 * Automation Controller
 *
 * Handles HTTP requests for automation configuration and processing.
 */

import { Request, Response } from 'express';
import * as db from '../database/database';
import { AutomationService, getAutomationService, AutomationConfig } from '../automation/automation-service';
import { CrossAccountIntelligence, EnrichedTransaction } from '../ai/cross-account-intelligence';
import { TransactionMatcher, applyMatchesToTransactions, StoredTransaction as MatcherStoredTransaction } from '../matching/matcher';
import { getRulesEngine } from './rules.controller';

// Initialize automation service
const automationService = getAutomationService(getRulesEngine());

// Load automation config on startup
async function loadAutomationConfig(): Promise<void> {
  const config = db.getAutomationConfig();
  automationService.setConfig(config);
}

loadAutomationConfig().catch(err => console.error('Failed to load automation config:', err));

/**
 * Export the automation service for use in other modules.
 */
export function getAutomationServiceInstance(): AutomationService {
  return automationService;
}

/**
 * Save automation config to database.
 */
async function saveAutomationConfig(config: AutomationConfig): Promise<void> {
  db.saveAutomationConfig(config);
}

/**
 * Convert stored transaction to enriched format.
 */
function toEnrichedTransaction(tx: db.StoredTransaction): EnrichedTransaction {
  return {
    id: tx.id,
    description: tx.description,
    amount: tx.amount,
    date: tx.date,
    category: tx.category,
    beneficiary: tx.beneficiary,
    source: tx.source ? {
      connectorType: tx.source.connectorType,
      externalId: tx.source.externalId
    } : undefined
  };
}

/**
 * GET /automation/config
 * Get automation configuration.
 */
export async function getConfig(req: Request, res: Response): Promise<void> {
  const config = automationService.getConfig();
  res.json(config);
}

/**
 * PUT /automation/config
 * Update automation configuration.
 */
export async function updateConfig(req: Request, res: Response): Promise<void> {
  const config = req.body as Partial<AutomationConfig>;
  automationService.setConfig(config);
  await saveAutomationConfig(automationService.getConfig());
  res.json(automationService.getConfig());
}

/**
 * POST /automation/categorize
 * Auto-categorize uncategorized transactions.
 */
export async function categorize(req: Request, res: Response): Promise<void> {
  const transactions = db.getAllTransactions();

  const uncategorized = transactions.filter(
    t => !t.category || t.category === '' || t.category === 'Uncategorized'
  );

  if (uncategorized.length === 0) {
    res.json({
      success: true,
      message: 'No uncategorized transactions',
      categorized: 0
    });
    return;
  }

  const enrichedAll = transactions.map(toEnrichedTransaction);

  const results = await automationService.categorizeTransactions(
    uncategorized.map(t => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      date: t.date,
      category: t.category,
      beneficiary: t.beneficiary,
      source: t.source
    })),
    enrichedAll
  );

  let updatedCount = 0;
  for (const result of results) {
    const index = transactions.findIndex(t => t.id === result.transactionId);
    if (index !== -1) {
      transactions[index].category = result.category;
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    db.bulkUpdateTransactions(transactions);
  }

  res.json({
    success: true,
    message: `Auto-categorized ${updatedCount} transactions`,
    categorized: updatedCount,
    results
  });
}

/**
 * POST /automation/process-new
 * Process newly imported transactions (categorize + match).
 */
export async function processNew(req: Request, res: Response): Promise<void> {
  const { transactionIds } = req.body;
  const transactions = db.getAllTransactions();

  const newTransactions = transactionIds
    ? transactions.filter(t => transactionIds.includes(t.id))
    : transactions.filter(t => !t.category || t.category === '' || t.category === 'Uncategorized');

  if (newTransactions.length === 0) {
    res.json({
      success: true,
      message: 'No transactions to process',
      categorized: 0,
      matched: 0
    });
    return;
  }

  const enrichedAll = transactions.map(toEnrichedTransaction);

  const categorizationResults = await automationService.categorizeTransactions(
    newTransactions.map(t => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      date: t.date,
      category: t.category,
      beneficiary: t.beneficiary,
      source: t.source
    })),
    enrichedAll
  );

  let categorizedCount = 0;
  for (const result of categorizationResults) {
    const index = transactions.findIndex(t => t.id === result.transactionId);
    if (index !== -1) {
      transactions[index].category = result.category;
      categorizedCount++;
    }
  }

  db.bulkUpdateTransactions(transactions);

  let matchedCount = 0;
  const config = automationService.getConfig();
  if (config.autoMatch) {
    const existingMatches = db.getAllMatches();
    const matcherTransactions = transactions.map(tx => ({
      ...tx,
      matchId: tx.matchId,
      matchInfo: tx.matchInfo ? {
        ...tx.matchInfo,
        patternType: tx.matchInfo.patternType as any,
        source: tx.matchInfo.source as any,
        confidence: tx.matchInfo.confidence as any
      } : undefined
    })) as MatcherStoredTransaction[];

    const matcher = new TransactionMatcher(matcherTransactions, existingMatches);
    const matchResult = matcher.runAllMatchers();

    if (matchResult.newMatches.length > 0) {
      const allMatches = [...existingMatches, ...matchResult.newMatches];
      db.saveMatches(allMatches);

      const updatedTransactions = applyMatchesToTransactions(
        matcherTransactions,
        matchResult.newMatches
      );
      db.bulkUpdateTransactions(updatedTransactions);
      matchedCount = matchResult.newMatches.length;
    }
  }

  res.json({
    success: true,
    message: `Processed ${newTransactions.length} transactions`,
    categorized: categorizedCount,
    matched: matchedCount,
    categorizationResults
  });
}
