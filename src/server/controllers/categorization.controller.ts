/**
 * Categorization Controller
 *
 * Handles HTTP requests for categorization job management.
 */

import { Request, Response } from 'express';
import * as db from '../database/database';
import { AppError } from '../middleware';
import { getAIAssistant } from './ai.controller';
import { getRulesEngine } from './rules.controller';
import type {
  StartCategorizationRequest,
  CorrectCategorizationRequest,
  CategorizationChatRequest,
  CategorizationJobStatus
} from '../jobs/categorization-job';
import { startCategorizationProcessor, cancelCategorizationProcessor } from '../jobs/categorization-processor';

/**
 * POST /categorization/jobs
 * Start a new categorization job.
 */
export async function createJob(req: Request, res: Response): Promise<void> {
  const request: StartCategorizationRequest = req.body;

  if (!request.transactionIds || request.transactionIds.length === 0) {
    throw AppError.badRequest('No transactions specified for categorization');
  }

  const allTransactions = db.getAllTransactions();
  let transactionIds = request.transactionIds;

  if (request.scope === 'uncategorized') {
    transactionIds = allTransactions
      .filter(tx => !tx.category || tx.category === '')
      .map(tx => tx.id);
  } else if (request.scope === 'all') {
    transactionIds = allTransactions
      .filter(tx => !tx.isContextOnly)
      .map(tx => tx.id);
  }

  if (!request.includeAlreadyCategorized) {
    const categorizedIds = new Set(
      allTransactions
        .filter(tx => tx.category && tx.category !== '')
        .map(tx => tx.id)
    );
    transactionIds = transactionIds.filter(id => !categorizedIds.has(id));
  }

  if (transactionIds.length === 0) {
    throw AppError.badRequest('No transactions to categorize after filtering');
  }

  const job = db.createCategorizationJob({
    transactionIds,
    includeAlreadyCategorized: request.includeAlreadyCategorized || false
  });

  console.log(`[Categorization] Created job ${job.id} with ${transactionIds.length} transactions`);

  startCategorizationProcessor(job.id).catch(error => {
    console.error(`[Categorization] Processor failed for job ${job.id}:`, error);
  });

  res.json({
    success: true,
    job: {
      id: job.id,
      status: job.status,
      totalCount: job.totalCount,
      processedCount: job.processedCount
    }
  });
}

/**
 * GET /categorization/jobs
 * Get all categorization jobs.
 */
export async function getJobs(req: Request, res: Response): Promise<void> {
  const limit = parseInt(req.query['limit'] as string) || 10;
  const jobs = db.getRecentCategorizationJobs(limit);
  res.json({ jobs });
}

/**
 * GET /categorization/jobs/active
 * Get active categorization jobs.
 */
export async function getActiveJobs(req: Request, res: Response): Promise<void> {
  const jobs = db.getActiveCategorizationJobs();
  res.json({ jobs });
}

/**
 * GET /categorization/jobs/:id
 * Get specific categorization job.
 */
export async function getJobById(req: Request, res: Response): Promise<void> {
  const job = db.getCategorizationJob(req.params['id']);
  if (!job) {
    throw AppError.notFound('Categorization job not found');
  }

  const recentResults = job.results.slice(-20);
  const status: CategorizationJobStatus = {
    id: job.id,
    status: job.status,
    progress: job.totalCount > 0 ? Math.round((job.processedCount / job.totalCount) * 100) : 0,
    totalCount: job.totalCount,
    processedCount: job.processedCount,
    appliedCount: job.appliedCount,
    correctedCount: job.correctedCount,
    recentResults
  };

  res.json({ job, status });
}

/**
 * PUT /categorization/jobs/:id/pause
 * Pause a categorization job.
 */
export async function pauseJob(req: Request, res: Response): Promise<void> {
  const job = db.getCategorizationJob(req.params['id']);
  if (!job) {
    throw AppError.notFound('Categorization job not found');
  }

  if (job.status !== 'processing') {
    throw AppError.badRequest('Job is not processing');
  }

  db.pauseCategorizationJob(job.id);
  res.json({ success: true, message: 'Job paused' });
}

/**
 * PUT /categorization/jobs/:id/resume
 * Resume a paused categorization job.
 */
export async function resumeJob(req: Request, res: Response): Promise<void> {
  const job = db.getCategorizationJob(req.params['id']);
  if (!job) {
    throw AppError.notFound('Categorization job not found');
  }

  if (job.status !== 'paused') {
    throw AppError.badRequest('Job is not paused');
  }

  db.resumeCategorizationJob(job.id);

  startCategorizationProcessor(job.id).catch(error => {
    console.error(`[Categorization] Failed to resume processor for job ${job.id}:`, error);
  });

  res.json({ success: true, message: 'Job resumed' });
}

/**
 * DELETE /categorization/jobs/:id
 * Cancel a categorization job.
 */
export async function cancelJob(req: Request, res: Response): Promise<void> {
  const job = db.getCategorizationJob(req.params['id']);
  if (!job) {
    throw AppError.notFound('Categorization job not found');
  }

  if (job.status === 'completed' || job.status === 'cancelled') {
    throw AppError.badRequest('Job is already completed or cancelled');
  }

  cancelCategorizationProcessor(job.id);
  db.cancelCategorizationJob(job.id);

  res.json({ success: true, message: 'Job cancelled' });
}

/**
 * POST /categorization/jobs/:id/correct
 * Correct a categorization result.
 */
export async function correctResult(req: Request, res: Response): Promise<void> {
  const request: CorrectCategorizationRequest = req.body;
  const jobId = req.params['id'];

  const job = db.getCategorizationJob(jobId);
  if (!job) {
    throw AppError.notFound('Categorization job not found');
  }

  const resultIndex = job.results.findIndex(r => r.transactionId === request.transactionId);
  if (resultIndex === -1) {
    throw AppError.notFound('Transaction result not found in job');
  }

  const result = job.results[resultIndex];
  result.status = 'corrected';
  result.correctedCategory = request.correctedCategory;
  result.correctedSubcategory = request.correctedSubcategory;
  result.correctionReason = request.reason;

  job.correctedCount++;
  db.updateCategorizationJob(job);

  const transaction = db.getTransactionById(request.transactionId);
  if (transaction) {
    transaction.category = request.correctedCategory;
    transaction.subcategory = request.correctedSubcategory;
    transaction.categorizedAt = new Date().toISOString();
    transaction.categorizedBy = 'user';
    transaction.categoryConfidence = 100;
    db.updateTransaction(transaction);

    if (request.createRule) {
      try {
        const rulesEngine = getRulesEngine();
        const newRule = rulesEngine.createRuleFromCorrection(
          transaction as any,
          result.suggestedCategory,
          request.correctedCategory
        );
        console.log(`[Categorization] Created rule from correction: ${newRule.id}`);
      } catch (ruleError) {
        console.error('[Categorization] Failed to create rule:', ruleError);
      }
    }
  }

  res.json({ success: true, message: 'Correction applied' });
}

/**
 * POST /categorization/jobs/:id/chat
 * Chat about a categorization.
 */
export async function chatAboutResult(req: Request, res: Response): Promise<void> {
  const request: CategorizationChatRequest = req.body;
  const jobId = req.params['id'];

  const job = db.getCategorizationJob(jobId);
  if (!job) {
    throw AppError.notFound('Categorization job not found');
  }

  const userMessage = {
    id: crypto.randomUUID(),
    role: 'user' as const,
    content: request.message,
    timestamp: new Date().toISOString(),
    relatedTransactionId: request.transactionId
  };
  db.addCategorizationConversationMessage(jobId, userMessage);

  let context = '';
  if (request.transactionId) {
    const transaction = db.getTransactionById(request.transactionId);
    const result = job.results.find(r => r.transactionId === request.transactionId);
    if (transaction && result) {
      context = `
Transaction details:
- Description: ${transaction.description}
- Amount: ${transaction.amount} EUR
- Beneficiary: ${transaction.beneficiary || 'N/A'}
- Date: ${transaction.date}
- Current AI suggestion: ${result.suggestedCategory}${result.suggestedSubcategory ? ' > ' + result.suggestedSubcategory : ''}
- Confidence: ${result.confidence}%
- Reasoning: ${result.reasoning}
`;
    }
  }

  const aiAssistant = getAIAssistant();
  const response = await aiAssistant.query(
    `${context}\n\nUser question: ${request.message}`
  );

  const assistantMessage = {
    id: crypto.randomUUID(),
    role: 'assistant' as const,
    content: response.message,
    timestamp: new Date().toISOString(),
    relatedTransactionId: request.transactionId
  };
  db.addCategorizationConversationMessage(jobId, assistantMessage);

  res.json({
    success: true,
    message: response.message,
    conversationHistory: [...job.conversationHistory, userMessage, assistantMessage]
  });
}
