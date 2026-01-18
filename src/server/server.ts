// Load environment variables from .env file
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
dotenv.config({ path: path.join(__dirname, '.env') });

// @ts-ignore
const express = require('express');
// @ts-ignore
const multer = require('multer');
import cors from 'cors';
import { Request, Response } from 'express';
import { connectorManager } from './connectors/connector-manager';
import type { ConnectorType as CMConnectorType } from './connectors/connector-manager';
import { getBrowserService } from './browser';
import { TransactionMatcher, applyMatchesToTransactions, TransactionMatch as MatcherTransactionMatch, MatchSuggestion, StoredTransaction as MatcherStoredTransaction } from './matching/matcher';
import { OrderMatcher, applyOrderMatches, getLinkedOrderDetails, OrderMatchResult, OrderMatchSuggestion, MatchableTransaction } from './matching/order-matcher';
import { AmazonConnector } from './connectors/amazon-connector';
import { PayPalTextParser } from './connectors/paypal-connector';
import { PayPalMatcher, applyPayPalMatches, PayPalMatchingResult } from './matching/paypal-matcher';
import { RecurringDetector, RecurringPattern as DetectedPattern, predictNextOccurrences } from './recurring/recurring-detector';
import { RulesEngine, Rule, StoredTransaction as RulesStoredTransaction } from './ai/rules-engine';
import { CrossAccountIntelligence, EnrichedTransaction } from './ai/cross-account-intelligence';
import { AIAssistant, AssistantContext } from './ai/ai-assistant';
import { AutomationService, getAutomationService, AutomationConfig } from './automation/automation-service';

// Database imports
import * as db from './database/database';
import { encryptCredentials, decryptCredentials } from './utils/encryption';

// Job processing imports
import { processCsvImport, cancelImportJob } from './jobs/csv-import-processor';

// Categorization job imports
import type {
  CategorizationJob,
  CategorizationResult,
  StartCategorizationRequest,
  CorrectCategorizationRequest,
  CategorizationChatRequest,
  CategorizationJobStatus
} from './jobs/categorization-job';
import { CATEGORIZATION_PROMPT, isGenericCategory, GENERIC_CATEGORIES_TO_AVOID } from './jobs/categorization-job';
import { startCategorizationProcessor, cancelCategorizationProcessor, isJobProcessing } from './jobs/categorization-processor';

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '../data/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

const app = express();

// AI Services - Singleton instances
const rulesEngine = new RulesEngine();
let aiAssistant: AIAssistant | null = null;
let automationService: AutomationService;
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Store pending MFA references
const pendingMFAReferences: Map<string, string> = new Map();

// ==================== CONNECTOR TYPES ====================

enum ConnectorStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  MFA_REQUIRED = 'mfa_required',
  CONNECTED = 'connected',
  FETCHING = 'fetching',
  ERROR = 'error'
}

enum ConnectorType {
  SPARKASSE = 'sparkasse',
  N26 = 'n26',
  PAYPAL = 'paypal',
  GEBUHRENFREI = 'gebuhrenfrei',
  AMAZON = 'amazon'
}

interface ConnectorConfig {
  id: string;
  type: ConnectorType;
  name: string;
  enabled: boolean;
  bankCode?: string;
  accountId?: string;
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'partial' | 'failed';
  lastSyncError?: string;
  // Credential storage for auto-reconnect
  credentialsEncrypted?: string;
  credentialsSavedAt?: string;
  autoConnect?: boolean;
}

interface ConnectorState {
  config: ConnectorConfig;
  status: ConnectorStatus;
  statusMessage?: string;
  mfaChallenge?: {
    type: string;
    message: string;
    imageData?: string;
    expiresAt?: string;
    decoupled?: boolean;
    reference?: string;
  };
}

// In-memory connector states (not persisted)
const connectorStates: Map<string, ConnectorState> = new Map();

// ==================== CONNECTOR HELPERS ====================

async function getStoredConnectors(): Promise<ConnectorConfig[]> {
  return db.getAllConnectors() as ConnectorConfig[];
}

async function saveConnectors(connectors: ConnectorConfig[]) {
  // Update existing connectors
  for (const conn of connectors) {
    const existing = db.getConnectorById(conn.id);
    if (existing) {
      db.updateConnector(conn as any);
    } else {
      db.insertConnector(conn as any);
    }
  }
}

function getConnectorState(config: ConnectorConfig): ConnectorState {
  const existing = connectorStates.get(config.id);
  if (existing) {
    return { ...existing, config };
  }
  return {
    config,
    status: ConnectorStatus.DISCONNECTED
  };
}

// Use database StoredTransaction type
type StoredTransaction = db.StoredTransaction;

async function getStoredTransactions(): Promise<StoredTransaction[]> {
  return db.getAllTransactions();
}

async function saveTransaction(transaction: Omit<StoredTransaction, 'timestamp'>) {
  const existing = db.getTransactionById(transaction.id);
  if (existing) {
    db.updateTransaction({ ...transaction, timestamp: new Date().toISOString() } as StoredTransaction);
  } else {
    db.insertTransaction(transaction);
  }
}

async function bulkSaveTransactions(transactions: StoredTransaction[]): Promise<void> {
  db.bulkUpdateTransactions(transactions);
}

async function deleteTransactionById(id: string): Promise<boolean> {
  return db.deleteTransaction(id);
}

app.put('/categories', async (req: Request, res: Response) => {
  try {
    db.saveCategories(req.body);
    res.sendStatus(200);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save categories' });
  }
});

app.get('/categories', async (req: Request, res: Response) => {
  try {
    const categories = db.getAllCategories();
    res.json({ categories });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Failed to read categories' });
  }
});

// POST /categories/cleanup - Remove meaningless categories and reset affected transactions
app.post('/categories/cleanup', async (req: Request, res: Response) => {
  try {
    const forbiddenCategories = [
      'online shopping', 'new category', 'uncategorized', 'other',
      'misc', 'miscellaneous', 'general', 'shopping'
    ];

    // Get all categories and filter out forbidden ones
    const allCategories = db.getAllCategories();
    const categoriesToRemove = allCategories.filter(c =>
      forbiddenCategories.includes(c.name.toLowerCase())
    );
    const categoriesToKeep = allCategories.filter(c =>
      !forbiddenCategories.includes(c.name.toLowerCase())
    );

    // Get transactions with forbidden categories and reset them
    const transactions = await getStoredTransactions();
    let resetCount = 0;

    for (const tx of transactions) {
      if (tx.category && forbiddenCategories.includes(tx.category.toLowerCase())) {
        (tx as any).category = undefined;
        db.updateTransaction(tx);
        resetCount++;
      }
    }

    // Save the cleaned categories
    db.saveCategories(categoriesToKeep);

    res.json({
      success: true,
      categoriesRemoved: categoriesToRemove.map(c => c.name),
      transactionsReset: resetCount,
      remainingCategories: categoriesToKeep.length
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup categories' });
  }
});

app.get('/transactions/category/:description', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();
    const match = transactions.find(t =>
      t.description.toLowerCase() === req.params['description'].toLowerCase()
    );
    res.json({ category: match?.category || null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check transaction category' });
  }
});

// POST /transactions/find-duplicates - Find potential duplicate transactions
app.post('/transactions/find-duplicates', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();

    // Helper to extract Amazon order number from description
    const extractAmazonOrderNumber = (desc: string): string | null => {
      // Match patterns like "306-3583117-4868346" or "-3583117-4868346" or "3583117-4868346"
      const match = desc.match(/\d{7}-\d{7}/);
      return match ? match[0] : null;
    };

    // Group transactions by potential duplicate keys
    const groups = new Map<string, typeof transactions>();

    for (const tx of transactions) {
      // Skip context-only (Amazon orders) - they're not duplicates of bank transactions
      if (tx.isContextOnly) continue;

      const dateStr = new Date(tx.date).toISOString().split('T')[0];
      // IMPORTANT: Don't use Math.abs() - a purchase (-9.99) and refund (+9.99) are NOT duplicates!
      const amountKey = tx.amount.toFixed(2);

      // For Amazon transactions, use order number as additional key
      const orderNum = extractAmazonOrderNumber(tx.description);

      // Key components: date + amount + (order number OR beneficiary OR normalized description)
      // Date is REQUIRED for duplicate matching
      let key: string;
      if (orderNum) {
        // Amazon: date + order number + amount
        key = `amazon:${dateStr}:${orderNum}:${amountKey}`;
      } else if (tx.beneficiary) {
        // Non-Amazon with beneficiary: date + amount + normalized beneficiary
        // This catches duplicate rent payments, subscriptions, etc.
        const benefKey = tx.beneficiary.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
        key = `benef:${dateStr}:${amountKey}:${benefKey}`;
      } else {
        // Non-Amazon without beneficiary: date + amount + normalized description (first 30 chars)
        const descKey = tx.description.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
        key = `generic:${dateStr}:${amountKey}:${descKey}`;
      }

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(tx);
    }

    // Find groups with more than one transaction (duplicates)
    const duplicateGroups: { key: string; transactions: any[] }[] = [];
    for (const [key, txs] of groups) {
      if (txs.length > 1) {
        duplicateGroups.push({
          key,
          transactions: txs.map(t => ({
            id: t.id,
            date: t.date,
            description: t.description,
            amount: t.amount,
            beneficiary: t.beneficiary,
            source: t.source?.connectorType,
            category: t.category,
            linkedOrderIds: t.linkedOrderIds
          }))
        });
      }
    }

    res.json({
      totalGroups: duplicateGroups.length,
      totalDuplicates: duplicateGroups.reduce((sum, g) => sum + g.transactions.length - 1, 0),
      groups: duplicateGroups
    });
  } catch (error) {
    console.error('Find duplicates error:', error);
    res.status(500).json({ error: 'Failed to find duplicates' });
  }
});

// POST /transactions/remove-duplicate - Remove a specific duplicate transaction by ID
app.post('/transactions/remove-duplicate/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    db.deleteTransaction(id);
    res.json({ success: true, removedId: id });
  } catch (error) {
    console.error('Remove duplicate error:', error);
    res.status(500).json({ error: 'Failed to remove duplicate' });
  }
});

// POST /transactions/remove-duplicates-auto - Auto-remove duplicates (keeps the one with most info)
app.post('/transactions/remove-duplicates-auto', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();

    // Helper to extract Amazon order number from description
    const extractAmazonOrderNumber = (desc: string): string | null => {
      const match = desc.match(/\d{7}-\d{7}/);
      return match ? match[0] : null;
    };

    // Score a transaction - higher is better to keep
    const scoreTx = (tx: any): number => {
      let score = 0;
      if (tx.category) score += 10;
      if (tx.beneficiary) score += 5;
      if (tx.linkedOrderIds?.length) score += 8;
      if (tx.source?.externalId) score += 3;
      // Prefer longer descriptions (more info)
      score += Math.min(tx.description.length / 20, 5);
      return score;
    };

    // Group transactions by potential duplicate keys (same logic as find-duplicates)
    const groups = new Map<string, typeof transactions>();

    for (const tx of transactions) {
      if (tx.isContextOnly) continue;

      const dateStr = new Date(tx.date).toISOString().split('T')[0];
      const amountKey = tx.amount.toFixed(2);
      const orderNum = extractAmazonOrderNumber(tx.description);

      let key: string;
      if (orderNum) {
        key = `amazon:${dateStr}:${orderNum}:${amountKey}`;
      } else if (tx.beneficiary) {
        const benefKey = tx.beneficiary.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
        key = `benef:${dateStr}:${amountKey}:${benefKey}`;
      } else {
        const descKey = tx.description.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
        key = `generic:${dateStr}:${amountKey}:${descKey}`;
      }

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(tx);
    }

    // Remove duplicates (keep highest scored)
    let removedCount = 0;
    const removedIds: string[] = [];

    for (const [key, txs] of groups) {
      if (txs.length > 1) {
        // Sort by score descending, keep first
        txs.sort((a, b) => scoreTx(b) - scoreTx(a));

        // Keep the first (best), delete the rest
        for (let i = 1; i < txs.length; i++) {
          db.deleteTransaction(txs[i].id);
          removedIds.push(txs[i].id);
          removedCount++;
        }
      }
    }

    res.json({
      success: true,
      removedCount,
      removedIds
    });
  } catch (error) {
    console.error('Remove duplicates error:', error);
    res.status(500).json({ error: 'Failed to remove duplicates' });
  }
});

app.get('/transactions', async (req: Request, res: Response) => {
  try {
    const { page, limit, sort = 'date', order = 'desc' } = req.query;

    let transactions = await getStoredTransactions();

    // Sort transactions
    const sortField = sort.toString();
    const sortOrder = order.toString() === 'asc' ? 1 : -1;
    transactions.sort((a: any, b: any) => {
      if (sortField === 'date') {
        return (new Date(b.date).getTime() - new Date(a.date).getTime()) * sortOrder;
      } else if (sortField === 'amount') {
        return (b.amount - a.amount) * sortOrder;
      }
      return 0;
    });

    // Pagination
    const total = transactions.length;
    if (page && limit) {
      const pageNum = parseInt(page.toString(), 10);
      const limitNum = parseInt(limit.toString(), 10);
      const start = (pageNum - 1) * limitNum;
      transactions = transactions.slice(start, start + limitNum);

      return res.json({
        transactions,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasMore: start + transactions.length < total
        }
      });
    }

    return res.json({ transactions, total });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// Move this endpoint before the '/:id' routes to prevent route conflicts
app.get('/transactions/match', async (req: Request, res: Response) => {
  try {
    const { date, amount, description } = req.query;

    // Debug log for incoming query parameters
    console.log('Match request received:', { date, amount, description });

    if (!date || !amount || !description) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const transactions = await getStoredTransactions();

    // Debug log for stored transactions
    console.log('Stored transactions:', transactions);

    const match = transactions.find(t => {
      // Parse and compare dates without time component
      const storedDate = new Date(t.date).toISOString().split('T')[0];
      const queryDate = new Date(date.toString()).toISOString().split('T')[0];
      const sameDate = storedDate === queryDate;

      // Compare amounts with a small tolerance for floating-point differences
      const sameAmount = Math.abs(Number(t.amount) - Number(amount)) < 0.01;

      // Normalize and compare descriptions
      const storedDesc = t.description.toLowerCase().replace(/\s+/g, '');
      const queryDesc = description.toString().toLowerCase().replace(/\s+/g, '');
      const similarDescription = storedDesc.includes(queryDesc) || queryDesc.includes(storedDesc);

      // Debug log for comparison details
      console.log('Comparing transaction:', {
        storedDate,
        queryDate,
        sameDate,
        storedAmount: t.amount,
        queryAmount: amount,
        sameAmount,
        storedDesc,
        queryDesc,
        similarDescription
      });

      return sameDate && sameAmount && similarDescription;
    });

    // Debug log for match result
    console.log('Match result:', match);

    if (match) {
      return res.json({ exists: true, category: match.category });
    } else {
      return res.json({ exists: false });
    }
  } catch (error) {
    console.error('Error in /transactions/match:', error);
    return res.status(500).json({ error: 'Failed to check transaction match' });
  }
});

app.get('/transactions/filter', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, category, beneficiary, description } = req.query;
    let transactions = await getStoredTransactions();

    // Filter by date range
    if (startDate) {
      transactions = transactions.filter(t => 
        new Date(t.date) >= new Date(startDate.toString())
      );
    }
    if (endDate) {
      transactions = transactions.filter(t => 
        new Date(t.date) <= new Date(endDate.toString())
      );
    }

    // Filter by category
    if (category) {
      transactions = transactions.filter(t => 
        t.category.toLowerCase().includes(category.toString().toLowerCase())
      );
    }

    // Filter by beneficiary or description
    if (beneficiary || description) {
      transactions = transactions.filter(t => {
        const desc = t.description.toLowerCase();
        const matchBeneficiary = !beneficiary || desc.includes(beneficiary.toString().toLowerCase());
        const matchDescription = !description || desc.includes(description.toString().toLowerCase());
        return matchBeneficiary && matchDescription;
      });
    }

    // Sort by date, latest first
    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({ transactions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to filter transactions' });
  }
});

// DELETE /transactions/all - Clear all transactions
app.delete('/transactions/all', async (req: Request, res: Response) => {
  try {
    const deletedCount = db.clearAllTransactions();
    console.log(`[Server] Cleared ${deletedCount} transactions`);
    res.json({ success: true, deletedCount });
  } catch (error) {
    console.error('Clear all transactions error:', error);
    res.status(500).json({ error: 'Failed to clear transactions' });
  }
});

app.delete('/transactions/:id', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();
    const filtered = transactions.filter(t => t.id !== req.params['id']);
    await bulkSaveTransactions(filtered);
    res.json({ success: true, deletedId: req.params['id'] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

app.post('/transactions', async (req: Request, res: Response) => {
  try {
    const transaction = req.body;

    // Auto-categorize if enabled and no category provided
    if (automationService.getConfig().autoCategorize &&
        (!transaction.category || transaction.category === '' || transaction.category === 'Uncategorized')) {
      const category = await autoCategorizeTransaction({
        id: transaction.id,
        description: transaction.description,
        amount: transaction.amount,
        date: transaction.date,
        category: transaction.category || '',
        beneficiary: transaction.beneficiary,
        timestamp: new Date().toISOString(),
        source: transaction.source
      });
      if (category) {
        transaction.category = category;
        console.log(`[Automation] Auto-categorized transaction: ${category}`);
      }
    }

    await saveTransaction(transaction);
    res.status(200).json({
      message: 'Transaction saved successfully',
      category: transaction.category,
      autoCategorized: !!transaction.category
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save transaction' });
  }
});

app.put('/transactions/:id', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();
    const index = transactions.findIndex(t => t.id === req.params['id']);
    if (index !== -1) {
      transactions[index] = { ...req.body, timestamp: new Date().toISOString() };
      await bulkSaveTransactions(transactions);
      res.json({ success: true, updatedId: req.params['id'] });
    } else {
      res.status(404).json({ error: 'Transaction not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// ==================== JOB ENDPOINTS ====================

// POST /jobs/import/csv - Upload and start CSV import job
app.post('/jobs/import/csv', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Create the job
    const job = db.createJob({
      type: 'csv_import',
      fileName: file.originalname,
      filePath: file.path
    });

    console.log(`[Jobs] Created CSV import job ${job.id} for file ${file.originalname}`);

    // Start processing in background (don't await)
    processCsvImport(job.id, file.path).catch(err => {
      console.error(`[Jobs] CSV import job ${job.id} failed:`, err);
    });

    // Return immediately with job ID
    res.json({
      success: true,
      jobId: job.id,
      message: 'Import job started'
    });
  } catch (error: any) {
    console.error('Failed to start import job:', error);
    res.status(500).json({ error: 'Failed to start import job', details: error.message });
  }
});

// GET /jobs - Get all recent jobs
app.get('/jobs', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query['limit'] as string) || 20;
    const jobs = db.getRecentJobs(limit);
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get jobs' });
  }
});

// GET /jobs/active - Get active (running/pending) jobs
app.get('/jobs/active', (req: Request, res: Response) => {
  try {
    const jobs = db.getActiveJobs();
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get active jobs' });
  }
});

// GET /jobs/:id - Get specific job status
app.get('/jobs/:id', (req: Request, res: Response) => {
  try {
    const job = db.getJob(req.params['id']);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json({ job });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get job' });
  }
});

// POST /jobs/:id/cancel - Cancel a running job
app.post('/jobs/:id/cancel', (req: Request, res: Response) => {
  try {
    const job = db.getJob(req.params['id']);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.status !== 'running' && job.status !== 'pending') {
      res.status(400).json({ error: 'Job is not running' });
      return;
    }

    // Try to cancel the import
    const cancelled = cancelImportJob(job.id);
    if (cancelled) {
      res.json({ success: true, message: 'Job cancellation requested' });
    } else {
      // Job might have just completed
      db.cancelJob(job.id);
      res.json({ success: true, message: 'Job cancelled' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

// ==================== CATEGORIZATION JOB ENDPOINTS ====================

// POST /categorization/jobs - Start a new categorization job
app.post('/categorization/jobs', async (req: Request, res: Response) => {
  try {
    const request: StartCategorizationRequest = req.body;

    // Validate request
    if (!request.transactionIds || request.transactionIds.length === 0) {
      res.status(400).json({ error: 'No transactions specified for categorization' });
      return;
    }

    // Get the transactions to categorize
    const allTransactions = db.getAllTransactions();
    let transactionIds = request.transactionIds;

    // Filter based on scope if specified
    if (request.scope === 'uncategorized') {
      transactionIds = allTransactions
        .filter(tx => !tx.category || tx.category === '')
        .map(tx => tx.id);
    } else if (request.scope === 'all') {
      transactionIds = allTransactions
        .filter(tx => !tx.isContextOnly)
        .map(tx => tx.id);
    }

    // Filter out already categorized if not including them
    if (!request.includeAlreadyCategorized) {
      const categorizedIds = new Set(
        allTransactions
          .filter(tx => tx.category && tx.category !== '')
          .map(tx => tx.id)
      );
      transactionIds = transactionIds.filter(id => !categorizedIds.has(id));
    }

    if (transactionIds.length === 0) {
      res.status(400).json({ error: 'No transactions to categorize after filtering' });
      return;
    }

    // Create the categorization job
    const job = db.createCategorizationJob({
      transactionIds,
      includeAlreadyCategorized: request.includeAlreadyCategorized || false
    });

    console.log(`[Categorization] Created job ${job.id} with ${transactionIds.length} transactions`);

    // Start the background categorization processor
    // Run in background (non-blocking)
    startCategorizationProcessor(job.id).catch(error => {
      console.error(`[Categorization] Processor failed for job ${job.id}:`, error);
    });

    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        totalCount: job.totalCount,
        processedCount: job.processedCount
      }
    });
  } catch (error: any) {
    console.error('[Categorization] Failed to create job:', error);
    res.status(500).json({ error: 'Failed to create categorization job', details: error.message });
  }
});

// GET /categorization/jobs - Get all categorization jobs
app.get('/categorization/jobs', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query['limit'] as string) || 10;
    const jobs = db.getRecentCategorizationJobs(limit);
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get categorization jobs' });
  }
});

// GET /categorization/jobs/active - Get active categorization jobs
app.get('/categorization/jobs/active', (req: Request, res: Response) => {
  try {
    const jobs = db.getActiveCategorizationJobs();
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get active categorization jobs' });
  }
});

// GET /categorization/jobs/:id - Get specific categorization job
app.get('/categorization/jobs/:id', (req: Request, res: Response) => {
  try {
    const job = db.getCategorizationJob(req.params['id']);
    if (!job) {
      res.status(404).json({ error: 'Categorization job not found' });
      return;
    }

    // Build status response with recent results
    const recentResults = job.results.slice(-20); // Last 20 results
    const status: CategorizationJobStatus = {
      id: job.id,
      status: job.status,
      progress: job.totalCount > 0 ? Math.round((job.processedCount / job.totalCount) * 100) : 0,
      totalCount: job.totalCount,
      processedCount: job.processedCount,
      appliedCount: job.appliedCount,
      correctedCount: job.correctedCount,
      recentResults
    };

    res.json({ job, status });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get categorization job' });
  }
});

// PUT /categorization/jobs/:id/pause - Pause a categorization job
app.put('/categorization/jobs/:id/pause', (req: Request, res: Response) => {
  try {
    const job = db.getCategorizationJob(req.params['id']);
    if (!job) {
      res.status(404).json({ error: 'Categorization job not found' });
      return;
    }

    if (job.status !== 'processing') {
      res.status(400).json({ error: 'Job is not processing' });
      return;
    }

    db.pauseCategorizationJob(job.id);
    res.json({ success: true, message: 'Job paused' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to pause job' });
  }
});

// PUT /categorization/jobs/:id/resume - Resume a paused categorization job
app.put('/categorization/jobs/:id/resume', (req: Request, res: Response) => {
  try {
    const job = db.getCategorizationJob(req.params['id']);
    if (!job) {
      res.status(404).json({ error: 'Categorization job not found' });
      return;
    }

    if (job.status !== 'paused') {
      res.status(400).json({ error: 'Job is not paused' });
      return;
    }

    db.resumeCategorizationJob(job.id);

    // Restart the processor
    startCategorizationProcessor(job.id).catch(error => {
      console.error(`[Categorization] Failed to resume processor for job ${job.id}:`, error);
    });

    res.json({ success: true, message: 'Job resumed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to resume job' });
  }
});

// DELETE /categorization/jobs/:id - Cancel a categorization job
app.delete('/categorization/jobs/:id', (req: Request, res: Response) => {
  try {
    const job = db.getCategorizationJob(req.params['id']);
    if (!job) {
      res.status(404).json({ error: 'Categorization job not found' });
      return;
    }

    if (job.status === 'completed' || job.status === 'cancelled') {
      res.status(400).json({ error: 'Job is already completed or cancelled' });
      return;
    }

    // Cancel the processor if it's running
    cancelCategorizationProcessor(job.id);

    db.cancelCategorizationJob(job.id);
    res.json({ success: true, message: 'Job cancelled' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

// POST /categorization/jobs/:id/correct - Correct a categorization result
app.post('/categorization/jobs/:id/correct', async (req: Request, res: Response) => {
  try {
    const request: CorrectCategorizationRequest = req.body;
    const jobId = req.params['id'];

    const job = db.getCategorizationJob(jobId);
    if (!job) {
      res.status(404).json({ error: 'Categorization job not found' });
      return;
    }

    // Find the result for this transaction
    const resultIndex = job.results.findIndex(r => r.transactionId === request.transactionId);
    if (resultIndex === -1) {
      res.status(404).json({ error: 'Transaction result not found in job' });
      return;
    }

    // Update the result with the correction
    const result = job.results[resultIndex];
    result.status = 'corrected';
    result.correctedCategory = request.correctedCategory;
    result.correctedSubcategory = request.correctedSubcategory;
    result.correctionReason = request.reason;

    // Update the job
    job.correctedCount++;
    db.updateCategorizationJob(job);

    // Apply the correction to the actual transaction
    const transaction = db.getTransactionById(request.transactionId);
    if (transaction) {
      transaction.category = request.correctedCategory;
      transaction.subcategory = request.correctedSubcategory;
      transaction.categorizedAt = new Date().toISOString();
      transaction.categorizedBy = 'user';
      transaction.categoryConfidence = 100; // User corrections are 100% confident
      db.updateTransaction(transaction);

      // Optionally create a rule from this correction
      if (request.createRule) {
        // Create a rule from this correction (use rules engine)
        try {
          const newRule = rulesEngine.createRuleFromCorrection(
            {
              description: transaction.description,
              beneficiary: transaction.beneficiary,
              amount: transaction.amount
            },
            result.suggestedCategory,
            request.correctedCategory,
            request.reason
          );
          console.log(`[Categorization] Created rule from correction: ${newRule.id}`);
        } catch (ruleError) {
          console.error('[Categorization] Failed to create rule:', ruleError);
        }
      }
    }

    res.json({ success: true, message: 'Correction applied' });
  } catch (error: any) {
    console.error('[Categorization] Failed to apply correction:', error);
    res.status(500).json({ error: 'Failed to apply correction', details: error.message });
  }
});

// POST /categorization/jobs/:id/chat - Chat about a categorization
app.post('/categorization/jobs/:id/chat', async (req: Request, res: Response) => {
  try {
    const request: CategorizationChatRequest = req.body;
    const jobId = req.params['id'];

    const job = db.getCategorizationJob(jobId);
    if (!job) {
      res.status(404).json({ error: 'Categorization job not found' });
      return;
    }

    // Add user message to conversation
    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: request.message,
      timestamp: new Date().toISOString(),
      relatedTransactionId: request.transactionId
    };
    db.addCategorizationConversationMessage(jobId, userMessage);

    // Get context for AI response
    let context = '';
    if (request.transactionId) {
      const transaction = db.getTransactionById(request.transactionId);
      const result = job.results.find(r => r.transactionId === request.transactionId);
      if (transaction && result) {
        context = `
Transaction details:
- Description: ${transaction.description}
- Amount: ${transaction.amount} EUR
- Beneficiary: ${transaction.beneficiary || 'N/A'}
- Date: ${transaction.date}
- Current AI suggestion: ${result.suggestedCategory}${result.suggestedSubcategory ? ' > ' + result.suggestedSubcategory : ''}
- Confidence: ${result.confidence}%
- Reasoning: ${result.reasoning}
`;
      }
    }

    // Use AI assistant to respond
    if (!aiAssistant) {
      aiAssistant = new AIAssistant(process.env['OPENAI_API_KEY'] || '');
    }

    const response = await aiAssistant.chat(
      `${context}\n\nUser question: ${request.message}`,
      { currentView: 'categorization', selectedTransaction: request.transactionId }
    );

    // Add assistant response to conversation
    const assistantMessage = {
      id: crypto.randomUUID(),
      role: 'assistant' as const,
      content: response.message,
      timestamp: new Date().toISOString(),
      relatedTransactionId: request.transactionId
    };
    db.addCategorizationConversationMessage(jobId, assistantMessage);

    res.json({
      success: true,
      message: response.message,
      conversationHistory: [...job.conversationHistory, userMessage, assistantMessage]
    });
  } catch (error: any) {
    console.error('[Categorization] Chat failed:', error);
    res.status(500).json({ error: 'Failed to process chat', details: error.message });
  }
});

// ==================== CONNECTOR ENDPOINTS ====================

// GET /connectors - List all connectors with their current status
app.get('/connectors', async (req: Request, res: Response) => {
  try {
    const connectors = await getStoredConnectors();
    const states = connectors.map(config => getConnectorState(config));
    res.json({ connectors: states });
  } catch (error) {
    console.error('Error getting connectors:', error);
    res.status(500).json({ error: 'Failed to get connectors' });
  }
});

// POST /connectors - Create a new connector configuration
app.post('/connectors', async (req: Request, res: Response) => {
  try {
    const connectors = await getStoredConnectors();
    const newConnector: ConnectorConfig = {
      id: crypto.randomUUID(),
      type: req.body.type,
      name: req.body.name,
      enabled: true,
      bankCode: req.body.bankCode,
      accountId: req.body.accountId
    };
    connectors.push(newConnector);
    await saveConnectors(connectors);

    const state = getConnectorState(newConnector);
    res.status(201).json(state);
  } catch (error) {
    console.error('Error creating connector:', error);
    res.status(500).json({ error: 'Failed to create connector' });
  }
});

// DELETE /connectors/:id - Delete a connector
app.delete('/connectors/:id', async (req: Request, res: Response) => {
  try {
    const connectors = await getStoredConnectors();
    const filtered = connectors.filter(c => c.id !== req.params['id']);
    if (filtered.length === connectors.length) {
      return res.status(404).json({ error: 'Connector not found' });
    }
    await saveConnectors(filtered);
    connectorStates.delete(req.params['id']);
    return res.sendStatus(200);
  } catch (error) {
    console.error('Error deleting connector:', error);
    return res.status(500).json({ error: 'Failed to delete connector' });
  }
});

// DELETE /connectors/:id/credentials - Clear saved credentials for a connector
app.delete('/connectors/:id/credentials', async (req: Request, res: Response) => {
  try {
    const connector = db.getConnectorById(req.params['id']);
    if (!connector) {
      return res.status(404).json({ error: 'Connector not found' });
    }

    connector.credentialsEncrypted = undefined;
    connector.credentialsSavedAt = undefined;
    connector.autoConnect = false;
    db.updateConnector(connector);

    console.log(`[Connector] Cleared saved credentials for ${connector.name}`);
    return res.json({ success: true, message: 'Credentials cleared' });
  } catch (error) {
    console.error('Error clearing credentials:', error);
    return res.status(500).json({ error: 'Failed to clear credentials' });
  }
});

// GET /connectors/:id/has-credentials - Check if connector has saved credentials
app.get('/connectors/:id/has-credentials', async (req: Request, res: Response) => {
  try {
    const connector = db.getConnectorById(req.params['id']);
    if (!connector) {
      return res.status(404).json({ error: 'Connector not found' });
    }

    return res.json({
      hasCredentials: !!connector.credentialsEncrypted,
      savedAt: connector.credentialsSavedAt,
      autoConnect: connector.autoConnect
    });
  } catch (error) {
    console.error('Error checking credentials:', error);
    return res.status(500).json({ error: 'Failed to check credentials' });
  }
});

// POST /connectors/:id/connect - Initiate connection to the financial service
app.post('/connectors/:id/connect', async (req: Request, res: Response) => {
  try {
    const connectors = await getStoredConnectors();
    const connectorConfig = connectors.find(c => c.id === req.params['id']);

    if (!connectorConfig) {
      return res.status(404).json({ error: 'Connector not found' });
    }

    // Get credentials from request body or stored credentials
    let { userId, pin, saveCredentials } = req.body;

    // If no credentials provided, try to use saved credentials
    if ((!userId || !pin) && connectorConfig.credentialsEncrypted) {
      try {
        const savedCreds = decryptCredentials(connectorConfig.credentialsEncrypted);
        userId = savedCreds['userId'];
        pin = savedCreds['pin'];
        console.log(`[Connector] Using saved credentials for ${connectorConfig.name}`);
      } catch (error) {
        console.error('[Connector] Failed to decrypt saved credentials:', error);
        return res.status(400).json({ error: 'Saved credentials invalid. Please provide new credentials.' });
      }
    }

    if (!userId || !pin) {
      // Check if there are saved credentials available
      const hasSavedCredentials = !!connectorConfig.credentialsEncrypted;
      return res.status(400).json({
        error: 'Credentials required (userId, pin)',
        hasSavedCredentials
      });
    }

    // Save credentials if requested
    if (saveCredentials) {
      const encrypted = encryptCredentials({ userId, pin });
      connectorConfig.credentialsEncrypted = encrypted;
      connectorConfig.credentialsSavedAt = new Date().toISOString();
      connectorConfig.autoConnect = true;
      db.updateConnector(connectorConfig as any);
      console.log(`[Connector] Credentials saved for ${connectorConfig.name}`);
    }

    // Update state to connecting
    let state: ConnectorState = {
      config: connectorConfig,
      status: ConnectorStatus.CONNECTING,
      statusMessage: 'Initiating connection...'
    };
    connectorStates.set(connectorConfig.id, state);

    // Check if connector type is implemented
    if (!connectorManager.isImplemented(connectorConfig.type as CMConnectorType)) {
      // Fall back to simulation for unimplemented connectors
      setTimeout(() => {
        const updatedState: ConnectorState = {
          config: connectorConfig,
          status: ConnectorStatus.MFA_REQUIRED,
          statusMessage: 'MFA verification required',
          mfaChallenge: {
            type: 'push',
            message: 'Please confirm the login in your banking app or enter the TAN code.',
            expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
          }
        };
        connectorStates.set(connectorConfig.id, updatedState);
      }, 1000);
      return res.json(state);
    }

    // Use real connector
    try {
      const connector = await connectorManager.initializeConnector(
        connectorConfig.id,
        connectorConfig.type as CMConnectorType,
        {
          userId,
          pin,
          bankCode: connectorConfig.bankCode
        }
      );

      const result = await connector.connect();

      if (!result.success && !result.requiresMFA) {
        state = {
          config: connectorConfig,
          status: ConnectorStatus.ERROR,
          statusMessage: result.error || 'Connection failed'
        };
        connectorStates.set(connectorConfig.id, state);
        return res.json(state);
      }

      if (result.requiresMFA && result.mfaChallenge) {
        // Store MFA reference
        if (result.mfaChallenge.reference) {
          pendingMFAReferences.set(connectorConfig.id, result.mfaChallenge.reference);
        }

        state = {
          config: connectorConfig,
          status: ConnectorStatus.MFA_REQUIRED,
          statusMessage: 'TAN verification required',
          mfaChallenge: {
            type: result.mfaChallenge.type,
            message: result.mfaChallenge.message,
            imageData: result.mfaChallenge.imageData,
            expiresAt: result.mfaChallenge.expiresAt?.toISOString(),
            decoupled: result.mfaChallenge.decoupled || false,
            reference: result.mfaChallenge.reference
          }
        };
        connectorStates.set(connectorConfig.id, state);
        return res.json(state);
      }

      // Connected successfully
      state = {
        config: connectorConfig,
        status: ConnectorStatus.CONNECTED,
        statusMessage: `Connected. Found ${result.accounts?.length || 0} accounts.`
      };
      connectorStates.set(connectorConfig.id, state);
      return res.json(state);

    } catch (connectorError) {
      console.error('Connector error:', connectorError);
      state = {
        config: connectorConfig,
        status: ConnectorStatus.ERROR,
        statusMessage: connectorError instanceof Error ? connectorError.message : 'Connection failed'
      };
      connectorStates.set(connectorConfig.id, state);
      return res.json(state);
    }
  } catch (error) {
    console.error('Error connecting:', error);
    return res.status(500).json({ error: 'Failed to initiate connection' });
  }
});

// POST /connectors/:id/mfa - Submit MFA code
app.post('/connectors/:id/mfa', async (req: Request, res: Response) => {
  try {
    const connectors = await getStoredConnectors();
    const connectorConfig = connectors.find(c => c.id === req.params['id']);

    if (!connectorConfig) {
      return res.status(404).json({ error: 'Connector not found' });
    }

    const currentState = connectorStates.get(connectorConfig.id);
    if (!currentState || currentState.status !== ConnectorStatus.MFA_REQUIRED) {
      return res.status(400).json({ error: 'No MFA challenge pending' });
    }

    const { code } = req.body;
    // Code can be empty for push/decoupled TAN

    // Check if we have a real connector instance
    const connectorInstance = connectorManager.getConnector(connectorConfig.id);

    if (!connectorInstance) {
      // Fall back to simulation for unimplemented connectors
      const state: ConnectorState = {
        config: connectorConfig,
        status: ConnectorStatus.CONNECTED,
        statusMessage: 'Connected successfully'
      };
      connectorStates.set(connectorConfig.id, state);
      return res.json(state);
    }

    // Use real connector
    const reference = pendingMFAReferences.get(connectorConfig.id);
    const result = await connectorInstance.connector.submitMFA(code || '', reference);

    if (!result.success && !result.requiresMFA) {
      const state: ConnectorState = {
        config: connectorConfig,
        status: ConnectorStatus.ERROR,
        statusMessage: result.error || 'MFA verification failed'
      };
      connectorStates.set(connectorConfig.id, state);
      pendingMFAReferences.delete(connectorConfig.id);
      return res.json(state);
    }

    if (result.requiresMFA && result.mfaChallenge) {
      // Another MFA step required
      if (result.mfaChallenge.reference) {
        pendingMFAReferences.set(connectorConfig.id, result.mfaChallenge.reference);
      }

      const state: ConnectorState = {
        config: connectorConfig,
        status: ConnectorStatus.MFA_REQUIRED,
        statusMessage: 'Additional verification required',
        mfaChallenge: {
          type: result.mfaChallenge.type,
          message: result.mfaChallenge.message,
          imageData: result.mfaChallenge.imageData,
          expiresAt: result.mfaChallenge.expiresAt?.toISOString(),
          decoupled: result.mfaChallenge.decoupled || false,
          reference: result.mfaChallenge.reference
        }
      };
      connectorStates.set(connectorConfig.id, state);
      return res.json(state);
    }

    // Connected successfully
    pendingMFAReferences.delete(connectorConfig.id);
    const state: ConnectorState = {
      config: connectorConfig,
      status: ConnectorStatus.CONNECTED,
      statusMessage: `Connected. Found ${result.accounts?.length || 0} accounts.`
    };
    connectorStates.set(connectorConfig.id, state);
    return res.json(state);
  } catch (error) {
    console.error('Error submitting MFA:', error);
    return res.status(500).json({ error: 'Failed to verify MFA' });
  }
});

// POST /connectors/:id/poll-decoupled - Poll for decoupled TAN confirmation
app.post('/connectors/:id/poll-decoupled', async (req: Request, res: Response) => {
  try {
    const connectors = await getStoredConnectors();
    const connectorConfig = connectors.find(c => c.id === req.params['id']);

    if (!connectorConfig) {
      return res.status(404).json({ error: 'Connector not found' });
    }

    const currentState = connectorStates.get(connectorConfig.id);
    if (!currentState || currentState.status !== ConnectorStatus.MFA_REQUIRED) {
      // If no longer in MFA_REQUIRED state, check if connected (meaning TAN was confirmed)
      if (currentState?.status === ConnectorStatus.CONNECTED) {
        return res.json({ confirmed: true, expired: false });
      }
      return res.json({ confirmed: false, expired: true, error: 'No pending decoupled TAN' });
    }

    // Check if we have a real connector instance
    const connectorInstance = connectorManager.getConnector(connectorConfig.id);

    if (!connectorInstance) {
      // Simulation mode - just say not confirmed
      return res.json({ confirmed: false, expired: false });
    }

    // For decoupled TAN, we need to poll the bank to see if it was confirmed
    // This is done by calling submitMFA with an empty code
    const reference = pendingMFAReferences.get(connectorConfig.id);

    try {
      const result = await connectorInstance.connector.submitMFA('', reference);

      if (result.connected) {
        // TAN was confirmed!
        pendingMFAReferences.delete(connectorConfig.id);
        const state: ConnectorState = {
          config: connectorConfig,
          status: ConnectorStatus.CONNECTED,
          statusMessage: `Connected. Found ${result.accounts?.length || 0} accounts.`
        };
        connectorStates.set(connectorConfig.id, state);
        return res.json({ confirmed: true, expired: false });
      }

      if (result.requiresMFA) {
        // Still waiting for confirmation
        return res.json({ confirmed: false, expired: false });
      }

      // Something went wrong
      return res.json({ confirmed: false, expired: false, error: result.error });
    } catch (pollError) {
      // Polling error - might be timeout or network issue
      console.error('Decoupled polling error:', pollError);
      return res.json({ confirmed: false, expired: false });
    }
  } catch (error) {
    console.error('Error polling decoupled:', error);
    return res.status(500).json({ error: 'Failed to poll decoupled status' });
  }
});

// POST /connectors/:id/fetch - Fetch transactions for date range
app.post('/connectors/:id/fetch', async (req: Request, res: Response) => {
  try {
    const connectors = await getStoredConnectors();
    const connectorConfig = connectors.find(c => c.id === req.params['id']);

    if (!connectorConfig) {
      return res.status(404).json({ error: 'Connector not found' });
    }

    const currentState = connectorStates.get(connectorConfig.id);
    if (!currentState || currentState.status !== ConnectorStatus.CONNECTED) {
      return res.status(400).json({ error: 'Connector not connected. Please connect first.' });
    }

    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Date range required (startDate, endDate)' });
    }

    // Update state to fetching
    let state: ConnectorState = {
      config: connectorConfig,
      status: ConnectorStatus.FETCHING,
      statusMessage: 'Fetching transactions...'
    };
    connectorStates.set(connectorConfig.id, state);

    // Check if we have a real connector instance
    const connectorInstance = connectorManager.getConnector(connectorConfig.id);

    if (!connectorInstance) {
      // Fall back to simulation for unimplemented connectors
      setTimeout(async () => {
        connectorConfig.lastSyncAt = new Date().toISOString();
        connectorConfig.lastSyncStatus = 'success';
        const allConnectors = await getStoredConnectors();
        const index = allConnectors.findIndex(c => c.id === connectorConfig.id);
        if (index !== -1) {
          allConnectors[index] = connectorConfig;
          await saveConnectors(allConnectors);
        }

        const completedState: ConnectorState = {
          config: connectorConfig,
          status: ConnectorStatus.CONNECTED,
          statusMessage: 'Fetch completed (simulation)'
        };
        connectorStates.set(connectorConfig.id, completedState);
      }, 2000);

      return res.json({
        message: 'Fetch started',
        dateRange: { startDate, endDate }
      });
    }

    // Use real connector
    try {
      const result = await connectorInstance.connector.fetchTransactions({
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      });

      // Check if MFA is required
      if ('requiresMFA' in result && result.requiresMFA) {
        if (result.mfaChallenge.reference) {
          pendingMFAReferences.set(connectorConfig.id, result.mfaChallenge.reference);
        }

        state = {
          config: connectorConfig,
          status: ConnectorStatus.MFA_REQUIRED,
          statusMessage: 'TAN required for transaction fetch',
          mfaChallenge: {
            type: result.mfaChallenge.type,
            message: result.mfaChallenge.message,
            imageData: result.mfaChallenge.imageData,
            expiresAt: result.mfaChallenge.expiresAt?.toISOString()
          }
        };
        connectorStates.set(connectorConfig.id, state);
        return res.json(state);
      }

      // Process fetched transactions
      const fetchResult = result as { success: boolean; transactions: any[]; errors?: string[] };

      if (!fetchResult.success) {
        connectorConfig.lastSyncAt = new Date().toISOString();
        connectorConfig.lastSyncStatus = 'failed';
        connectorConfig.lastSyncError = fetchResult.errors?.join('; ');

        state = {
          config: connectorConfig,
          status: ConnectorStatus.ERROR,
          statusMessage: fetchResult.errors?.join('; ') || 'Failed to fetch transactions'
        };
        connectorStates.set(connectorConfig.id, state);

        // Save connector state
        const allConnectors = await getStoredConnectors();
        const index = allConnectors.findIndex(c => c.id === connectorConfig.id);
        if (index !== -1) {
          allConnectors[index] = connectorConfig;
          await saveConnectors(allConnectors);
        }

        return res.json(state);
      }

      // Save transactions to storage
      let newCount = 0;
      let duplicateCount = 0;
      const newTransactionIds: string[] = [];

      // Load existing transactions once for efficiency
      const existingTransactions = await getStoredTransactions();

      // Build lookup sets for fast duplicate detection
      const existingExternalIds = new Set(
        existingTransactions
          .filter(t => t.source?.externalId)
          .map(t => `${t.source?.connectorType}-${t.source?.externalId}`)
      );

      // Also build a secondary lookup by date+amount+description for fallback
      const existingSignatures = new Set(
        existingTransactions.map(t => {
          const dateKey = new Date(t.date).toISOString().split('T')[0];
          const amountKey = t.amount.toFixed(2);
          const descKey = t.description.substring(0, 30).toLowerCase().replace(/\s+/g, '');
          return `${dateKey}-${amountKey}-${descKey}`;
        })
      );

      let extIdDupes = 0;
      let sigDupes = 0;

      for (const tx of fetchResult.transactions) {
        // Primary check: externalId (most reliable)
        const externalIdKey = `${connectorConfig.type}-${tx.externalId}`;
        if (existingExternalIds.has(externalIdKey)) {
          duplicateCount++;
          extIdDupes++;
          continue;
        }

        // Secondary check: date+amount+description signature
        const dateKey = tx.date.toISOString().split('T')[0];
        const amountKey = tx.amount.toFixed(2);
        const descKey = tx.description.substring(0, 30).toLowerCase().replace(/\s+/g, '');
        const signature = `${dateKey}-${amountKey}-${descKey}`;

        if (existingSignatures.has(signature)) {
          duplicateCount++;
          sigDupes++;
          continue;
        }

        // Not a duplicate - save it
        const newId = crypto.randomUUID();
        await saveTransaction({
          id: newId,
          date: tx.date.toISOString(),
          description: tx.description,
          amount: tx.amount,
          category: '', // Will be categorized by automation
          beneficiary: tx.beneficiary,
          source: {
            connectorType: connectorConfig.type,
            externalId: tx.externalId,
            importedAt: new Date().toISOString()
          }
        });
        newCount++;
        newTransactionIds.push(newId);

        // Add to lookup sets to prevent duplicates within same batch
        existingExternalIds.add(externalIdKey);
        existingSignatures.add(signature);
      }

      // Check for duplicates within the fetched batch itself
      const fetchedExtIds = fetchResult.transactions.map(tx => `${connectorConfig.type}-${tx.externalId}`);
      const uniqueFetchedExtIds = new Set(fetchedExtIds);
      console.log(`[Duplicate Detection] Fetched: ${fetchResult.transactions.length}, unique externalIds in batch: ${uniqueFetchedExtIds.size}`);
      console.log(`[Duplicate Detection] Total dupes: ${duplicateCount}, by externalId: ${extIdDupes}, by signature: ${sigDupes}`);
      console.log(`[Duplicate Detection] Existing externalIds in DB: ${existingExternalIds.size - newCount}`);

      // Update connector's last sync info
      connectorConfig.lastSyncAt = new Date().toISOString();
      connectorConfig.lastSyncStatus = 'success';
      const allConnectors = await getStoredConnectors();
      const index = allConnectors.findIndex(c => c.id === connectorConfig.id);
      if (index !== -1) {
        allConnectors[index] = connectorConfig;
        await saveConnectors(allConnectors);
      }

      // Auto-process ONLY the new transactions (not existing ones)
      let categorizedCount = 0;
      let matchedCount = 0;
      const automationConfig = automationService.getConfig();

      if (newCount > 0 && (automationConfig.autoCategorize || automationConfig.autoMatch)) {
        console.log(`[Automation] Processing ${newCount} new transactions (IDs: ${newTransactionIds.slice(0, 3).join(', ')}...)`);

        const allTransactions = await getStoredTransactions();

        // Auto-categorize ONLY the new transactions
        if (automationConfig.autoCategorize) {
          // Filter to only the new transaction IDs
          const newTransactions = allTransactions.filter(t => newTransactionIds.includes(t.id));

          if (newTransactions.length > 0) {
            const enrichedAll: EnrichedTransaction[] = allTransactions.map(t => ({
              id: t.id,
              description: t.description,
              amount: t.amount,
              date: t.date,
              category: t.category,
              beneficiary: t.beneficiary,
              source: t.source ? {
                connectorType: t.source.connectorType,
                externalId: t.source.externalId
              } : undefined
            }));

            const results = await automationService.categorizeTransactions(
              newTransactions.map(t => ({
                id: t.id,
                description: t.description,
                amount: t.amount,
                date: t.date,
                category: t.category,
                beneficiary: t.beneficiary,
                source: t.source
              })),
              enrichedAll
            );

            for (const result of results) {
              const txIndex = allTransactions.findIndex(t => t.id === result.transactionId);
              if (txIndex !== -1) {
                allTransactions[txIndex].category = result.category;
                categorizedCount++;
              }
            }

            if (categorizedCount > 0) {
              await bulkSaveTransactions(allTransactions);
              console.log(`[Automation] Auto-categorized ${categorizedCount} of ${newCount} new transactions`);
            }
          }
        }

        // Auto-match (this can run on all transactions since matching involves pairs)
        if (automationConfig.autoMatch) {
          const existingMatches = await getStoredMatches();
          const matcherTransactions = allTransactions.map(tx => ({
            ...tx,
            matchId: tx.matchId,
            matchInfo: tx.matchInfo ? {
              ...tx.matchInfo,
              patternType: tx.matchInfo.patternType as any,
              source: tx.matchInfo.source as any,
              confidence: tx.matchInfo.confidence as any
            } : undefined
          })) as MatcherStoredTransaction[];

          const matcher = new TransactionMatcher(matcherTransactions, existingMatches);
          const matchResult = matcher.runAllMatchers();

          if (matchResult.newMatches.length > 0) {
            const allMatches = [...existingMatches, ...matchResult.newMatches];
            await saveMatches(allMatches);

            const updatedTransactions = applyMatchesToTransactions(
              matcherTransactions,
              matchResult.newMatches
            );
            await bulkSaveTransactions(updatedTransactions);
            matchedCount = matchResult.newMatches.length;
            console.log(`[Automation] Created ${matchedCount} new matches`);
          }
        }
      }

      state = {
        config: connectorConfig,
        status: ConnectorStatus.CONNECTED,
        statusMessage: `Fetch completed: ${newCount} new, ${duplicateCount} duplicates skipped`
      };
      connectorStates.set(connectorConfig.id, state);

      return res.json({
        success: true,
        message: 'Fetch completed',
        transactionsCount: fetchResult.transactions.length,
        newTransactionsCount: newCount,
        duplicatesSkipped: duplicateCount,
        automation: {
          categorized: categorizedCount,
          matched: matchedCount
        }
      });

    } catch (fetchError) {
      console.error('Fetch error:', fetchError);
      state = {
        config: connectorConfig,
        status: ConnectorStatus.ERROR,
        statusMessage: fetchError instanceof Error ? fetchError.message : 'Fetch failed'
      };
      connectorStates.set(connectorConfig.id, state);
      return res.json(state);
    }
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// POST /connectors/:id/disconnect - Disconnect from the financial service
app.post('/connectors/:id/disconnect', async (req: Request, res: Response) => {
  try {
    const connectors = await getStoredConnectors();
    const connectorConfig = connectors.find(c => c.id === req.params['id']);

    if (!connectorConfig) {
      return res.status(404).json({ error: 'Connector not found' });
    }

    // Disconnect real connector if exists
    await connectorManager.removeConnector(connectorConfig.id);
    pendingMFAReferences.delete(connectorConfig.id);

    const state: ConnectorState = {
      config: connectorConfig,
      status: ConnectorStatus.DISCONNECTED,
      statusMessage: 'Disconnected'
    };
    connectorStates.set(connectorConfig.id, state);

    return res.json(state);
  } catch (error) {
    console.error('Error disconnecting:', error);
    return res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// GET /connectors/:id/status - Get current status of a connector
app.get('/connectors/:id/status', async (req: Request, res: Response) => {
  try {
    const connectors = await getStoredConnectors();
    const connector = connectors.find(c => c.id === req.params['id']);

    if (!connector) {
      return res.status(404).json({ error: 'Connector not found' });
    }

    const state = getConnectorState(connector);
    return res.json(state);
  } catch (error) {
    console.error('Error getting connector status:', error);
    return res.status(500).json({ error: 'Failed to get connector status' });
  }
});

// ==================== BROWSER AUTOMATION ENDPOINTS ====================

// GET /browser/status - Get browser status
app.get('/browser/status', async (req: Request, res: Response) => {
  try {
    const browserService = getBrowserService();
    return res.json({
      running: browserService.isRunning()
    });
  } catch (error) {
    console.error('Error getting browser status:', error);
    return res.status(500).json({ error: 'Failed to get browser status' });
  }
});

// POST /browser/launch - Launch browser with Chrome profile
app.post('/browser/launch', async (req: Request, res: Response) => {
  try {
    const browserService = getBrowserService({
      headless: req.body.headless ?? false,
      slowMo: req.body.slowMo ?? 50
    });

    const useDefaultProfile = req.body.useDefaultProfile ?? true;
    await browserService.launch(useDefaultProfile);

    return res.json({
      success: true,
      message: 'Browser launched successfully'
    });
  } catch (error) {
    console.error('Error launching browser:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to launch browser'
    });
  }
});

// POST /browser/close - Close the browser
app.post('/browser/close', async (req: Request, res: Response) => {
  try {
    const browserService = getBrowserService();
    await browserService.close();

    return res.json({
      success: true,
      message: 'Browser closed'
    });
  } catch (error) {
    console.error('Error closing browser:', error);
    return res.status(500).json({ error: 'Failed to close browser' });
  }
});

// Cleanup browser on server shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing browser...');
  const browserService = getBrowserService();
  await browserService.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing browser...');
  const browserService = getBrowserService();
  await browserService.close();
  process.exit(0);
});

// ==================== AMAZON CSV IMPORT ENDPOINT ====================

// POST /import/amazon - Import Amazon order history CSV
app.post('/import/amazon', async (req: Request, res: Response) => {
  try {
    const { csvData, startDate, endDate } = req.body;

    if (!csvData) {
      return res.status(400).json({ error: 'CSV data is required' });
    }

    // Create Amazon connector and import
    const connector = new AmazonConnector('amazon-import');

    const dateRange = (startDate && endDate) ? {
      startDate: new Date(startDate),
      endDate: new Date(endDate)
    } : undefined;

    const result = connector.importFromCsv(csvData, dateRange);

    if (!result.success && result.transactions.length === 0) {
      return res.status(400).json({
        error: 'Failed to import Amazon data',
        details: result.errors
      });
    }

    // Save transactions to storage
    let newCount = 0;
    let duplicateCount = 0;

    for (const tx of result.transactions) {
      // Check for duplicates
      const existingTx = await getStoredTransactions();
      const isDuplicate = existingTx.some(
        existing =>
          existing.source?.externalId === tx.externalId ||
          (
            Math.abs(new Date(existing.date).getTime() - tx.date.getTime()) < 86400000 &&
            Math.abs(existing.amount - tx.amount) < 0.01 &&
            existing.description.includes(tx.description.substring(0, 20))
          )
      );

      if (!isDuplicate) {
        await saveTransaction({
          id: crypto.randomUUID(),
          date: tx.date.toISOString(),
          description: tx.description,
          amount: tx.amount,
          category: 'Amazon', // Default category
          beneficiary: tx.beneficiary || 'Amazon',
          source: {
            connectorType: 'amazon',
            externalId: tx.externalId,
            importedAt: new Date().toISOString()
          },
          isContextOnly: true // Amazon orders are context data, not real bank transactions
        });
        newCount++;
      } else {
        duplicateCount++;
      }
    }

    return res.json({
      success: true,
      message: 'Amazon import completed',
      stats: {
        ...result.stats,
        newTransactions: newCount,
        duplicatesSkipped: duplicateCount
      },
      errors: result.errors.length > 0 ? result.errors : undefined
    });

  } catch (error) {
    console.error('Error importing Amazon data:', error);
    return res.status(500).json({
      error: 'Failed to import Amazon data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /import/amazon - Delete all Amazon orders and unlink transactions
app.delete('/import/amazon', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();

    let deletedOrders = 0;
    let unlinkedTransactions = 0;

    // Find and delete all Amazon context-only transactions
    const amazonOrderIds: string[] = [];
    for (const tx of transactions) {
      if (tx.isContextOnly && tx.source?.connectorType === 'amazon') {
        amazonOrderIds.push(tx.id);
        db.deleteTransaction(tx.id);
        deletedOrders++;
      }
    }

    // Unlink any bank transactions that were linked to Amazon orders
    const remainingTransactions = await getStoredTransactions();
    for (const tx of remainingTransactions) {
      if (tx.linkedOrderIds && tx.linkedOrderIds.length > 0) {
        // Remove any Amazon order links
        const originalLength = tx.linkedOrderIds.length;
        tx.linkedOrderIds = tx.linkedOrderIds.filter(id => !amazonOrderIds.includes(id));

        if (tx.linkedOrderIds.length !== originalLength) {
          await saveTransaction(tx);
          unlinkedTransactions++;
        }
      }
    }

    res.json({
      success: true,
      message: 'Amazon data cleanup completed',
      stats: {
        deletedOrders,
        unlinkedTransactions
      }
    });

  } catch (error) {
    console.error('Error cleaning up Amazon data:', error);
    res.status(500).json({
      error: 'Failed to cleanup Amazon data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /import/amazon/refunds - Import Amazon refunds CSV
app.post('/import/amazon/refunds', async (req: Request, res: Response) => {
  try {
    const { csvData, startDate, endDate } = req.body;

    if (!csvData) {
      return res.status(400).json({ error: 'CSV data is required' });
    }

    // Create Amazon connector and import refunds
    const connector = new AmazonConnector('amazon-refunds-import');

    const dateRange = (startDate && endDate) ? {
      startDate: new Date(startDate),
      endDate: new Date(endDate)
    } : undefined;

    const result = connector.importRefundsFromCsv(csvData, dateRange);

    if (!result.success && result.transactions.length === 0) {
      return res.status(400).json({
        error: 'Failed to import Amazon refunds data',
        details: result.errors
      });
    }

    // Save transactions to storage
    let newCount = 0;
    let duplicateCount = 0;

    for (const tx of result.transactions) {
      // Check for duplicates
      const existingTx = await getStoredTransactions();
      const isDuplicate = existingTx.some(
        existing =>
          existing.source?.externalId === tx.externalId ||
          (
            Math.abs(new Date(existing.date).getTime() - tx.date.getTime()) < 86400000 &&
            Math.abs(existing.amount - tx.amount) < 0.01 &&
            existing.description.includes(tx.description.substring(0, 20))
          )
      );

      if (!isDuplicate) {
        await saveTransaction({
          id: crypto.randomUUID(),
          date: tx.date.toISOString(),
          description: tx.description,
          amount: tx.amount, // Refunds are POSITIVE (money coming back)
          category: 'Amazon Refund',
          beneficiary: tx.beneficiary || 'Amazon',
          source: {
            connectorType: 'amazon',
            externalId: tx.externalId,
            importedAt: new Date().toISOString()
          },
          isContextOnly: true // Amazon refunds are context data
        });
        newCount++;
      } else {
        duplicateCount++;
      }
    }

    return res.json({
      success: true,
      message: 'Amazon refunds import completed',
      stats: {
        ...result.stats,
        newTransactions: newCount,
        duplicatesSkipped: duplicateCount
      },
      errors: result.errors.length > 0 ? result.errors : undefined
    });

  } catch (error) {
    console.error('Error importing Amazon refunds:', error);
    return res.status(500).json({
      error: 'Failed to import Amazon refunds',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ==================== PAYPAL TEXT IMPORT ENDPOINT ====================

// POST /import/paypal - Import PayPal transaction history from text export
app.post('/import/paypal', async (req: Request, res: Response) => {
  try {
    const { textData, startDate, endDate } = req.body;

    if (!textData) {
      res.status(400).json({ error: 'Text data is required' });
      return;
    }

    // Create PayPal text parser and import
    const parser = new PayPalTextParser();

    const dateRange = (startDate && endDate) ? {
      startDate: new Date(startDate),
      endDate: new Date(endDate)
    } : undefined;

    const result = parser.importFromText(textData, dateRange);

    if (!result.success && result.transactions.length === 0) {
      res.status(400).json({
        error: 'Failed to import PayPal data',
        details: result.errors
      });
      return;
    }

    // Save transactions to storage
    let newCount = 0;
    let duplicateCount = 0;
    let recurringCount = 0;

    for (const tx of result.transactions) {
      // Check for duplicates
      const existingTx = await getStoredTransactions();
      const isDuplicate = existingTx.some(
        existing =>
          existing.source?.externalId === tx.externalId ||
          (
            Math.abs(new Date(existing.date).getTime() - tx.date.getTime()) < 86400000 &&
            Math.abs(existing.amount - tx.amount) < 0.01 &&
            existing.beneficiary === tx.beneficiary
          )
      );

      if (!isDuplicate) {
        const isRecurring = (tx.rawData as any)?.isRecurring || false;
        if (isRecurring) recurringCount++;

        await saveTransaction({
          id: crypto.randomUUID(),
          date: tx.date.toISOString(),
          description: tx.description,
          amount: tx.amount,
          category: '', // Will be set by AI categorization or user
          beneficiary: tx.beneficiary || '',
          source: {
            connectorType: 'paypal',
            externalId: tx.externalId,
            importedAt: new Date().toISOString()
          },
          isContextOnly: true // PayPal transactions are context data for matching to bank transactions
        });
        newCount++;
      } else {
        duplicateCount++;
      }
    }

    res.json({
      success: true,
      message: 'PayPal import completed',
      stats: {
        ...result.stats,
        newTransactions: newCount,
        duplicatesSkipped: duplicateCount,
        recurringTransactions: recurringCount
      },
      errors: result.errors.length > 0 ? result.errors : undefined
    });

  } catch (error) {
    console.error('Error importing PayPal data:', error);
    res.status(500).json({
      error: 'Failed to import PayPal data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /import/paypal/file - Import PayPal text file
app.post('/import/paypal/file', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const textData = fs.readFileSync(req.file.path, 'utf-8');

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    // Create PayPal text parser and import
    const parser = new PayPalTextParser();
    const result = parser.importFromText(textData);

    if (!result.success && result.transactions.length === 0) {
      res.status(400).json({
        error: 'Failed to import PayPal data',
        details: result.errors
      });
      return;
    }

    // Save transactions to storage
    let newCount = 0;
    let duplicateCount = 0;
    let recurringCount = 0;

    for (const tx of result.transactions) {
      const existingTx = await getStoredTransactions();
      const isDuplicate = existingTx.some(
        existing =>
          existing.source?.externalId === tx.externalId ||
          (
            Math.abs(new Date(existing.date).getTime() - tx.date.getTime()) < 86400000 &&
            Math.abs(existing.amount - tx.amount) < 0.01 &&
            existing.beneficiary === tx.beneficiary
          )
      );

      if (!isDuplicate) {
        const isRecurring = (tx.rawData as any)?.isRecurring || false;
        if (isRecurring) recurringCount++;

        await saveTransaction({
          id: crypto.randomUUID(),
          date: tx.date.toISOString(),
          description: tx.description,
          amount: tx.amount,
          category: '',
          beneficiary: tx.beneficiary || '',
          source: {
            connectorType: 'paypal',
            externalId: tx.externalId,
            importedAt: new Date().toISOString()
          },
          isContextOnly: true
        });
        newCount++;
      } else {
        duplicateCount++;
      }
    }

    res.json({
      success: true,
      message: 'PayPal file import completed',
      stats: {
        ...result.stats,
        newTransactions: newCount,
        duplicatesSkipped: duplicateCount,
        recurringTransactions: recurringCount
      },
      errors: result.errors.length > 0 ? result.errors : undefined
    });

  } catch (error) {
    console.error('Error importing PayPal file:', error);
    res.status(500).json({
      error: 'Failed to import PayPal file',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ==================== MATCHING HELPERS ====================

// Use database TransactionMatch type
type TransactionMatch = db.TransactionMatch;

async function getStoredMatches(): Promise<TransactionMatch[]> {
  return db.getAllMatches();
}

async function saveMatches(matches: TransactionMatch[]): Promise<void> {
  db.saveMatches(matches);
}

// ==================== MATCHING ENDPOINTS ====================

// POST /matching/run - Run automatic matching on all transactions
app.post('/matching/run', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();
    const existingMatches = await getStoredMatches();

    // Convert to matcher format
    const matcherTransactions = transactions.map(tx => ({
      ...tx,
      matchId: tx.matchId,
      matchInfo: tx.matchInfo ? {
        ...tx.matchInfo,
        patternType: tx.matchInfo.patternType as any,
        source: tx.matchInfo.source as any,
        confidence: tx.matchInfo.confidence as any
      } : undefined
    })) as MatcherStoredTransaction[];

    // Run the matcher
    const matcher = new TransactionMatcher(matcherTransactions, existingMatches);
    const result = matcher.runAllMatchers();

    // Save new matches
    const allMatches = [...existingMatches, ...result.newMatches];
    await saveMatches(allMatches);

    // Apply matches to transactions and save
    const updatedTransactions = applyMatchesToTransactions(
      matcherTransactions,
      result.newMatches
    );
    await bulkSaveTransactions(updatedTransactions);

    return res.json({
      success: true,
      newMatches: result.newMatches.length,
      suggestions: result.suggestions.length,
      stats: result.stats
    });
  } catch (error) {
    console.error('Error running matcher:', error);
    return res.status(500).json({ error: 'Failed to run matching' });
  }
});

// GET /matching - Get all matches
app.get('/matching', async (req: Request, res: Response) => {
  try {
    const matches = await getStoredMatches();
    return res.json({ matches });
  } catch (error) {
    console.error('Error getting matches:', error);
    return res.status(500).json({ error: 'Failed to get matches' });
  }
});

// GET /matching/suggestions - Get match suggestions (re-runs matcher in suggestion-only mode)
app.get('/matching/suggestions', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();
    const existingMatches = await getStoredMatches();

    // Convert to matcher format
    const matcherTransactions = transactions.map(tx => ({
      ...tx,
      matchId: tx.matchId,
      matchInfo: tx.matchInfo ? {
        ...tx.matchInfo,
        patternType: tx.matchInfo.patternType as any,
        source: tx.matchInfo.source as any,
        confidence: tx.matchInfo.confidence as any
      } : undefined
    })) as MatcherStoredTransaction[];

    const matcher = new TransactionMatcher(matcherTransactions, existingMatches);
    const result = matcher.runAllMatchers();

    return res.json({ suggestions: result.suggestions });
  } catch (error) {
    console.error('Error getting suggestions:', error);
    return res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

// POST /matching/confirm - Confirm a suggested match
app.post('/matching/confirm', async (req: Request, res: Response) => {
  try {
    const { primaryTransactionId, linkedTransactionIds, patternType } = req.body;

    if (!primaryTransactionId || !linkedTransactionIds || !patternType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const transactions = await getStoredTransactions();
    const existingMatches = await getStoredMatches();

    // Find the primary transaction to get amount
    const primaryTx = transactions.find(tx => tx.id === primaryTransactionId);
    if (!primaryTx) {
      return res.status(404).json({ error: 'Primary transaction not found' });
    }

    // Create the match
    const now = new Date().toISOString();
    const newMatch: TransactionMatch = {
      id: `match-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
      patternType,
      source: 'suggested',
      confidence: 'medium',
      primaryTransactionId,
      linkedTransactionIds,
      matchedAmount: Math.abs(primaryTx.amount)
    };

    // Save match
    existingMatches.push(newMatch);
    await saveMatches(existingMatches);

    // Apply match to transactions
    const matcherTransactions = transactions.map(tx => ({
      ...tx,
      matchId: tx.matchId,
      matchInfo: tx.matchInfo ? {
        ...tx.matchInfo,
        patternType: tx.matchInfo.patternType as any,
        source: tx.matchInfo.source as any,
        confidence: tx.matchInfo.confidence as any
      } : undefined
    })) as MatcherStoredTransaction[];

    const updatedTransactions = applyMatchesToTransactions(matcherTransactions, [newMatch]);
    await bulkSaveTransactions(updatedTransactions);

    return res.json({ success: true, match: newMatch });
  } catch (error) {
    console.error('Error confirming match:', error);
    return res.status(500).json({ error: 'Failed to confirm match' });
  }
});

// POST /matching/manual - Create a manual match between transactions
app.post('/matching/manual', async (req: Request, res: Response) => {
  try {
    const { primaryTransactionId, linkedTransactionIds, notes } = req.body;

    if (!primaryTransactionId || !linkedTransactionIds || linkedTransactionIds.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const transactions = await getStoredTransactions();
    const existingMatches = await getStoredMatches();

    // Find the primary transaction
    const primaryTx = transactions.find(tx => tx.id === primaryTransactionId);
    if (!primaryTx) {
      return res.status(404).json({ error: 'Primary transaction not found' });
    }

    // Verify linked transactions exist
    for (const linkedId of linkedTransactionIds) {
      const linkedTx = transactions.find(tx => tx.id === linkedId);
      if (!linkedTx) {
        return res.status(404).json({ error: `Linked transaction ${linkedId} not found` });
      }
    }

    // Create the manual match
    const now = new Date().toISOString();
    const newMatch: TransactionMatch = {
      id: `match-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
      patternType: 'custom',
      source: 'manual',
      confidence: 'high',
      primaryTransactionId,
      linkedTransactionIds,
      matchedAmount: Math.abs(primaryTx.amount),
      notes
    };

    // Save match
    existingMatches.push(newMatch);
    await saveMatches(existingMatches);

    // Apply match to transactions
    const matcherTransactions = transactions.map(tx => ({
      ...tx,
      matchId: tx.matchId,
      matchInfo: tx.matchInfo ? {
        ...tx.matchInfo,
        patternType: tx.matchInfo.patternType as any,
        source: tx.matchInfo.source as any,
        confidence: tx.matchInfo.confidence as any
      } : undefined
    })) as MatcherStoredTransaction[];

    const updatedTransactions = applyMatchesToTransactions(matcherTransactions, [newMatch]);
    await bulkSaveTransactions(updatedTransactions);

    return res.json({ success: true, match: newMatch });
  } catch (error) {
    console.error('Error creating manual match:', error);
    return res.status(500).json({ error: 'Failed to create manual match' });
  }
});

// DELETE /matching/:id - Remove a match
app.delete('/matching/:id', async (req: Request, res: Response) => {
  try {
    const matchId = req.params['id'];
    const matches = await getStoredMatches();
    const matchIndex = matches.findIndex(m => m.id === matchId);

    if (matchIndex === -1) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const match = matches[matchIndex];

    // Remove match from list
    matches.splice(matchIndex, 1);
    await saveMatches(matches);

    // Remove match info from transactions
    const transactions = await getStoredTransactions();
    const updatedTransactions = transactions.map(tx => {
      if (tx.matchId === matchId) {
        const { matchId: _, matchInfo: __, transactionType, excludeFromStats, ...rest } = tx;
        // Only keep transactionType and excludeFromStats if they weren't set by matching
        return rest;
      }
      return tx;
    });
    await bulkSaveTransactions(updatedTransactions);

    return res.json({ success: true, message: 'Match removed' });
  } catch (error) {
    console.error('Error removing match:', error);
    return res.status(500).json({ error: 'Failed to remove match' });
  }
});

// GET /matching/overview - Get comprehensive matching overview for Amazon/PayPal
// NOTE: This MUST be before /matching/:id to avoid route conflict
app.get('/matching/overview', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();

    // Detection patterns for payment platforms
    const AMAZON_PATTERNS_LOCAL = [
      /amazon/i, /amzn/i, /amazon\.de/i, /amazon\s+payments/i,
      /amazon\s+eu/i, /amz\*|amzn\*/i, /amazon\s+prime/i, /prime\s+video/i
    ];
    const PAYPAL_PATTERNS_LOCAL = [
      /paypal/i, /pp\s*\*/i, /paypal\s*\(europe\)/i, /paypal\s*pte/i, /paypal\s*europe/i
    ];

    // Helper function to detect payment platform from transaction
    const detectPlatformLocal = (tx: StoredTransaction): 'amazon' | 'paypal' | null => {
      if (tx.isContextOnly) return null;
      const searchText = `${tx.description} ${tx.beneficiary || ''}`.toLowerCase();
      if (AMAZON_PATTERNS_LOCAL.some(p => p.test(searchText))) return 'amazon';
      if (PAYPAL_PATTERNS_LOCAL.some(p => p.test(searchText))) return 'paypal';
      return null;
    };

    // Helper to check if a context-only transaction is linked to any bank transaction
    const isLinkedToAnyBankLocal = (contextId: string, txs: StoredTransaction[]): boolean => {
      return txs.some(tx =>
        !tx.isContextOnly &&
        tx.linkedOrderIds &&
        tx.linkedOrderIds.includes(contextId)
      );
    };

    // Enrich transactions with detected platform
    const enrichedTx = transactions.map(tx => ({
      ...tx,
      detectedPlatform: tx.isContextOnly ? null : detectPlatformLocal(tx)
    }));

    // Amazon analysis
    const amazonBankUnlinked = enrichedTx.filter(tx =>
      tx.detectedPlatform === 'amazon' &&
      !tx.isContextOnly &&
      (!tx.linkedOrderIds || tx.linkedOrderIds.length === 0)
    );

    const amazonOrdersUnlinked = enrichedTx.filter(tx =>
      tx.isContextOnly &&
      tx.source?.connectorType === 'amazon' &&
      !isLinkedToAnyBankLocal(tx.id, enrichedTx)
    );

    const amazonBankLinked = enrichedTx.filter(tx =>
      tx.detectedPlatform === 'amazon' &&
      !tx.isContextOnly &&
      tx.linkedOrderIds &&
      tx.linkedOrderIds.length > 0
    );

    // PayPal analysis
    const paypalBankUnlinked = enrichedTx.filter(tx =>
      tx.detectedPlatform === 'paypal' &&
      !tx.isContextOnly &&
      (!tx.linkedOrderIds || tx.linkedOrderIds.length === 0)
    );

    const paypalImportsUnlinked = enrichedTx.filter(tx =>
      tx.isContextOnly &&
      tx.source?.connectorType === 'paypal' &&
      !isLinkedToAnyBankLocal(tx.id, enrichedTx)
    );

    const paypalBankLinked = enrichedTx.filter(tx =>
      tx.detectedPlatform === 'paypal' &&
      !tx.isContextOnly &&
      tx.linkedOrderIds &&
      tx.linkedOrderIds.length > 0
    );

    // Generate suggestions for matching
    const generateSuggestions = (
      bankTxs: typeof enrichedTx,
      contextTxs: typeof enrichedTx
    ) => {
      const suggestions: Array<{
        bankTransactionId: string;
        contextIds: string[];
        confidence: 'high' | 'medium' | 'low';
        totalAmount: number;
        amountDiff: number;
      }> = [];

      for (const bankTx of bankTxs) {
        const bankDate = new Date(bankTx.date);
        const bankAmount = Math.abs(bankTx.amount);

        const candidates = contextTxs.filter(ctx => {
          const ctxDate = new Date(ctx.date);
          const daysDiff = Math.abs((bankDate.getTime() - ctxDate.getTime()) / 86400000);
          return daysDiff <= 7;
        });

        for (const ctx of candidates) {
          const ctxAmount = Math.abs(ctx.amount);
          const amountDiff = Math.abs(ctxAmount - bankAmount);
          const daysDiff = Math.abs((bankDate.getTime() - new Date(ctx.date).getTime()) / 86400000);

          if (amountDiff < 0.05) {
            suggestions.push({
              bankTransactionId: bankTx.id,
              contextIds: [ctx.id],
              confidence: daysDiff <= 2 ? 'high' : 'medium',
              totalAmount: ctxAmount,
              amountDiff
            });
          }
        }
      }

      return suggestions;
    };

    const amazonSuggestions = generateSuggestions(amazonBankUnlinked, amazonOrdersUnlinked);
    const paypalSuggestions = generateSuggestions(paypalBankUnlinked, paypalImportsUnlinked);

    return res.json({
      amazon: {
        bankUnlinked: amazonBankUnlinked,
        ordersUnlinked: amazonOrdersUnlinked,
        bankLinked: amazonBankLinked,
        suggestions: amazonSuggestions,
        stats: {
          totalBankCharges: amazonBankLinked.length + amazonBankUnlinked.length,
          linkedBankCharges: amazonBankLinked.length,
          unlinkedBankCharges: amazonBankUnlinked.length,
          totalOrders: amazonOrdersUnlinked.length + amazonBankLinked.reduce(
            (sum, tx) => sum + (tx.linkedOrderIds?.length || 0), 0
          ),
          unlinkedOrders: amazonOrdersUnlinked.length,
          suggestionCount: amazonSuggestions.length
        }
      },
      paypal: {
        bankUnlinked: paypalBankUnlinked,
        importsUnlinked: paypalImportsUnlinked,
        bankLinked: paypalBankLinked,
        suggestions: paypalSuggestions,
        stats: {
          totalBankCharges: paypalBankLinked.length + paypalBankUnlinked.length,
          linkedBankCharges: paypalBankLinked.length,
          unlinkedBankCharges: paypalBankUnlinked.length,
          totalImports: paypalImportsUnlinked.length + paypalBankLinked.reduce(
            (sum, tx) => sum + (tx.linkedOrderIds?.length || 0), 0
          ),
          unlinkedImports: paypalImportsUnlinked.length,
          suggestionCount: paypalSuggestions.length
        }
      }
    });
  } catch (error) {
    console.error('Error getting matching overview:', error);
    return res.status(500).json({ error: 'Failed to get matching overview' });
  }
});

// GET /matching/:id - Get a specific match with transaction details
app.get('/matching/:id', async (req: Request, res: Response) => {
  try {
    const matchId = req.params['id'];
    const matches = await getStoredMatches();
    const match = matches.find(m => m.id === matchId);

    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // Get transaction details
    const transactions = await getStoredTransactions();
    const primaryTx = transactions.find(tx => tx.id === match.primaryTransactionId);
    const linkedTxs = match.linkedTransactionIds
      .map(id => transactions.find(tx => tx.id === id))
      .filter(Boolean);

    return res.json({
      match,
      primaryTransaction: primaryTx,
      linkedTransactions: linkedTxs
    });
  } catch (error) {
    console.error('Error getting match:', error);
    return res.status(500).json({ error: 'Failed to get match' });
  }
});

// ==================== ORDER MATCHING ENDPOINTS ====================

// POST /order-matching/run - Run order matching algorithm (Amazon orders → Bank transactions)
app.post('/order-matching/run', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();

    // Convert to matchable format
    const matchableTransactions: MatchableTransaction[] = transactions.map(tx => ({
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      category: tx.category,
      beneficiary: tx.beneficiary,
      source: tx.source,
      isContextOnly: tx.isContextOnly,
      linkedOrderIds: tx.linkedOrderIds
    }));

    // Run order matching
    const matcher = new OrderMatcher(matchableTransactions);
    const result = matcher.runMatching();

    // Apply auto-matches to transactions
    if (result.autoMatches.length > 0) {
      const updatedTransactions = applyOrderMatches(matchableTransactions, result.autoMatches);

      // Save updated transactions
      for (const tx of updatedTransactions) {
        const storedTx = transactions.find(t => t.id === tx.id);
        if (storedTx && tx.linkedOrderIds && tx.linkedOrderIds.length > 0) {
          storedTx.linkedOrderIds = tx.linkedOrderIds;
          db.updateTransaction(storedTx);
        }
      }
    }

    return res.json({
      success: true,
      autoMatched: result.autoMatches.length,
      suggestions: result.suggestions.length,
      stats: result.stats,
      matches: result.autoMatches,
      pendingSuggestions: result.suggestions
    });
  } catch (error) {
    console.error('Error running order matching:', error);
    return res.status(500).json({ error: 'Failed to run order matching' });
  }
});

// GET /order-matching/suggestions - Get order match suggestions without applying
app.get('/order-matching/suggestions', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();

    const matchableTransactions: MatchableTransaction[] = transactions.map(tx => ({
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      category: tx.category,
      beneficiary: tx.beneficiary,
      source: tx.source,
      isContextOnly: tx.isContextOnly,
      linkedOrderIds: tx.linkedOrderIds
    }));

    const matcher = new OrderMatcher(matchableTransactions);
    const result = matcher.runMatching();

    return res.json({
      autoMatches: result.autoMatches,
      suggestions: result.suggestions,
      stats: result.stats
    });
  } catch (error) {
    console.error('Error getting order match suggestions:', error);
    return res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

// POST /order-matching/link - Manually link orders to a bank transaction
app.post('/order-matching/link', async (req: Request, res: Response) => {
  try {
    const { bankTransactionId, orderIds } = req.body;

    if (!bankTransactionId || !orderIds || !Array.isArray(orderIds)) {
      return res.status(400).json({ error: 'bankTransactionId and orderIds array required' });
    }

    const transactions = await getStoredTransactions();

    // Find the bank transaction
    const bankTx = transactions.find(tx => tx.id === bankTransactionId);
    if (!bankTx) {
      return res.status(404).json({ error: 'Bank transaction not found' });
    }

    if (bankTx.isContextOnly) {
      return res.status(400).json({ error: 'Cannot link orders to a context-only transaction' });
    }

    // Verify all orders exist and are context-only
    for (const orderId of orderIds) {
      const order = transactions.find(tx => tx.id === orderId);
      if (!order) {
        return res.status(404).json({ error: `Order ${orderId} not found` });
      }
      if (!order.isContextOnly) {
        return res.status(400).json({ error: `Transaction ${orderId} is not a context-only order` });
      }
    }

    // Update the bank transaction with linked orders
    bankTx.linkedOrderIds = orderIds;
    db.updateTransaction(bankTx);

    return res.json({
      success: true,
      message: `Linked ${orderIds.length} order(s) to bank transaction`,
      bankTransaction: bankTx
    });
  } catch (error) {
    console.error('Error linking orders:', error);
    return res.status(500).json({ error: 'Failed to link orders' });
  }
});

// POST /order-matching/unlink - Remove order links from a bank transaction
app.post('/order-matching/unlink', async (req: Request, res: Response) => {
  try {
    const { bankTransactionId, orderIds } = req.body;

    if (!bankTransactionId) {
      return res.status(400).json({ error: 'bankTransactionId required' });
    }

    const transactions = await getStoredTransactions();
    const bankTx = transactions.find(tx => tx.id === bankTransactionId);

    if (!bankTx) {
      return res.status(404).json({ error: 'Bank transaction not found' });
    }

    if (!bankTx.linkedOrderIds || bankTx.linkedOrderIds.length === 0) {
      return res.status(400).json({ error: 'Bank transaction has no linked orders' });
    }

    // If specific orderIds provided, remove only those; otherwise remove all
    if (orderIds && Array.isArray(orderIds) && orderIds.length > 0) {
      bankTx.linkedOrderIds = bankTx.linkedOrderIds.filter(
        id => !orderIds.includes(id)
      );
    } else {
      bankTx.linkedOrderIds = [];
    }

    db.updateTransaction(bankTx);

    return res.json({
      success: true,
      message: 'Order links removed',
      bankTransaction: bankTx
    });
  } catch (error) {
    console.error('Error unlinking orders:', error);
    return res.status(500).json({ error: 'Failed to unlink orders' });
  }
});

// GET /order-matching/linked/:id - Get linked orders for a bank transaction
app.get('/order-matching/linked/:id', async (req: Request, res: Response) => {
  try {
    const bankTransactionId = req.params['id'];
    const transactions = await getStoredTransactions();

    const bankTx = transactions.find(tx => tx.id === bankTransactionId);
    if (!bankTx) {
      return res.status(404).json({ error: 'Bank transaction not found' });
    }

    if (!bankTx.linkedOrderIds || bankTx.linkedOrderIds.length === 0) {
      return res.json({
        bankTransaction: bankTx,
        linkedOrders: [],
        totalOrderAmount: 0
      });
    }

    // Get linked order details
    const linkedOrders = transactions.filter(tx =>
      bankTx.linkedOrderIds!.includes(tx.id)
    );

    const totalOrderAmount = linkedOrders.reduce(
      (sum, order) => sum + Math.abs(order.amount), 0
    );

    return res.json({
      bankTransaction: bankTx,
      linkedOrders,
      totalOrderAmount,
      amountDifference: Math.abs(Math.abs(bankTx.amount) - totalOrderAmount)
    });
  } catch (error) {
    console.error('Error getting linked orders:', error);
    return res.status(500).json({ error: 'Failed to get linked orders' });
  }
});

// GET /transactions/context-only - Get only context-only transactions (orders)
app.get('/transactions/context-only', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();
    const contextOnly = transactions.filter(tx => tx.isContextOnly);

    return res.json({
      transactions: contextOnly,
      total: contextOnly.length
    });
  } catch (error) {
    console.error('Error getting context-only transactions:', error);
    return res.status(500).json({ error: 'Failed to get context-only transactions' });
  }
});

// GET /transactions/bank-only - Get only real bank transactions (excluding context-only)
app.get('/transactions/bank-only', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();
    const bankOnly = transactions.filter(tx => !tx.isContextOnly);

    return res.json({
      transactions: bankOnly,
      total: bankOnly.length
    });
  } catch (error) {
    console.error('Error getting bank transactions:', error);
    return res.status(500).json({ error: 'Failed to get bank transactions' });
  }
});

// ==================== PAYPAL MATCHING ENDPOINTS ====================

// POST /paypal-matching/run - Run PayPal matching algorithm (PayPal transactions → Bank transactions)
app.post('/paypal-matching/run', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();

    // Convert to matchable format
    const matchableTransactions: MatchableTransaction[] = transactions.map(tx => ({
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      category: tx.category,
      beneficiary: tx.beneficiary,
      source: tx.source,
      isContextOnly: tx.isContextOnly,
      linkedOrderIds: tx.linkedOrderIds
    }));

    // Run PayPal matching
    const matcher = new PayPalMatcher(matchableTransactions);
    const result = matcher.runMatching();

    // Apply auto-matches
    if (result.autoMatches.length > 0) {
      const updatedTransactions = applyPayPalMatches(matchableTransactions, result.autoMatches);

      // Save updated transactions
      await bulkSaveTransactions(updatedTransactions.map(tx => ({
        ...tx,
        category: tx.category || '',
        timestamp: new Date().toISOString()
      })) as db.StoredTransaction[]);
    }

    res.json({
      success: true,
      autoMatched: result.autoMatches.length,
      suggestions: result.suggestions.length,
      stats: result.stats,
      matches: result.autoMatches,
      pendingSuggestions: result.suggestions
    });
  } catch (error) {
    console.error('Error running PayPal matcher:', error);
    res.status(500).json({ error: 'Failed to run PayPal matching' });
  }
});

// GET /paypal-matching/suggestions - Get PayPal match suggestions without applying
app.get('/paypal-matching/suggestions', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();

    const matchableTransactions: MatchableTransaction[] = transactions.map(tx => ({
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      category: tx.category,
      beneficiary: tx.beneficiary,
      source: tx.source,
      isContextOnly: tx.isContextOnly,
      linkedOrderIds: tx.linkedOrderIds
    }));

    const matcher = new PayPalMatcher(matchableTransactions);
    const result = matcher.runMatching();

    res.json({
      suggestions: result.suggestions,
      potentialAutoMatches: result.autoMatches,
      stats: result.stats
    });
  } catch (error) {
    console.error('Error getting PayPal suggestions:', error);
    res.status(500).json({ error: 'Failed to get PayPal match suggestions' });
  }
});

// POST /paypal-matching/link - Manually link PayPal transactions to a bank transaction
app.post('/paypal-matching/link', async (req: Request, res: Response) => {
  try {
    const { bankTransactionId, paypalIds } = req.body;

    if (!bankTransactionId || !paypalIds || !Array.isArray(paypalIds)) {
      res.status(400).json({ error: 'bankTransactionId and paypalIds array are required' });
      return;
    }

    const transactions = await getStoredTransactions();

    // Find and update bank transaction
    const bankTx = transactions.find(tx => tx.id === bankTransactionId);
    if (!bankTx) {
      res.status(404).json({ error: 'Bank transaction not found' });
      return;
    }

    if (bankTx.isContextOnly) {
      res.status(400).json({ error: 'Cannot link to a context-only transaction' });
      return;
    }

    // Verify PayPal transactions exist
    const paypalTxs = transactions.filter(tx =>
      paypalIds.includes(tx.id) &&
      tx.isContextOnly &&
      tx.source?.connectorType === 'paypal'
    );

    if (paypalTxs.length !== paypalIds.length) {
      res.status(400).json({ error: 'Some PayPal transactions not found or invalid' });
      return;
    }

    // Update bank transaction with new links
    const existingLinks = bankTx.linkedOrderIds || [];
    const newLinks = [...new Set([...existingLinks, ...paypalIds])];

    await saveTransaction({
      ...bankTx,
      linkedOrderIds: newLinks
    });

    res.json({
      success: true,
      bankTransactionId,
      linkedPayPalTransactions: newLinks.length,
      totalPayPalAmount: paypalTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
    });
  } catch (error) {
    console.error('Error linking PayPal transactions:', error);
    res.status(500).json({ error: 'Failed to link PayPal transactions' });
  }
});

// GET /paypal-matching/linked/:id - Get linked PayPal transactions for a bank transaction
app.get('/paypal-matching/linked/:id', async (req: Request, res: Response) => {
  try {
    const bankTransactionId = req.params['id'];
    const transactions = await getStoredTransactions();

    const bankTx = transactions.find(tx => tx.id === bankTransactionId);
    if (!bankTx) {
      res.status(404).json({ error: 'Bank transaction not found' });
      return;
    }

    if (!bankTx.linkedOrderIds || bankTx.linkedOrderIds.length === 0) {
      res.json({
        bankTransaction: bankTx,
        linkedPayPal: [],
        totalPayPalAmount: 0
      });
      return;
    }

    // Get linked PayPal transaction details
    const linkedPayPal = transactions.filter(tx =>
      bankTx.linkedOrderIds!.includes(tx.id) &&
      tx.source?.connectorType === 'paypal'
    );

    const totalPayPalAmount = linkedPayPal.reduce(
      (sum, tx) => sum + Math.abs(tx.amount), 0
    );

    res.json({
      bankTransaction: bankTx,
      linkedPayPal,
      totalPayPalAmount,
      amountDifference: Math.abs(Math.abs(bankTx.amount) - totalPayPalAmount)
    });
  } catch (error) {
    console.error('Error getting linked PayPal transactions:', error);
    res.status(500).json({ error: 'Failed to get linked PayPal transactions' });
  }
});

// ==================== RECURRING TRANSACTION ENDPOINTS ====================

// POST /recurring/detect - Detect recurring transaction patterns
app.post('/recurring/detect', async (req: Request, res: Response) => {
  try {
    const { saveResults } = req.body;
    const transactions = await getStoredTransactions();

    // Convert to detectable format
    const detectableTransactions = transactions.map(tx => ({
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      beneficiary: tx.beneficiary,
      category: tx.category,
      isContextOnly: tx.isContextOnly
    }));

    // Run detection
    const detector = new RecurringDetector(detectableTransactions);
    const result = detector.detectPatterns();

    // Save patterns if requested
    if (saveResults && result.patterns.length > 0) {
      const now = new Date().toISOString();
      const dbPatterns: db.RecurringPattern[] = result.patterns.map(p => ({
        id: p.id,
        beneficiary: p.beneficiary,
        averageAmount: p.averageAmount,
        frequency: p.frequency,
        averageIntervalDays: p.averageIntervalDays,
        confidence: p.confidence,
        transactionIds: p.transactionIds,
        firstOccurrence: p.firstOccurrence,
        lastOccurrence: p.lastOccurrence,
        occurrenceCount: p.occurrenceCount,
        category: p.category,
        isActive: p.isActive,
        nextExpectedDate: p.nextExpectedDate,
        amountVariance: p.amountVariance,
        description: p.description,
        createdAt: now,
        updatedAt: now
      }));

      // Clear old patterns and save new ones
      db.clearRecurringPatterns();
      db.saveRecurringPatterns(dbPatterns);
    }

    res.json({
      success: true,
      patterns: result.patterns,
      stats: result.stats,
      saved: saveResults === true
    });
  } catch (error) {
    console.error('Error detecting recurring patterns:', error);
    res.status(500).json({ error: 'Failed to detect recurring patterns' });
  }
});

// GET /recurring/patterns - Get all saved recurring patterns
app.get('/recurring/patterns', async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query['active'] === 'true';
    const patterns = activeOnly
      ? db.getActiveRecurringPatterns()
      : db.getAllRecurringPatterns();

    res.json({
      patterns,
      total: patterns.length,
      active: patterns.filter(p => p.isActive).length
    });
  } catch (error) {
    console.error('Error getting recurring patterns:', error);
    res.status(500).json({ error: 'Failed to get recurring patterns' });
  }
});

// GET /recurring/patterns/:id - Get a specific recurring pattern
app.get('/recurring/patterns/:id', async (req: Request, res: Response) => {
  try {
    const patternId = req.params['id'];
    const pattern = db.getRecurringPatternById(patternId);

    if (!pattern) {
      res.status(404).json({ error: 'Pattern not found' });
      return;
    }

    // Get associated transactions
    const transactions = await getStoredTransactions();
    const patternTransactions = transactions.filter(tx =>
      pattern.transactionIds.includes(tx.id)
    );

    // Predict next occurrences
    const predictions = predictNextOccurrences(pattern as any, 3);

    res.json({
      pattern,
      transactions: patternTransactions,
      predictions: predictions.map(d => d.toISOString())
    });
  } catch (error) {
    console.error('Error getting recurring pattern:', error);
    res.status(500).json({ error: 'Failed to get recurring pattern' });
  }
});

// PUT /recurring/patterns/:id - Update a recurring pattern
app.put('/recurring/patterns/:id', async (req: Request, res: Response) => {
  try {
    const patternId = req.params['id'];
    const updates = req.body;

    const existing = db.getRecurringPatternById(patternId);
    if (!existing) {
      res.status(404).json({ error: 'Pattern not found' });
      return;
    }

    // Merge updates
    const updated: db.RecurringPattern = {
      ...existing,
      ...updates,
      id: patternId, // Prevent ID change
      updatedAt: new Date().toISOString()
    };

    db.saveRecurringPattern(updated);

    res.json({
      success: true,
      pattern: updated
    });
  } catch (error) {
    console.error('Error updating recurring pattern:', error);
    res.status(500).json({ error: 'Failed to update recurring pattern' });
  }
});

// DELETE /recurring/patterns/:id - Delete a recurring pattern
app.delete('/recurring/patterns/:id', async (req: Request, res: Response) => {
  try {
    const patternId = req.params['id'];

    const existing = db.getRecurringPatternById(patternId);
    if (!existing) {
      res.status(404).json({ error: 'Pattern not found' });
      return;
    }

    db.deleteRecurringPattern(patternId);

    res.json({
      success: true,
      deletedId: patternId
    });
  } catch (error) {
    console.error('Error deleting recurring pattern:', error);
    res.status(500).json({ error: 'Failed to delete recurring pattern' });
  }
});

// POST /recurring/patterns/:id/categorize - Apply category to all transactions in pattern
app.post('/recurring/patterns/:id/categorize', async (req: Request, res: Response) => {
  try {
    const patternId = req.params['id'];
    const { category } = req.body;

    if (!category) {
      res.status(400).json({ error: 'Category is required' });
      return;
    }

    const pattern = db.getRecurringPatternById(patternId);
    if (!pattern) {
      res.status(404).json({ error: 'Pattern not found' });
      return;
    }

    // Update all transactions in the pattern
    const transactions = await getStoredTransactions();
    let updatedCount = 0;

    for (const txId of pattern.transactionIds) {
      const tx = transactions.find(t => t.id === txId);
      if (tx) {
        await saveTransaction({
          ...tx,
          category
        });
        updatedCount++;
      }
    }

    // Update pattern category
    db.saveRecurringPattern({
      ...pattern,
      category,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      updatedTransactions: updatedCount,
      category
    });
  } catch (error) {
    console.error('Error categorizing recurring pattern:', error);
    res.status(500).json({ error: 'Failed to categorize recurring pattern' });
  }
});

// GET /recurring/summary - Get summary of recurring patterns
app.get('/recurring/summary', async (req: Request, res: Response) => {
  try {
    const patterns = db.getAllRecurringPatterns();
    const active = patterns.filter(p => p.isActive);

    // Calculate totals by frequency
    const byFrequency: Record<string, { count: number; totalAmount: number }> = {};
    for (const p of active) {
      if (!byFrequency[p.frequency]) {
        byFrequency[p.frequency] = { count: 0, totalAmount: 0 };
      }
      byFrequency[p.frequency].count++;
      byFrequency[p.frequency].totalAmount += p.averageAmount;
    }

    // Calculate monthly estimated total
    const frequencyMultipliers: Record<string, number> = {
      weekly: 4.33,
      biweekly: 2.17,
      monthly: 1,
      quarterly: 0.33,
      yearly: 0.083,
      irregular: 0
    };

    let monthlyEstimate = 0;
    for (const p of active) {
      monthlyEstimate += p.averageAmount * (frequencyMultipliers[p.frequency] || 0);
    }

    res.json({
      totalPatterns: patterns.length,
      activePatterns: active.length,
      byFrequency,
      monthlyEstimate: Math.round(monthlyEstimate * 100) / 100,
      yearlyEstimate: Math.round(monthlyEstimate * 12 * 100) / 100
    });
  } catch (error) {
    console.error('Error getting recurring summary:', error);
    res.status(500).json({ error: 'Failed to get recurring summary' });
  }
});

// ==================== AI HELPERS ====================

async function getStoredRules(): Promise<Rule[]> {
  return db.getAllRules() as Rule[];
}

async function saveRules(rules: Rule[]): Promise<void> {
  db.saveRules(rules as any[]);
}

async function loadRulesIntoEngine(): Promise<void> {
  const rules = await getStoredRules();
  rulesEngine.setRules(rules);
}

async function getCategories(): Promise<{ id: string; name: string; color?: string }[]> {
  return db.getAllCategories();
}

function getAIAssistant(): AIAssistant {
  if (!aiAssistant) {
    // Get API key from environment
    const apiKey = process.env['OPENAI_API_KEY'] || '';
    aiAssistant = new AIAssistant(apiKey);
  }
  return aiAssistant;
}

// Load rules on startup
loadRulesIntoEngine().catch(err => console.error('Failed to load rules:', err));

// Initialize automation service
automationService = getAutomationService(rulesEngine);

// Load automation config
async function loadAutomationConfig(): Promise<void> {
  const config = db.getAutomationConfig();
  automationService.setConfig(config);
}

async function saveAutomationConfig(config: AutomationConfig): Promise<void> {
  db.saveAutomationConfig(config);
}

// Load automation config on startup
loadAutomationConfig().catch(err => console.error('Failed to load automation config:', err));

// Auto-categorize a transaction and return the category
async function autoCategorizeTransaction(transaction: StoredTransaction): Promise<string | null> {
  const allTransactions = await getStoredTransactions();
  const enrichedAll: EnrichedTransaction[] = allTransactions.map(t => ({
    id: t.id,
    description: t.description,
    amount: t.amount,
    date: t.date,
    category: t.category,
    beneficiary: t.beneficiary,
    source: t.source ? {
      connectorType: t.source.connectorType,
      externalId: t.source.externalId
    } : undefined
  }));

  const result = await automationService.categorizeTransaction(
    {
      id: transaction.id,
      description: transaction.description,
      amount: transaction.amount,
      date: transaction.date,
      category: transaction.category,
      beneficiary: transaction.beneficiary,
      source: transaction.source
    },
    enrichedAll
  );

  return result?.category || null;
}

// ==================== RULES ENGINE ENDPOINTS ====================

// GET /rules - Get all rules
app.get('/rules', async (req: Request, res: Response) => {
  try {
    const rules = rulesEngine.getRules();
    const stats = rulesEngine.getStats();
    return res.json({ rules, stats });
  } catch (error) {
    console.error('Error getting rules:', error);
    return res.status(500).json({ error: 'Failed to get rules' });
  }
});

// POST /rules - Create a new rule
app.post('/rules', async (req: Request, res: Response) => {
  try {
    const rule = req.body as Rule;

    // Generate ID if not provided
    if (!rule.id) {
      rule.id = `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    rule.createdAt = rule.createdAt || new Date().toISOString();
    rule.updatedAt = new Date().toISOString();

    rulesEngine.addRule(rule);
    await saveRules(rulesEngine.getRules());

    return res.status(201).json(rule);
  } catch (error) {
    console.error('Error creating rule:', error);
    return res.status(500).json({ error: 'Failed to create rule' });
  }
});

// PUT /rules/:id - Update a rule
app.put('/rules/:id', async (req: Request, res: Response) => {
  try {
    const ruleId = req.params['id'];
    const updates = req.body;

    const success = rulesEngine.updateRule(ruleId, updates);
    if (!success) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    await saveRules(rulesEngine.getRules());
    const rule = rulesEngine.getRules().find(r => r.id === ruleId);
    return res.json(rule);
  } catch (error) {
    console.error('Error updating rule:', error);
    return res.status(500).json({ error: 'Failed to update rule' });
  }
});

// DELETE /rules/:id - Delete a rule
app.delete('/rules/:id', async (req: Request, res: Response) => {
  try {
    const ruleId = req.params['id'];
    const success = rulesEngine.removeRule(ruleId);

    if (!success) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    await saveRules(rulesEngine.getRules());
    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting rule:', error);
    return res.status(500).json({ error: 'Failed to delete rule' });
  }
});

// POST /rules/apply - Apply rules to a transaction
app.post('/rules/apply', async (req: Request, res: Response) => {
  try {
    const transaction = req.body as RulesStoredTransaction;
    const result = rulesEngine.applyRules(transaction);

    // Save updated rules (usage stats changed)
    if (result.applied) {
      await saveRules(rulesEngine.getRules());
    }

    return res.json(result);
  } catch (error) {
    console.error('Error applying rules:', error);
    return res.status(500).json({ error: 'Failed to apply rules' });
  }
});

// POST /rules/from-correction - Create a rule from a user correction
app.post('/rules/from-correction', async (req: Request, res: Response) => {
  try {
    const { transaction, originalCategory, newCategory } = req.body;

    const rule = rulesEngine.createRuleFromCorrection(
      transaction as RulesStoredTransaction,
      originalCategory,
      newCategory
    );

    rulesEngine.addRule(rule);
    await saveRules(rulesEngine.getRules());

    return res.status(201).json(rule);
  } catch (error) {
    console.error('Error creating rule from correction:', error);
    return res.status(500).json({ error: 'Failed to create rule from correction' });
  }
});

// POST /rules/:id/feedback - Update rule confidence based on feedback
app.post('/rules/:id/feedback', async (req: Request, res: Response) => {
  try {
    const ruleId = req.params['id'];
    const { wasCorrect } = req.body;

    rulesEngine.updateRuleConfidence(ruleId, wasCorrect);
    await saveRules(rulesEngine.getRules());

    const rule = rulesEngine.getRules().find(r => r.id === ruleId);
    return res.json(rule);
  } catch (error) {
    console.error('Error updating rule feedback:', error);
    return res.status(500).json({ error: 'Failed to update rule feedback' });
  }
});

// POST /rules/consolidate - Merge similar rules
app.post('/rules/consolidate', async (req: Request, res: Response) => {
  try {
    const consolidated = rulesEngine.consolidateRules();
    rulesEngine.setRules(consolidated);
    await saveRules(consolidated);

    return res.json({
      success: true,
      ruleCount: consolidated.length,
      stats: rulesEngine.getStats()
    });
  } catch (error) {
    console.error('Error consolidating rules:', error);
    return res.status(500).json({ error: 'Failed to consolidate rules' });
  }
});

// ==================== AI ASSISTANT ENDPOINTS ====================

// POST /ai/chat - Chat with AI assistant
app.post('/ai/chat', async (req: Request, res: Response) => {
  try {
    const { message, includeContext = true, attachedTransactionIds } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const assistant = getAIAssistant();

    // Update context if requested
    if (includeContext) {
      const transactions = await getStoredTransactions();
      const categories = await getCategories();

      assistant.setContext({
        transactions: transactions.map(t => ({
          id: t.id,
          description: t.description,
          amount: t.amount,
          date: t.date,
          category: t.category,
          beneficiary: t.beneficiary,
          source: t.source,
          matchInfo: t.matchInfo,
          // Include order linking fields so AI can use linked order details
          isContextOnly: t.isContextOnly,
          linkedOrderIds: t.linkedOrderIds
        })),
        categories
      });
    }

    // Enhance message with linked order details if attached transactions have linked orders
    let enhancedMessage = message;
    if (attachedTransactionIds && attachedTransactionIds.length > 0) {
      const transactions = await getStoredTransactions();
      const linkedOrderDetails: string[] = [];

      for (const txId of attachedTransactionIds) {
        const tx = transactions.find(t => t.id === txId);
        if (tx && tx.linkedOrderIds && tx.linkedOrderIds.length > 0) {
          // Find the linked orders (context-only transactions)
          const linkedOrders = transactions.filter(t =>
            tx.linkedOrderIds!.includes(t.id)
          );
          if (linkedOrders.length > 0) {
            const orderDescriptions = linkedOrders.map(o =>
              `  - ${o.description} (€${o.amount.toFixed(2)})`
            ).join('\n');
            linkedOrderDetails.push(
              `\nLinked order details for "${tx.description}":\n${orderDescriptions}`
            );
          }
        }
      }

      if (linkedOrderDetails.length > 0) {
        enhancedMessage = message + '\n\n' + linkedOrderDetails.join('\n');
      }
    }

    // Detect if this is a category suggestion request
    const isCategoryRequest = /categor|suggest|what.*is|classify/i.test(message);

    // If category request with single attached transaction, instruct AI to respond with structured category
    let finalMessage = enhancedMessage;
    if (isCategoryRequest && attachedTransactionIds?.length === 1) {
      finalMessage = enhancedMessage + '\n\nIMPORTANT: End your response with the suggested category on its own line in this exact format: [CATEGORY: CategoryName]';
    }

    const response = await assistant.query(finalMessage);

    // Extract category from AI response if present
    if (isCategoryRequest && attachedTransactionIds?.length === 1 && response.message) {
      const categoryMatch = response.message.match(/\[CATEGORY:\s*([^\]]+)\]/i);
      if (categoryMatch) {
        const suggestedCategory = categoryMatch[1].trim();
        const categories = await getCategories();

        // Check if category exists (case-insensitive match)
        const existingCategory = categories.find(
          c => c.name.toLowerCase() === suggestedCategory.toLowerCase()
        );

        response.categoryAction = {
          transactionId: attachedTransactionIds[0],
          suggestedCategory: existingCategory ? existingCategory.name : suggestedCategory,
          confidence: existingCategory ? 'high' : 'medium'
        };

        // Clean up the response message (remove the [CATEGORY: ...] tag)
        response.message = response.message.replace(/\s*\[CATEGORY:\s*[^\]]+\]/i, '').trim();
      }
    }

    return res.json(response);
  } catch (error) {
    console.error('Error in AI chat:', error);
    return res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// POST /ai/chat/clear - Clear conversation history
app.post('/ai/chat/clear', async (req: Request, res: Response) => {
  try {
    const assistant = getAIAssistant();
    assistant.clearHistory();
    return res.json({ success: true });
  } catch (error) {
    console.error('Error clearing chat history:', error);
    return res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

// POST /ai/similar-transactions - Find similar transactions
app.post('/ai/similar-transactions', async (req: Request, res: Response) => {
  try {
    const { transactionId, description, beneficiary, amount } = req.body;

    if (!transactionId && !description) {
      return res.status(400).json({ error: 'Transaction ID or description is required' });
    }

    const transactions = await getStoredTransactions();
    let targetTx: StoredTransaction | undefined;

    if (transactionId) {
      targetTx = transactions.find(t => t.id === transactionId);
      if (!targetTx) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
    }

    const targetDescription = targetTx?.description || description || '';
    const targetBeneficiary = targetTx?.beneficiary || beneficiary || '';
    const targetAmount = targetTx?.amount || amount;

    // Find similar transactions based on:
    // 1. Description similarity (contains same key words)
    // 2. Same beneficiary
    // 3. Similar amount (within 20%)
    const descWords = targetDescription.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);

    const similar = transactions.filter(t => {
      // Skip the source transaction
      if (targetTx && t.id === targetTx.id) return false;

      // Check description similarity
      const txDescWords = t.description.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
      const commonWords = descWords.filter((w: string) => txDescWords.includes(w));
      const descSimilarity = descWords.length > 0 ? commonWords.length / descWords.length : 0;

      // Check beneficiary match
      const beneficiaryMatch = targetBeneficiary && t.beneficiary &&
        t.beneficiary.toLowerCase().includes(targetBeneficiary.toLowerCase());

      // Check amount similarity (within 20%)
      const amountMatch = targetAmount !== undefined &&
        Math.abs(t.amount - targetAmount) / Math.abs(targetAmount) <= 0.2;

      // Transaction is similar if:
      // - Description is >= 50% similar, OR
      // - Beneficiary matches, OR
      // - Amount is similar AND at least 30% description similarity
      return descSimilarity >= 0.5 ||
             beneficiaryMatch ||
             (amountMatch && descSimilarity >= 0.3);
    });

    // Sort by date descending
    similar.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Limit to 50 results
    const limitedSimilar = similar.slice(0, 50);

    return res.json({
      sourceTransaction: targetTx || { description: targetDescription, beneficiary: targetBeneficiary, amount: targetAmount },
      similarTransactions: limitedSimilar,
      totalFound: similar.length
    });
  } catch (error) {
    console.error('Error finding similar transactions:', error);
    return res.status(500).json({ error: 'Failed to find similar transactions' });
  }
});

// POST /ai/apply-category-to-similar - Apply category to similar transactions
app.post('/ai/apply-category-to-similar', async (req: Request, res: Response) => {
  try {
    const { transactionId, category, transactionIds } = req.body;

    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }

    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return res.status(400).json({ error: 'Transaction IDs are required' });
    }

    const transactions = await getStoredTransactions();
    let updatedCount = 0;

    for (const id of transactionIds) {
      const tx = transactions.find(t => t.id === id);
      if (tx) {
        tx.category = category;
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      await bulkSaveTransactions(transactions);
    }

    return res.json({
      success: true,
      message: `Applied category "${category}" to ${updatedCount} transaction(s)`,
      updatedCount
    });
  } catch (error) {
    console.error('Error applying category to similar:', error);
    return res.status(500).json({ error: 'Failed to apply category' });
  }
});

// ==================== CROSS-ACCOUNT INTELLIGENCE ENDPOINTS ====================

// POST /ai/enrich - Enrich a transaction with cross-account data
app.post('/ai/enrich', async (req: Request, res: Response) => {
  try {
    const transaction = req.body as EnrichedTransaction;
    const transactions = await getStoredTransactions();

    // Convert to enriched format
    const allTransactions: EnrichedTransaction[] = transactions.map(t => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      date: t.date,
      category: t.category,
      beneficiary: t.beneficiary,
      source: t.source ? {
        connectorType: t.source.connectorType,
        externalId: t.source.externalId
      } : undefined,
      matchInfo: t.matchInfo ? {
        matchId: t.matchInfo.matchId,
        isPrimary: t.matchInfo.isPrimary,
        patternType: t.matchInfo.patternType,
        linkedTransactionIds: t.matchInfo.linkedTransactionIds
      } : undefined
    }));

    const intelligence = new CrossAccountIntelligence(allTransactions);
    const enriched = intelligence.enrichTransaction(transaction);

    return res.json(enriched);
  } catch (error) {
    console.error('Error enriching transaction:', error);
    return res.status(500).json({ error: 'Failed to enrich transaction' });
  }
});

// POST /ai/suggest-category - Get category suggestions for a transaction
app.post('/ai/suggest-category', async (req: Request, res: Response) => {
  try {
    const transaction = req.body as EnrichedTransaction;
    const transactions = await getStoredTransactions();

    const allTransactions: EnrichedTransaction[] = transactions.map(t => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      date: t.date,
      category: t.category,
      beneficiary: t.beneficiary,
      source: t.source ? {
        connectorType: t.source.connectorType as any,
        externalId: t.source.externalId
      } : undefined
    }));

    const intelligence = new CrossAccountIntelligence(allTransactions);
    const suggestions = intelligence.getCategorySuggestions(transaction);

    return res.json({ suggestions });
  } catch (error) {
    console.error('Error getting category suggestions:', error);
    return res.status(500).json({ error: 'Failed to get category suggestions' });
  }
});

// POST /ai/detect-insights - Detect insights for a transaction
app.post('/ai/detect-insights', async (req: Request, res: Response) => {
  try {
    const transaction = req.body as EnrichedTransaction;
    const transactions = await getStoredTransactions();

    const allTransactions: EnrichedTransaction[] = transactions.map(t => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      date: t.date,
      category: t.category,
      beneficiary: t.beneficiary,
      source: t.source ? {
        connectorType: t.source.connectorType as any,
        externalId: t.source.externalId
      } : undefined
    }));

    const intelligence = new CrossAccountIntelligence(allTransactions);
    const insights = intelligence.detectInsights(transaction);

    return res.json({ insights });
  } catch (error) {
    console.error('Error detecting insights:', error);
    return res.status(500).json({ error: 'Failed to detect insights' });
  }
});

// POST /ai/analyze-all - Run cross-account analysis on all uncategorized transactions
app.post('/ai/analyze-all', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();

    const allTransactions: EnrichedTransaction[] = transactions.map(t => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      date: t.date,
      category: t.category,
      beneficiary: t.beneficiary,
      source: t.source ? {
        connectorType: t.source.connectorType,
        externalId: t.source.externalId
      } : undefined,
      matchInfo: t.matchInfo ? {
        matchId: t.matchInfo.matchId,
        isPrimary: t.matchInfo.isPrimary,
        patternType: t.matchInfo.patternType,
        linkedTransactionIds: t.matchInfo.linkedTransactionIds
      } : undefined
    }));

    const intelligence = new CrossAccountIntelligence(allTransactions);

    // Find uncategorized or empty-category transactions
    const uncategorized = allTransactions.filter(
      t => !t.category || t.category === '' || t.category === 'Uncategorized'
    );

    const results: { transactionId: string; suggestions: any[] }[] = [];

    for (const tx of uncategorized) {
      const suggestions = intelligence.getCategorySuggestions(tx);
      if (suggestions.length > 0) {
        results.push({
          transactionId: tx.id,
          suggestions
        });
      }
    }

    return res.json({
      analyzed: uncategorized.length,
      withSuggestions: results.length,
      results
    });
  } catch (error) {
    console.error('Error analyzing transactions:', error);
    return res.status(500).json({ error: 'Failed to analyze transactions' });
  }
});

// ==================== DATA EXPORT/IMPORT ENDPOINTS ====================

// GET /export - Export all data for backup
app.get('/export', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();
    const categories = db.getAllCategories();
    const rules = await getStoredRules();
    const matches = await getStoredMatches();

    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      transactions,
      categories,
      rules,
      matches
    };

    return res.json(exportData);
  } catch (error) {
    console.error('Error exporting data:', error);
    return res.status(500).json({ error: 'Failed to export data' });
  }
});

// POST /import - Import data from backup
app.post('/import', async (req: Request, res: Response) => {
  try {
    const { transactions, categories, rules, matches, merge = false } = req.body;

    if (merge) {
      // Merge with existing data
      const existingTransactions = await getStoredTransactions();
      const existingCategories = db.getAllCategories();
      const existingRules = await getStoredRules();
      const existingMatches = await getStoredMatches();

      // Merge transactions (avoid duplicates by ID)
      const existingIds = new Set(existingTransactions.map(t => t.id));
      const newTransactions = transactions?.filter((t: any) => !existingIds.has(t.id)) || [];
      const mergedTransactions = [...existingTransactions, ...newTransactions];

      // Merge categories (avoid duplicates by name)
      const existingCategoryNames = new Set(existingCategories.map((c: any) => c.name.toLowerCase()));
      const newCategories = categories?.filter((c: any) => !existingCategoryNames.has(c.name.toLowerCase())) || [];
      const mergedCategories = [...existingCategories, ...newCategories];

      // Merge rules (avoid duplicates by ID)
      const existingRuleIds = new Set(existingRules.map(r => r.id));
      const newRules = rules?.filter((r: any) => !existingRuleIds.has(r.id)) || [];
      const mergedRules = [...existingRules, ...newRules];

      // Merge matches (avoid duplicates by ID)
      const existingMatchIds = new Set(existingMatches.map(m => m.id));
      const newMatches = matches?.filter((m: any) => !existingMatchIds.has(m.id)) || [];
      const mergedMatches = [...existingMatches, ...newMatches];

      // Save merged data
      await bulkSaveTransactions(mergedTransactions);
      db.saveCategories(mergedCategories);
      saveRules(mergedRules);
      await saveMatches(mergedMatches);

      // Reload rules into engine
      rulesEngine.setRules(mergedRules);

      return res.json({
        success: true,
        message: 'Data merged successfully',
        stats: {
          transactions: { existing: existingTransactions.length, new: newTransactions.length, total: mergedTransactions.length },
          categories: { existing: existingCategories.length, new: newCategories.length, total: mergedCategories.length },
          rules: { existing: existingRules.length, new: newRules.length, total: mergedRules.length },
          matches: { existing: existingMatches.length, new: newMatches.length, total: mergedMatches.length }
        }
      });
    } else {
      // Replace all data
      await bulkSaveTransactions(transactions || []);
      db.saveCategories(categories || []);
      saveRules(rules || []);
      await saveMatches(matches || []);

      // Reload rules into engine
      rulesEngine.setRules(rules || []);

      return res.json({
        success: true,
        message: 'Data imported successfully',
        stats: {
          transactions: transactions?.length || 0,
          categories: categories?.length || 0,
          rules: rules?.length || 0,
          matches: matches?.length || 0
        }
      });
    }
  } catch (error) {
    console.error('Error importing data:', error);
    return res.status(500).json({ error: 'Failed to import data' });
  }
});

// ==================== AUTOMATION ENDPOINTS ====================

// GET /automation/config - Get automation configuration
app.get('/automation/config', async (req: Request, res: Response) => {
  try {
    const config = automationService.getConfig();
    return res.json(config);
  } catch (error) {
    console.error('Error getting automation config:', error);
    return res.status(500).json({ error: 'Failed to get automation config' });
  }
});

// PUT /automation/config - Update automation configuration
app.put('/automation/config', async (req: Request, res: Response) => {
  try {
    const config = req.body as Partial<AutomationConfig>;
    automationService.setConfig(config);
    await saveAutomationConfig(automationService.getConfig());
    return res.json(automationService.getConfig());
  } catch (error) {
    console.error('Error updating automation config:', error);
    return res.status(500).json({ error: 'Failed to update automation config' });
  }
});

// POST /automation/categorize - Auto-categorize uncategorized transactions
app.post('/automation/categorize', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();

    // Find uncategorized transactions
    const uncategorized = transactions.filter(
      t => !t.category || t.category === '' || t.category === 'Uncategorized'
    );

    if (uncategorized.length === 0) {
      return res.json({
        success: true,
        message: 'No uncategorized transactions',
        categorized: 0
      });
    }

    // Convert to enriched format for cross-account intelligence
    const enrichedAll: EnrichedTransaction[] = transactions.map(t => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      date: t.date,
      category: t.category,
      beneficiary: t.beneficiary,
      source: t.source ? {
        connectorType: t.source.connectorType,
        externalId: t.source.externalId
      } : undefined
    }));

    // Auto-categorize
    const results = await automationService.categorizeTransactions(
      uncategorized.map(t => ({
        id: t.id,
        description: t.description,
        amount: t.amount,
        date: t.date,
        category: t.category,
        beneficiary: t.beneficiary,
        source: t.source
      })),
      enrichedAll
    );

    // Apply categorizations
    let updatedCount = 0;
    for (const result of results) {
      const index = transactions.findIndex(t => t.id === result.transactionId);
      if (index !== -1) {
        transactions[index].category = result.category;
        updatedCount++;
      }
    }

    // Save updated transactions
    if (updatedCount > 0) {
      await bulkSaveTransactions(transactions);
    }

    return res.json({
      success: true,
      message: `Auto-categorized ${updatedCount} transactions`,
      categorized: updatedCount,
      results
    });
  } catch (error) {
    console.error('Error in auto-categorization:', error);
    return res.status(500).json({ error: 'Failed to auto-categorize' });
  }
});

// POST /automation/process-new - Process newly imported transactions (categorize + match)
app.post('/automation/process-new', async (req: Request, res: Response) => {
  try {
    const { transactionIds } = req.body;
    const transactions = await getStoredTransactions();

    // Get new transactions
    const newTransactions = transactionIds
      ? transactions.filter(t => transactionIds.includes(t.id))
      : transactions.filter(t => !t.category || t.category === '' || t.category === 'Uncategorized');

    if (newTransactions.length === 0) {
      return res.json({
        success: true,
        message: 'No transactions to process',
        categorized: 0,
        matched: 0
      });
    }

    // Auto-categorize
    const enrichedAll: EnrichedTransaction[] = transactions.map(t => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      date: t.date,
      category: t.category,
      beneficiary: t.beneficiary,
      source: t.source ? {
        connectorType: t.source.connectorType,
        externalId: t.source.externalId
      } : undefined
    }));

    const categorizationResults = await automationService.categorizeTransactions(
      newTransactions.map(t => ({
        id: t.id,
        description: t.description,
        amount: t.amount,
        date: t.date,
        category: t.category,
        beneficiary: t.beneficiary,
        source: t.source
      })),
      enrichedAll
    );

    // Apply categorizations
    let categorizedCount = 0;
    for (const result of categorizationResults) {
      const index = transactions.findIndex(t => t.id === result.transactionId);
      if (index !== -1) {
        transactions[index].category = result.category;
        categorizedCount++;
      }
    }

    // Save transactions before matching
    await bulkSaveTransactions(transactions);

    // Run matching if enabled
    let matchedCount = 0;
    const config = automationService.getConfig();
    if (config.autoMatch) {
      const existingMatches = await getStoredMatches();
      const matcherTransactions = transactions.map(tx => ({
        ...tx,
        matchId: tx.matchId,
        matchInfo: tx.matchInfo ? {
          ...tx.matchInfo,
          patternType: tx.matchInfo.patternType as any,
          source: tx.matchInfo.source as any,
          confidence: tx.matchInfo.confidence as any
        } : undefined
      })) as MatcherStoredTransaction[];

      const matcher = new TransactionMatcher(matcherTransactions, existingMatches);
      const matchResult = matcher.runAllMatchers();

      if (matchResult.newMatches.length > 0) {
        const allMatches = [...existingMatches, ...matchResult.newMatches];
        await saveMatches(allMatches);

        const updatedTransactions = applyMatchesToTransactions(
          matcherTransactions,
          matchResult.newMatches
        );
        await bulkSaveTransactions(updatedTransactions);
        matchedCount = matchResult.newMatches.length;
      }
    }

    return res.json({
      success: true,
      message: `Processed ${newTransactions.length} transactions`,
      categorized: categorizedCount,
      matched: matchedCount,
      categorizationResults
    });
  } catch (error) {
    console.error('Error processing new transactions:', error);
    return res.status(500).json({ error: 'Failed to process transactions' });
  }
});

// GET /stats - Get overall system statistics
app.get('/stats', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();
    const categories = db.getAllCategories();
    const matches = await getStoredMatches();

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    // Calculate stats
    const totalTransactions = transactions.length;
    const totalSpending = Math.abs(
      transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
    );
    const totalIncome = transactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    const thisMonthTx = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    const thisMonthSpending = Math.abs(
      thisMonthTx.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
    );

    const uncategorizedCount = transactions.filter(
      t => !t.category || t.category === '' || t.category === 'Uncategorized'
    ).length;

    const matchedCount = transactions.filter(t => t.matchId).length;

    // Category breakdown
    const categoryTotals = new Map<string, number>();
    transactions.filter(t => t.amount < 0).forEach(t => {
      const cat = t.category || 'Uncategorized';
      categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + Math.abs(t.amount));
    });

    const topCategories = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, total]) => {
        const category = categories.find((c: any) => c.name === name);
        return { name, total, color: category?.color };
      });

    // Source breakdown
    const sourceCounts = new Map<string, number>();
    transactions.forEach(t => {
      const source = t.source?.connectorType || 'manual';
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    });

    return res.json({
      transactions: {
        total: totalTransactions,
        uncategorized: uncategorizedCount,
        matched: matchedCount
      },
      financial: {
        totalSpending,
        totalIncome,
        netBalance: totalIncome - totalSpending,
        thisMonthSpending
      },
      categories: {
        total: categories.length,
        topCategories
      },
      sources: Object.fromEntries(sourceCounts),
      matches: {
        total: matches.length
      },
      rules: rulesEngine.getStats()
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    return res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ==================== AUTO-RECONNECT ====================

async function autoReconnectConnectors(): Promise<void> {
  const connectorsWithCreds = db.getConnectorsWithCredentials();

  if (connectorsWithCreds.length === 0) {
    console.log('[Auto-Reconnect] No connectors with saved credentials');
    return;
  }

  console.log(`[Auto-Reconnect] Found ${connectorsWithCreds.length} connector(s) with saved credentials`);

  for (const connectorConfig of connectorsWithCreds) {
    try {
      console.log(`[Auto-Reconnect] Attempting to connect ${connectorConfig.name}...`);

      // Skip if connector type is not implemented
      if (!connectorManager.isImplemented(connectorConfig.type as CMConnectorType)) {
        console.log(`[Auto-Reconnect] Skipping ${connectorConfig.name} - connector type not implemented`);
        continue;
      }

      // Decrypt credentials
      const credentials = decryptCredentials(connectorConfig.credentialsEncrypted!);

      // Initialize connector
      const connector = await connectorManager.initializeConnector(
        connectorConfig.id,
        connectorConfig.type as CMConnectorType,
        {
          userId: credentials['userId'],
          pin: credentials['pin'],
          bankCode: connectorConfig.bankCode
        }
      );

      // Attempt connection
      const result = await connector.connect();

      if (result.success) {
        const state: ConnectorState = {
          config: connectorConfig as ConnectorConfig,
          status: ConnectorStatus.CONNECTED,
          statusMessage: `Auto-connected. Found ${result.accounts?.length || 0} accounts.`
        };
        connectorStates.set(connectorConfig.id, state);
        console.log(`[Auto-Reconnect] Successfully connected ${connectorConfig.name}`);
      } else if (result.requiresMFA) {
        // MFA required - set state but can't auto-complete
        const state: ConnectorState = {
          config: connectorConfig as ConnectorConfig,
          status: ConnectorStatus.MFA_REQUIRED,
          statusMessage: 'Auto-connect requires MFA - please confirm manually',
          mfaChallenge: result.mfaChallenge ? {
            type: result.mfaChallenge.type,
            message: result.mfaChallenge.message,
            decoupled: result.mfaChallenge.decoupled || false,
            reference: result.mfaChallenge.reference
          } : undefined
        };
        connectorStates.set(connectorConfig.id, state);
        console.log(`[Auto-Reconnect] ${connectorConfig.name} requires MFA confirmation`);
      } else {
        console.log(`[Auto-Reconnect] Failed to connect ${connectorConfig.name}: ${result.error}`);
      }
    } catch (error) {
      console.error(`[Auto-Reconnect] Error connecting ${connectorConfig.name}:`, error);
    }
  }
}

app.listen(3000, async () => {
  console.log('Server running on port 3000');

  // Auto-reconnect connectors with saved credentials
  setTimeout(() => {
    autoReconnectConnectors().catch(err =>
      console.error('[Auto-Reconnect] Failed:', err)
    );
  }, 2000); // Delay to allow server to fully start
});
