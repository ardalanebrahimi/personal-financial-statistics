// @ts-ignore
const express = require('express');
import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import cors from 'cors';
import { Request, Response } from 'express';
import { connectorManager } from './connectors/connector-manager';
import type { ConnectorType as CMConnectorType } from './connectors/connector-manager';

const app = express();
app.use(express.json());
app.use(cors());

const CATEGORIES_FILE = join(__dirname, '../assets/categories.json');
const TRANSACTIONS_FILE = join(__dirname, '../assets/transactions.json');
const CONNECTORS_FILE = join(__dirname, '../assets/connectors.json');

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
    const transactions = await getStoredTransactions();
    const sortedTransactions = transactions.sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    res.json({ transactions: sortedTransactions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get transactions' });
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
    await saveTransaction(req.body);
    res.status(200).json({ message: 'Transaction saved successfully' }); // Return a valid JSON response
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
            expiresAt: result.mfaChallenge.expiresAt?.toISOString()
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
          expiresAt: result.mfaChallenge.expiresAt?.toISOString()
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

      for (const tx of fetchResult.transactions) {
        // Check for duplicates
        const existingTx = await getStoredTransactions();
        const isDuplicate = existingTx.some(
          existing =>
            Math.abs(new Date(existing.date).getTime() - tx.date.getTime()) < 86400000 &&
            Math.abs(existing.amount - tx.amount) < 0.01 &&
            existing.description.includes(tx.description.substring(0, 20))
        );

        if (!isDuplicate) {
          await saveTransaction({
            id: crypto.randomUUID(),
            date: tx.date.toISOString(),
            description: tx.description,
            amount: tx.amount,
            category: '', // Will be categorized by AI later
            beneficiary: tx.beneficiary,
            source: {
              connectorType: connectorConfig.type,
              externalId: tx.externalId,
              importedAt: new Date().toISOString()
            }
          });
          newCount++;
        } else {
          duplicateCount++;
        }
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
        duplicatesSkipped: duplicateCount
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

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
