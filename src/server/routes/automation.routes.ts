/**
 * Automation Routes
 *
 * Routes for automation configuration and processing.
 */

import { Router } from 'express';
import * as automationController from '../controllers/automation.controller';
import { asyncHandler } from '../middleware';

const router = Router();

// GET /automation/config - Get automation config
router.get('/config', asyncHandler(automationController.getConfig));

// PUT /automation/config - Update automation config
router.put('/config', asyncHandler(automationController.updateConfig));

// POST /automation/categorize - Auto-categorize uncategorized
router.post('/categorize', asyncHandler(automationController.categorize));

// POST /automation/process-new - Process newly imported transactions
router.post('/process-new', asyncHandler(automationController.processNew));

export default router;
