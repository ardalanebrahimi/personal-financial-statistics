/**
 * Rules Controller
 *
 * Handles HTTP requests for categorization rules management.
 */

import { Request, Response } from 'express';
import * as db from '../database/database';
import { AppError } from '../middleware';
import { RulesEngine, Rule, StoredTransaction as RulesStoredTransaction } from '../ai/rules-engine';

// Singleton rules engine instance
const rulesEngine = new RulesEngine();

// Load rules on module initialization
async function initializeRulesEngine(): Promise<void> {
  const rules = db.getAllRules() as Rule[];
  rulesEngine.setRules(rules);
}

initializeRulesEngine().catch(err => console.error('Failed to load rules:', err));

/**
 * Get the rules engine instance.
 */
export function getRulesEngine(): RulesEngine {
  return rulesEngine;
}

/**
 * Save rules to database.
 */
async function saveRules(rules: Rule[]): Promise<void> {
  db.saveRules(rules as any[]);
}

/**
 * GET /rules
 * Get all rules with stats.
 */
export async function getAll(req: Request, res: Response): Promise<void> {
  const rules = rulesEngine.getRules();
  const stats = rulesEngine.getStats();
  res.json({ rules, stats });
}

/**
 * POST /rules
 * Create a new rule.
 */
export async function create(req: Request, res: Response): Promise<void> {
  const rule = req.body as Rule;

  if (!rule.id) {
    rule.id = `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  rule.createdAt = rule.createdAt || new Date().toISOString();
  rule.updatedAt = new Date().toISOString();

  rulesEngine.addRule(rule);
  await saveRules(rulesEngine.getRules());

  res.status(201).json(rule);
}

/**
 * PUT /rules/:id
 * Update an existing rule.
 */
export async function update(req: Request, res: Response): Promise<void> {
  const ruleId = req.params['id'];
  const updates = req.body;

  const success = rulesEngine.updateRule(ruleId, updates);
  if (!success) {
    throw AppError.notFound('Rule not found');
  }

  await saveRules(rulesEngine.getRules());
  const rule = rulesEngine.getRules().find(r => r.id === ruleId);
  res.json(rule);
}

/**
 * DELETE /rules/:id
 * Delete a rule.
 */
export async function remove(req: Request, res: Response): Promise<void> {
  const ruleId = req.params['id'];
  const success = rulesEngine.removeRule(ruleId);

  if (!success) {
    throw AppError.notFound('Rule not found');
  }

  await saveRules(rulesEngine.getRules());
  res.json({ success: true });
}

/**
 * POST /rules/apply
 * Apply rules to a transaction.
 */
export async function apply(req: Request, res: Response): Promise<void> {
  const transaction = req.body as RulesStoredTransaction;
  const result = rulesEngine.applyRules(transaction);

  // Save updated rules (usage stats changed)
  if (result.applied) {
    await saveRules(rulesEngine.getRules());
  }

  res.json(result);
}

/**
 * POST /rules/from-correction
 * Create a rule from a user correction.
 */
export async function createFromCorrection(req: Request, res: Response): Promise<void> {
  const { transaction, originalCategory, newCategory } = req.body;

  const rule = rulesEngine.createRuleFromCorrection(
    transaction as RulesStoredTransaction,
    originalCategory,
    newCategory
  );

  rulesEngine.addRule(rule);
  await saveRules(rulesEngine.getRules());

  res.status(201).json(rule);
}

/**
 * POST /rules/:id/feedback
 * Update rule confidence based on feedback.
 */
export async function feedback(req: Request, res: Response): Promise<void> {
  const ruleId = req.params['id'];
  const { wasCorrect } = req.body;

  rulesEngine.updateRuleConfidence(ruleId, wasCorrect);
  await saveRules(rulesEngine.getRules());

  const rule = rulesEngine.getRules().find(r => r.id === ruleId);
  res.json(rule);
}

/**
 * POST /rules/consolidate
 * Merge similar rules.
 */
export async function consolidate(req: Request, res: Response): Promise<void> {
  const consolidated = rulesEngine.consolidateRules();
  rulesEngine.setRules(consolidated);
  await saveRules(consolidated);

  res.json({
    success: true,
    ruleCount: consolidated.length,
    stats: rulesEngine.getStats()
  });
}
