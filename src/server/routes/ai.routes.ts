/**
 * AI Routes
 *
 * Routes for AI assistant and cross-account intelligence.
 */

import { Router } from 'express';
import * as aiController from '../controllers/ai.controller';
import { asyncHandler } from '../middleware';

const router = Router();

// POST /ai/chat - Chat with AI assistant
router.post('/chat', asyncHandler(aiController.chat));

// POST /ai/chat/clear - Clear conversation history
router.post('/chat/clear', asyncHandler(aiController.clearHistory));

// POST /ai/similar-transactions - Find similar transactions
router.post('/similar-transactions', asyncHandler(aiController.findSimilar));

// POST /ai/apply-category-to-similar - Apply category to similar transactions
router.post('/apply-category-to-similar', asyncHandler(aiController.applyCategoryToSimilar));

// POST /ai/enrich - Enrich a transaction with cross-account data
router.post('/enrich', asyncHandler(aiController.enrich));

// POST /ai/suggest-category - Get category suggestions
router.post('/suggest-category', asyncHandler(aiController.suggestCategory));

// POST /ai/detect-insights - Detect insights for a transaction
router.post('/detect-insights', asyncHandler(aiController.detectInsights));

// POST /ai/analyze-all - Run cross-account analysis on all uncategorized
router.post('/analyze-all', asyncHandler(aiController.analyzeAll));

export default router;
