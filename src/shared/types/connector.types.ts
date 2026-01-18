/**
 * Shared Connector Types
 *
 * Types shared between frontend and backend for connector operations.
 */

/**
 * Status of a connector connection
 */
export enum ConnectorStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  MFA_REQUIRED = 'mfa_required',
  CONNECTED = 'connected',
  FETCHING = 'fetching',
  ERROR = 'error'
}

/**
 * Supported connector types
 */
export enum ConnectorType {
  SPARKASSE = 'sparkasse',
  N26 = 'n26',
  PAYPAL = 'paypal',
  GEBUHRENFREI = 'gebuhrenfrei',
  AMAZON = 'amazon'
}

/**
 * MFA (Multi-Factor Authentication) types
 */
export enum MFAType {
  SMS = 'sms',
  EMAIL = 'email',
  PUSH = 'push',
  PHOTO_TAN = 'photo_tan',
  CHIP_TAN = 'chip_tan',
  APP_TAN = 'app_tan',
  TOTP = 'totp',
  DECOUPLED = 'decoupled'
}

/**
 * MFA challenge information
 * Note: expiresAt is string for JSON serialization compatibility
 */
export interface MFAChallenge {
  type: MFAType | string;
  message: string;
  imageData?: string;
  expiresAt?: string;
  attemptsRemaining?: number;
  decoupled?: boolean;
  reference?: string;
}

/**
 * Connector configuration
 */
export interface ConnectorConfig {
  id: string;
  type: ConnectorType;
  name: string;
  enabled: boolean;
  credentials?: {
    userId?: string;
    bankCode?: string;
    // Note: PIN is not stored, only used during connection
  };
  lastSync?: string;
  lastError?: string;
}

/**
 * Connector state for runtime tracking
 */
export interface ConnectorState {
  status: ConnectorStatus;
  mfaChallenge?: MFAChallenge;
  error?: string;
  accounts?: AccountInfo[];
  lastActivity?: string;
}

/**
 * Account information from a connector
 */
export interface AccountInfo {
  accountNumber: string;
  iban?: string;
  bic?: string;
  accountType: string;
  currency: string;
  ownerName?: string;
}
