/**
 * Browser Routes
 *
 * Routes for browser automation.
 */

import { Router } from 'express';
import * as browserController from '../controllers/browser.controller';
import { asyncHandler } from '../middleware';

const router = Router();

// GET /browser/status - Get browser status
router.get('/status', asyncHandler(browserController.getStatus));

// POST /browser/launch - Launch browser
router.post('/launch', asyncHandler(browserController.launch));

// POST /browser/close - Close browser
router.post('/close', asyncHandler(browserController.close));

export default router;
