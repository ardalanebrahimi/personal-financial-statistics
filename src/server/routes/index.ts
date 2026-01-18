/**
 * Routes Index
 *
 * Aggregates all route modules and exports a configured router.
 */

import { Router } from 'express';

// Import all route modules
import categoriesRoutes from './categories.routes';
import transactionsRoutes from './transactions.routes';
import jobsRoutes from './jobs.routes';
import categorizationRoutes from './categorization.routes';
import connectorsRoutes from './connectors.routes';
import matchingRoutes from './matching.routes';
import importRoutes from './import.routes';
import rulesRoutes from './rules.routes';
import aiRoutes from './ai.routes';
import automationRoutes from './automation.routes';
import browserRoutes from './browser.routes';
import recurringRoutes from './recurring.routes';
import statsRoutes from './stats.routes';
import exportRoutes from './export.routes';
import orderMatchingRoutes from './order-matching.routes';
import paypalMatchingRoutes from './paypal-matching.routes';

/**
 * Create and configure the main API router.
 */
export function createApiRouter(): Router {
  const router = Router();

  // Mount all route modules
  router.use('/categories', categoriesRoutes);
  router.use('/transactions', transactionsRoutes);
  router.use('/jobs', jobsRoutes);
  router.use('/categorization', categorizationRoutes);
  router.use('/connectors', connectorsRoutes);
  router.use('/matching', matchingRoutes);
  router.use('/import', importRoutes);
  router.use('/rules', rulesRoutes);
  router.use('/ai', aiRoutes);
  router.use('/automation', automationRoutes);
  router.use('/browser', browserRoutes);
  router.use('/recurring', recurringRoutes);
  router.use('/stats', statsRoutes);
  router.use('/export', exportRoutes);
  router.use('/order-matching', orderMatchingRoutes);
  router.use('/paypal-matching', paypalMatchingRoutes);

  return router;
}

// Re-export individual route modules for flexibility
export {
  categoriesRoutes,
  transactionsRoutes,
  jobsRoutes,
  categorizationRoutes,
  connectorsRoutes,
  matchingRoutes,
  importRoutes,
  rulesRoutes,
  aiRoutes,
  automationRoutes,
  browserRoutes,
  recurringRoutes,
  statsRoutes,
  exportRoutes,
  orderMatchingRoutes,
  paypalMatchingRoutes
};
