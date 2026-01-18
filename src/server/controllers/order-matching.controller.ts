/**
 * Order Matching Controller
 *
 * Handles HTTP requests for Amazon order matching.
 */

import { Request, Response } from 'express';
import * as db from '../database/database';
import { AppError } from '../middleware';
import { OrderMatcher, applyOrderMatches, MatchableTransaction } from '../matching/order-matcher';

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
 * POST /order-matching/run
 * Run order matching algorithm (Amazon orders → Bank transactions).
 */
export async function run(req: Request, res: Response): Promise<void> {
  const transactions = db.getAllTransactions();
  const matchableTransactions = transactions.map(toMatchableTransaction);

  const matcher = new OrderMatcher(matchableTransactions);
  const result = matcher.runMatching();

  if (result.autoMatches.length > 0) {
    const updatedTransactions = applyOrderMatches(matchableTransactions, result.autoMatches);

    for (const tx of updatedTransactions) {
      const storedTx = transactions.find(t => t.id === tx.id);
      if (storedTx && tx.linkedOrderIds && tx.linkedOrderIds.length > 0) {
        storedTx.linkedOrderIds = tx.linkedOrderIds;
        db.updateTransaction(storedTx);
      }
    }
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
 * GET /order-matching/suggestions
 * Get order match suggestions without applying.
 */
export async function getSuggestions(req: Request, res: Response): Promise<void> {
  const transactions = db.getAllTransactions();
  const matchableTransactions = transactions.map(toMatchableTransaction);

  const matcher = new OrderMatcher(matchableTransactions);
  const result = matcher.runMatching();

  res.json({
    autoMatches: result.autoMatches,
    suggestions: result.suggestions,
    stats: result.stats
  });
}

/**
 * POST /order-matching/link
 * Manually link orders to a bank transaction.
 */
export async function link(req: Request, res: Response): Promise<void> {
  const { bankTransactionId, orderIds } = req.body;

  if (!bankTransactionId || !orderIds || !Array.isArray(orderIds)) {
    throw AppError.badRequest('bankTransactionId and orderIds array required');
  }

  const transactions = db.getAllTransactions();

  const bankTx = transactions.find(tx => tx.id === bankTransactionId);
  if (!bankTx) {
    throw AppError.notFound('Bank transaction not found');
  }

  if (bankTx.isContextOnly) {
    throw AppError.badRequest('Cannot link orders to a context-only transaction');
  }

  for (const orderId of orderIds) {
    const order = transactions.find(tx => tx.id === orderId);
    if (!order) {
      throw AppError.notFound(`Order ${orderId} not found`);
    }
    if (!order.isContextOnly) {
      throw AppError.badRequest(`Transaction ${orderId} is not a context-only order`);
    }
  }

  bankTx.linkedOrderIds = orderIds;
  db.updateTransaction(bankTx);

  res.json({
    success: true,
    message: `Linked ${orderIds.length} order(s) to bank transaction`,
    bankTransaction: bankTx
  });
}

/**
 * POST /order-matching/unlink
 * Remove order links from a bank transaction.
 */
export async function unlink(req: Request, res: Response): Promise<void> {
  const { bankTransactionId, orderIds } = req.body;

  if (!bankTransactionId) {
    throw AppError.badRequest('bankTransactionId required');
  }

  const transactions = db.getAllTransactions();
  const bankTx = transactions.find(tx => tx.id === bankTransactionId);

  if (!bankTx) {
    throw AppError.notFound('Bank transaction not found');
  }

  if (!bankTx.linkedOrderIds || bankTx.linkedOrderIds.length === 0) {
    throw AppError.badRequest('Bank transaction has no linked orders');
  }

  if (orderIds && Array.isArray(orderIds) && orderIds.length > 0) {
    bankTx.linkedOrderIds = bankTx.linkedOrderIds.filter(
      id => !orderIds.includes(id)
    );
  } else {
    bankTx.linkedOrderIds = [];
  }

  db.updateTransaction(bankTx);

  res.json({
    success: true,
    message: 'Order links removed',
    bankTransaction: bankTx
  });
}

/**
 * GET /order-matching/linked/:id
 * Get linked orders for a bank transaction.
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
      linkedOrders: [],
      totalOrderAmount: 0
    });
    return;
  }

  const linkedOrders = transactions.filter(tx =>
    bankTx.linkedOrderIds!.includes(tx.id)
  );

  const totalOrderAmount = linkedOrders.reduce(
    (sum, order) => sum + Math.abs(order.amount), 0
  );

  res.json({
    bankTransaction: bankTx,
    linkedOrders,
    totalOrderAmount,
    amountDifference: Math.abs(Math.abs(bankTx.amount) - totalOrderAmount)
  });
}
