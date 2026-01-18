/**
 * Matching Controller
 *
 * Handles HTTP requests for transaction matching.
 */

import { Request, Response } from 'express';
import * as db from '../database/database';
import { AppError } from '../middleware';
import {
  TransactionMatcher,
  applyMatchesToTransactions,
  StoredTransaction as MatcherStoredTransaction
} from '../matching/matcher';

type TransactionMatch = db.TransactionMatch;

/**
 * Convert stored transactions to matcher format.
 */
function toMatcherTransactions(transactions: db.StoredTransaction[]): MatcherStoredTransaction[] {
  return transactions.map(tx => ({
    ...tx,
    matchId: tx.matchId,
    matchInfo: tx.matchInfo ? {
      ...tx.matchInfo,
      patternType: tx.matchInfo.patternType as any,
      source: tx.matchInfo.source as any,
      confidence: tx.matchInfo.confidence as any
    } : undefined
  })) as MatcherStoredTransaction[];
}

/**
 * POST /matching/run
 * Run automatic matching on all transactions.
 */
export async function runMatching(req: Request, res: Response): Promise<void> {
  const transactions = db.getAllTransactions();
  const existingMatches = db.getAllMatches();

  const matcherTransactions = toMatcherTransactions(transactions);
  const matcher = new TransactionMatcher(matcherTransactions, existingMatches);
  const result = matcher.runAllMatchers();

  // Save new matches
  const allMatches = [...existingMatches, ...result.newMatches];
  db.saveMatches(allMatches);

  // Apply matches to transactions and save
  const updatedTransactions = applyMatchesToTransactions(matcherTransactions, result.newMatches);
  db.bulkUpdateTransactions(updatedTransactions);

  res.json({
    success: true,
    newMatches: result.newMatches.length,
    suggestions: result.suggestions.length,
    stats: result.stats
  });
}

/**
 * GET /matching
 * Get all matches.
 */
export async function getAll(req: Request, res: Response): Promise<void> {
  const matches = db.getAllMatches();
  res.json({ matches });
}

/**
 * GET /matching/suggestions
 * Get match suggestions.
 */
export async function getSuggestions(req: Request, res: Response): Promise<void> {
  const transactions = db.getAllTransactions();
  const existingMatches = db.getAllMatches();

  const matcherTransactions = toMatcherTransactions(transactions);
  const matcher = new TransactionMatcher(matcherTransactions, existingMatches);
  const result = matcher.runAllMatchers();

  res.json({ suggestions: result.suggestions });
}

/**
 * POST /matching/confirm
 * Confirm a suggested match.
 */
export async function confirmMatch(req: Request, res: Response): Promise<void> {
  const { primaryTransactionId, linkedTransactionIds, patternType } = req.body;

  if (!primaryTransactionId || !linkedTransactionIds || !patternType) {
    throw AppError.badRequest('Missing required fields: primaryTransactionId, linkedTransactionIds, patternType');
  }

  const transactions = db.getAllTransactions();
  const existingMatches = db.getAllMatches();

  const primaryTx = transactions.find(tx => tx.id === primaryTransactionId);
  if (!primaryTx) {
    throw AppError.notFound('Primary transaction not found');
  }

  const now = new Date().toISOString();
  const newMatch: TransactionMatch = {
    id: `match-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: now,
    updatedAt: now,
    patternType,
    source: 'suggested',
    confidence: 'medium',
    primaryTransactionId,
    linkedTransactionIds,
    matchedAmount: Math.abs(primaryTx.amount)
  };

  existingMatches.push(newMatch);
  db.saveMatches(existingMatches);

  const matcherTransactions = toMatcherTransactions(transactions);
  const updatedTransactions = applyMatchesToTransactions(matcherTransactions, [newMatch]);
  db.bulkUpdateTransactions(updatedTransactions);

  res.json({ success: true, match: newMatch });
}

/**
 * POST /matching/manual
 * Create a manual match between transactions.
 */
export async function createManualMatch(req: Request, res: Response): Promise<void> {
  const { primaryTransactionId, linkedTransactionIds, notes } = req.body;

  if (!primaryTransactionId || !linkedTransactionIds || linkedTransactionIds.length === 0) {
    throw AppError.badRequest('Missing required fields');
  }

  const transactions = db.getAllTransactions();
  const existingMatches = db.getAllMatches();

  const primaryTx = transactions.find(tx => tx.id === primaryTransactionId);
  if (!primaryTx) {
    throw AppError.notFound('Primary transaction not found');
  }

  // Verify linked transactions exist
  for (const linkedId of linkedTransactionIds) {
    const linkedTx = transactions.find(tx => tx.id === linkedId);
    if (!linkedTx) {
      throw AppError.notFound(`Linked transaction ${linkedId} not found`);
    }
  }

  const now = new Date().toISOString();
  const newMatch: TransactionMatch = {
    id: `match-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: now,
    updatedAt: now,
    patternType: 'custom',
    source: 'manual',
    confidence: 'high',
    primaryTransactionId,
    linkedTransactionIds,
    matchedAmount: Math.abs(primaryTx.amount),
    notes
  };

  existingMatches.push(newMatch);
  db.saveMatches(existingMatches);

  const matcherTransactions = toMatcherTransactions(transactions);
  const updatedTransactions = applyMatchesToTransactions(matcherTransactions, [newMatch]);
  db.bulkUpdateTransactions(updatedTransactions);

  res.json({ success: true, match: newMatch });
}

/**
 * DELETE /matching/:id
 * Delete a match.
 */
export async function deleteMatch(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  // Get the match to find affected transactions
  const matches = db.getAllMatches();
  const matchToDelete = matches.find(m => m.id === id);

  if (!matchToDelete) {
    throw AppError.notFound('Match not found');
  }

  // Clear match info from affected transactions
  const transactions = db.getAllTransactions();
  const affectedIds = [matchToDelete.primaryTransactionId, ...matchToDelete.linkedTransactionIds];

  for (const txId of affectedIds) {
    const tx = transactions.find(t => t.id === txId);
    if (tx && tx.matchId === id) {
      tx.matchId = undefined;
      tx.matchInfo = undefined;
      db.updateTransaction(tx);
    }
  }

  db.deleteMatch(id);

  res.json({ success: true });
}

/**
 * GET /matching/overview
 * Get comprehensive matching overview for Amazon/PayPal.
 */
export async function getOverview(req: Request, res: Response): Promise<void> {
  const transactions = db.getAllTransactions();

  // Detection patterns for payment platforms
  const AMAZON_PATTERNS = [
    /amazon/i, /amzn/i, /amazon\.de/i, /amazon\s+payments/i,
    /amazon\s+eu/i, /amz\*|amzn\*/i, /amazon\s+prime/i, /prime\s+video/i
  ];
  const PAYPAL_PATTERNS = [
    /paypal/i, /pp\s*\*/i, /paypal\s*\(europe\)/i, /paypal\s*pte/i, /paypal\s*europe/i
  ];

  // Helper function to detect payment platform from transaction
  const detectPlatform = (tx: db.StoredTransaction): 'amazon' | 'paypal' | null => {
    if (tx.isContextOnly) return null;
    const searchText = `${tx.description} ${tx.beneficiary || ''}`.toLowerCase();
    if (AMAZON_PATTERNS.some(p => p.test(searchText))) return 'amazon';
    if (PAYPAL_PATTERNS.some(p => p.test(searchText))) return 'paypal';
    return null;
  };

  // Helper to check if a context-only transaction is linked to any bank transaction
  const isLinkedToAnyBank = (contextId: string): boolean => {
    return transactions.some(tx =>
      !tx.isContextOnly &&
      tx.linkedOrderIds &&
      tx.linkedOrderIds.includes(contextId)
    );
  };

  // Enrich transactions with detected platform
  const enrichedTx = transactions.map(tx => ({
    ...tx,
    detectedPlatform: tx.isContextOnly ? null : detectPlatform(tx)
  }));

  // Amazon analysis
  const amazonBankUnlinked = enrichedTx.filter(tx =>
    tx.detectedPlatform === 'amazon' &&
    !tx.isContextOnly &&
    (!tx.linkedOrderIds || tx.linkedOrderIds.length === 0)
  );

  const amazonOrdersUnlinked = enrichedTx.filter(tx =>
    tx.isContextOnly &&
    tx.source?.connectorType === 'amazon' &&
    !isLinkedToAnyBank(tx.id)
  );

  const amazonBankLinked = enrichedTx.filter(tx =>
    tx.detectedPlatform === 'amazon' &&
    !tx.isContextOnly &&
    tx.linkedOrderIds &&
    tx.linkedOrderIds.length > 0
  );

  // PayPal analysis
  const paypalBankUnlinked = enrichedTx.filter(tx =>
    tx.detectedPlatform === 'paypal' &&
    !tx.isContextOnly &&
    (!tx.linkedOrderIds || tx.linkedOrderIds.length === 0)
  );

  const paypalImportsUnlinked = enrichedTx.filter(tx =>
    tx.isContextOnly &&
    tx.source?.connectorType === 'paypal' &&
    !isLinkedToAnyBank(tx.id)
  );

  const paypalBankLinked = enrichedTx.filter(tx =>
    tx.detectedPlatform === 'paypal' &&
    !tx.isContextOnly &&
    tx.linkedOrderIds &&
    tx.linkedOrderIds.length > 0
  );

  // Generate suggestions for matching
  const generateSuggestions = (
    bankTxs: typeof enrichedTx,
    contextTxs: typeof enrichedTx
  ) => {
    const suggestions: Array<{
      bankTransactionId: string;
      contextIds: string[];
      confidence: 'high' | 'medium' | 'low';
      totalAmount: number;
      amountDiff: number;
    }> = [];

    for (const bankTx of bankTxs) {
      const bankDate = new Date(bankTx.date);
      const bankAmount = Math.abs(bankTx.amount);

      const candidates = contextTxs.filter(ctx => {
        const ctxDate = new Date(ctx.date);
        const daysDiff = Math.abs((bankDate.getTime() - ctxDate.getTime()) / 86400000);
        return daysDiff <= 7;
      });

      for (const ctx of candidates) {
        const ctxAmount = Math.abs(ctx.amount);
        const amountDiff = Math.abs(ctxAmount - bankAmount);
        const daysDiff = Math.abs((bankDate.getTime() - new Date(ctx.date).getTime()) / 86400000);

        if (amountDiff < 0.05) {
          suggestions.push({
            bankTransactionId: bankTx.id,
            contextIds: [ctx.id],
            confidence: daysDiff <= 2 ? 'high' : 'medium',
            totalAmount: ctxAmount,
            amountDiff
          });
        }
      }
    }

    return suggestions;
  };

  const amazonSuggestions = generateSuggestions(amazonBankUnlinked, amazonOrdersUnlinked);
  const paypalSuggestions = generateSuggestions(paypalBankUnlinked, paypalImportsUnlinked);

  res.json({
    amazon: {
      bankUnlinked: amazonBankUnlinked,
      ordersUnlinked: amazonOrdersUnlinked,
      bankLinked: amazonBankLinked,
      suggestions: amazonSuggestions,
      stats: {
        totalBankCharges: amazonBankLinked.length + amazonBankUnlinked.length,
        linkedBankCharges: amazonBankLinked.length,
        unlinkedBankCharges: amazonBankUnlinked.length,
        totalOrders: amazonOrdersUnlinked.length + amazonBankLinked.reduce(
          (sum, tx) => sum + (tx.linkedOrderIds?.length || 0), 0
        ),
        unlinkedOrders: amazonOrdersUnlinked.length,
        suggestionCount: amazonSuggestions.length
      }
    },
    paypal: {
      bankUnlinked: paypalBankUnlinked,
      importsUnlinked: paypalImportsUnlinked,
      bankLinked: paypalBankLinked,
      suggestions: paypalSuggestions,
      stats: {
        totalBankCharges: paypalBankLinked.length + paypalBankUnlinked.length,
        linkedBankCharges: paypalBankLinked.length,
        unlinkedBankCharges: paypalBankUnlinked.length,
        totalImports: paypalImportsUnlinked.length + paypalBankLinked.reduce(
          (sum, tx) => sum + (tx.linkedOrderIds?.length || 0), 0
        ),
        unlinkedImports: paypalImportsUnlinked.length,
        suggestionCount: paypalSuggestions.length
      }
    }
  });
}

/**
 * GET /matching/:id
 * Get match details.
 */
export async function getById(req: Request, res: Response): Promise<void> {
  const matches = db.getAllMatches();
  const match = matches.find(m => m.id === req.params['id']);

  if (!match) {
    throw AppError.notFound('Match not found');
  }

  // Get the actual transactions
  const transactions = db.getAllTransactions();
  const primaryTx = transactions.find(t => t.id === match.primaryTransactionId);
  const linkedTxs = match.linkedTransactionIds.map(id => transactions.find(t => t.id === id)).filter(Boolean);

  res.json({
    match,
    primaryTransaction: primaryTx,
    linkedTransactions: linkedTxs
  });
}
