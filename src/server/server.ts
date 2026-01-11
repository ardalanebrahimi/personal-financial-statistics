// @ts-ignore
const express = require('express');
import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import cors from 'cors';
import { Request, Response } from 'express';
import { connectorManager } from './connectors/connector-manager';
import type { ConnectorType as CMConnectorType } from './connectors/connector-manager';
import { getBrowserService } from './browser';
import { TransactionMatcher, applyMatchesToTransactions, TransactionMatch, MatchSuggestion, StoredTransaction as MatcherStoredTransaction } from './matching/matcher';
import { AmazonConnector } from './connectors/amazon-connector';
import { RulesEngine, Rule, StoredTransaction as RulesStoredTransaction } from './ai/rules-engine';
import { CrossAccountIntelligence, EnrichedTransaction } from './ai/cross-account-intelligence';
import { AIAssistant, AssistantContext } from './ai/ai-assistant';
import { AutomationService, getAutomationService, AutomationConfig } from './automation/automation-service';

const app = express();

// AI Services - Singleton instances
const RULES_FILE = join(__dirname, '../assets/rules.json');
const AUTOMATION_CONFIG_FILE = join(__dirname, '../assets/automation-config.json');
const rulesEngine = new RulesEngine();
let aiAssistant: AIAssistant | null = null;
let automationService: AutomationService;
app.use(express.json());
app.use(cors());

const CATEGORIES_FILE = join(__dirname, '../assets/categories.json');
const TRANSACTIONS_FILE = join(__dirname, '../assets/transactions.json');
const CONNECTORS_FILE = join(__dirname, '../assets/connectors.json');
const MATCHES_FILE = join(__dirname, '../assets/matches.json');

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
  try {
    const data = await readFile(CONNECTORS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.connectors || [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function saveConnectors(connectors: ConnectorConfig[]) {
  await writeFile(CONNECTORS_FILE, JSON.stringify({ connectors }, null, 2));
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

interface StoredTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  timestamp: string;
  beneficiary?: string;
  source?: {
    connectorType: string;
    externalId?: string;
    importedAt: string;
  };
  // Matching fields
  matchId?: string;
  matchInfo?: {
    matchId: string;
    isPrimary: boolean;
    patternType: string;
    source: string;
    confidence: string;
    linkedTransactionIds: string[];
  };
  transactionType?: 'expense' | 'income' | 'transfer' | 'internal';
  excludeFromStats?: boolean;
}

async function getStoredTransactions(): Promise<StoredTransaction[]> {
  try {
    const data = await readFile(TRANSACTIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function saveTransaction(transaction: Omit<StoredTransaction, 'timestamp'>) {
  const transactions = await getStoredTransactions();
  transactions.push({
    ...transaction,
    timestamp: new Date().toISOString()
  } as StoredTransaction);
  await writeFile(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
}

app.put('/categories', async (req: Request, res: Response) => {
  try {
    await writeFile(CATEGORIES_FILE, JSON.stringify({ categories: req.body }, null, 2));
    res.sendStatus(200);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save categories' });
  }
});

app.get('/categories', async (req: Request, res: Response) => {
  try {
    const data = await readFile(CATEGORIES_FILE, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.json({ categories: [] });
    } else {
        console.log(error)
      res.status(500).json({ error: 'Failed to read categories' });
    }
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

app.delete('/transactions/:id', async (req: Request, res: Response) => {
  try {
    const transactions = await getStoredTransactions();
    const filtered = transactions.filter(t => t.id !== req.params['id']);
    await writeFile(TRANSACTIONS_FILE, JSON.stringify(filtered, null, 2));
    res.sendStatus(200);
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
      await writeFile(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
      res.sendStatus(200);
    } else {
      res.status(404).json({ error: 'Transaction not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to update transaction' });
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

// POST /connectors/:id/connect - Initiate connection to the financial service
app.post('/connectors/:id/connect', async (req: Request, res: Response) => {
  try {
    const connectors = await getStoredConnectors();
    const connectorConfig = connectors.find(c => c.id === req.params['id']);

    if (!connectorConfig) {
      return res.status(404).json({ error: 'Connector not found' });
    }

    // Get credentials from request body
    const { userId, pin } = req.body;
    if (!userId || !pin) {
      return res.status(400).json({ error: 'Credentials required (userId, pin)' });
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

      for (const tx of fetchResult.transactions) {
        // Primary check: externalId (most reliable)
        const externalIdKey = `${connectorConfig.type}-${tx.externalId}`;
        if (existingExternalIds.has(externalIdKey)) {
          duplicateCount++;
          continue;
        }

        // Secondary check: date+amount+description signature
        const dateKey = tx.date.toISOString().split('T')[0];
        const amountKey = tx.amount.toFixed(2);
        const descKey = tx.description.substring(0, 30).toLowerCase().replace(/\s+/g, '');
        const signature = `${dateKey}-${amountKey}-${descKey}`;

        if (existingSignatures.has(signature)) {
          duplicateCount++;
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
              await writeFile(TRANSACTIONS_FILE, JSON.stringify(allTransactions, null, 2));
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
            await writeFile(TRANSACTIONS_FILE, JSON.stringify(updatedTransactions, null, 2));
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
          }
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

// ==================== MATCHING HELPERS ====================

async function getStoredMatches(): Promise<TransactionMatch[]> {
  try {
    const data = await readFile(MATCHES_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.matches || [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function saveMatches(matches: TransactionMatch[]): Promise<void> {
  await writeFile(MATCHES_FILE, JSON.stringify({ matches }, null, 2));
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
    await writeFile(TRANSACTIONS_FILE, JSON.stringify(updatedTransactions, null, 2));

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
    await writeFile(TRANSACTIONS_FILE, JSON.stringify(updatedTransactions, null, 2));

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
    await writeFile(TRANSACTIONS_FILE, JSON.stringify(updatedTransactions, null, 2));

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
    await writeFile(TRANSACTIONS_FILE, JSON.stringify(updatedTransactions, null, 2));

    return res.json({ success: true, message: 'Match removed' });
  } catch (error) {
    console.error('Error removing match:', error);
    return res.status(500).json({ error: 'Failed to remove match' });
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

// ==================== AI HELPERS ====================

async function getStoredRules(): Promise<Rule[]> {
  try {
    const data = await readFile(RULES_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.rules || [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function saveRules(rules: Rule[]): Promise<void> {
  await writeFile(RULES_FILE, JSON.stringify({ rules }, null, 2));
}

async function loadRulesIntoEngine(): Promise<void> {
  const rules = await getStoredRules();
  rulesEngine.setRules(rules);
}

async function getCategories(): Promise<{ id: string; name: string; color?: string }[]> {
  try {
    const data = await readFile(CATEGORIES_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.categories || [];
  } catch {
    return [];
  }
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
  try {
    const data = await readFile(AUTOMATION_CONFIG_FILE, 'utf8');
    const config = JSON.parse(data);
    automationService.setConfig(config);
  } catch (error) {
    // Use defaults if no config file
    console.log('[Automation] Using default configuration');
  }
}

async function saveAutomationConfig(config: AutomationConfig): Promise<void> {
  await writeFile(AUTOMATION_CONFIG_FILE, JSON.stringify(config, null, 2));
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
    const { message, includeContext = true } = req.body;

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
          matchInfo: t.matchInfo
        })),
        categories
      });
    }

    const response = await assistant.query(message);
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
    const [transactions, categories, rules, matches] = await Promise.all([
      getStoredTransactions(),
      readFile(CATEGORIES_FILE, 'utf8').then(d => JSON.parse(d).categories).catch(() => []),
      getStoredRules(),
      getStoredMatches()
    ]);

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
      const existingCategories = await readFile(CATEGORIES_FILE, 'utf8')
        .then(d => JSON.parse(d).categories)
        .catch(() => []);
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
      await Promise.all([
        writeFile(TRANSACTIONS_FILE, JSON.stringify(mergedTransactions, null, 2)),
        writeFile(CATEGORIES_FILE, JSON.stringify({ categories: mergedCategories }, null, 2)),
        saveRules(mergedRules),
        saveMatches(mergedMatches)
      ]);

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
      await Promise.all([
        writeFile(TRANSACTIONS_FILE, JSON.stringify(transactions || [], null, 2)),
        writeFile(CATEGORIES_FILE, JSON.stringify({ categories: categories || [] }, null, 2)),
        saveRules(rules || []),
        saveMatches(matches || [])
      ]);

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
      await writeFile(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
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
    await writeFile(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));

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
        await writeFile(TRANSACTIONS_FILE, JSON.stringify(updatedTransactions, null, 2));
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
    const categories = await readFile(CATEGORIES_FILE, 'utf8')
      .then(d => JSON.parse(d).categories)
      .catch(() => []);
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

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
