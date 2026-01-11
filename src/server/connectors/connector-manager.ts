/**
 * Connector Manager
 * Manages instances of financial connectors and their lifecycle
 */

import { BaseConnector, ConnectorCredentials, DateRange, FetchedTransaction } from './base-connector';
import { SparkasseConnector } from './sparkasse-connector';
import { N26Connector } from './n26-connector';
import { PayPalConnector } from './paypal-connector';

export type ConnectorType = 'sparkasse' | 'n26' | 'paypal' | 'gebuhrenfrei' | 'amazon';

export interface ConnectorInstance {
  id: string;
  type: ConnectorType;
  connector: BaseConnector;
  credentials?: Partial<ConnectorCredentials>;
  lastError?: string;
}

class ConnectorManager {
  private connectors: Map<string, ConnectorInstance> = new Map();

  /**
   * Create a connector instance for a given type
   */
  createConnector(id: string, type: ConnectorType): BaseConnector {
    let connector: BaseConnector;

    switch (type) {
      case 'sparkasse':
        connector = new SparkasseConnector(id);
        break;
      case 'n26':
        connector = new N26Connector(id);
        break;
      case 'paypal':
        connector = new PayPalConnector(id);
        break;
      case 'gebuhrenfrei':
        // TODO: Implement in Phase 6
        throw new Error('Gebührfrei connector not yet implemented');
      case 'amazon':
        // TODO: Implement in Phase 7
        throw new Error('Amazon connector not yet implemented');
      default:
        throw new Error(`Unknown connector type: ${type}`);
    }

    this.connectors.set(id, {
      id,
      type,
      connector
    });

    return connector;
  }

  /**
   * Get a connector instance by ID
   */
  getConnector(id: string): ConnectorInstance | undefined {
    return this.connectors.get(id);
  }

  /**
   * Get or create a connector
   */
  getOrCreateConnector(id: string, type: ConnectorType): BaseConnector {
    const existing = this.connectors.get(id);
    if (existing) {
      return existing.connector;
    }
    return this.createConnector(id, type);
  }

  /**
   * Remove a connector instance
   */
  async removeConnector(id: string): Promise<void> {
    const instance = this.connectors.get(id);
    if (instance) {
      await instance.connector.disconnect();
      this.connectors.delete(id);
    }
  }

  /**
   * Initialize connector with credentials
   */
  async initializeConnector(
    id: string,
    type: ConnectorType,
    credentials: ConnectorCredentials
  ): Promise<BaseConnector> {
    const connector = this.getOrCreateConnector(id, type);

    const instance = this.connectors.get(id);
    if (instance) {
      // Store partial credentials (never store PIN)
      instance.credentials = {
        userId: credentials.userId,
        bankCode: credentials.bankCode
      };
    }

    await connector.initialize(credentials);
    return connector;
  }

  /**
   * Check if a connector type is implemented
   */
  isImplemented(type: ConnectorType): boolean {
    switch (type) {
      case 'sparkasse':
      case 'n26':
      case 'paypal':
        return true;
      case 'gebuhrenfrei':
      case 'amazon':
        return false;
      default:
        return false;
    }
  }

  /**
   * Get all active connector IDs
   */
  getActiveConnectorIds(): string[] {
    return Array.from(this.connectors.keys());
  }

  /**
   * Disconnect and clean up all connectors
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.connectors.values()).map(
      instance => instance.connector.disconnect()
    );
    await Promise.all(promises);
    this.connectors.clear();
  }
}

// Export singleton instance
export const connectorManager = new ConnectorManager();
