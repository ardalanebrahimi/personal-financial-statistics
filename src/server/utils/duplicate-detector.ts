/**
 * Duplicate Detection Utility
 *
 * Centralized logic for detecting duplicate transactions.
 * Previously duplicated in server.ts (find-duplicates, remove-duplicates-auto)
 * and csv-import-processor.ts.
 */

import type { StoredTransaction } from '../database/database';

export interface DuplicateGroup {
  key: string;
  transactions: StoredTransaction[];
}

/**
 * Extract Amazon order number from transaction description.
 * Matches patterns like "306-3583117-4868346" or partial "3583117-4868346".
 */
export function extractAmazonOrderNumber(description: string): string | null {
  const match = description.match(/\d{7}-\d{7}/);
  return match ? match[0] : null;
}

/**
 * Generate a unique key for duplicate detection.
 * Uses date + amount + (order number OR beneficiary OR description).
 */
export function generateDuplicateKey(tx: StoredTransaction): string {
  const dateStr = new Date(tx.date).toISOString().split('T')[0];
  // IMPORTANT: Don't use Math.abs() - a purchase (-9.99) and refund (+9.99) are NOT duplicates!
  const amountKey = tx.amount.toFixed(2);

  // For Amazon transactions, use order number as additional key
  const orderNum = extractAmazonOrderNumber(tx.description);

  if (orderNum) {
    // Amazon: date + order number + amount
    return `amazon:${dateStr}:${orderNum}:${amountKey}`;
  } else if (tx.beneficiary) {
    // Non-Amazon with beneficiary: date + amount + normalized beneficiary
    const benefKey = tx.beneficiary.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
    return `benef:${dateStr}:${amountKey}:${benefKey}`;
  } else {
    // Non-Amazon without beneficiary: date + amount + normalized description
    const descKey = tx.description.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
    return `generic:${dateStr}:${amountKey}:${descKey}`;
  }
}

/**
 * Score a transaction for duplicate resolution.
 * Higher score = more information = better to keep.
 */
export function scoreTx(tx: StoredTransaction): number {
  let score = 0;
  if (tx.category) score += 10;
  if (tx.beneficiary) score += 5;
  if (tx.linkedOrderIds && tx.linkedOrderIds.length > 0) score += 8;
  if (tx.source?.externalId) score += 3;
  // Prefer longer descriptions (more info)
  score += Math.min(tx.description.length / 20, 5);
  return score;
}

/**
 * Group transactions by duplicate keys.
 * Returns only groups with more than one transaction (actual duplicates).
 */
export function findDuplicateGroups(transactions: StoredTransaction[]): DuplicateGroup[] {
  const groups = new Map<string, StoredTransaction[]>();

  for (const tx of transactions) {
    // Skip context-only transactions (Amazon orders) - they're not duplicates of bank transactions
    if (tx.isContextOnly) continue;

    const key = generateDuplicateKey(tx);

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(tx);
  }

  // Return only groups with more than one transaction
  const duplicateGroups: DuplicateGroup[] = [];
  for (const [key, txs] of groups) {
    if (txs.length > 1) {
      duplicateGroups.push({ key, transactions: txs });
    }
  }

  return duplicateGroups;
}

/**
 * Identify duplicates to remove, keeping the best transaction in each group.
 * Returns IDs of transactions that should be removed.
 */
export function identifyDuplicatesToRemove(transactions: StoredTransaction[]): string[] {
  const groups = findDuplicateGroups(transactions);
  const idsToRemove: string[] = [];

  for (const group of groups) {
    // Sort by score descending, keep first (best)
    const sorted = [...group.transactions].sort((a, b) => scoreTx(b) - scoreTx(a));

    // Mark all but the first for removal
    for (let i = 1; i < sorted.length; i++) {
      idsToRemove.push(sorted[i].id);
    }
  }

  return idsToRemove;
}

/**
 * Check if a transaction is a duplicate of existing transactions.
 * Used during import to avoid creating duplicates.
 */
export function isDuplicate(
  newTx: { date: Date; amount: number; description: string; externalId?: string },
  existingTransactions: StoredTransaction[],
  connectorType?: string
): boolean {
  // Primary check: externalId (most reliable)
  if (newTx.externalId && connectorType) {
    const hasSameExternalId = existingTransactions.some(
      t => t.source?.connectorType === connectorType && t.source?.externalId === newTx.externalId
    );
    if (hasSameExternalId) return true;
  }

  // Secondary check: date + amount + description signature
  const dateKey = newTx.date.toISOString().split('T')[0];
  const amountKey = newTx.amount.toFixed(2);
  const descKey = newTx.description.substring(0, 30).toLowerCase().replace(/\s+/g, '');
  const signature = `${dateKey}-${amountKey}-${descKey}`;

  return existingTransactions.some(t => {
    const existingDateKey = new Date(t.date).toISOString().split('T')[0];
    const existingAmountKey = t.amount.toFixed(2);
    const existingDescKey = t.description.substring(0, 30).toLowerCase().replace(/\s+/g, '');
    const existingSignature = `${existingDateKey}-${existingAmountKey}-${existingDescKey}`;
    return signature === existingSignature;
  });
}

/**
 * Build lookup sets for fast duplicate detection during bulk import.
 */
export function buildDuplicateLookupSets(transactions: StoredTransaction[]): {
  externalIds: Set<string>;
  signatures: Set<string>;
} {
  const externalIds = new Set<string>();
  const signatures = new Set<string>();

  for (const t of transactions) {
    if (t.source?.externalId) {
      externalIds.add(`${t.source.connectorType}-${t.source.externalId}`);
    }

    const dateKey = new Date(t.date).toISOString().split('T')[0];
    const amountKey = t.amount.toFixed(2);
    const descKey = t.description.substring(0, 30).toLowerCase().replace(/\s+/g, '');
    signatures.add(`${dateKey}-${amountKey}-${descKey}`);
  }

  return { externalIds, signatures };
}
