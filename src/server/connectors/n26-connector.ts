/**
 * N26 Connector
 *
 * Connects to N26 bank using their unofficial API (reverse-engineered).
 * Uses OAuth 2.0 authentication with MFA support (SMS or push notification).
 *
 * API Base URL: https://api.tech26.de
 * Authentication: OAuth 2.0 with password grant
 *
 * WARNING: This uses an unofficial API. N26 does not officially support
 * third-party API access and this may stop working at any time.
 */

import {
  BaseConnector,
  ConnectorCredentials,
  ConnectResult,
  MFAChallenge,
  DateRange,
  FetchResult,
  FetchedTransaction,
  AccountInfo
} from './base-connector';

// N26 API Configuration
const N26_API_BASE = 'https://api.tech26.de';
const N26_CLIENT_ID = 'android';
const N26_CLIENT_SECRET = 'secret';

// N26 API Response Types
interface N26TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  host_url?: string;
}

interface N26MFAResponse {
  mfaToken: string;
  hostUrl?: string;
  error?: string;
  error_description?: string;
}

interface N26Account {
  id: string;
  iban: string;
  bic: string;
  availableBalance: number;
  usableBalance: number;
  bankBalance: number;
}

interface N26Transaction {
  id: string;
  userId: string;
  type: string;
  amount: number;
  currencyCode: string;
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;
  merchantCity?: string;
  visibleTS: number;
  mcc?: number;
  mccGroup?: number;
  merchantName?: string;
  merchantId?: string;
  recurring: boolean;
  partnerBic?: string;
  partnerName?: string;
  partnerAccountIsSepa?: boolean;
  partnerIban?: string;
  referenceText?: string;
  userCertified?: number;
  pending: boolean;
  transactionNature?: string;
  createdTS: number;
  smartLinkId?: string;
  linkId?: string;
  confirmed?: number;
  category?: string;
}

interface PendingOperation {
  type: 'connect' | 'fetch';
  mfaToken?: string;
  dateRange?: DateRange;
}

export class N26Connector extends BaseConnector {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private mfaType: 'sms' | 'app' = 'app';
  private n26Account: N26Account | null = null;
  private _connected: boolean = false;
  private _accounts: AccountInfo[] = [];
  private pendingOperation?: PendingOperation;
  private deviceToken: string = '';

  constructor(connectorId: string) {
    super(connectorId);
  }

  /**
   * Initialize the connector with credentials
   */
  async initialize(credentials: ConnectorCredentials): Promise<void> {
    this.credentials = credentials;
    this.mfaType = (credentials as any).mfaType || 'app';
    // Generate device token based on user ID for consistency
    this.deviceToken = `pfs-${this.simpleHash(credentials.userId)}`;
    console.log(`[N26] Initialized for user: ${credentials.userId}`);
  }

  /**
   * Connect to N26 and initiate authentication
   */
  async connect(): Promise<ConnectResult> {
    if (!this.credentials) {
      return {
        success: false,
        connected: false,
        requiresMFA: false,
        error: 'Connector not initialized. Call initialize() first.'
      };
    }

    try {
      console.log('[N26] Initiating authentication...');

      // Step 1: Request OAuth token (will trigger MFA)
      const tokenResult = await this.requestToken();

      if ('mfaToken' in tokenResult) {
        // MFA required
        this.pendingOperation = {
          type: 'connect',
          mfaToken: tokenResult.mfaToken
        };

        const mfaChallenge: MFAChallenge = {
          type: this.mfaType === 'sms' ? 'sms' : 'push',
          message: this.mfaType === 'sms'
            ? 'Please enter the verification code sent to your phone.'
            : 'Please approve the login request in your N26 app.',
          decoupled: this.mfaType === 'app',
          reference: tokenResult.mfaToken
        };

        return {
          success: false,
          connected: false,
          requiresMFA: true,
          mfaChallenge
        };
      }

      // Direct authentication succeeded (unlikely with current N26 security)
      if ('access_token' in tokenResult) {
        await this.handleSuccessfulAuth(tokenResult);
        return {
          success: true,
          connected: true,
          requiresMFA: false,
          accounts: this._accounts
        };
      }

      return {
        success: false,
        connected: false,
        requiresMFA: false,
        error: 'Unexpected response from N26 API'
      };

    } catch (error: any) {
      console.error('[N26] Connection error:', error);
      return {
        success: false,
        connected: false,
        requiresMFA: false,
        error: error.message || 'Failed to connect to N26'
      };
    }
  }

  /**
   * Submit MFA code/confirmation
   */
  async submitMFA(code: string, reference?: string): Promise<ConnectResult> {
    if (!this.credentials) {
      return {
        success: false,
        connected: false,
        requiresMFA: false,
        error: 'Connector not initialized'
      };
    }

    const mfaToken = reference || this.pendingOperation?.mfaToken;
    if (!mfaToken) {
      return {
        success: false,
        connected: false,
        requiresMFA: false,
        error: 'No MFA session active'
      };
    }

    try {
      console.log('[N26] Completing MFA authentication...');

      // Complete MFA authentication
      const tokenResult = await this.completeMFA(mfaToken, code);

      if ('error' in tokenResult && tokenResult.error) {
        // Check if still waiting for app confirmation
        if (tokenResult.error === 'authorization_pending') {
          return {
            success: false,
            connected: false,
            requiresMFA: true,
            mfaChallenge: {
              type: 'push',
              message: 'Still waiting for approval in your N26 app...',
              decoupled: true,
              reference: mfaToken
            }
          };
        }

        return {
          success: false,
          connected: false,
          requiresMFA: false,
          error: tokenResult.error_description || tokenResult.error
        };
      }

      if ('access_token' in tokenResult) {
        await this.handleSuccessfulAuth(tokenResult);
        this.pendingOperation = undefined;
        return {
          success: true,
          connected: true,
          requiresMFA: false,
          accounts: this._accounts
        };
      }

      return {
        success: false,
        connected: false,
        requiresMFA: false,
        error: 'Failed to complete authentication'
      };

    } catch (error: any) {
      console.error('[N26] MFA error:', error);
      return {
        success: false,
        connected: false,
        requiresMFA: false,
        error: error.message || 'MFA verification failed'
      };
    }
  }

  /**
   * Fetch transactions for a date range
   */
  async fetchTransactions(
    dateRange: DateRange,
    accountNumber?: string
  ): Promise<FetchResult | { requiresMFA: true; mfaChallenge: MFAChallenge }> {
    if (!this.accessToken) {
      return {
        success: false,
        transactions: [],
        errors: ['Not authenticated. Please connect first.']
      };
    }

    try {
      console.log('[N26] Fetching transactions...');

      // Ensure token is valid
      await this.ensureValidToken();

      // Convert dates to timestamps (N26 uses milliseconds)
      const fromTs = dateRange.startDate.getTime();
      const toTs = dateRange.endDate.getTime();

      // Fetch transactions from N26 API
      const response = await fetch(
        `${N26_API_BASE}/smrt/transactions?from=${fromTs}&to=${toTs}&limit=500`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          this._connected = false;
          return {
            success: false,
            transactions: [],
            errors: ['Session expired. Please reconnect.']
          };
        }
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const n26Transactions: N26Transaction[] = await response.json();
      console.log(`[N26] Fetched ${n26Transactions.length} transactions`);

      // Transform to app format
      const transactions: FetchedTransaction[] = n26Transactions.map(tx =>
        this.transformTransaction(tx)
      );

      return {
        success: true,
        transactions
      };

    } catch (error: any) {
      console.error('[N26] Fetch error:', error);
      return {
        success: false,
        transactions: [],
        errors: [error.message || 'Failed to fetch transactions']
      };
    }
  }

  /**
   * Continue fetch after MFA (not typically needed for N26 transaction fetching)
   */
  async fetchTransactionsWithMFA(code: string, reference: string): Promise<FetchResult> {
    // N26 doesn't require MFA for transaction fetching after initial auth
    // But if it ever does, we'd handle it here
    const dateRange = this.pendingOperation?.dateRange;
    if (!dateRange) {
      return {
        success: false,
        transactions: [],
        errors: ['No pending fetch operation']
      };
    }

    // Submit MFA and retry fetch
    const mfaResult = await this.submitMFA(code, reference);
    if (!mfaResult.connected) {
      return {
        success: false,
        transactions: [],
        errors: [mfaResult.error || 'MFA failed']
      };
    }

    const result = await this.fetchTransactions(dateRange);
    if ('requiresMFA' in result) {
      return {
        success: false,
        transactions: [],
        errors: ['Unexpected MFA requirement']
      };
    }
    return result;
  }

  /**
   * Disconnect from N26
   */
  async disconnect(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = null;
    this.n26Account = null;
    this._connected = false;
    this._accounts = [];
    this.pendingOperation = undefined;
    console.log('[N26] Disconnected');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this._connected && !!this.accessToken;
  }

  /**
   * Get available accounts
   */
  getAccounts(): AccountInfo[] {
    return this._accounts;
  }

  /**
   * Handle successful authentication
   */
  private async handleSuccessfulAuth(tokenResponse: N26TokenResponse): Promise<void> {
    this.accessToken = tokenResponse.access_token;
    this.refreshToken = tokenResponse.refresh_token;
    this.tokenExpiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);
    this._connected = true;

    // Fetch account info
    await this.fetchAccountInfo();
  }

  /**
   * Request OAuth token (initiates MFA flow)
   */
  private async requestToken(): Promise<N26TokenResponse | N26MFAResponse> {
    const params = new URLSearchParams({
      grant_type: 'password',
      username: this.credentials!.userId,
      password: this.credentials!.pin
    });

    const response = await fetch(`${N26_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${N26_CLIENT_ID}:${N26_CLIENT_SECRET}`).toString('base64')}`,
        'Accept': 'application/json',
        'device-token': this.deviceToken
      },
      body: params.toString()
    });

    const data = await response.json();

    // Check for MFA requirement
    if (data.mfaToken || (data.error === 'mfa_required')) {
      return {
        mfaToken: data.mfaToken || data.userMessage?.token,
        hostUrl: data.hostUrl
      };
    }

    // Check for error
    if (data.error) {
      throw new Error(data.error_description || data.error);
    }

    return data as N26TokenResponse;
  }

  /**
   * Complete MFA authentication
   */
  private async completeMFA(mfaToken: string, code?: string): Promise<N26TokenResponse | N26MFAResponse> {
    const params = new URLSearchParams({
      grant_type: 'mfa_oob',
      mfaToken
    });

    // Add OTP code if provided (for SMS)
    if (code && code.trim()) {
      params.set('grant_type', 'mfa_otp');
      params.set('otp', code);
    }

    const response = await fetch(`${N26_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${N26_CLIENT_ID}:${N26_CLIENT_SECRET}`).toString('base64')}`,
        'Accept': 'application/json',
        'device-token': this.deviceToken
      },
      body: params.toString()
    });

    const data = await response.json();

    // Check for pending authorization (app not yet approved)
    if (data.error === 'authorization_pending') {
      return {
        error: 'authorization_pending',
        error_description: 'Waiting for app approval...',
        mfaToken
      };
    }

    // Check for error
    if (data.error && data.error !== 'authorization_pending') {
      return {
        error: data.error,
        error_description: data.error_description,
        mfaToken
      };
    }

    return data as N26TokenResponse;
  }

  /**
   * Fetch account information
   */
  private async fetchAccountInfo(): Promise<void> {
    if (!this.accessToken) return;

    try {
      const response = await fetch(`${N26_API_BASE}/accounts`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        this.n26Account = await response.json();
        console.log('[N26] Account info loaded:', this.n26Account?.iban);

        // Store as standard account info
        if (this.n26Account) {
          this._accounts = [{
            accountNumber: this.n26Account.id,
            iban: this.n26Account.iban,
            bic: this.n26Account.bic,
            accountType: 'current',
            currency: 'EUR',
            ownerName: undefined
          }];
        }
      }
    } catch (error) {
      console.error('[N26] Failed to fetch account info:', error);
    }
  }

  /**
   * Ensure the access token is still valid, refresh if needed
   */
  private async ensureValidToken(): Promise<void> {
    if (!this.tokenExpiresAt || !this.refreshToken) return;

    // Refresh if token expires in less than 5 minutes
    if (this.tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
      console.log('[N26] Refreshing access token...');

      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken
      });

      const response = await fetch(`${N26_API_BASE}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${N26_CLIENT_ID}:${N26_CLIENT_SECRET}`).toString('base64')}`,
          'Accept': 'application/json'
        },
        body: params.toString()
      });

      if (response.ok) {
        const data: N26TokenResponse = await response.json();
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;
        this.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);
        console.log('[N26] Token refreshed successfully');
      }
    }
  }

  /**
   * Transform N26 transaction to app format
   */
  private transformTransaction(tx: N26Transaction): FetchedTransaction {
    // Determine description from various fields
    let description = '';
    if (tx.merchantName) {
      description = tx.merchantName;
    } else if (tx.partnerName) {
      description = tx.partnerName;
    } else if (tx.referenceText) {
      description = tx.referenceText;
    } else {
      description = tx.type || 'N26 Transaction';
    }

    // Add reference text if different from main description
    if (tx.referenceText && tx.referenceText !== description) {
      description += ` - ${tx.referenceText}`;
    }

    // Determine beneficiary/counterparty
    let beneficiary = tx.partnerName || tx.merchantName;
    if (tx.partnerIban) {
      beneficiary = beneficiary ? `${beneficiary} (${tx.partnerIban})` : tx.partnerIban;
    }

    return {
      externalId: tx.id,
      date: new Date(tx.visibleTS),
      description: description.trim(),
      amount: tx.amount,
      beneficiary,
      rawData: {
        type: tx.type,
        merchantCity: tx.merchantCity,
        mcc: tx.mcc,
        originalAmount: tx.originalAmount,
        originalCurrency: tx.originalCurrency,
        exchangeRate: tx.exchangeRate,
        recurring: tx.recurring,
        pending: tx.pending,
        category: tx.category
      }
    };
  }

  /**
   * Simple hash function for generating device token
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

export default N26Connector;
