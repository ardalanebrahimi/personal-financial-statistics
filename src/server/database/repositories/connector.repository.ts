/**
 * Connector Repository
 *
 * Database operations for connectors.
 */

import { db } from '../connection';
import type { ConnectorType } from '../../connectors/connector-manager';

export interface ConnectorConfig {
  id: string;
  type: ConnectorType;
  name: string;
  enabled: boolean;
  bankCode?: string;
  accountId?: string;
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'partial' | 'failed';
  lastSyncError?: string;
  credentialsEncrypted?: string;
  credentialsSavedAt?: string;
  autoConnect?: boolean;
}

function rowToConnector(row: any): ConnectorConfig {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    enabled: row.enabled === 1,
    bankCode: row.bank_code || undefined,
    accountId: row.account_id || undefined,
    lastSyncAt: row.last_sync_at || undefined,
    lastSyncStatus: row.last_sync_status || undefined,
    lastSyncError: row.last_sync_error || undefined,
    credentialsEncrypted: row.credentials_encrypted || undefined,
    credentialsSavedAt: row.credentials_saved_at || undefined,
    autoConnect: row.auto_connect === 1
  };
}

export function getAllConnectors(): ConnectorConfig[] {
  const rows = db.prepare(`SELECT * FROM connectors`).all() as any[];
  return rows.map(rowToConnector);
}

export function getConnectorById(id: string): ConnectorConfig | null {
  const row = db.prepare(`SELECT * FROM connectors WHERE id = ?`).get(id) as any;
  if (!row) return null;
  return rowToConnector(row);
}

export function getConnectorsWithCredentials(): ConnectorConfig[] {
  const rows = db.prepare(`
    SELECT * FROM connectors
    WHERE credentials_encrypted IS NOT NULL AND auto_connect = 1
  `).all() as any[];
  return rows.map(rowToConnector);
}

export function insertConnector(connector: ConnectorConfig): void {
  db.prepare(`
    INSERT INTO connectors (id, type, name, enabled, bank_code, account_id,
      last_sync_at, last_sync_status, last_sync_error,
      credentials_encrypted, credentials_saved_at, auto_connect)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    connector.id,
    connector.type,
    connector.name,
    connector.enabled ? 1 : 0,
    connector.bankCode || null,
    connector.accountId || null,
    connector.lastSyncAt || null,
    connector.lastSyncStatus || null,
    connector.lastSyncError || null,
    connector.credentialsEncrypted || null,
    connector.credentialsSavedAt || null,
    connector.autoConnect ? 1 : 0
  );
}

export function updateConnector(connector: ConnectorConfig): void {
  db.prepare(`
    UPDATE connectors SET
      type = ?, name = ?, enabled = ?, bank_code = ?, account_id = ?,
      last_sync_at = ?, last_sync_status = ?, last_sync_error = ?,
      credentials_encrypted = ?, credentials_saved_at = ?, auto_connect = ?
    WHERE id = ?
  `).run(
    connector.type,
    connector.name,
    connector.enabled ? 1 : 0,
    connector.bankCode || null,
    connector.accountId || null,
    connector.lastSyncAt || null,
    connector.lastSyncStatus || null,
    connector.lastSyncError || null,
    connector.credentialsEncrypted || null,
    connector.credentialsSavedAt || null,
    connector.autoConnect ? 1 : 0,
    connector.id
  );
}

export function deleteConnector(id: string): boolean {
  const result = db.prepare(`DELETE FROM connectors WHERE id = ?`).run(id);
  return result.changes > 0;
}
