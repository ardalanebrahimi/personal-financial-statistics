/**
 * Connector Models
 *
 * Re-exports shared types and adds frontend-specific extensions.
 */

// Re-export shared types
export {
  ConnectorStatus,
  ConnectorType,
  MFAType,
  MFAChallenge as SharedMFAChallenge,
  AccountInfo
} from '@shared/types';

import {
  ConnectorStatus,
  ConnectorType,
  MFAType,
  MFAChallenge as SharedMFAChallenge
} from '@shared/types';

/**
 * MFA challenge with Date objects for frontend use
 */
export interface MFAChallenge extends Omit<SharedMFAChallenge, 'expiresAt'> {
  expiresAt?: Date;
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
  },
  {
    type: ConnectorType.PAYPAL,
    name: 'PayPal',
    description: 'PayPal transaction history',
    icon: 'account_balance_wallet',
    requiresBankCode: false,
    supportedMFA: [MFAType.SMS, MFAType.TOTP],
    implemented: false
  }
];
