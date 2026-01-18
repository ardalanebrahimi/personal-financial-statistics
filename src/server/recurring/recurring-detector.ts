/**
 * Recurring Transaction Detector
 *
 * Detects and groups recurring transactions based on patterns:
 * - Same beneficiary
 * - Same/similar amount
 * - Regular interval (weekly, monthly, quarterly, yearly)
 */

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'irregular';
export type RecurringConfidence = 'high' | 'medium' | 'low';

export interface RecurringPattern {
  id: string;
  beneficiary: string;
  averageAmount: number;
  frequency: RecurringFrequency;
  averageIntervalDays: number;
  confidence: RecurringConfidence;
  transactionIds: string[];
  firstOccurrence: string;
  lastOccurrence: string;
  occurrenceCount: number;
  category?: string;
  isActive: boolean;
  nextExpectedDate?: string;
  amountVariance: number;
  description?: string;
}

export interface RecurringDetectionResult {
  patterns: RecurringPattern[];
  stats: {
    totalTransactionsAnalyzed: number;
    patternsDetected: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    transactionsInPatterns: number;
  };
}

export interface DetectableTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  beneficiary?: string;
  category?: string;
  isContextOnly?: boolean;
}

// Configuration for detection
const DETECTION_CONFIG = {
  // Minimum occurrences to consider a pattern
  minOccurrences: 3,
  // Amount tolerance for matching (percentage)
  amountTolerancePercent: 0.15,
  // Absolute amount tolerance for small amounts
  amountToleranceAbsolute: 2.00,
  // Interval tolerances (in days)
  weeklyTolerance: 2,
  biweeklyTolerance: 3,
  monthlyTolerance: 5,
  quarterlyTolerance: 10,
  yearlyTolerance: 15,
  // Maximum days to consider "active"
  maxInactiveDays: 45
};

// Expected intervals for different frequencies (in days)
const EXPECTED_INTERVALS: Record<RecurringFrequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
  yearly: 365,
  irregular: 0
};

export class RecurringDetector {
  private transactions: DetectableTransaction[] = [];

  constructor(transactions: DetectableTransaction[]) {
    // Filter out context-only transactions and sort by date
    this.transactions = transactions
      .filter(tx => !tx.isContextOnly)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  /**
   * Detect all recurring patterns
   */
  detectPatterns(): RecurringDetectionResult {
    const result: RecurringDetectionResult = {
      patterns: [],
      stats: {
        totalTransactionsAnalyzed: this.transactions.length,
        patternsDetected: 0,
        highConfidence: 0,
        mediumConfidence: 0,
        lowConfidence: 0,
        transactionsInPatterns: 0
      }
    };

    // Group transactions by beneficiary
    const byBeneficiary = this.groupByBeneficiary();

    // Track which transactions are already part of a pattern
    const usedTransactionIds = new Set<string>();

    // Analyze each beneficiary group
    for (const [beneficiary, txGroup] of byBeneficiary) {
      if (txGroup.length < DETECTION_CONFIG.minOccurrences) continue;

      // Further group by similar amounts
      const amountGroups = this.groupBySimilarAmount(txGroup);

      for (const amountGroup of amountGroups) {
        if (amountGroup.length < DETECTION_CONFIG.minOccurrences) continue;

        // Check if any transactions are already used
        const unusedTx = amountGroup.filter(tx => !usedTransactionIds.has(tx.id));
        if (unusedTx.length < DETECTION_CONFIG.minOccurrences) continue;

        // Analyze the interval pattern
        const pattern = this.analyzePattern(beneficiary, unusedTx);

        if (pattern) {
          result.patterns.push(pattern);
          pattern.transactionIds.forEach(id => usedTransactionIds.add(id));
        }
      }
    }

    // Calculate stats
    result.stats.patternsDetected = result.patterns.length;
    result.stats.transactionsInPatterns = new Set(
      result.patterns.flatMap(p => p.transactionIds)
    ).size;
    result.stats.highConfidence = result.patterns.filter(p => p.confidence === 'high').length;
    result.stats.mediumConfidence = result.patterns.filter(p => p.confidence === 'medium').length;
    result.stats.lowConfidence = result.patterns.filter(p => p.confidence === 'low').length;

    return result;
  }

  /**
   * Group transactions by beneficiary
   */
  private groupByBeneficiary(): Map<string, DetectableTransaction[]> {
    const groups = new Map<string, DetectableTransaction[]>();

    for (const tx of this.transactions) {
      const key = this.normalizeBeneficiary(tx.beneficiary || tx.description);
      const existing = groups.get(key) || [];
      existing.push(tx);
      groups.set(key, existing);
    }

    return groups;
  }

  /**
   * Normalize beneficiary name for grouping
   */
  private normalizeBeneficiary(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 30); // First 30 chars
  }

  /**
   * Group transactions by similar amounts
   */
  private groupBySimilarAmount(transactions: DetectableTransaction[]): DetectableTransaction[][] {
    const groups: DetectableTransaction[][] = [];
    const used = new Set<string>();

    for (const tx of transactions) {
      if (used.has(tx.id)) continue;

      const group: DetectableTransaction[] = [tx];
      used.add(tx.id);

      // Find similar amounts
      for (const other of transactions) {
        if (used.has(other.id)) continue;

        if (this.amountsAreSimilar(tx.amount, other.amount)) {
          group.push(other);
          used.add(other.id);
        }
      }

      if (group.length >= DETECTION_CONFIG.minOccurrences) {
        groups.push(group);
      }
    }

    return groups;
  }

  /**
   * Check if two amounts are similar
   */
  private amountsAreSimilar(a: number, b: number): boolean {
    const absA = Math.abs(a);
    const absB = Math.abs(b);
    const diff = Math.abs(absA - absB);

    // Check absolute tolerance for small amounts
    if (diff <= DETECTION_CONFIG.amountToleranceAbsolute) {
      return true;
    }

    // Check percentage tolerance
    const avg = (absA + absB) / 2;
    return diff / avg <= DETECTION_CONFIG.amountTolerancePercent;
  }

  /**
   * Analyze pattern in a group of transactions
   */
  private analyzePattern(
    beneficiary: string,
    transactions: DetectableTransaction[]
  ): RecurringPattern | null {
    if (transactions.length < DETECTION_CONFIG.minOccurrences) {
      return null;
    }

    // Sort by date
    const sorted = [...transactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Calculate intervals between transactions
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prevDate = new Date(sorted[i - 1].date);
      const currDate = new Date(sorted[i].date);
      const daysDiff = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      intervals.push(daysDiff);
    }

    if (intervals.length === 0) {
      return null;
    }

    // Calculate average interval
    const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;

    // Determine frequency
    const frequency = this.determineFrequency(avgInterval, intervals);

    // Calculate confidence based on interval consistency
    const confidence = this.calculateConfidence(intervals, frequency);

    // Calculate amount statistics
    const amounts = sorted.map(tx => Math.abs(tx.amount));
    const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    const amountVariance = Math.max(...amounts) - Math.min(...amounts);

    // Get the most common category
    const categories = sorted.map(tx => tx.category).filter(Boolean);
    const category = this.getMostCommon(categories);

    // Build description
    const originalBeneficiary = sorted[0].beneficiary || sorted[0].description.substring(0, 50);

    // Determine if still active
    const lastDate = new Date(sorted[sorted.length - 1].date);
    const daysSinceLastOccurrence = Math.round(
      (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const isActive = daysSinceLastOccurrence < DETECTION_CONFIG.maxInactiveDays;

    // Calculate next expected date
    let nextExpectedDate: string | undefined;
    if (isActive && frequency !== 'irregular') {
      const expectedInterval = EXPECTED_INTERVALS[frequency] || avgInterval;
      const nextDate = new Date(lastDate.getTime() + expectedInterval * 24 * 60 * 60 * 1000);
      nextExpectedDate = nextDate.toISOString();
    }

    return {
      id: `recurring-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      beneficiary: originalBeneficiary,
      averageAmount: avgAmount,
      frequency,
      averageIntervalDays: Math.round(avgInterval),
      confidence,
      transactionIds: sorted.map(tx => tx.id),
      firstOccurrence: sorted[0].date,
      lastOccurrence: sorted[sorted.length - 1].date,
      occurrenceCount: sorted.length,
      category,
      isActive,
      nextExpectedDate,
      amountVariance,
      description: this.generateDescription(frequency, avgAmount, originalBeneficiary)
    };
  }

  /**
   * Determine the frequency based on average interval
   */
  private determineFrequency(avgInterval: number, intervals: number[]): RecurringFrequency {
    // Check each frequency type
    if (this.matchesFrequency(avgInterval, 7, DETECTION_CONFIG.weeklyTolerance)) {
      return 'weekly';
    }
    if (this.matchesFrequency(avgInterval, 14, DETECTION_CONFIG.biweeklyTolerance)) {
      return 'biweekly';
    }
    if (this.matchesFrequency(avgInterval, 30, DETECTION_CONFIG.monthlyTolerance)) {
      return 'monthly';
    }
    if (this.matchesFrequency(avgInterval, 91, DETECTION_CONFIG.quarterlyTolerance)) {
      return 'quarterly';
    }
    if (this.matchesFrequency(avgInterval, 365, DETECTION_CONFIG.yearlyTolerance)) {
      return 'yearly';
    }

    return 'irregular';
  }

  /**
   * Check if interval matches expected frequency
   */
  private matchesFrequency(avgInterval: number, expected: number, tolerance: number): boolean {
    return Math.abs(avgInterval - expected) <= tolerance;
  }

  /**
   * Calculate confidence based on interval consistency
   */
  private calculateConfidence(intervals: number[], frequency: RecurringFrequency): RecurringConfidence {
    if (frequency === 'irregular') {
      return 'low';
    }

    const expected = EXPECTED_INTERVALS[frequency];
    const variance = this.calculateVariance(intervals);

    // Calculate how consistent the intervals are
    const avgDeviation = intervals.reduce(
      (sum, i) => sum + Math.abs(i - expected), 0
    ) / intervals.length;

    if (avgDeviation <= 2 && intervals.length >= 4) {
      return 'high';
    }
    if (avgDeviation <= 5 && intervals.length >= 3) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Calculate variance of numbers
   */
  private calculateVariance(numbers: number[]): number {
    const avg = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
    const squaredDiffs = numbers.map(n => Math.pow(n - avg, 2));
    return squaredDiffs.reduce((sum, d) => sum + d, 0) / numbers.length;
  }

  /**
   * Get most common value from array
   */
  private getMostCommon<T>(arr: T[]): T | undefined {
    if (arr.length === 0) return undefined;

    const counts = new Map<T, number>();
    for (const item of arr) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }

    let maxCount = 0;
    let mostCommon: T | undefined;
    for (const [item, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = item;
      }
    }

    return mostCommon;
  }

  /**
   * Generate human-readable description
   */
  private generateDescription(
    frequency: RecurringFrequency,
    amount: number,
    beneficiary: string
  ): string {
    const frequencyText: Record<RecurringFrequency, string> = {
      weekly: 'Weekly',
      biweekly: 'Bi-weekly',
      monthly: 'Monthly',
      quarterly: 'Quarterly',
      yearly: 'Yearly',
      irregular: 'Recurring'
    };

    return `${frequencyText[frequency]} payment of €${amount.toFixed(2)} to ${beneficiary}`;
  }
}

/**
 * Get transactions that belong to a recurring pattern
 */
export function getRecurringTransactions(
  pattern: RecurringPattern,
  transactions: DetectableTransaction[]
): DetectableTransaction[] {
  return transactions.filter(tx => pattern.transactionIds.includes(tx.id));
}

/**
 * Predict next occurrences of a recurring pattern
 */
export function predictNextOccurrences(
  pattern: RecurringPattern,
  count: number = 3
): Date[] {
  if (pattern.frequency === 'irregular' || !pattern.isActive) {
    return [];
  }

  const lastDate = new Date(pattern.lastOccurrence);
  const interval = EXPECTED_INTERVALS[pattern.frequency] || pattern.averageIntervalDays;
  const predictions: Date[] = [];

  for (let i = 1; i <= count; i++) {
    const nextDate = new Date(lastDate.getTime() + (interval * i * 24 * 60 * 60 * 1000));
    predictions.push(nextDate);
  }

  return predictions;
}

export default RecurringDetector;
