/**
 * PayPal Matching Routes
 *
 * Routes for PayPal transaction matching.
 */

import { Router } from 'express';
import * as paypalMatchingController from '../controllers/paypal-matching.controller';
import { asyncHandler } from '../middleware';

const router = Router();

// POST /paypal-matching/run - Run PayPal matching
router.post('/run', asyncHandler(paypalMatchingController.run));

// GET /paypal-matching/suggestions - Get match suggestions
router.get('/suggestions', asyncHandler(paypalMatchingController.getSuggestions));

// POST /paypal-matching/link - Manually link PayPal transactions
router.post('/link', asyncHandler(paypalMatchingController.link));

// GET /paypal-matching/linked/:id - Get linked PayPal transactions
router.get('/linked/:id', asyncHandler(paypalMatchingController.getLinked));

export default router;
