/**
 * Rules Routes
 *
 * Routes for categorization rules management.
 */

import { Router } from 'express';
import * as rulesController from '../controllers/rules.controller';
import { asyncHandler } from '../middleware';

const router = Router();

// GET /rules - Get all rules
router.get('/', asyncHandler(rulesController.getAll));

// POST /rules - Create a new rule
router.post('/', asyncHandler(rulesController.create));

// PUT /rules/:id - Update a rule
router.put('/:id', asyncHandler(rulesController.update));

// DELETE /rules/:id - Delete a rule
router.delete('/:id', asyncHandler(rulesController.remove));

// POST /rules/apply - Apply rules to a transaction
router.post('/apply', asyncHandler(rulesController.apply));

// POST /rules/from-correction - Create rule from correction
router.post('/from-correction', asyncHandler(rulesController.createFromCorrection));

// POST /rules/:id/feedback - Update rule confidence
router.post('/:id/feedback', asyncHandler(rulesController.feedback));

// POST /rules/consolidate - Merge similar rules
router.post('/consolidate', asyncHandler(rulesController.consolidate));

export default router;
