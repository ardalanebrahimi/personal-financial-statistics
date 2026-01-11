/**
 * Automation Service
 *
 * Handles automatic operations:
 * - Auto-categorization of new transactions using rules and AI
 * - Auto-matching after syncs
 * - Scheduled background syncs
 */

import { RulesEngine, Rule, StoredTransaction } from '../ai/rules-engine';
import { CrossAccountIntelligence, EnrichedTransaction } from '../ai/cross-account-intelligence';

export interface AutomationConfig {
  autoCategorize: boolean;
  autoMatch: boolean;
  scheduledSync: {
    enabled: boolean;
    intervalMinutes: number;
  };
  notifyOnNewTransactions: boolean;
}

export interface CategorizationResult {
  transactionId: string;
  category: string;
  source: 'rule' | 'ai' | 'linked' | 'manual';
  confidence: number;
  ruleId?: string;
}

export class AutomationService {
  private rulesEngine: RulesEngine;
  private config: AutomationConfig = {
    autoCategorize: true,
    autoMatch: true,
    scheduledSync: {
      enabled: false,
      intervalMinutes: 60
    },
    notifyOnNewTransactions: true
  };

  private syncInterval: NodeJS.Timeout | null = null;
  private onSyncCallback: (() => Promise<void>) | null = null;

  constructor(rulesEngine: RulesEngine) {
    this.rulesEngine = rulesEngine;
  }

  /**
   * Get current configuration
   */
  getConfig(): AutomationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<AutomationConfig>) {
    this.config = { ...this.config, ...config };

    // Update scheduled sync if changed
    if (config.scheduledSync !== undefined) {
      this.updateScheduledSync();
    }
  }

  /**
   * Set the sync callback for scheduled syncs
   */
  setSyncCallback(callback: () => Promise<void>) {
    this.onSyncCallback = callback;
  }

  /**
   * Start/stop scheduled sync based on config
   */
  private updateScheduledSync() {
    // Clear existing interval
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    // Start new interval if enabled
    if (this.config.scheduledSync.enabled && this.onSyncCallback) {
      const intervalMs = this.config.scheduledSync.intervalMinutes * 60 * 1000;
      this.syncInterval = setInterval(async () => {
        console.log('[Automation] Running scheduled sync...');
        try {
          await this.onSyncCallback!();
          console.log('[Automation] Scheduled sync completed');
        } catch (error) {
          console.error('[Automation] Scheduled sync failed:', error);
        }
      }, intervalMs);
      console.log(`[Automation] Scheduled sync enabled: every ${this.config.scheduledSync.intervalMinutes} minutes`);
    }
  }

  /**
   * Auto-categorize a single transaction
   */
  async categorizeTransaction(
    transaction: StoredTransaction,
    allTransactions: EnrichedTransaction[]
  ): Promise<CategorizationResult | null> {
    if (!this.config.autoCategorize) {
      return null;
    }

    // Skip if already categorized
    if (transaction.category && transaction.category !== '' && transaction.category !== 'Uncategorized') {
      return null;
    }

    // 1. Try rules engine first
    const ruleResult = this.rulesEngine.applyRules(transaction);
    if (ruleResult.applied && ruleResult.changes.category) {
      return {
        transactionId: transaction.id,
        category: ruleResult.changes.category,
        source: 'rule',
        confidence: ruleResult.rule?.confidence || 70,
        ruleId: ruleResult.rule?.id
      };
    }

    // 2. Try cross-account intelligence
    const intelligence = new CrossAccountIntelligence(allTransactions);
    const enrichedTx: EnrichedTransaction = {
      id: transaction.id,
      description: transaction.description,
      amount: transaction.amount,
      date: transaction.date,
      category: transaction.category,
      beneficiary: transaction.beneficiary,
      source: transaction.source ? {
        connectorType: transaction.source.connectorType,
        externalId: transaction.source.externalId
      } : undefined
    };

    const suggestions = intelligence.getCategorySuggestions(enrichedTx);
    if (suggestions.length > 0 && suggestions[0].confidence > 60) {
      return {
        transactionId: transaction.id,
        category: suggestions[0].category,
        source: suggestions[0].source === 'linked_transaction' ? 'linked' : 'rule',
        confidence: suggestions[0].confidence
      };
    }

    return null;
  }

  /**
   * Auto-categorize multiple transactions
   */
  async categorizeTransactions(
    transactions: StoredTransaction[],
    allTransactions: EnrichedTransaction[]
  ): Promise<CategorizationResult[]> {
    const results: CategorizationResult[] = [];

    for (const tx of transactions) {
      const result = await this.categorizeTransaction(tx, allTransactions);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Process new transactions after import/sync
   */
  async processNewTransactions(
    newTransactions: StoredTransaction[],
    allTransactions: StoredTransaction[]
  ): Promise<{
    categorized: CategorizationResult[];
    matched: number;
  }> {
    // Convert to enriched format for cross-account intelligence
    const enrichedAll: EnrichedTransaction[] = allTransactions.map(t => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      date: t.date,
      category: t.category,
      beneficiary: t.beneficiary,
      source: t.source ? {
        connectorType: t.source.connectorType,
        externalId: t.source.externalId
      } : undefined
    }));

    // Auto-categorize
    const categorized = await this.categorizeTransactions(newTransactions, enrichedAll);

    return {
      categorized,
      matched: 0 // Matching is handled separately
    };
  }

  /**
   * Stop all automation tasks
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

// Singleton instance
let automationServiceInstance: AutomationService | null = null;

export function getAutomationService(rulesEngine: RulesEngine): AutomationService {
  if (!automationServiceInstance) {
    automationServiceInstance = new AutomationService(rulesEngine);
  }
  return automationServiceInstance;
}

export default AutomationService;
