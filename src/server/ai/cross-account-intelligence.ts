/**
 * Cross-Account Intelligence
 *
 * Enhances transaction categorization by leveraging details from
 * linked transactions across different accounts:
 * - PayPal transactions provide merchant details for Sparkasse "PAYPAL" debits
 * - Mastercard transactions provide purchase details for "ADVANZIA" debits
 * - N26 transfers help identify internal movements
 */

import { TransactionMatch } from '../matching/matcher';

export interface EnrichedTransaction {
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
  matchInfo?: {
    matchId: string;
    isPrimary: boolean;
    patternType: string;
    linkedTransactionIds: string[];
  };
  // Enriched fields
  enrichedDescription?: string;
  merchantNames?: string[];
  itemDescriptions?: string[];
  suggestedCategory?: string;
  enrichmentSource?: string;
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

export class CrossAccountIntelligence {
  private transactions: EnrichedTransaction[] = [];
  private matches: TransactionMatch[] = [];

  constructor(transactions: EnrichedTransaction[] = [], matches: TransactionMatch[] = []) {
    this.transactions = transactions;
    this.matches = matches;
  }

  /**
   * Set transaction data
   */
  setData(transactions: EnrichedTransaction[], matches: TransactionMatch[]) {
    this.transactions = transactions;
    this.matches = matches;
  }

  /**
   * Enrich a Sparkasse transaction using linked PayPal/Mastercard details
   */
  enrichTransaction(transaction: EnrichedTransaction): EnrichedTransaction {
    const enriched = { ...transaction };

    // Find linked transactions via match
    const match = this.matches.find(m =>
      m.primaryTransactionId === transaction.id ||
      m.linkedTransactionIds.includes(transaction.id)
    );

    if (!match) return enriched;

    // Get all related transactions
    const linkedIds = match.primaryTransactionId === transaction.id
      ? match.linkedTransactionIds
      : [match.primaryTransactionId, ...match.linkedTransactionIds.filter(id => id !== transaction.id)];

    const linkedTransactions = linkedIds
      .map(id => this.transactions.find(t => t.id === id))
      .filter(Boolean) as EnrichedTransaction[];

    if (linkedTransactions.length === 0) return enriched;

    // Enrich based on pattern type
    switch (match.patternType) {
      case 'paypal_sparkasse':
        return this.enrichFromPayPal(enriched, linkedTransactions);
      case 'mastercard_sparkasse':
        return this.enrichFromMastercard(enriched, linkedTransactions);
      case 'n26_sparkasse':
        return this.enrichFromN26(enriched, linkedTransactions);
      default:
        return enriched;
    }
  }

  /**
   * Enrich from PayPal transactions
   */
  private enrichFromPayPal(
    transaction: EnrichedTransaction,
    paypalTransactions: EnrichedTransaction[]
  ): EnrichedTransaction {
    const enriched = { ...transaction };

    // Extract merchant names from PayPal descriptions
    const merchantNames = paypalTransactions
      .map(pt => this.extractMerchantFromPayPal(pt.description))
      .filter(Boolean) as string[];

    if (merchantNames.length > 0) {
      enriched.merchantNames = [...new Set(merchantNames)];
      enriched.enrichedDescription = `PayPal: ${merchantNames.join(', ')}`;
      enriched.enrichmentSource = 'paypal';

      // Suggest category based on merchants
      enriched.suggestedCategory = this.suggestCategoryFromMerchants(merchantNames);
    }

    return enriched;
  }

  /**
   * Enrich from Mastercard transactions
   */
  private enrichFromMastercard(
    transaction: EnrichedTransaction,
    mastercardTransactions: EnrichedTransaction[]
  ): EnrichedTransaction {
    const enriched = { ...transaction };

    // Extract item descriptions
    const itemDescriptions = mastercardTransactions
      .map(mt => mt.description)
      .filter(Boolean);

    const merchantNames = mastercardTransactions
      .map(mt => this.extractMerchantFromMastercard(mt.description))
      .filter(Boolean) as string[];

    if (itemDescriptions.length > 0) {
      enriched.itemDescriptions = itemDescriptions;
      enriched.merchantNames = [...new Set(merchantNames)];
      enriched.enrichedDescription = `Mastercard (${mastercardTransactions.length} purchases): ${merchantNames.slice(0, 3).join(', ')}${merchantNames.length > 3 ? '...' : ''}`;
      enriched.enrichmentSource = 'mastercard';

      // Suggest category based on purchases
      enriched.suggestedCategory = this.suggestCategoryFromPurchases(itemDescriptions);
    }

    return enriched;
  }

  /**
   * Enrich from N26 transactions
   */
  private enrichFromN26(
    transaction: EnrichedTransaction,
    n26Transactions: EnrichedTransaction[]
  ): EnrichedTransaction {
    const enriched = { ...transaction };

    // For N26 transfers, mark as internal transfer
    enriched.enrichedDescription = 'Internal Transfer (N26 ↔ Sparkasse)';
    enriched.suggestedCategory = 'Internal Transfer';
    enriched.enrichmentSource = 'n26';

    return enriched;
  }

  /**
   * Extract merchant name from PayPal description
   */
  private extractMerchantFromPayPal(description: string): string | null {
    // PayPal descriptions often follow patterns like:
    // "PAYPAL *MERCHANTNAME" or "PP*MERCHANTNAME" or just the merchant name
    const patterns = [
      /paypal\s*\*\s*(.+)/i,
      /pp\s*\*\s*(.+)/i,
      /^([^-]+)\s*-/,  // "MERCHANT - Transaction details"
    ];

    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // If no pattern matches, clean up the description
    return description
      .replace(/paypal/gi, '')
      .replace(/pp\./gi, '')
      .replace(/\d{10,}/g, '') // Remove long numbers (transaction IDs)
      .trim() || null;
  }

  /**
   * Extract merchant name from Mastercard description
   */
  private extractMerchantFromMastercard(description: string): string | null {
    // Mastercard descriptions often include merchant name at the start
    const cleaned = description
      .replace(/\d{2}\.\d{2}\.\d{4}/g, '') // Remove dates
      .replace(/\d{2}\/\d{2}\/\d{4}/g, '')
      .replace(/[A-Z]{2}\d{2}[A-Z0-9]{4,}/g, '') // Remove reference numbers
      .trim();

    // Take first significant part
    const parts = cleaned.split(/[\s\-\/]+/);
    const merchant = parts.filter(p => p.length > 2).slice(0, 2).join(' ');

    return merchant || null;
  }

  /**
   * Suggest category based on merchant names
   */
  private suggestCategoryFromMerchants(merchants: string[]): string | undefined {
    const merchantLower = merchants.map(m => m.toLowerCase()).join(' ');

    // Common merchant-to-category mappings
    const categoryMappings: [RegExp, string][] = [
      [/amazon|amzn/i, 'Online Shopping'],
      [/netflix|spotify|disney|hulu|youtube|prime/i, 'Entertainment'],
      [/uber|lyft|taxi|grab/i, 'Transportation'],
      [/starbucks|mcdonald|burger|pizza|restaurant|cafe|coffee/i, 'Dining'],
      [/shell|esso|bp|tankstelle|petrol|gas station/i, 'Fuel'],
      [/rewe|edeka|lidl|aldi|kaufland|supermarket|grocery/i, 'Groceries'],
      [/dm|rossmann|apotheke|pharmacy|drugstore/i, 'Health & Pharmacy'],
      [/ikea|mediamarkt|saturn|electronics/i, 'Electronics & Home'],
      [/h&m|zara|primark|clothing|fashion/i, 'Clothing'],
      [/gym|fitness|sport/i, 'Fitness'],
      [/insurance|versicherung/i, 'Insurance'],
      [/hotel|booking|airbnb|hostel/i, 'Travel & Lodging'],
      [/steam|playstation|xbox|game/i, 'Gaming'],
    ];

    for (const [pattern, category] of categoryMappings) {
      if (pattern.test(merchantLower)) {
        return category;
      }
    }

    return undefined;
  }

  /**
   * Suggest category based on purchase descriptions
   */
  private suggestCategoryFromPurchases(descriptions: string[]): string | undefined {
    // Combine all descriptions and analyze
    const combined = descriptions.join(' ').toLowerCase();
    return this.suggestCategoryFromMerchants([combined]);
  }

  /**
   * Get category suggestions for a transaction
   */
  getCategorySuggestions(transaction: EnrichedTransaction): CategorySuggestion[] {
    const suggestions: CategorySuggestion[] = [];

    // First, try to enrich and get suggestion from linked transactions
    const enriched = this.enrichTransaction(transaction);
    if (enriched.suggestedCategory) {
      suggestions.push({
        category: enriched.suggestedCategory,
        confidence: 75,
        reason: `Based on ${enriched.enrichmentSource} transaction details`,
        source: 'linked_transaction'
      });
    }

    // Pattern-based suggestions from description
    const patternSuggestion = this.suggestCategoryFromMerchants([transaction.description]);
    if (patternSuggestion) {
      suggestions.push({
        category: patternSuggestion,
        confidence: 60,
        reason: 'Matched known merchant pattern',
        source: 'pattern'
      });
    }

    // Check for similar past transactions
    const similarTx = this.findSimilarCategorizedTransactions(transaction);
    if (similarTx.length > 0) {
      const categories = new Map<string, number>();
      similarTx.forEach(t => {
        if (t.category) {
          categories.set(t.category, (categories.get(t.category) || 0) + 1);
        }
      });

      // Get most common category
      let maxCount = 0;
      let topCategory = '';
      categories.forEach((count, cat) => {
        if (count > maxCount) {
          maxCount = count;
          topCategory = cat;
        }
      });

      if (topCategory && maxCount >= 2) {
        suggestions.push({
          category: topCategory,
          confidence: Math.min(90, 50 + maxCount * 10),
          reason: `${maxCount} similar transactions categorized as "${topCategory}"`,
          source: 'pattern'
        });
      }
    }

    // Sort by confidence
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Find similar categorized transactions
   */
  private findSimilarCategorizedTransactions(transaction: EnrichedTransaction): EnrichedTransaction[] {
    const description = transaction.description.toLowerCase();
    const beneficiary = transaction.beneficiary?.toLowerCase();

    return this.transactions.filter(t => {
      if (!t.category || t.id === transaction.id) return false;

      // Check beneficiary match
      if (beneficiary && t.beneficiary?.toLowerCase() === beneficiary) {
        return true;
      }

      // Check description similarity
      const otherDesc = t.description.toLowerCase();
      const words = description.split(/\s+/).filter(w => w.length > 3);
      const matchingWords = words.filter(w => otherDesc.includes(w));

      return matchingWords.length >= 2 || matchingWords.length / words.length > 0.5;
    });
  }

  /**
   * Detect transaction insights (recurring, unusual, etc.)
   */
  detectInsights(transaction: EnrichedTransaction): TransactionInsight[] {
    const insights: TransactionInsight[] = [];

    // Check for recurring transactions
    const recurring = this.detectRecurring(transaction);
    if (recurring) {
      insights.push(recurring);
    }

    // Check for unusual amount
    const unusual = this.detectUnusualAmount(transaction);
    if (unusual) {
      insights.push(unusual);
    }

    // Check for potential subscription
    const subscription = this.detectSubscription(transaction);
    if (subscription) {
      insights.push(subscription);
    }

    // Check for uncategorized
    if (!transaction.category) {
      insights.push({
        type: 'uncategorized',
        severity: 'action_required',
        message: 'This transaction needs categorization',
        suggestedAction: 'Assign a category'
      });
    }

    return insights;
  }

  /**
   * Detect if transaction is recurring
   */
  private detectRecurring(transaction: EnrichedTransaction): TransactionInsight | null {
    const similarTx = this.transactions.filter(t => {
      if (t.id === transaction.id) return false;

      // Same amount (within small tolerance)
      if (Math.abs(t.amount - transaction.amount) > 0.50) return false;

      // Similar description
      const desc1 = transaction.description.toLowerCase();
      const desc2 = t.description.toLowerCase();

      return desc1.includes(desc2.substring(0, 10)) || desc2.includes(desc1.substring(0, 10));
    });

    if (similarTx.length >= 2) {
      // Check if dates are roughly monthly apart
      const dates = [transaction, ...similarTx]
        .map(t => new Date(t.date).getTime())
        .sort((a, b) => a - b);

      const intervals = [];
      for (let i = 1; i < dates.length; i++) {
        intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24)); // days
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

      if (avgInterval >= 25 && avgInterval <= 35) {
        return {
          type: 'recurring',
          severity: 'info',
          message: `Monthly recurring transaction (${similarTx.length + 1} occurrences)`,
          relatedTransactionIds: similarTx.map(t => t.id)
        };
      }

      if (avgInterval >= 6 && avgInterval <= 8) {
        return {
          type: 'recurring',
          severity: 'info',
          message: `Weekly recurring transaction`,
          relatedTransactionIds: similarTx.map(t => t.id)
        };
      }
    }

    return null;
  }

  /**
   * Detect unusual amount
   */
  private detectUnusualAmount(transaction: EnrichedTransaction): TransactionInsight | null {
    // Find transactions from same source/beneficiary
    const similar = this.transactions.filter(t =>
      t.id !== transaction.id &&
      t.source?.connectorType === transaction.source?.connectorType &&
      (t.beneficiary === transaction.beneficiary || t.category === transaction.category)
    );

    if (similar.length < 3) return null;

    const amounts = similar.map(t => Math.abs(t.amount));
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const stdDev = Math.sqrt(
      amounts.reduce((sum, a) => sum + Math.pow(a - avg, 2), 0) / amounts.length
    );

    const currentAmount = Math.abs(transaction.amount);

    if (currentAmount > avg + 2 * stdDev) {
      return {
        type: 'unusual_amount',
        severity: 'warning',
        message: `Amount is unusually high (${((currentAmount / avg - 1) * 100).toFixed(0)}% above average)`,
        suggestedAction: 'Verify this transaction'
      };
    }

    return null;
  }

  /**
   * Detect potential subscription
   */
  private detectSubscription(transaction: EnrichedTransaction): TransactionInsight | null {
    const subscriptionPatterns = [
      /netflix/i, /spotify/i, /amazon prime/i, /disney/i, /hulu/i,
      /youtube premium/i, /apple music/i, /hbo/i, /gym/i, /fitness/i,
      /insurance/i, /versicherung/i, /membership/i, /mitgliedschaft/i,
      /subscription/i, /abo/i, /monthly/i, /monatlich/i
    ];

    const desc = transaction.description.toLowerCase();
    const isSubscription = subscriptionPatterns.some(p => p.test(desc));

    if (isSubscription && !transaction.category?.toLowerCase().includes('subscription')) {
      return {
        type: 'subscription',
        severity: 'info',
        message: 'This appears to be a subscription payment',
        suggestedAction: 'Consider categorizing as "Subscriptions"'
      };
    }

    return null;
  }

  /**
   * Get all enriched transactions
   */
  enrichAllTransactions(): EnrichedTransaction[] {
    return this.transactions.map(t => this.enrichTransaction(t));
  }

  /**
   * Get spending insights for a category
   */
  getCategoryInsights(category: string): {
    totalSpent: number;
    transactionCount: number;
    avgTransaction: number;
    merchants: string[];
    trend: 'up' | 'down' | 'stable';
  } {
    const categoryTx = this.transactions.filter(t =>
      t.category === category && t.amount < 0
    );

    const totalSpent = Math.abs(categoryTx.reduce((sum, t) => sum + t.amount, 0));
    const transactionCount = categoryTx.length;
    const avgTransaction = transactionCount > 0 ? totalSpent / transactionCount : 0;

    // Extract merchants
    const merchants = [...new Set(
      categoryTx
        .map(t => t.beneficiary || this.extractMerchantFromPayPal(t.description))
        .filter(Boolean) as string[]
    )];

    // Calculate trend (compare last 30 days to previous 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const recentSpending = categoryTx
      .filter(t => new Date(t.date) >= thirtyDaysAgo)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const previousSpending = categoryTx
      .filter(t => {
        const d = new Date(t.date);
        return d >= sixtyDaysAgo && d < thirtyDaysAgo;
      })
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (previousSpending > 0) {
      const change = (recentSpending - previousSpending) / previousSpending;
      if (change > 0.1) trend = 'up';
      else if (change < -0.1) trend = 'down';
    }

    return {
      totalSpent,
      transactionCount,
      avgTransaction,
      merchants,
      trend
    };
  }
}

export default CrossAccountIntelligence;
