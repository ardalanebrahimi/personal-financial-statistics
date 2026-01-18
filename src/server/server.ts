/**
 * Express Server
 *
 * Main server entry point. Sets up Express with middleware and routes.
 */

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

import { createApiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware';
import { getBrowserService } from './browser';
import { connectorManager } from './connectors/connector-manager';
import type { ConnectorType as CMConnectorType } from './connectors/connector-manager';
import * as db from './database/database';
import { decryptCredentials } from './utils/encryption';
import { ConnectorStatus, ConnectorState } from './types/connector.types';
import { connectorStates } from './controllers/connectors.controller';
import { importPayPalFile } from './controllers/import.controller';
import { asyncHandler } from './middleware';

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '../data/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

// Create Express app
const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Mount API routes
app.use('/', createApiRouter());

// File upload routes that need multer middleware
app.post('/import/paypal/file', upload.single('file'), asyncHandler(importPayPalFile));

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Browser cleanup on shutdown
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

// Auto-reconnect connectors with saved credentials
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

      if (!connectorManager.isImplemented(connectorConfig.type as CMConnectorType)) {
        console.log(`[Auto-Reconnect] Skipping ${connectorConfig.name} - connector type not implemented`);
        continue;
      }

      const credentials = decryptCredentials(connectorConfig.credentialsEncrypted!);

      const connector = await connectorManager.initializeConnector(
        connectorConfig.id,
        connectorConfig.type as CMConnectorType,
        {
          userId: credentials['userId'],
          pin: credentials['pin'],
          bankCode: connectorConfig.bankCode
        }
      );

      const result = await connector.connect();

      if (result.success) {
        const state: ConnectorState = {
          config: connectorConfig as any,
          status: ConnectorStatus.CONNECTED,
          statusMessage: `Auto-connected. Found ${result.accounts?.length || 0} accounts.`
        };
        connectorStates.set(connectorConfig.id, state);
        console.log(`[Auto-Reconnect] Successfully connected ${connectorConfig.name}`);
      } else if (result.requiresMFA) {
        const state: ConnectorState = {
          config: connectorConfig as any,
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

// Start server
app.listen(3000, async () => {
  console.log('Server running on port 3000');

  // Auto-reconnect connectors with saved credentials
  setTimeout(() => {
    autoReconnectConnectors().catch(err =>
      console.error('[Auto-Reconnect] Failed:', err)
    );
  }, 2000);
});
