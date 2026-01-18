/**
 * Categorization Job Repository
 *
 * Database operations for AI categorization jobs.
 */

import { db } from '../connection';
import type {
  CategorizationJob,
  CategorizationResult,
  ConversationMessage
} from '../../jobs/categorization-job';

function rowToCategorizationJob(row: any): CategorizationJob {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    transactionIds: JSON.parse(row.transaction_ids || '[]'),
    includeAlreadyCategorized: row.include_already_categorized === 1,
    totalCount: row.total_count,
    processedCount: row.processed_count,
    appliedCount: row.applied_count,
    skippedCount: row.skipped_count,
    correctedCount: row.corrected_count,
    results: JSON.parse(row.results || '[]'),
    conversationHistory: JSON.parse(row.conversation_history || '[]'),
    errors: JSON.parse(row.errors || '[]')
  };
}

export function createCategorizationJob(job: Partial<CategorizationJob> & { transactionIds: string[] }): CategorizationJob {
  const now = new Date().toISOString();
  const newJob: CategorizationJob = {
    id: job.id || crypto.randomUUID(),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    transactionIds: job.transactionIds,
    includeAlreadyCategorized: job.includeAlreadyCategorized || false,
    totalCount: job.transactionIds.length,
    processedCount: 0,
    appliedCount: 0,
    skippedCount: 0,
    correctedCount: 0,
    results: [],
    conversationHistory: [],
    errors: []
  };

  db.prepare(`
    INSERT INTO categorization_jobs (
      id, status, created_at, updated_at,
      transaction_ids, include_already_categorized,
      total_count, processed_count, applied_count, skipped_count, corrected_count,
      results, conversation_history, errors
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newJob.id,
    newJob.status,
    newJob.createdAt,
    newJob.updatedAt,
    JSON.stringify(newJob.transactionIds),
    newJob.includeAlreadyCategorized ? 1 : 0,
    newJob.totalCount,
    newJob.processedCount,
    newJob.appliedCount,
    newJob.skippedCount,
    newJob.correctedCount,
    JSON.stringify(newJob.results),
    JSON.stringify(newJob.conversationHistory),
    JSON.stringify(newJob.errors)
  );

  return newJob;
}

export function getCategorizationJob(id: string): CategorizationJob | null {
  const row = db.prepare(`SELECT * FROM categorization_jobs WHERE id = ?`).get(id) as any;
  return row ? rowToCategorizationJob(row) : null;
}

export function getActiveCategorizationJobs(): CategorizationJob[] {
  const rows = db.prepare(`
    SELECT * FROM categorization_jobs
    WHERE status IN ('pending', 'processing', 'paused')
    ORDER BY created_at DESC
  `).all() as any[];
  return rows.map(rowToCategorizationJob);
}

export function getRecentCategorizationJobs(limit: number = 10): CategorizationJob[] {
  const rows = db.prepare(`
    SELECT * FROM categorization_jobs
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as any[];
  return rows.map(rowToCategorizationJob);
}

export function updateCategorizationJob(job: CategorizationJob): void {
  db.prepare(`
    UPDATE categorization_jobs SET
      status = ?, updated_at = ?, started_at = ?, completed_at = ?,
      transaction_ids = ?, include_already_categorized = ?,
      total_count = ?, processed_count = ?, applied_count = ?, skipped_count = ?, corrected_count = ?,
      results = ?, conversation_history = ?, errors = ?
    WHERE id = ?
  `).run(
    job.status,
    new Date().toISOString(),
    job.startedAt || null,
    job.completedAt || null,
    JSON.stringify(job.transactionIds),
    job.includeAlreadyCategorized ? 1 : 0,
    job.totalCount,
    job.processedCount,
    job.appliedCount,
    job.skippedCount,
    job.correctedCount,
    JSON.stringify(job.results),
    JSON.stringify(job.conversationHistory),
    JSON.stringify(job.errors),
    job.id
  );
}

export function updateCategorizationJobProgress(
  id: string,
  processedCount: number,
  appliedCount: number,
  skippedCount: number
): void {
  db.prepare(`
    UPDATE categorization_jobs SET
      processed_count = ?, applied_count = ?, skipped_count = ?,
      updated_at = ?, status = 'processing',
      started_at = COALESCE(started_at, ?)
    WHERE id = ?
  `).run(processedCount, appliedCount, skippedCount, new Date().toISOString(), new Date().toISOString(), id);
}

export function addCategorizationResult(id: string, result: CategorizationResult): void {
  const job = getCategorizationJob(id);
  if (!job) return;

  job.results.push(result);
  job.processedCount++;
  if (result.status === 'applied') job.appliedCount++;
  if (result.status === 'skipped' || result.status === 'error') job.skippedCount++;
  if (result.status === 'corrected') job.correctedCount++;

  db.prepare(`
    UPDATE categorization_jobs SET
      results = ?, processed_count = ?, applied_count = ?, skipped_count = ?, corrected_count = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    JSON.stringify(job.results),
    job.processedCount,
    job.appliedCount,
    job.skippedCount,
    job.correctedCount,
    new Date().toISOString(),
    id
  );
}

export function addCategorizationConversationMessage(id: string, message: ConversationMessage): void {
  const job = getCategorizationJob(id);
  if (!job) return;

  job.conversationHistory.push(message);
  db.prepare(`
    UPDATE categorization_jobs SET conversation_history = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(job.conversationHistory), new Date().toISOString(), id);
}

export function addCategorizationError(id: string, error: string): void {
  const job = getCategorizationJob(id);
  if (!job) return;

  job.errors.push(error);
  db.prepare(`
    UPDATE categorization_jobs SET errors = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(job.errors), new Date().toISOString(), id);
}

export function completeCategorizationJob(id: string): void {
  db.prepare(`
    UPDATE categorization_jobs SET status = 'completed', completed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), new Date().toISOString(), id);
}

export function failCategorizationJob(id: string, error: string): void {
  const job = getCategorizationJob(id);
  if (job) {
    job.errors.push(error);
    db.prepare(`
      UPDATE categorization_jobs SET status = 'failed', completed_at = ?, updated_at = ?, errors = ?
      WHERE id = ?
    `).run(new Date().toISOString(), new Date().toISOString(), JSON.stringify(job.errors), id);
  }
}

export function cancelCategorizationJob(id: string): void {
  db.prepare(`
    UPDATE categorization_jobs SET status = 'cancelled', completed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), new Date().toISOString(), id);
}

export function pauseCategorizationJob(id: string): void {
  db.prepare(`
    UPDATE categorization_jobs SET status = 'paused', updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), id);
}

export function resumeCategorizationJob(id: string): void {
  db.prepare(`
    UPDATE categorization_jobs SET status = 'processing', updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), id);
}

export function deleteCategorizationJob(id: string): boolean {
  const result = db.prepare(`DELETE FROM categorization_jobs WHERE id = ?`).run(id);
  return result.changes > 0;
}
