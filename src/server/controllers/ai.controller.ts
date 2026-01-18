/**
 * AI Controller
 *
 * Handles HTTP requests for AI assistant and cross-account intelligence.
 */

import { Request, Response } from 'express';
import * as db from '../database/database';
import { AppError } from '../middleware';
import { AIAssistant } from '../ai/ai-assistant';
import { CrossAccountIntelligence, EnrichedTransaction } from '../ai/cross-account-intelligence';

// Singleton AI assistant instance
let aiAssistant: AIAssistant | null = null;

/**
 * Get the AI assistant instance.
 */
function getAIAssistant(): AIAssistant {
  if (!aiAssistant) {
    const apiKey = process.env['OPENAI_API_KEY'] || '';
    aiAssistant = new AIAssistant(apiKey);
  }
  return aiAssistant;
}

/**
 * Export the AI assistant getter for use in other modules.
 */
export { getAIAssistant };

/**
 * Convert stored transaction to enriched format.
 */
function toEnrichedTransaction(tx: db.StoredTransaction): EnrichedTransaction {
  return {
    id: tx.id,
    description: tx.description,
    amount: tx.amount,
    date: tx.date,
    category: tx.category,
    beneficiary: tx.beneficiary,
    source: tx.source ? {
      connectorType: tx.source.connectorType,
      externalId: tx.source.externalId
    } : undefined,
    matchInfo: tx.matchInfo ? {
      matchId: tx.matchInfo.matchId,
      isPrimary: tx.matchInfo.isPrimary,
      patternType: tx.matchInfo.patternType,
      linkedTransactionIds: tx.matchInfo.linkedTransactionIds
    } : undefined
  };
}

/**
 * POST /ai/chat
 * Chat with AI assistant.
 */
export async function chat(req: Request, res: Response): Promise<void> {
  const { message, includeContext = true, attachedTransactionIds } = req.body;

  if (!message) {
    throw AppError.badRequest('Message is required');
  }

  const assistant = getAIAssistant();

  // Update context if requested
  if (includeContext) {
    const transactions = db.getAllTransactions();
    const categories = db.getAllCategories();

    assistant.setContext({
      transactions: transactions.map(t => ({
        id: t.id,
        description: t.description,
        amount: t.amount,
        date: t.date,
        category: t.category,
        beneficiary: t.beneficiary,
        source: t.source,
        matchInfo: t.matchInfo,
        isContextOnly: t.isContextOnly,
        linkedOrderIds: t.linkedOrderIds
      })),
      categories
    });
  }

  // Enhance message with linked order details if attached transactions have linked orders
  let enhancedMessage = message;
  if (attachedTransactionIds && attachedTransactionIds.length > 0) {
    const transactions = db.getAllTransactions();
    const linkedOrderDetails: string[] = [];

    for (const txId of attachedTransactionIds) {
      const tx = transactions.find(t => t.id === txId);
      if (tx && tx.linkedOrderIds && tx.linkedOrderIds.length > 0) {
        const linkedOrders = transactions.filter(t =>
          tx.linkedOrderIds!.includes(t.id)
        );
        if (linkedOrders.length > 0) {
          const orderDescriptions = linkedOrders.map(o =>
            `  - ${o.description} (€${o.amount.toFixed(2)})`
          ).join('\n');
          linkedOrderDetails.push(
            `\nLinked order details for "${tx.description}":\n${orderDescriptions}`
          );
        }
      }
    }

    if (linkedOrderDetails.length > 0) {
      enhancedMessage = message + '\n\n' + linkedOrderDetails.join('\n');
    }
  }

  // Detect if this is a category suggestion request
  const isCategoryRequest = /categor|suggest|what.*is|classify/i.test(message);

  let finalMessage = enhancedMessage;
  if (isCategoryRequest && attachedTransactionIds?.length === 1) {
    finalMessage = enhancedMessage + '\n\nIMPORTANT: End your response with the suggested category on its own line in this exact format: [CATEGORY: CategoryName]';
  }

  const response = await assistant.query(finalMessage);

  // Extract category from AI response if present
  if (isCategoryRequest && attachedTransactionIds?.length === 1 && response.message) {
    const categoryMatch = response.message.match(/\[CATEGORY:\s*([^\]]+)\]/i);
    if (categoryMatch) {
      const suggestedCategory = categoryMatch[1].trim();
      const categories = db.getAllCategories();

      const existingCategory = categories.find(
        c => c.name.toLowerCase() === suggestedCategory.toLowerCase()
      );

      (response as any).categoryAction = {
        transactionId: attachedTransactionIds[0],
        suggestedCategory: existingCategory ? existingCategory.name : suggestedCategory,
        confidence: existingCategory ? 'high' : 'medium'
      };

      response.message = response.message.replace(/\s*\[CATEGORY:\s*[^\]]+\]/i, '').trim();
    }
  }

  res.json(response);
}

/**
 * POST /ai/chat/clear
 * Clear conversation history.
 */
export async function clearHistory(req: Request, res: Response): Promise<void> {
  const assistant = getAIAssistant();
  assistant.clearHistory();
  res.json({ success: true });
}

/**
 * POST /ai/similar-transactions
 * Find similar transactions.
 */
export async function findSimilar(req: Request, res: Response): Promise<void> {
  const { transactionId, description, beneficiary, amount } = req.body;

  if (!transactionId && !description) {
    throw AppError.badRequest('Transaction ID or description is required');
  }

  const transactions = db.getAllTransactions();
  let targetTx: db.StoredTransaction | undefined;

  if (transactionId) {
    targetTx = transactions.find(t => t.id === transactionId);
    if (!targetTx) {
      throw AppError.notFound('Transaction not found');
    }
  }

  const targetDescription = targetTx?.description || description || '';
  const targetBeneficiary = targetTx?.beneficiary || beneficiary || '';
  const targetAmount = targetTx?.amount || amount;

  const descWords = targetDescription.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);

  const similar = transactions.filter(t => {
    if (targetTx && t.id === targetTx.id) return false;

    const txDescWords = t.description.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
    const commonWords = descWords.filter((w: string) => txDescWords.includes(w));
    const descSimilarity = descWords.length > 0 ? commonWords.length / descWords.length : 0;

    const beneficiaryMatch = targetBeneficiary && t.beneficiary &&
      t.beneficiary.toLowerCase().includes(targetBeneficiary.toLowerCase());

    const amountMatch = targetAmount !== undefined &&
      Math.abs(t.amount - targetAmount) / Math.abs(targetAmount) <= 0.2;

    return descSimilarity >= 0.5 ||
           beneficiaryMatch ||
           (amountMatch && descSimilarity >= 0.3);
  });

  similar.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const limitedSimilar = similar.slice(0, 50);

  res.json({
    sourceTransaction: targetTx || { description: targetDescription, beneficiary: targetBeneficiary, amount: targetAmount },
    similarTransactions: limitedSimilar,
    totalFound: similar.length
  });
}

/**
 * POST /ai/apply-category-to-similar
 * Apply category to similar transactions.
 */
export async function applyCategoryToSimilar(req: Request, res: Response): Promise<void> {
  const { category, transactionIds } = req.body;

  if (!category) {
    throw AppError.badRequest('Category is required');
  }

  if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
    throw AppError.badRequest('Transaction IDs are required');
  }

  const transactions = db.getAllTransactions();
  let updatedCount = 0;

  for (const id of transactionIds) {
    const tx = transactions.find(t => t.id === id);
    if (tx) {
      tx.category = category;
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    db.bulkUpdateTransactions(transactions);
  }

  res.json({
    success: true,
    message: `Applied category "${category}" to ${updatedCount} transaction(s)`,
    updatedCount
  });
}

/**
 * POST /ai/enrich
 * Enrich a transaction with cross-account data.
 */
export async function enrich(req: Request, res: Response): Promise<void> {
  const transaction = req.body as EnrichedTransaction;
  const transactions = db.getAllTransactions();
  const allTransactions = transactions.map(toEnrichedTransaction);

  const intelligence = new CrossAccountIntelligence(allTransactions);
  const enriched = intelligence.enrichTransaction(transaction);

  res.json(enriched);
}

/**
 * POST /ai/suggest-category
 * Get category suggestions for a transaction.
 */
export async function suggestCategory(req: Request, res: Response): Promise<void> {
  const transaction = req.body as EnrichedTransaction;
  const transactions = db.getAllTransactions();
  const allTransactions = transactions.map(toEnrichedTransaction);

  const intelligence = new CrossAccountIntelligence(allTransactions);
  const suggestions = intelligence.getCategorySuggestions(transaction);

  res.json({ suggestions });
}

/**
 * POST /ai/detect-insights
 * Detect insights for a transaction.
 */
export async function detectInsights(req: Request, res: Response): Promise<void> {
  const transaction = req.body as EnrichedTransaction;
  const transactions = db.getAllTransactions();
  const allTransactions = transactions.map(toEnrichedTransaction);

  const intelligence = new CrossAccountIntelligence(allTransactions);
  const insights = intelligence.detectInsights(transaction);

  res.json({ insights });
}

/**
 * POST /ai/analyze-all
 * Run cross-account analysis on all uncategorized transactions.
 */
export async function analyzeAll(req: Request, res: Response): Promise<void> {
  const transactions = db.getAllTransactions();
  const allTransactions = transactions.map(toEnrichedTransaction);

  const intelligence = new CrossAccountIntelligence(allTransactions);

  const uncategorized = allTransactions.filter(
    t => !t.category || t.category === '' || t.category === 'Uncategorized'
  );

  const results: { transactionId: string; suggestions: any[] }[] = [];

  for (const tx of uncategorized) {
    const suggestions = intelligence.getCategorySuggestions(tx);
    if (suggestions.length > 0) {
      results.push({
        transactionId: tx.id,
        suggestions
      });
    }
  }

  res.json({
    analyzed: uncategorized.length,
    withSuggestions: results.length,
    results
  });
}
