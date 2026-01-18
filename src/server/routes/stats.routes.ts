/**
 * Stats Routes
 *
 * Routes for system statistics.
 */

import { Router } from 'express';
import * as statsController from '../controllers/stats.controller';
import { asyncHandler } from '../middleware';

const router = Router();

// GET /stats - Get overall system statistics
router.get('/', asyncHandler(statsController.getStats));

export default router;
