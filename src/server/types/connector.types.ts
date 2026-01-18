/**
 * Connector Types
 *
 * Re-exports shared types and adds backend-specific extensions.
 */

// Re-export shared types
export {
  ConnectorStatus,
  ConnectorType,
  MFAType,
  MFAChallenge,
  AccountInfo
} from '@shared/types';

// Backend-specific connector configuration (extends shared config)
export interface ConnectorConfig {
  id: string;
  type: import('@shared/types').ConnectorType;
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

// Backend-specific connector state
export interface ConnectorState {
  config: ConnectorConfig;
  status: import('@shared/types').ConnectorStatus;
  statusMessage?: string;
  mfaChallenge?: import('@shared/types').MFAChallenge;
}

// Backend-specific credentials (with PIN)
export interface ConnectorCredentials {
  userId: string;
  pin: string;
  bankCode?: string;
}
