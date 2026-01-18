/**
 * Categorization Processor
 *
 * Background job processor for AI-powered transaction categorization.
 * Features:
 * - Unbiased categorization (doesn't list existing categories)
 * - Uses linked order details as context
 * - Applies categories immediately
 * - Supports pause/resume/cancel
 * - Auto-creates new categories as needed
 */

import * as db from '../database/database';
import type { StoredTransaction } from '../database/database';
import {
  CategorizationJob,
  CategorizationResult,
  CATEGORIZATION_PROMPT,
  isGenericCategory
} from './categorization-job';

// Map to track active processors for cancellation
const activeProcessors = new Map<string, { cancel: () => void }>();

// Rate limiting: max 3 requests per second to OpenAI
const RATE_LIMIT_DELAY_MS = 350;

// Minimum confidence threshold for auto-application
const MIN_CONFIDENCE_THRESHOLD = 50;

// OpenAI API configuration
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';

interface AICategorizationResponse {
  category: string;
  subcategory: string | null;
  confidence: number;
  reasoning: string;
}

/**
 * Start processing a categorization job
 */
export async function startCategorizationProcessor(jobId: string): Promise<void> {
  const job = db.getCategorizationJob(jobId);
  if (!job) {
    console.error(`[CategorizationProcessor] Job ${jobId} not found`);
    return;
  }

  if (job.status !== 'pending' && job.status !== 'paused') {
    console.error(`[CategorizationProcessor] Job ${jobId} is not in a startable state: ${job.status}`);
    return;
  }

  // Mark job as processing
  job.status = 'processing';
  job.startedAt = job.startedAt || new Date().toISOString();
  db.updateCategorizationJob(job);

  // Create cancellation handler
  let cancelled = false;
  activeProcessors.set(jobId, {
    cancel: () => { cancelled = true; }
  });

  console.log(`[CategorizationProcessor] Starting job ${jobId} with ${job.totalCount} transactions`);

  try {
    // Verify OpenAI API key is configured
    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    // Get all transactions that need to be processed
    const allTransactions = db.getAllTransactions();
    const transactionsToProcess = job.transactionIds
      .filter(id => {
        // Skip already processed transactions (in case of resume)
        const existingResult = job.results.find(r => r.transactionId === id);
        return !existingResult || existingResult.status === 'pending';
      })
      .map(id => allTransactions.find(tx => tx.id === id))
      .filter((tx): tx is StoredTransaction => tx !== undefined);

    // Process transactions one by one
    for (const transaction of transactionsToProcess) {
      // Check for cancellation or pause
      const currentJob = db.getCategorizationJob(jobId);
      if (!currentJob || currentJob.status === 'cancelled') {
        console.log(`[CategorizationProcessor] Job ${jobId} was cancelled`);
        cancelled = true;
        break;
      }

      if (currentJob.status === 'paused') {
        console.log(`[CategorizationProcessor] Job ${jobId} was paused`);
        break;
      }

      if (cancelled) {
        break;
      }

      try {
        // Process this transaction
        const result = await categorizeTransaction(apiKey, transaction, allTransactions);

        // Add result to job
        db.addCategorizationResult(jobId, result);

        // If categorization was successful, apply it to the transaction
        if (result.status === 'applied' && result.confidence >= MIN_CONFIDENCE_THRESHOLD) {
          await applyCategorizationResult(transaction, result);
        }

        console.log(`[CategorizationProcessor] Processed ${transaction.id}: ${result.suggestedCategory} (${result.confidence}%)`);

      } catch (error: any) {
        console.error(`[CategorizationProcessor] Error processing ${transaction.id}:`, error);

        // Add error result
        const errorResult: CategorizationResult = {
          transactionId: transaction.id,
          transactionDescription: transaction.description,
          transactionAmount: transaction.amount,
          transactionBeneficiary: transaction.beneficiary,
          suggestedCategory: '',
          confidence: 0,
          reasoning: '',
          status: 'error',
          errorMessage: error.message || 'Unknown error'
        };
        db.addCategorizationResult(jobId, errorResult);
        db.addCategorizationError(jobId, `Transaction ${transaction.id}: ${error.message}`);
      }

      // Rate limiting
      await sleep(RATE_LIMIT_DELAY_MS);
    }

    // Finalize job
    const finalJob = db.getCategorizationJob(jobId);
    if (finalJob) {
      if (finalJob.status === 'processing') {
        db.completeCategorizationJob(jobId);
        console.log(`[CategorizationProcessor] Job ${jobId} completed`);
      } else if (finalJob.status === 'paused') {
        console.log(`[CategorizationProcessor] Job ${jobId} paused at ${finalJob.processedCount}/${finalJob.totalCount}`);
      }
    }

  } catch (error: any) {
    console.error(`[CategorizationProcessor] Job ${jobId} failed:`, error);
    db.failCategorizationJob(jobId, error.message || 'Unknown error');
  } finally {
    activeProcessors.delete(jobId);
  }
}

/**
 * Cancel a running categorization processor
 */
export function cancelCategorizationProcessor(jobId: string): boolean {
  const processor = activeProcessors.get(jobId);
  if (processor) {
    processor.cancel();
    return true;
  }
  return false;
}

/**
 * Check if a job is being processed
 */
export function isJobProcessing(jobId: string): boolean {
  return activeProcessors.has(jobId);
}

/**
 * Categorize a single transaction using OpenAI API
 */
async function categorizeTransaction(
  apiKey: string,
  transaction: StoredTransaction,
  allTransactions: StoredTransaction[]
): Promise<CategorizationResult> {
  // Build context from linked orders
  let linkedOrdersContext = '';
  if (transaction.linkedOrderIds && transaction.linkedOrderIds.length > 0) {
    const linkedOrders = transaction.linkedOrderIds
      .map(id => allTransactions.find(tx => tx.id === id))
      .filter((tx): tx is StoredTransaction => tx !== undefined);

    if (linkedOrders.length > 0) {
      linkedOrdersContext = `\n- Linked Orders (product details):\n${
        linkedOrders.map(o => `  * ${o.description} (${o.amount.toFixed(2)} EUR)`).join('\n')
      }`;
    }
  }

  // Build the prompt
  const prompt = CATEGORIZATION_PROMPT
    .replace('{description}', transaction.description)
    .replace('{amount}', Math.abs(transaction.amount).toFixed(2))
    .replace('{beneficiary}', transaction.beneficiary || 'Unknown')
    .replace('{date}', transaction.date)
    .replace('{linkedOrdersContext}', linkedOrdersContext);

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a financial transaction categorizer. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 150,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse the response
    const parsed: AICategorizationResponse = JSON.parse(content);

    // Validate the category isn't too generic
    if (isGenericCategory(parsed.category)) {
      // AI suggested a generic category, lower confidence and note it
      return {
        transactionId: transaction.id,
        transactionDescription: transaction.description,
        transactionAmount: transaction.amount,
        transactionBeneficiary: transaction.beneficiary,
        suggestedCategory: parsed.category,
        suggestedSubcategory: parsed.subcategory || undefined,
        confidence: Math.min(parsed.confidence, 30), // Cap confidence for generic categories
        reasoning: `${parsed.reasoning} [Note: Generic category detected, confidence reduced]`,
        status: 'skipped',
        linkedOrderDetails: linkedOrdersContext ? [linkedOrdersContext] : undefined
      };
    }

    // Successful categorization
    return {
      transactionId: transaction.id,
      transactionDescription: transaction.description,
      transactionAmount: transaction.amount,
      transactionBeneficiary: transaction.beneficiary,
      suggestedCategory: parsed.category,
      suggestedSubcategory: parsed.subcategory || undefined,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      status: 'applied',
      appliedAt: new Date().toISOString(),
      linkedOrderDetails: linkedOrdersContext ? [linkedOrdersContext] : undefined
    };

  } catch (parseError: any) {
    console.error(`[CategorizationProcessor] Failed to parse AI response:`, parseError);
    throw new Error(`Failed to parse AI response: ${parseError.message}`);
  }
}

/**
 * Apply a categorization result to the transaction
 */
async function applyCategorizationResult(
  transaction: StoredTransaction,
  result: CategorizationResult
): Promise<void> {
  // Ensure the category exists
  await ensureCategoryExists(result.suggestedCategory, result.suggestedSubcategory);

  // Update the transaction
  transaction.category = result.suggestedCategory;
  transaction.subcategory = result.suggestedSubcategory;
  transaction.categoryConfidence = result.confidence;
  transaction.categorizedAt = new Date().toISOString();
  transaction.categorizedBy = 'ai';

  db.updateTransaction(transaction);
}

/**
 * Ensure a category exists, creating it if needed
 */
async function ensureCategoryExists(categoryName: string, subcategoryName?: string): Promise<void> {
  const existingCategories = db.getAllCategories();

  // Check if main category exists
  const mainCategory = existingCategories.find(
    c => c.name.toLowerCase() === categoryName.toLowerCase()
  );

  if (!mainCategory) {
    // Create the main category with a random color
    const newCategory = {
      id: crypto.randomUUID(),
      name: categoryName,
      description: `Auto-created category for ${categoryName}`,
      color: generateRandomColor()
    };

    existingCategories.push(newCategory);
    db.saveCategories(existingCategories);
    console.log(`[CategorizationProcessor] Created new category: ${categoryName}`);
  }

  // Handle subcategory if provided
  if (subcategoryName) {
    const parentCategory = existingCategories.find(
      c => c.name.toLowerCase() === categoryName.toLowerCase()
    );
    const subcategory = existingCategories.find(
      c => c.name.toLowerCase() === subcategoryName.toLowerCase()
    );

    if (!subcategory && parentCategory) {
      // Create subcategory - for now just as a regular category
      // Full hierarchy support will be added when we update the Category model
      const newSubcategory = {
        id: crypto.randomUUID(),
        name: `${categoryName} > ${subcategoryName}`,
        description: `Subcategory of ${categoryName}`,
        color: parentCategory.color || generateRandomColor()
      };

      existingCategories.push(newSubcategory);
      db.saveCategories(existingCategories);
      console.log(`[CategorizationProcessor] Created new subcategory: ${subcategoryName}`);
    }
  }
}

/**
 * Generate a random pleasing color
 */
function generateRandomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 60 + Math.floor(Math.random() * 20); // 60-80%
  const lightness = 45 + Math.floor(Math.random() * 15);  // 45-60%

  // Convert HSL to hex
  const h = hue / 360;
  const s = saturation / 100;
  const l = lightness / 100;

  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  startCategorizationProcessor,
  cancelCategorizationProcessor,
  isJobProcessing
};
