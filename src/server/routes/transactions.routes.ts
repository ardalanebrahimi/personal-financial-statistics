/**
 * Transactions Routes
 *
 * Routes for transaction management.
 */

import { Router } from 'express';
import * as transactionsController from '../controllers/transactions.controller';
import { asyncHandler } from '../middleware';

const router = Router();

// GET /transactions - Get all transactions with pagination
router.get('/', asyncHandler(transactionsController.getAll));

// GET /transactions/match - Check for duplicate (must be before /:id)
router.get('/match', asyncHandler(transactionsController.checkMatch));

// GET /transactions/filter - Filter transactions
router.get('/filter', asyncHandler(transactionsController.filter));

// GET /transactions/category/:description - Get category by description
router.get('/category/:description', asyncHandler(transactionsController.getCategoryByDescription));

// POST /transactions - Create transaction
router.post('/', asyncHandler(transactionsController.create));

// POST /transactions/find-duplicates - Find duplicates
router.post('/find-duplicates', asyncHandler(transactionsController.findDuplicates));

// POST /transactions/remove-duplicate/:id - Remove specific duplicate
router.post('/remove-duplicate/:id', asyncHandler(transactionsController.removeDuplicate));

// POST /transactions/remove-duplicates-auto - Auto-remove duplicates
router.post('/remove-duplicates-auto', asyncHandler(transactionsController.removeDuplicatesAuto));

// PUT /transactions/:id - Update transaction
router.put('/:id', asyncHandler(transactionsController.update));

// DELETE /transactions/all - Clear all transactions (must be before /:id)
router.delete('/all', asyncHandler(transactionsController.clearAll));

// DELETE /transactions/:id - Delete transaction
router.delete('/:id', asyncHandler(transactionsController.remove));

export default router;
