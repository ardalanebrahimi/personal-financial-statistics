/**
 * Matching Routes
 *
 * Routes for transaction matching.
 */

import { Router } from 'express';
import * as matchingController from '../controllers/matching.controller';
import { asyncHandler } from '../middleware';

const router = Router();

// POST /matching/run - Run automatic matching
router.post('/run', asyncHandler(matchingController.runMatching));

// GET /matching - Get all matches
router.get('/', asyncHandler(matchingController.getAll));

// GET /matching/suggestions - Get match suggestions
router.get('/suggestions', asyncHandler(matchingController.getSuggestions));

// GET /matching/overview - Get matching overview
router.get('/overview', asyncHandler(matchingController.getOverview));

// POST /matching/confirm - Confirm a suggested match
router.post('/confirm', asyncHandler(matchingController.confirmMatch));

// POST /matching/manual - Create manual match
router.post('/manual', asyncHandler(matchingController.createManualMatch));

// GET /matching/:id - Get match by ID
router.get('/:id', asyncHandler(matchingController.getById));

// DELETE /matching/:id - Delete match
router.delete('/:id', asyncHandler(matchingController.deleteMatch));

export default router;
