/**
 * Connector status enum representing the current state of a connector
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
 * Types of MFA challenges that connectors may require
 */
export enum MFAType {
  SMS = 'sms',
  EMAIL = 'email',
  PUSH = 'push',
  PHOTO_TAN = 'photo_tan',
  CHIP_TAN = 'chip_tan',
  APP_TAN = 'app_tan',
  TOTP = 'totp',
  DECOUPLED = 'decoupled' // pushTAN where user confirms in banking app
}

/**
 * Connector type identifies which financial service the connector interfaces with
 */
export enum ConnectorType {
  SPARKASSE = 'sparkasse',
  N26 = 'n26',
  GEBUHRENFREI = 'gebuhrenfrei',
  AMAZON = 'amazon'
}

/**
 * MFA challenge presented to the user during authentication
 */
export interface MFAChallenge {
  type: MFAType;
  message: string;
  imageData?: string; // Base64 encoded image for photoTAN
  expiresAt?: Date;
  attemptsRemaining?: number;
  decoupled?: boolean; // If true, user confirms in external app (no code needed)
  reference?: string; // Reference for polling decoupled TAN status
}

/**
 * Configuration for a specific connector instance
 */
export interface ConnectorConfig {
  id: string;
  type: ConnectorType;
  name: string;
  enabled: boolean;
  // Bank-specific settings
  bankCode?: string; // BLZ for German banks
  accountId?: string;
  // Last sync information
  lastSyncAt?: Date;
  lastSyncStatus?: 'success' | 'partial' | 'failed';
  lastSyncError?: string;
}

/**
 * Runtime state of a connector
 */
export interface ConnectorState {
  config: ConnectorConfig;
  status: ConnectorStatus;
  statusMessage?: string;
  mfaChallenge?: MFAChallenge;
  progress?: {
    current: number;
    total: number;
    message: string;
  };
}

/**
 * Date range for fetching transactions
 */
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Result of a fetch operation
 */
export interface FetchResult {
  success: boolean;
  transactionsCount: number;
  newTransactionsCount: number;
  duplicatesSkipped: number;
  errors?: string[];
}

/**
 * Available connector definition (for displaying in UI)
 */
export interface AvailableConnector {
  type: ConnectorType;
  name: string;
  description: string;
  icon: string;
  requiresBankCode: boolean;
  supportedMFA: MFAType[];
  implemented: boolean;
}

/**
 * List of all available connectors in the system
 */
export const AVAILABLE_CONNECTORS: AvailableConnector[] = [
  {
    type: ConnectorType.SPARKASSE,
    name: 'Sparkasse',
    description: 'German Sparkasse banks via FinTS/HBCI',
    icon: 'account_balance',
    requiresBankCode: true,
    supportedMFA: [MFAType.PUSH, MFAType.PHOTO_TAN, MFAType.CHIP_TAN, MFAType.SMS],
    implemented: false
  },
  {
    type: ConnectorType.N26,
    name: 'N26',
    description: 'N26 digital bank',
    icon: 'smartphone',
    requiresBankCode: false,
    supportedMFA: [MFAType.PUSH],
    implemented: false
  },
  {
    type: ConnectorType.GEBUHRENFREI,
    name: 'Gebührfrei Mastercard',
    description: 'Advanzia Bank Mastercard Gold',
    icon: 'credit_card',
    requiresBankCode: false,
    supportedMFA: [MFAType.SMS, MFAType.EMAIL],
    implemented: false
  },
  {
    type: ConnectorType.AMAZON,
    name: 'Amazon Orders',
    description: 'Amazon order history',
    icon: 'shopping_cart',
    requiresBankCode: false,
    supportedMFA: [MFAType.TOTP, MFAType.SMS],
    implemented: false
  }
];
