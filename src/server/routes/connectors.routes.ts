/**
 * Connectors Routes
 *
 * Routes for financial service connector management.
 */

import { Router } from 'express';
import * as connectorsController from '../controllers/connectors.controller';
import { asyncHandler } from '../middleware';

const router = Router();

// GET /connectors - List all connectors
router.get('/', asyncHandler(connectorsController.getAll));

// POST /connectors - Create connector
router.post('/', asyncHandler(connectorsController.create));

// DELETE /connectors/:id - Delete connector
router.delete('/:id', asyncHandler(connectorsController.remove));

// DELETE /connectors/:id/credentials - Clear credentials
router.delete('/:id/credentials', asyncHandler(connectorsController.clearCredentials));

// GET /connectors/:id/has-credentials - Check credentials
router.get('/:id/has-credentials', asyncHandler(connectorsController.hasCredentials));

// POST /connectors/:id/connect - Connect
router.post('/:id/connect', asyncHandler(connectorsController.connect));

// POST /connectors/:id/mfa - Submit MFA
router.post('/:id/mfa', asyncHandler(connectorsController.submitMFA));

// POST /connectors/:id/poll-decoupled - Poll for decoupled MFA
router.post('/:id/poll-decoupled', asyncHandler(connectorsController.pollDecoupled));

// POST /connectors/:id/disconnect - Disconnect
router.post('/:id/disconnect', asyncHandler(connectorsController.disconnect));

// GET /connectors/:id/status - Get status
router.get('/:id/status', asyncHandler(connectorsController.getStatus));

// Note: POST /connectors/:id/fetch is in a separate file due to its complexity
// It will be added via the fetch controller

export default router;
