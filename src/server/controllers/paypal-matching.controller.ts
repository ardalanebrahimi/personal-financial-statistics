/**
 * PayPal Matching Controller
 *
 * Handles HTTP requests for PayPal transaction matching.
 */

import { Request, Response } from 'express';
import * as db from '../database/database';
import { AppError } from '../middleware';
import { PayPalMatcher, applyPayPalMatches } from '../matching/paypal-matcher';
import { MatchableTransaction } from '../matching/order-matcher';

/**
 * Convert stored transaction to matchable format.
 */
function toMatchableTransaction(tx: db.StoredTransaction): MatchableTransaction {
  return {
    id: tx.id,
    date: tx.date,
    description: tx.description,
    amount: tx.amount,
    category: tx.category,
    beneficiary: tx.beneficiary,
    source: tx.source,
    isContextOnly: tx.isContextOnly,
    linkedOrderIds: tx.linkedOrderIds
  };
}

/**
 * POST /paypal-matching/run
 * Run PayPal matching algorithm.
 */
export async function run(req: Request, res: Response): Promise<void> {
  const transactions = db.getAllTransactions();
  const matchableTransactions = transactions.map(toMatchableTransaction);

  const matcher = new PayPalMatcher(matchableTransactions);
  const result = matcher.runMatching();

  if (result.autoMatches.length > 0) {
    const updatedTransactions = applyPayPalMatches(matchableTransactions, result.autoMatches);

    db.bulkUpdateTransactions(updatedTransactions.map(tx => ({
      ...tx,
      category: tx.category || '',
      timestamp: new Date().toISOString()
    })) as db.StoredTransaction[]);
  }

  res.json({
    success: true,
    autoMatched: result.autoMatches.length,
    suggestions: result.suggestions.length,
    stats: result.stats,
    matches: result.autoMatches,
    pendingSuggestions: result.suggestions
  });
}

/**
 * GET /paypal-matching/suggestions
 * Get PayPal match suggestions without applying.
 */
export async function getSuggestions(req: Request, res: Response): Promise<void> {
  const transactions = db.getAllTransactions();
  const matchableTransactions = transactions.map(toMatchableTransaction);

  const matcher = new PayPalMatcher(matchableTransactions);
  const result = matcher.runMatching();

  res.json({
    suggestions: result.suggestions,
    potentialAutoMatches: result.autoMatches,
    stats: result.stats
  });
}

/**
 * POST /paypal-matching/link
 * Manually link PayPal transactions to a bank transaction.
 */
export async function link(req: Request, res: Response): Promise<void> {
  const { bankTransactionId, paypalIds } = req.body;

  if (!bankTransactionId || !paypalIds || !Array.isArray(paypalIds)) {
    throw AppError.badRequest('bankTransactionId and paypalIds array are required');
  }

  const transactions = db.getAllTransactions();

  const bankTx = transactions.find(tx => tx.id === bankTransactionId);
  if (!bankTx) {
    throw AppError.notFound('Bank transaction not found');
  }

  if (bankTx.isContextOnly) {
    throw AppError.badRequest('Cannot link to a context-only transaction');
  }

  const paypalTxs = transactions.filter(tx =>
    paypalIds.includes(tx.id) &&
    tx.isContextOnly &&
    tx.source?.connectorType === 'paypal'
  );

  if (paypalTxs.length !== paypalIds.length) {
    throw AppError.badRequest('Some PayPal transactions not found or invalid');
  }

  const existingLinks = bankTx.linkedOrderIds || [];
  const newLinks = [...new Set([...existingLinks, ...paypalIds])];

  bankTx.linkedOrderIds = newLinks;
  db.updateTransaction(bankTx);

  res.json({
    success: true,
    bankTransactionId,
    linkedPayPalTransactions: newLinks.length,
    totalPayPalAmount: paypalTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
  });
}

/**
 * GET /paypal-matching/linked/:id
 * Get linked PayPal transactions for a bank transaction.
 */
export async function getLinked(req: Request, res: Response): Promise<void> {
  const bankTransactionId = req.params['id'];
  const transactions = db.getAllTransactions();

  const bankTx = transactions.find(tx => tx.id === bankTransactionId);
  if (!bankTx) {
    throw AppError.notFound('Bank transaction not found');
  }

  if (!bankTx.linkedOrderIds || bankTx.linkedOrderIds.length === 0) {
    res.json({
      bankTransaction: bankTx,
      linkedPayPal: [],
      totalPayPalAmount: 0
    });
    return;
  }

  const linkedPayPal = transactions.filter(tx =>
    bankTx.linkedOrderIds!.includes(tx.id) &&
    tx.source?.connectorType === 'paypal'
  );

  const totalPayPalAmount = linkedPayPal.reduce(
    (sum, tx) => sum + Math.abs(tx.amount), 0
  );

  res.json({
    bankTransaction: bankTx,
    linkedPayPal,
    totalPayPalAmount,
    amountDifference: Math.abs(Math.abs(bankTx.amount) - totalPayPalAmount)
  });
}
