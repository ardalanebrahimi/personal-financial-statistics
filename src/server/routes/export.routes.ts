/**
 * Export Routes
 *
 * Routes for data export and import.
 */

import { Router } from 'express';
import * as exportController from '../controllers/export.controller';
import { asyncHandler } from '../middleware';

const router = Router();

// GET /export - Export all data
router.get('/', asyncHandler(exportController.exportData));

// POST /import - Import data from backup
router.post('/import', asyncHandler(exportController.importData));

export default router;
