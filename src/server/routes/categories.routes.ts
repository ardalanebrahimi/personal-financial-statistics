/**
 * Categories Routes
 *
 * Routes for category management.
 */

import { Router } from 'express';
import * as categoriesController from '../controllers/categories.controller';
import { asyncHandler } from '../middleware';

const router = Router();

// GET /categories - Retrieve all categories
router.get('/', asyncHandler(categoriesController.getAll));

// PUT /categories - Save/update categories
router.put('/', asyncHandler(categoriesController.save));

// POST /categories/cleanup - Remove forbidden categories
router.post('/cleanup', asyncHandler(categoriesController.cleanup));

export default router;
