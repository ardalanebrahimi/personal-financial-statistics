/**
 * Import Controller
 *
 * Handles HTTP requests for importing data from various sources.
 */

import { Request, Response } from 'express';
import * as fs from 'fs';
import * as db from '../database/database';
import { AppError } from '../middleware';
import { AmazonConnector } from '../connectors/amazon-connector';
import { PayPalTextParser } from '../connectors/paypal-connector';
import { isDuplicate } from '../utils';

/**
 * POST /import/amazon
 * Import Amazon order history CSV.
 */
export async function importAmazon(req: Request, res: Response): Promise<void> {
  const { csvData, startDate, endDate } = req.body;

  if (!csvData) {
    throw AppError.badRequest('CSV data is required');
  }

  const connector = new AmazonConnector('amazon-import');

  const dateRange = (startDate && endDate) ? {
    startDate: new Date(startDate),
    endDate: new Date(endDate)
  } : undefined;

  const result = connector.importFromCsv(csvData, dateRange);

  if (!result.success && result.transactions.length === 0) {
    throw AppError.badRequest(`Failed to import Amazon data: ${result.errors.join(', ')}`);
  }

  let newCount = 0;
  let duplicateCount = 0;
  const existingTransactions = db.getAllTransactions();

  for (const tx of result.transactions) {
    const duplicate = isDuplicate(
      { date: tx.date, amount: tx.amount, description: tx.description, externalId: tx.externalId },
      existingTransactions,
      'amazon'
    );

    if (!duplicate) {
      db.insertTransaction({
        id: crypto.randomUUID(),
        date: tx.date.toISOString(),
        description: tx.description,
        amount: tx.amount,
        category: 'Amazon',
        beneficiary: tx.beneficiary || 'Amazon',
        source: {
          connectorType: 'amazon',
          externalId: tx.externalId,
          importedAt: new Date().toISOString()
        },
        isContextOnly: true
      });
      newCount++;
    } else {
      duplicateCount++;
    }
  }

  res.json({
    success: true,
    message: 'Amazon import completed',
    stats: {
      ...result.stats,
      newTransactions: newCount,
      duplicatesSkipped: duplicateCount
    },
    errors: result.errors.length > 0 ? result.errors : undefined
  });
}

/**
 * DELETE /import/amazon
 * Delete all Amazon orders and unlink transactions.
 */
export async function clearAmazon(req: Request, res: Response): Promise<void> {
  const transactions = db.getAllTransactions();

  let deletedOrders = 0;
  let unlinkedTransactions = 0;

  // Find and delete all Amazon context-only transactions
  const amazonOrderIds: string[] = [];
  for (const tx of transactions) {
    if (tx.isContextOnly && tx.source?.connectorType === 'amazon') {
      amazonOrderIds.push(tx.id);
      db.deleteTransaction(tx.id);
      deletedOrders++;
    }
  }

  // Unlink any bank transactions that were linked to Amazon orders
  const remainingTransactions = db.getAllTransactions();
  for (const tx of remainingTransactions) {
    if (tx.linkedOrderIds && tx.linkedOrderIds.length > 0) {
      const originalLength = tx.linkedOrderIds.length;
      tx.linkedOrderIds = tx.linkedOrderIds.filter(id => !amazonOrderIds.includes(id));

      if (tx.linkedOrderIds.length !== originalLength) {
        db.updateTransaction(tx);
        unlinkedTransactions++;
      }
    }
  }

  res.json({
    success: true,
    message: 'Amazon data cleanup completed',
    stats: {
      deletedOrders,
      unlinkedTransactions
    }
  });
}

/**
 * POST /import/amazon/refunds
 * Import Amazon refunds CSV.
 */
export async function importAmazonRefunds(req: Request, res: Response): Promise<void> {
  const { csvData, startDate, endDate } = req.body;

  if (!csvData) {
    throw AppError.badRequest('CSV data is required');
  }

  const connector = new AmazonConnector('amazon-refunds-import');

  const dateRange = (startDate && endDate) ? {
    startDate: new Date(startDate),
    endDate: new Date(endDate)
  } : undefined;

  const result = connector.importRefundsFromCsv(csvData, dateRange);

  if (!result.success && result.transactions.length === 0) {
    throw AppError.badRequest(`Failed to import Amazon refunds: ${result.errors.join(', ')}`);
  }

  let newCount = 0;
  let duplicateCount = 0;
  const existingTransactions = db.getAllTransactions();

  for (const tx of result.transactions) {
    const duplicate = isDuplicate(
      { date: tx.date, amount: tx.amount, description: tx.description, externalId: tx.externalId },
      existingTransactions,
      'amazon'
    );

    if (!duplicate) {
      db.insertTransaction({
        id: crypto.randomUUID(),
        date: tx.date.toISOString(),
        description: tx.description,
        amount: tx.amount,
        category: 'Amazon Refund',
        beneficiary: tx.beneficiary || 'Amazon',
        source: {
          connectorType: 'amazon',
          externalId: tx.externalId,
          importedAt: new Date().toISOString()
        },
        isContextOnly: true
      });
      newCount++;
    } else {
      duplicateCount++;
    }
  }

  res.json({
    success: true,
    message: 'Amazon refunds import completed',
    stats: {
      ...result.stats,
      newTransactions: newCount,
      duplicatesSkipped: duplicateCount
    },
    errors: result.errors.length > 0 ? result.errors : undefined
  });
}

/**
 * POST /import/paypal
 * Import PayPal transaction history from text export.
 */
export async function importPayPal(req: Request, res: Response): Promise<void> {
  const { textData, startDate, endDate } = req.body;

  if (!textData) {
    throw AppError.badRequest('Text data is required');
  }

  const parser = new PayPalTextParser();

  const dateRange = (startDate && endDate) ? {
    startDate: new Date(startDate),
    endDate: new Date(endDate)
  } : undefined;

  const result = parser.importFromText(textData, dateRange);

  if (!result.success && result.transactions.length === 0) {
    throw AppError.badRequest(`Failed to import PayPal data: ${result.errors.join(', ')}`);
  }

  let newCount = 0;
  let duplicateCount = 0;
  let recurringCount = 0;
  const existingTransactions = db.getAllTransactions();

  for (const tx of result.transactions) {
    const duplicate = isDuplicate(
      { date: tx.date, amount: tx.amount, description: tx.description, externalId: tx.externalId },
      existingTransactions,
      'paypal'
    );

    if (!duplicate) {
      const isRecurring = (tx.rawData as any)?.isRecurring || false;
      if (isRecurring) recurringCount++;

      db.insertTransaction({
        id: crypto.randomUUID(),
        date: tx.date.toISOString(),
        description: tx.description,
        amount: tx.amount,
        category: '',
        beneficiary: tx.beneficiary || '',
        source: {
          connectorType: 'paypal',
          externalId: tx.externalId,
          importedAt: new Date().toISOString()
        },
        isContextOnly: true
      });
      newCount++;
    } else {
      duplicateCount++;
    }
  }

  res.json({
    success: true,
    message: 'PayPal import completed',
    stats: {
      ...result.stats,
      newTransactions: newCount,
      duplicatesSkipped: duplicateCount,
      recurringTransactions: recurringCount
    },
    errors: result.errors.length > 0 ? result.errors : undefined
  });
}

/**
 * POST /import/paypal/file
 * Import PayPal text file.
 */
export async function importPayPalFile(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw AppError.badRequest('No file uploaded');
  }

  const textData = fs.readFileSync(req.file.path, 'utf-8');
  fs.unlinkSync(req.file.path); // Clean up

  const parser = new PayPalTextParser();
  const result = parser.importFromText(textData);

  if (!result.success && result.transactions.length === 0) {
    throw AppError.badRequest(`Failed to import PayPal data: ${result.errors.join(', ')}`);
  }

  let newCount = 0;
  let duplicateCount = 0;
  let recurringCount = 0;
  const existingTransactions = db.getAllTransactions();

  for (const tx of result.transactions) {
    const duplicate = isDuplicate(
      { date: tx.date, amount: tx.amount, description: tx.description, externalId: tx.externalId },
      existingTransactions,
      'paypal'
    );

    if (!duplicate) {
      const isRecurring = (tx.rawData as any)?.isRecurring || false;
      if (isRecurring) recurringCount++;

      db.insertTransaction({
        id: crypto.randomUUID(),
        date: tx.date.toISOString(),
        description: tx.description,
        amount: tx.amount,
        category: '',
        beneficiary: tx.beneficiary || '',
        source: {
          connectorType: 'paypal',
          externalId: tx.externalId,
          importedAt: new Date().toISOString()
        },
        isContextOnly: true
      });
      newCount++;
    } else {
      duplicateCount++;
    }
  }

  res.json({
    success: true,
    message: 'PayPal file import completed',
    stats: {
      ...result.stats,
      newTransactions: newCount,
      duplicatesSkipped: duplicateCount,
      recurringTransactions: recurringCount
    },
    errors: result.errors.length > 0 ? result.errors : undefined
  });
}
