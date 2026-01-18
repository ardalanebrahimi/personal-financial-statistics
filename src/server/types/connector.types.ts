/**
 * Connector Types
 *
 * Shared types for connector state management and configuration.
 */

export enum ConnectorStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  MFA_REQUIRED = 'mfa_required',
  CONNECTED = 'connected',
  FETCHING = 'fetching',
  ERROR = 'error'
}

export enum ConnectorType {
  SPARKASSE = 'sparkasse',
  N26 = 'n26',
  PAYPAL = 'paypal',
  GEBUHRENFREI = 'gebuhrenfrei',
  AMAZON = 'amazon'
}

export interface MFAChallenge {
  type: string;
  message: string;
  imageData?: string;
  expiresAt?: string;
  decoupled?: boolean;
  reference?: string;
}

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

export interface ConnectorState {
  config: ConnectorConfig;
  status: ConnectorStatus;
  statusMessage?: string;
  mfaChallenge?: MFAChallenge;
}

export interface ConnectorCredentials {
  userId: string;
  pin: string;
}
