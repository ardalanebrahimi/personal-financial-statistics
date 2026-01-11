/**
 * Base connector interface for all financial data connectors
 */

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface FetchedTransaction {
  externalId: string;
  date: Date;
  description: string;
  amount: number;
  beneficiary?: string;
  rawData?: Record<string, unknown>;
}

export interface FetchResult {
  success: boolean;
  transactions: FetchedTransaction[];
  errors?: string[];
}

export interface MFAChallenge {
  type: 'sms' | 'push' | 'photo_tan' | 'chip_tan' | 'app_tan' | 'decoupled';
  message: string;
  imageData?: string; // Base64 encoded for photoTAN
  reference?: string; // TAN reference for continuing the flow
  expiresAt?: Date;
}

export interface ConnectResult {
  success: boolean;
  connected: boolean;
  requiresMFA: boolean;
  mfaChallenge?: MFAChallenge;
  error?: string;
  accounts?: AccountInfo[];
}

export interface AccountInfo {
  accountNumber: string;
  iban?: string;
  bic?: string;
  accountType: string;
  currency: string;
  ownerName?: string;
}

export interface ConnectorCredentials {
  userId: string;
  pin: string;
  bankCode?: string; // BLZ for German banks
}

export abstract class BaseConnector {
  protected connectorId: string;
  protected credentials?: ConnectorCredentials;

  constructor(connectorId: string) {
    this.connectorId = connectorId;
  }

  /**
   * Initialize the connector with credentials
   */
  abstract initialize(credentials: ConnectorCredentials): Promise<void>;

  /**
   * Connect to the financial service
   * Returns MFA challenge if required
   */
  abstract connect(): Promise<ConnectResult>;

  /**
   * Submit MFA code to complete authentication
   */
  abstract submitMFA(code: string, reference?: string): Promise<ConnectResult>;

  /**
   * Fetch transactions for a date range
   * May require MFA for each fetch
   */
  abstract fetchTransactions(
    dateRange: DateRange,
    accountNumber?: string
  ): Promise<FetchResult | { requiresMFA: true; mfaChallenge: MFAChallenge }>;

  /**
   * Continue fetch after MFA
   */
  abstract fetchTransactionsWithMFA(
    code: string,
    reference: string
  ): Promise<FetchResult>;

  /**
   * Disconnect from the service
   */
  abstract disconnect(): Promise<void>;

  /**
   * Check if connector is currently connected
   */
  abstract isConnected(): boolean;

  /**
   * Get list of available accounts
   */
  abstract getAccounts(): AccountInfo[];
}
