/**
 * Jobs Controller
 *
 * Handles HTTP requests for background job management.
 */

import { Request, Response } from 'express';
import * as db from '../database/database';
import { AppError } from '../middleware';
import { processCsvImport, cancelImportJob } from '../jobs/csv-import-processor';

/**
 * POST /jobs/import/csv
 * Upload and start a CSV import job.
 */
export async function startCsvImport(req: Request, res: Response): Promise<void> {
  const file = (req as any).file;
  if (!file) {
    throw AppError.badRequest('No file uploaded');
  }

  // Create the job
  const job = db.createJob({
    type: 'csv_import',
    fileName: file.originalname,
    filePath: file.path
  });

  console.log(`[Jobs] Created CSV import job ${job.id} for file ${file.originalname}`);

  // Start processing in background (don't await)
  processCsvImport(job.id, file.path).catch(err => {
    console.error(`[Jobs] CSV import job ${job.id} failed:`, err);
  });

  // Return immediately with job ID
  res.json({
    success: true,
    jobId: job.id,
    message: 'Import job started'
  });
}

/**
 * GET /jobs
 * Get all recent jobs.
 */
export async function getAll(req: Request, res: Response): Promise<void> {
  const limit = parseInt(req.query['limit'] as string) || 20;
  const jobs = db.getRecentJobs(limit);
  res.json({ jobs });
}

/**
 * GET /jobs/active
 * Get active (running/pending) jobs.
 */
export async function getActive(req: Request, res: Response): Promise<void> {
  const jobs = db.getActiveJobs();
  res.json({ jobs });
}

/**
 * GET /jobs/:id
 * Get specific job status.
 */
export async function getById(req: Request, res: Response): Promise<void> {
  const job = db.getJob(req.params['id']);
  if (!job) {
    throw AppError.notFound('Job not found');
  }
  res.json({ job });
}

/**
 * POST /jobs/:id/cancel
 * Cancel a running job.
 */
export async function cancel(req: Request, res: Response): Promise<void> {
  const job = db.getJob(req.params['id']);
  if (!job) {
    throw AppError.notFound('Job not found');
  }

  if (job.status !== 'running' && job.status !== 'pending') {
    throw AppError.badRequest('Job is not running');
  }

  // Try to cancel the import
  const cancelled = cancelImportJob(job.id);
  if (cancelled) {
    res.json({ success: true, message: 'Job cancellation requested' });
  } else {
    // Job might have just completed
    db.cancelJob(job.id);
    res.json({ success: true, message: 'Job cancelled' });
  }
}
