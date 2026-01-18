/**
 * Order Matching Routes
 *
 * Routes for Amazon order matching.
 */

import { Router } from 'express';
import * as orderMatchingController from '../controllers/order-matching.controller';
import { asyncHandler } from '../middleware';

const router = Router();

// POST /order-matching/run - Run order matching
router.post('/run', asyncHandler(orderMatchingController.run));

// GET /order-matching/suggestions - Get match suggestions
router.get('/suggestions', asyncHandler(orderMatchingController.getSuggestions));

// POST /order-matching/link - Manually link orders
router.post('/link', asyncHandler(orderMatchingController.link));

// POST /order-matching/unlink - Unlink orders
router.post('/unlink', asyncHandler(orderMatchingController.unlink));

// GET /order-matching/linked/:id - Get linked orders
router.get('/linked/:id', asyncHandler(orderMatchingController.getLinked));

export default router;
