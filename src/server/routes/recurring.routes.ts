/**
 * Recurring Routes
 *
 * Routes for recurring transaction pattern detection.
 */

import { Router } from 'express';
import * as recurringController from '../controllers/recurring.controller';
import { asyncHandler } from '../middleware';

const router = Router();

// POST /recurring/detect - Detect recurring patterns
router.post('/detect', asyncHandler(recurringController.detect));

// GET /recurring/patterns - Get all patterns
router.get('/patterns', asyncHandler(recurringController.getPatterns));

// GET /recurring/summary - Get summary
router.get('/summary', asyncHandler(recurringController.getSummary));

// GET /recurring/patterns/:id - Get specific pattern
router.get('/patterns/:id', asyncHandler(recurringController.getPatternById));

// PUT /recurring/patterns/:id - Update pattern
router.put('/patterns/:id', asyncHandler(recurringController.updatePattern));

// DELETE /recurring/patterns/:id - Delete pattern
router.delete('/patterns/:id', asyncHandler(recurringController.deletePattern));

// POST /recurring/patterns/:id/categorize - Categorize pattern
router.post('/patterns/:id/categorize', asyncHandler(recurringController.categorizePattern));

export default router;
