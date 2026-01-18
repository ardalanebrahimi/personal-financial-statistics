/**
 * Connectors Controller
 *
 * Handles HTTP requests for financial service connector management.
 */

import { Request, Response } from 'express';
import * as db from '../database/database';
import { AppError } from '../middleware';
import { connectorManager } from '../connectors/connector-manager';
import type { ConnectorType as CMConnectorType } from '../connectors/connector-manager';
import { encryptCredentials, decryptCredentials } from '../utils/encryption';
import { ConnectorStatus, ConnectorConfig, ConnectorState } from '../types';

// In-memory connector states (not persisted to DB)
const connectorStates: Map<string, ConnectorState> = new Map();

// Store pending MFA references
const pendingMFAReferences: Map<string, string> = new Map();

/**
 * Get connector state from memory or create default.
 */
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

/**
 * GET /connectors
 * List all connectors with their current status.
 */
export async function getAll(req: Request, res: Response): Promise<void> {
  const connectors = db.getAllConnectors() as ConnectorConfig[];
  const states = connectors.map(config => getConnectorState(config));
  res.json({ connectors: states });
}

/**
 * POST /connectors
 * Create a new connector configuration.
 */
export async function create(req: Request, res: Response): Promise<void> {
  const newConnector: ConnectorConfig = {
    id: crypto.randomUUID(),
    type: req.body.type,
    name: req.body.name,
    enabled: true,
    bankCode: req.body.bankCode,
    accountId: req.body.accountId
  };

  db.insertConnector(newConnector as any);

  const state = getConnectorState(newConnector);
  res.status(201).json(state);
}

/**
 * DELETE /connectors/:id
 * Delete a connector.
 */
export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const deleted = db.deleteConnector(id);

  if (!deleted) {
    throw AppError.notFound('Connector not found');
  }

  connectorStates.delete(id);
  res.sendStatus(200);
}

/**
 * DELETE /connectors/:id/credentials
 * Clear saved credentials for a connector.
 */
export async function clearCredentials(req: Request, res: Response): Promise<void> {
  const connector = db.getConnectorById(req.params['id']);
  if (!connector) {
    throw AppError.notFound('Connector not found');
  }

  connector.credentialsEncrypted = undefined;
  connector.credentialsSavedAt = undefined;
  connector.autoConnect = false;
  db.updateConnector(connector);

  console.log(`[Connector] Cleared saved credentials for ${connector.name}`);
  res.json({ success: true, message: 'Credentials cleared' });
}

/**
 * GET /connectors/:id/has-credentials
 * Check if connector has saved credentials.
 */
export async function hasCredentials(req: Request, res: Response): Promise<void> {
  const connector = db.getConnectorById(req.params['id']);
  if (!connector) {
    throw AppError.notFound('Connector not found');
  }

  res.json({
    hasCredentials: !!connector.credentialsEncrypted,
    savedAt: connector.credentialsSavedAt,
    autoConnect: connector.autoConnect
  });
}

/**
 * POST /connectors/:id/connect
 * Initiate connection to the financial service.
 */
export async function connect(req: Request, res: Response): Promise<void> {
  const connectorConfig = db.getConnectorById(req.params['id']) as ConnectorConfig;

  if (!connectorConfig) {
    throw AppError.notFound('Connector not found');
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
      throw AppError.badRequest('Saved credentials invalid. Please provide new credentials.');
    }
  }

  if (!userId || !pin) {
    const hasSavedCredentials = !!connectorConfig.credentialsEncrypted;
    throw AppError.badRequest(`Credentials required (userId, pin). Has saved: ${hasSavedCredentials}`);
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
    res.json(state);
    return;
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
      res.json(state);
      return;
    }

    if (result.requiresMFA && result.mfaChallenge) {
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
      res.json(state);
      return;
    }

    // Connected successfully
    state = {
      config: connectorConfig,
      status: ConnectorStatus.CONNECTED,
      statusMessage: `Connected. Found ${result.accounts?.length || 0} accounts.`
    };
    connectorStates.set(connectorConfig.id, state);
    res.json(state);

  } catch (connectorError) {
    console.error('Connector error:', connectorError);
    state = {
      config: connectorConfig,
      status: ConnectorStatus.ERROR,
      statusMessage: connectorError instanceof Error ? connectorError.message : 'Connection failed'
    };
    connectorStates.set(connectorConfig.id, state);
    res.json(state);
  }
}

/**
 * POST /connectors/:id/mfa
 * Submit MFA code.
 */
export async function submitMFA(req: Request, res: Response): Promise<void> {
  const connectorConfig = db.getConnectorById(req.params['id']) as ConnectorConfig;

  if (!connectorConfig) {
    throw AppError.notFound('Connector not found');
  }

  const currentState = connectorStates.get(connectorConfig.id);
  if (!currentState || currentState.status !== ConnectorStatus.MFA_REQUIRED) {
    throw AppError.badRequest('No MFA challenge pending');
  }

  const { code } = req.body;
  const connectorInstance = connectorManager.getConnector(connectorConfig.id);

  if (!connectorInstance) {
    // Fall back to simulation
    const state: ConnectorState = {
      config: connectorConfig,
      status: ConnectorStatus.CONNECTED,
      statusMessage: 'Connected successfully'
    };
    connectorStates.set(connectorConfig.id, state);
    res.json(state);
    return;
  }

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
    res.json(state);
    return;
  }

  if (result.requiresMFA && result.mfaChallenge) {
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
    res.json(state);
    return;
  }

  // Connected successfully
  pendingMFAReferences.delete(connectorConfig.id);
  const state: ConnectorState = {
    config: connectorConfig,
    status: ConnectorStatus.CONNECTED,
    statusMessage: `Connected. Found ${result.accounts?.length || 0} accounts.`
  };
  connectorStates.set(connectorConfig.id, state);
  res.json(state);
}

/**
 * POST /connectors/:id/poll-decoupled
 * Poll for decoupled TAN confirmation.
 */
export async function pollDecoupled(req: Request, res: Response): Promise<void> {
  const connectorConfig = db.getConnectorById(req.params['id']) as ConnectorConfig;

  if (!connectorConfig) {
    throw AppError.notFound('Connector not found');
  }

  const currentState = connectorStates.get(connectorConfig.id);
  if (!currentState || currentState.status !== ConnectorStatus.MFA_REQUIRED) {
    if (currentState?.status === ConnectorStatus.CONNECTED) {
      res.json({ confirmed: true, expired: false });
      return;
    }
    res.json({ confirmed: false, expired: true, error: 'No pending decoupled TAN' });
    return;
  }

  const connectorInstance = connectorManager.getConnector(connectorConfig.id);

  if (!connectorInstance) {
    res.json({ confirmed: false, expired: false });
    return;
  }

  const reference = pendingMFAReferences.get(connectorConfig.id);

  try {
    const result = await connectorInstance.connector.submitMFA('', reference);

    if (result.connected) {
      pendingMFAReferences.delete(connectorConfig.id);
      const state: ConnectorState = {
        config: connectorConfig,
        status: ConnectorStatus.CONNECTED,
        statusMessage: `Connected. Found ${result.accounts?.length || 0} accounts.`
      };
      connectorStates.set(connectorConfig.id, state);
      res.json({ confirmed: true, expired: false });
      return;
    }

    if (result.requiresMFA) {
      res.json({ confirmed: false, expired: false });
      return;
    }

    res.json({ confirmed: false, expired: false, error: result.error });
  } catch (pollError) {
    console.error('Decoupled polling error:', pollError);
    res.json({ confirmed: false, expired: false });
  }
}

/**
 * POST /connectors/:id/disconnect
 * Disconnect from the financial service.
 */
export async function disconnect(req: Request, res: Response): Promise<void> {
  const connectorConfig = db.getConnectorById(req.params['id']) as ConnectorConfig;

  if (!connectorConfig) {
    throw AppError.notFound('Connector not found');
  }

  await connectorManager.removeConnector(connectorConfig.id);
  pendingMFAReferences.delete(connectorConfig.id);

  const state: ConnectorState = {
    config: connectorConfig,
    status: ConnectorStatus.DISCONNECTED,
    statusMessage: 'Disconnected'
  };
  connectorStates.set(connectorConfig.id, state);

  res.json(state);
}

/**
 * GET /connectors/:id/status
 * Get current status of a connector.
 */
export async function getStatus(req: Request, res: Response): Promise<void> {
  const connector = db.getConnectorById(req.params['id']) as ConnectorConfig;

  if (!connector) {
    throw AppError.notFound('Connector not found');
  }

  const state = getConnectorState(connector);
  res.json(state);
}

// Export state management functions for use by other controllers (e.g., fetch)
export { connectorStates, pendingMFAReferences, getConnectorState };
