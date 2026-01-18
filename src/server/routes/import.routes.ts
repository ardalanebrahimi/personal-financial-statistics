/**
 * Import Routes
 *
 * Routes for importing data from various sources.
 */

import { Router } from 'express';
import * as importController from '../controllers/import.controller';
import { asyncHandler } from '../middleware';

const router = Router();

// POST /import/amazon - Import Amazon orders
router.post('/amazon', asyncHandler(importController.importAmazon));

// DELETE /import/amazon - Clear Amazon data
router.delete('/amazon', asyncHandler(importController.clearAmazon));

// POST /import/amazon/refunds - Import Amazon refunds
router.post('/amazon/refunds', asyncHandler(importController.importAmazonRefunds));

// POST /import/paypal - Import PayPal text
router.post('/paypal', asyncHandler(importController.importPayPal));

// Note: POST /import/paypal/file needs multer middleware, will be added in index.ts

export default router;
