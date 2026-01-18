/**
 * Rule Repository
 *
 * Database operations for categorization rules.
 */

import { db } from '../connection';
import type { RuleCondition, RuleAction } from '../../ai/rules-engine';

export interface Rule {
  id: string;
  createdAt: string;
  updatedAt: string;
  conditions: RuleCondition[];
  conditionOperator: 'AND' | 'OR';
  action: RuleAction;
  source: 'auto' | 'manual' | 'correction';
  confidence: number;
  usageCount: number;
  lastUsedAt?: string;
  enabled: boolean;
  correctionHistory?: {
    originalCategory?: string;
    correctedCategory: string;
    transactionId: string;
    timestamp: string;
  }[];
}

export function getAllRules(): Rule[] {
  const rows = db.prepare(`SELECT * FROM rules ORDER BY priority DESC, confidence DESC`).all() as any[];
  return rows.map(row => {
    const conditionsData = JSON.parse(row.conditions);
    const actionsData = JSON.parse(row.actions);
    return {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      conditions: conditionsData.conditions || conditionsData,
      conditionOperator: conditionsData.operator || 'AND',
      action: actionsData.action || actionsData,
      source: row.source,
      confidence: row.confidence,
      usageCount: row.times_applied,
      lastUsedAt: row.last_applied_at || undefined,
      enabled: row.enabled === 1,
      correctionHistory: actionsData.correctionHistory
    };
  });
}

export function insertRule(rule: Rule): void {
  const conditionsData = { conditions: rule.conditions, operator: rule.conditionOperator };
  const actionsData = { action: rule.action, correctionHistory: rule.correctionHistory };
  db.prepare(`
    INSERT INTO rules (id, name, conditions, actions, priority, enabled,
                      created_at, updated_at, source, confidence, times_applied, last_applied_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    rule.id,
    '',
    JSON.stringify(conditionsData),
    JSON.stringify(actionsData),
    0,
    rule.enabled ? 1 : 0,
    rule.createdAt,
    rule.updatedAt,
    rule.source,
    rule.confidence,
    rule.usageCount,
    rule.lastUsedAt || null
  );
}

export function updateRule(rule: Rule): void {
  const conditionsData = { conditions: rule.conditions, operator: rule.conditionOperator };
  const actionsData = { action: rule.action, correctionHistory: rule.correctionHistory };
  db.prepare(`
    UPDATE rules SET
      name = ?, conditions = ?, actions = ?, priority = ?, enabled = ?,
      updated_at = ?, source = ?, confidence = ?, times_applied = ?, last_applied_at = ?
    WHERE id = ?
  `).run(
    '',
    JSON.stringify(conditionsData),
    JSON.stringify(actionsData),
    0,
    rule.enabled ? 1 : 0,
    rule.updatedAt,
    rule.source,
    rule.confidence,
    rule.usageCount,
    rule.lastUsedAt || null,
    rule.id
  );
}

export function deleteRule(id: string): boolean {
  const result = db.prepare(`DELETE FROM rules WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function saveRules(rules: Rule[]): void {
  const save = db.transaction((rs: Rule[]) => {
    db.prepare(`DELETE FROM rules`).run();
    for (const rule of rs) {
      insertRule(rule);
    }
  });
  save(rules);
}
