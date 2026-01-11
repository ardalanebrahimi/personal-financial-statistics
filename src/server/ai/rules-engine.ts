/**
 * Smart Rules Engine
 *
 * Manages categorization rules that are learned from user corrections
 * and applied to automatically categorize new transactions.
 */

export interface Rule {
  id: string;
  createdAt: string;
  updatedAt: string;

  // Rule conditions
  conditions: RuleCondition[];
  conditionOperator: 'AND' | 'OR';

  // Rule action
  action: RuleAction;

  // Metadata
  source: 'auto' | 'manual' | 'correction';
  confidence: number; // 0-100
  usageCount: number;
  lastUsedAt?: string;
  enabled: boolean;

  // For correction-based rules
  correctionHistory?: {
    originalCategory?: string;
    correctedCategory: string;
    transactionId: string;
    timestamp: string;
  }[];
}

export interface RuleCondition {
  field: 'description' | 'beneficiary' | 'amount' | 'source' | 'date';
  operator: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'regex' | 'gt' | 'lt' | 'between';
  value: string | number | [number, number];
  caseSensitive?: boolean;
}

export interface RuleAction {
  type: 'setCategory' | 'setTransactionType' | 'excludeFromStats' | 'flagForReview' | 'suggestSplit';
  value: string | boolean;
}

export interface RuleMatch {
  rule: Rule;
  score: number; // How well the rule matched (0-100)
}

export interface StoredTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category?: string;
  beneficiary?: string;
  source?: {
    connectorType: string;
    externalId?: string;
  };
  transactionType?: string;
}

export class RulesEngine {
  private rules: Rule[] = [];

  constructor(rules: Rule[] = []) {
    this.rules = rules;
  }

  /**
   * Load rules from storage
   */
  setRules(rules: Rule[]) {
    this.rules = rules;
  }

  /**
   * Get all rules
   */
  getRules(): Rule[] {
    return this.rules;
  }

  /**
   * Get enabled rules sorted by confidence
   */
  getActiveRules(): Rule[] {
    return this.rules
      .filter(r => r.enabled)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Find matching rules for a transaction
   */
  findMatchingRules(transaction: StoredTransaction): RuleMatch[] {
    const matches: RuleMatch[] = [];

    for (const rule of this.getActiveRules()) {
      const score = this.evaluateRule(rule, transaction);
      if (score > 0) {
        matches.push({ rule, score });
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Apply the best matching rule to a transaction
   */
  applyRules(transaction: StoredTransaction): { applied: boolean; rule?: Rule; changes: Partial<StoredTransaction> } {
    const matches = this.findMatchingRules(transaction);

    if (matches.length === 0) {
      return { applied: false, changes: {} };
    }

    const bestMatch = matches[0];
    const changes: Partial<StoredTransaction> = {};

    // Apply the action
    switch (bestMatch.rule.action.type) {
      case 'setCategory':
        changes.category = bestMatch.rule.action.value as string;
        break;
      case 'setTransactionType':
        changes.transactionType = bestMatch.rule.action.value as string;
        break;
    }

    // Update rule usage stats
    bestMatch.rule.usageCount++;
    bestMatch.rule.lastUsedAt = new Date().toISOString();

    return {
      applied: true,
      rule: bestMatch.rule,
      changes
    };
  }

  /**
   * Evaluate a rule against a transaction
   */
  private evaluateRule(rule: Rule, transaction: StoredTransaction): number {
    const results = rule.conditions.map(cond => this.evaluateCondition(cond, transaction));

    let matched: boolean;
    if (rule.conditionOperator === 'AND') {
      matched = results.every(r => r > 0);
    } else {
      matched = results.some(r => r > 0);
    }

    if (!matched) return 0;

    // Calculate score based on condition specificity and rule confidence
    const avgConditionScore = results.reduce((sum, r) => sum + r, 0) / results.length;
    return (avgConditionScore * rule.confidence) / 100;
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(condition: RuleCondition, transaction: StoredTransaction): number {
    const fieldValue = this.getFieldValue(condition.field, transaction);
    if (fieldValue === undefined || fieldValue === null) return 0;

    const condValue = condition.value;
    const fieldStr = String(fieldValue);
    const compareStr = condition.caseSensitive ? fieldStr : fieldStr.toLowerCase();
    const targetStr = condition.caseSensitive ? String(condValue) : String(condValue).toLowerCase();

    switch (condition.operator) {
      case 'equals':
        return compareStr === targetStr ? 100 : 0;

      case 'contains':
        if (compareStr.includes(targetStr)) {
          // Higher score for longer matches relative to field length
          return Math.min(100, (targetStr.length / compareStr.length) * 150);
        }
        return 0;

      case 'startsWith':
        return compareStr.startsWith(targetStr) ? 90 : 0;

      case 'endsWith':
        return compareStr.endsWith(targetStr) ? 90 : 0;

      case 'regex':
        try {
          const regex = new RegExp(String(condValue), condition.caseSensitive ? '' : 'i');
          return regex.test(fieldStr) ? 80 : 0;
        } catch {
          return 0;
        }

      case 'gt':
        return typeof fieldValue === 'number' && fieldValue > Number(condValue) ? 100 : 0;

      case 'lt':
        return typeof fieldValue === 'number' && fieldValue < Number(condValue) ? 100 : 0;

      case 'between':
        if (typeof fieldValue === 'number' && Array.isArray(condValue)) {
          const [min, max] = condValue;
          return fieldValue >= min && fieldValue <= max ? 100 : 0;
        }
        return 0;

      default:
        return 0;
    }
  }

  /**
   * Get field value from transaction
   */
  private getFieldValue(field: string, transaction: StoredTransaction): string | number | undefined {
    switch (field) {
      case 'description':
        return transaction.description;
      case 'beneficiary':
        return transaction.beneficiary;
      case 'amount':
        return transaction.amount;
      case 'source':
        return transaction.source?.connectorType;
      case 'date':
        return transaction.date;
      default:
        return undefined;
    }
  }

  /**
   * Create a rule from a user correction
   */
  createRuleFromCorrection(
    transaction: StoredTransaction,
    originalCategory: string | undefined,
    newCategory: string
  ): Rule {
    // Extract key patterns from the transaction
    const conditions: RuleCondition[] = [];

    // Add beneficiary condition if available (high specificity)
    if (transaction.beneficiary) {
      conditions.push({
        field: 'beneficiary',
        operator: 'contains',
        value: transaction.beneficiary,
        caseSensitive: false
      });
    }

    // Add description pattern condition
    const keywords = this.extractKeywords(transaction.description);
    if (keywords.length > 0) {
      conditions.push({
        field: 'description',
        operator: 'contains',
        value: keywords[0], // Use most significant keyword
        caseSensitive: false
      });
    }

    // Add source condition if from specific connector
    if (transaction.source?.connectorType) {
      conditions.push({
        field: 'source',
        operator: 'equals',
        value: transaction.source.connectorType
      });
    }

    const now = new Date().toISOString();

    return {
      id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
      conditions,
      conditionOperator: conditions.length > 1 ? 'AND' : 'AND',
      action: {
        type: 'setCategory',
        value: newCategory
      },
      source: 'correction',
      confidence: 70, // Start with moderate confidence
      usageCount: 0,
      enabled: true,
      correctionHistory: [{
        originalCategory,
        correctedCategory: newCategory,
        transactionId: transaction.id,
        timestamp: now
      }]
    };
  }

  /**
   * Update rule confidence based on user feedback
   */
  updateRuleConfidence(ruleId: string, wasCorrect: boolean): void {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) return;

    if (wasCorrect) {
      // Increase confidence (diminishing returns)
      rule.confidence = Math.min(100, rule.confidence + (100 - rule.confidence) * 0.1);
    } else {
      // Decrease confidence more aggressively
      rule.confidence = Math.max(0, rule.confidence - 15);

      // Disable rule if confidence drops too low
      if (rule.confidence < 20) {
        rule.enabled = false;
      }
    }

    rule.updatedAt = new Date().toISOString();
  }

  /**
   * Merge similar rules to reduce redundancy
   */
  consolidateRules(): Rule[] {
    // Group rules by action value (category)
    const rulesByCategory = new Map<string, Rule[]>();

    for (const rule of this.rules.filter(r => r.action.type === 'setCategory')) {
      const category = rule.action.value as string;
      const existing = rulesByCategory.get(category) || [];
      existing.push(rule);
      rulesByCategory.set(category, existing);
    }

    // Merge rules with similar conditions
    const mergedRules: Rule[] = [];

    for (const [category, rules] of rulesByCategory) {
      if (rules.length === 1) {
        mergedRules.push(rules[0]);
        continue;
      }

      // Find rules that can be merged (same field conditions)
      const merged = this.mergeRulesForCategory(rules);
      mergedRules.push(...merged);
    }

    // Add non-category rules
    mergedRules.push(...this.rules.filter(r => r.action.type !== 'setCategory'));

    return mergedRules;
  }

  /**
   * Merge rules for the same category
   */
  private mergeRulesForCategory(rules: Rule[]): Rule[] {
    // For now, keep all rules but increase confidence for frequently used ones
    return rules.map(rule => {
      if (rule.usageCount > 10) {
        rule.confidence = Math.min(100, rule.confidence + 10);
      }
      return rule;
    });
  }

  /**
   * Extract keywords from description
   */
  private extractKeywords(description: string): string[] {
    // Remove common words and extract significant terms
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'been', 'be',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
      'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'aber', 'von',
      'zu', 'bei', 'mit', 'für', 'auf', 'an', 'in', 'aus', 'nach', 'über'
    ]);

    const words = description
      .toLowerCase()
      .replace(/[^a-zA-Z0-9äöüß\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    // Sort by length (longer words are often more specific)
    return words.sort((a, b) => b.length - a.length);
  }

  /**
   * Add a new rule
   */
  addRule(rule: Rule): void {
    this.rules.push(rule);
  }

  /**
   * Remove a rule
   */
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index >= 0) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Update a rule
   */
  updateRule(ruleId: string, updates: Partial<Rule>): boolean {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) return false;

    Object.assign(rule, updates, { updatedAt: new Date().toISOString() });
    return true;
  }

  /**
   * Get rule statistics
   */
  getStats(): {
    totalRules: number;
    activeRules: number;
    avgConfidence: number;
    totalUsage: number;
    rulesBySource: Record<string, number>;
  } {
    const activeRules = this.getActiveRules();

    return {
      totalRules: this.rules.length,
      activeRules: activeRules.length,
      avgConfidence: activeRules.length > 0
        ? activeRules.reduce((sum, r) => sum + r.confidence, 0) / activeRules.length
        : 0,
      totalUsage: this.rules.reduce((sum, r) => sum + r.usageCount, 0),
      rulesBySource: {
        auto: this.rules.filter(r => r.source === 'auto').length,
        manual: this.rules.filter(r => r.source === 'manual').length,
        correction: this.rules.filter(r => r.source === 'correction').length
      }
    };
  }
}

export default RulesEngine;
