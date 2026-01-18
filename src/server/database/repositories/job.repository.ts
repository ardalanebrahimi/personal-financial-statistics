/**
 * Job Repository
 *
 * Database operations for background jobs.
 */

import { db } from '../connection';

export interface Job {
  id: string;
  type: 'csv_import' | 'amazon_import' | 'categorization' | 'order_matching';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  total: number;
  processed: number;
  errors: number;
  errorDetails: string[];
  result?: any;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  fileName?: string;
  filePath?: string;
}

function rowToJob(row: any): Job {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    progress: row.progress,
    total: row.total,
    processed: row.processed,
    errors: row.errors,
    errorDetails: JSON.parse(row.error_details || '[]'),
    result: row.result ? JSON.parse(row.result) : undefined,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    fileName: row.file_name,
    filePath: row.file_path
  };
}

export function createJob(job: Partial<Job> & { type: Job['type'] }): Job {
  const newJob: Job = {
    id: job.id || crypto.randomUUID(),
    type: job.type,
    status: 'pending',
    progress: 0,
    total: job.total || 0,
    processed: 0,
    errors: 0,
    errorDetails: [],
    createdAt: new Date().toISOString(),
    fileName: job.fileName,
    filePath: job.filePath
  };

  db.prepare(`
    INSERT INTO jobs (id, type, status, progress, total, processed, errors, error_details, created_at, file_name, file_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newJob.id,
    newJob.type,
    newJob.status,
    newJob.progress,
    newJob.total,
    newJob.processed,
    newJob.errors,
    JSON.stringify(newJob.errorDetails),
    newJob.createdAt,
    newJob.fileName || null,
    newJob.filePath || null
  );

  return newJob;
}

export function getJob(id: string): Job | null {
  const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as any;
  if (!row) return null;
  return rowToJob(row);
}

export function getActiveJobs(): Job[] {
  const rows = db.prepare(`
    SELECT * FROM jobs
    WHERE status IN ('pending', 'running')
    ORDER BY created_at DESC
  `).all() as any[];
  return rows.map(rowToJob);
}

export function getRecentJobs(limit: number = 10): Job[] {
  const rows = db.prepare(`
    SELECT * FROM jobs
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as any[];
  return rows.map(rowToJob);
}

export function updateJobProgress(id: string, processed: number, total?: number): void {
  const progress = total ? Math.round((processed / total) * 100) : 0;
  if (total !== undefined) {
    db.prepare(`
      UPDATE jobs SET processed = ?, total = ?, progress = ?, status = 'running', started_at = COALESCE(started_at, ?)
      WHERE id = ?
    `).run(processed, total, progress, new Date().toISOString(), id);
  } else {
    db.prepare(`
      UPDATE jobs SET processed = ?, progress = ?, status = 'running', started_at = COALESCE(started_at, ?)
      WHERE id = ?
    `).run(processed, progress, new Date().toISOString(), id);
  }
}

export function addJobError(id: string, error: string): void {
  const job = getJob(id);
  if (!job) return;

  const errorDetails = [...job.errorDetails, error].slice(-100);
  db.prepare(`
    UPDATE jobs SET errors = errors + 1, error_details = ?
    WHERE id = ?
  `).run(JSON.stringify(errorDetails), id);
}

export function completeJob(id: string, result?: any): void {
  db.prepare(`
    UPDATE jobs SET status = 'completed', progress = 100, completed_at = ?, result = ?
    WHERE id = ?
  `).run(new Date().toISOString(), result ? JSON.stringify(result) : null, id);
}

export function failJob(id: string, error: string): void {
  const job = getJob(id);
  if (!job) return;

  const errorDetails = [...job.errorDetails, error];
  db.prepare(`
    UPDATE jobs SET status = 'failed', completed_at = ?, error_details = ?
    WHERE id = ?
  `).run(new Date().toISOString(), JSON.stringify(errorDetails), id);
}

export function cancelJob(id: string): void {
  db.prepare(`
    UPDATE jobs SET status = 'cancelled', completed_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), id);
}
