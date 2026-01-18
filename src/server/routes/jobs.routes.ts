/**
 * Jobs Routes
 *
 * Routes for background job management.
 */

import { Router } from 'express';
import * as jobsController from '../controllers/jobs.controller';
import { asyncHandler } from '../middleware';

const router = Router();

// GET /jobs - Get all recent jobs
router.get('/', asyncHandler(jobsController.getAll));

// GET /jobs/active - Get active jobs
router.get('/active', asyncHandler(jobsController.getActive));

// GET /jobs/:id - Get specific job
router.get('/:id', asyncHandler(jobsController.getById));

// POST /jobs/:id/cancel - Cancel job
router.post('/:id/cancel', asyncHandler(jobsController.cancel));

// Note: POST /jobs/import/csv is handled separately with multer middleware
// It will be added in the main routes/index.ts

export default router;
