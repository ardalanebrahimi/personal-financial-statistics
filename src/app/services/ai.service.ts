import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { CategoryService } from './category.service';
import { environment } from '../../environments/environment';

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

export interface RulesStats {
  totalRules: number;
  activeRules: number;
  avgConfidence: number;
  totalUsage: number;
  rulesBySource: Record<string, number>;
}

export interface CategorySuggestion {
  category: string;
  confidence: number;
  reason: string;
  source: 'rule' | 'linked_transaction' | 'pattern' | 'ai';
}

export interface TransactionInsight {
  type: 'recurring' | 'unusual_amount' | 'potential_duplicate' | 'uncategorized' | 'subscription';
  severity: 'info' | 'warning' | 'action_required';
  message: string;
  relatedTransactionIds?: string[];
  suggestedAction?: string;
}

export interface ApplyRuleResult {
  applied: boolean;
  rule?: Rule;
  changes: {
    category?: string;
    transactionType?: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AIService {
  private rulesSubject = new BehaviorSubject<Rule[]>([]);
  rules$ = this.rulesSubject.asObservable();

  private statsSubject = new BehaviorSubject<RulesStats | null>(null);
  stats$ = this.statsSubject.asObservable();

  constructor(
    private http: HttpClient,
    private categoryService: CategoryService
  ) {
    this.loadRules();
  }

  // ==================== Original AI Categorization ====================

  async suggestCategory(description: string): Promise<string> {
    const existingCategories = this.categoryService.getCategories();
    const apiKey = environment.openAiApiKey;
    const endpoint = 'https://api.openai.com/v1/chat/completions';

    const systemPrompt = existingCategories.length > 0
      ? `You are a financial transaction categorizer. Given a transaction description, respond ONLY with a category name.
         If the transaction fits one of these existing categories, use it: ${existingCategories.map(c => c.name).join(', ')}.
         If it doesn't fit any existing category, respond with a new, concise category name (1-3 words maximum).
         DO NOT include any explanations, punctuation, or additional text.`
      : `You are a financial transaction categorizer. Given a transaction description, respond ONLY with a concise category name (1-3 words maximum).
         DO NOT include any explanations, punctuation, or additional text.`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: description
          }
        ],
        max_tokens: 10,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${errorData.error.message}`);
    }

    const data = await response.json();
    const suggestion = data.choices[0]?.message?.content?.trim();

    // If it's a new category, add it to the system
    if (suggestion && !existingCategories.some(c => c.name.toLowerCase() === suggestion.toLowerCase())) {
      this.categoryService.addCategory({
        id: crypto.randomUUID(),
        name: suggestion,
        color: this.generateRandomColor()
      });
    }

    return suggestion;
  }

  private generateRandomColor(): string {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

  // ==================== Rules Management ====================

  async loadRules(): Promise<void> {
    try {
      const response = await this.http.get<{ rules: Rule[]; stats: RulesStats }>(
        `${environment.apiUrl}/rules`
      ).toPromise();

      if (response) {
        this.rulesSubject.next(response.rules);
        this.statsSubject.next(response.stats);
      }
    } catch (error) {
      console.error('Failed to load rules:', error);
    }
  }

  getRules(): Rule[] {
    return this.rulesSubject.getValue();
  }

  async createRule(rule: Partial<Rule>): Promise<Rule | null> {
    try {
      const created = await this.http.post<Rule>(
        `${environment.apiUrl}/rules`,
        rule
      ).toPromise();

      await this.loadRules();
      return created || null;
    } catch (error) {
      console.error('Failed to create rule:', error);
      return null;
    }
  }

  async updateRule(ruleId: string, updates: Partial<Rule>): Promise<Rule | null> {
    try {
      const updated = await this.http.put<Rule>(
        `${environment.apiUrl}/rules/${ruleId}`,
        updates
      ).toPromise();

      await this.loadRules();
      return updated || null;
    } catch (error) {
      console.error('Failed to update rule:', error);
      return null;
    }
  }

  async deleteRule(ruleId: string): Promise<boolean> {
    try {
      await this.http.delete(`${environment.apiUrl}/rules/${ruleId}`).toPromise();
      await this.loadRules();
      return true;
    } catch (error) {
      console.error('Failed to delete rule:', error);
      return false;
    }
  }

  async applyRulesToTransaction(transaction: any): Promise<ApplyRuleResult> {
    try {
      const result = await this.http.post<ApplyRuleResult>(
        `${environment.apiUrl}/rules/apply`,
        transaction
      ).toPromise();

      return result || { applied: false, changes: {} };
    } catch (error) {
      console.error('Failed to apply rules:', error);
      return { applied: false, changes: {} };
    }
  }

  async createRuleFromCorrection(
    transaction: any,
    originalCategory: string | undefined,
    newCategory: string
  ): Promise<Rule | null> {
    try {
      const rule = await this.http.post<Rule>(
        `${environment.apiUrl}/rules/from-correction`,
        { transaction, originalCategory, newCategory }
      ).toPromise();

      await this.loadRules();
      return rule || null;
    } catch (error) {
      console.error('Failed to create rule from correction:', error);
      return null;
    }
  }

  async provideFeedback(ruleId: string, wasCorrect: boolean): Promise<void> {
    try {
      await this.http.post(
        `${environment.apiUrl}/rules/${ruleId}/feedback`,
        { wasCorrect }
      ).toPromise();

      await this.loadRules();
    } catch (error) {
      console.error('Failed to provide rule feedback:', error);
    }
  }

  // ==================== Cross-Account Intelligence ====================

  async getCategorySuggestions(transaction: any): Promise<CategorySuggestion[]> {
    try {
      const response = await this.http.post<{ suggestions: CategorySuggestion[] }>(
        `${environment.apiUrl}/ai/suggest-category`,
        transaction
      ).toPromise();

      return response?.suggestions || [];
    } catch (error) {
      console.error('Failed to get category suggestions:', error);
      return [];
    }
  }

  async getTransactionInsights(transaction: any): Promise<TransactionInsight[]> {
    try {
      const response = await this.http.post<{ insights: TransactionInsight[] }>(
        `${environment.apiUrl}/ai/detect-insights`,
        transaction
      ).toPromise();

      return response?.insights || [];
    } catch (error) {
      console.error('Failed to get transaction insights:', error);
      return [];
    }
  }

  async enrichTransaction(transaction: any): Promise<any> {
    try {
      const enriched = await this.http.post<any>(
        `${environment.apiUrl}/ai/enrich`,
        transaction
      ).toPromise();

      return enriched || transaction;
    } catch (error) {
      console.error('Failed to enrich transaction:', error);
      return transaction;
    }
  }

  async analyzeUncategorizedTransactions(): Promise<{
    analyzed: number;
    withSuggestions: number;
    results: { transactionId: string; suggestions: CategorySuggestion[] }[];
  }> {
    try {
      const response = await this.http.post<any>(
        `${environment.apiUrl}/ai/analyze-all`,
        {}
      ).toPromise();

      return response || { analyzed: 0, withSuggestions: 0, results: [] };
    } catch (error) {
      console.error('Failed to analyze transactions:', error);
      return { analyzed: 0, withSuggestions: 0, results: [] };
    }
  }

  // ==================== Smart Categorization ====================

  /**
   * Smart categorization that tries rules first, then falls back to AI
   */
  async smartCategorize(transaction: any): Promise<{
    category: string;
    source: 'rule' | 'ai' | 'linked' | 'existing';
    confidence: number;
    ruleId?: string;
  }> {
    // 1. First try to apply existing rules
    const ruleResult = await this.applyRulesToTransaction(transaction);
    if (ruleResult.applied && ruleResult.changes.category) {
      return {
        category: ruleResult.changes.category,
        source: 'rule',
        confidence: ruleResult.rule?.confidence || 70,
        ruleId: ruleResult.rule?.id
      };
    }

    // 2. Try cross-account suggestions
    const suggestions = await this.getCategorySuggestions(transaction);
    if (suggestions.length > 0 && suggestions[0].confidence > 60) {
      return {
        category: suggestions[0].category,
        source: suggestions[0].source === 'linked_transaction' ? 'linked' : 'rule',
        confidence: suggestions[0].confidence
      };
    }

    // 3. Fall back to AI categorization
    try {
      const aiCategory = await this.suggestCategory(transaction.description);
      return {
        category: aiCategory,
        source: 'ai',
        confidence: 50
      };
    } catch (error) {
      return {
        category: 'Uncategorized',
        source: 'ai',
        confidence: 0
      };
    }
  }
}
