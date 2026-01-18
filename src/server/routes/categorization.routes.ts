/**
 * Categorization Routes
 *
 * Routes for categorization job management.
 */

import { Router } from 'express';
import * as categorizationController from '../controllers/categorization.controller';
import { asyncHandler } from '../middleware';

const router = Router();

// POST /categorization/jobs - Start a new categorization job
router.post('/jobs', asyncHandler(categorizationController.createJob));

// GET /categorization/jobs - Get all categorization jobs
router.get('/jobs', asyncHandler(categorizationController.getJobs));

// GET /categorization/jobs/active - Get active categorization jobs
router.get('/jobs/active', asyncHandler(categorizationController.getActiveJobs));

// GET /categorization/jobs/:id - Get specific job
router.get('/jobs/:id', asyncHandler(categorizationController.getJobById));

// PUT /categorization/jobs/:id/pause - Pause a job
router.put('/jobs/:id/pause', asyncHandler(categorizationController.pauseJob));

// PUT /categorization/jobs/:id/resume - Resume a job
router.put('/jobs/:id/resume', asyncHandler(categorizationController.resumeJob));

// DELETE /categorization/jobs/:id - Cancel a job
router.delete('/jobs/:id', asyncHandler(categorizationController.cancelJob));

// POST /categorization/jobs/:id/correct - Correct a result
router.post('/jobs/:id/correct', asyncHandler(categorizationController.correctResult));

// POST /categorization/jobs/:id/chat - Chat about a result
router.post('/jobs/:id/chat', asyncHandler(categorizationController.chatAboutResult));

export default router;
