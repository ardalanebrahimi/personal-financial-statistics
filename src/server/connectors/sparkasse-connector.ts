/**
 * Sparkasse Connector using FinTS/HBCI protocol
 * Uses lib-fints for communication with German Sparkasse banks
 */

// Dynamic import types - lib-fints is ESM-only
type FinTSClientType = import('lib-fints').FinTSClient;
type FinTSConfigType = import('lib-fints').FinTSConfig;
type BankingInformationType = import('lib-fints').BankingInformation;

// TanMediaRequirement values (matches lib-fints codes)
const TAN_MEDIA_NOT_ALLOWED = 0;
const TAN_MEDIA_OPTIONAL = 1;
const TAN_MEDIA_REQUIRED = 2;

// Module cache for dynamic import
let libFintsModule: typeof import('lib-fints') | null = null;

async function getLibFints(): Promise<typeof import('lib-fints')> {
  if (!libFintsModule) {
    libFintsModule = await import('lib-fints');
  }
  return libFintsModule;
}

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

// Sparkasse bank endpoints by BLZ (verified endpoints)
// Source: https://www.willuhn.de/wiki/doku.php?id=support:list:banken:spk
const SPARKASSE_ENDPOINTS: Record<string, string> = {
  // Berlin
  '10050000': 'https://banking-be3.s-fints-pt-be.de/fints30', // Berliner Sparkasse
  // Hamburg
  '20050550': 'https://banking-hh7.s-fints-pt-hh.de/fints30', // Haspa Hamburg
  // Niedersachsen
  '25050180': 'https://banking.s-fints-pt-ni.de/PinTanServlet', // Sparkasse Hannover
  // NRW
  '37050299': 'https://hbci-pintan-rl.s-hbci.de/PinTanServlet', // Sparkasse Köln
  '30050110': 'https://hbci-pintan-rl.s-hbci.de/PinTanServlet', // Stadtsparkasse Düsseldorf
  // Hessen
  '50850150': 'https://banking-hs3.s-fints-pt-hs.de/fints30', // Sparkasse Darmstadt
  '50050201': 'https://banking-hs3.s-fints-pt-hs.de/fints30', // Frankfurter Sparkasse
  // Baden-Württemberg
  '66050101': 'https://hbci-pintan-bw.s-hbci.de/PinTanServlet', // Sparkasse Karlsruhe
  '60050101': 'https://hbci-pintan-bw.s-hbci.de/PinTanServlet', // BW Bank / Sparkasse Stuttgart
  // Bayern
  '76050101': 'https://hbci-pintan-by.s-hbci.de/PinTanServlet', // Sparkasse Nürnberg
  '70050000': 'https://hbci-pintan-by.s-hbci.de/PinTanServlet', // Sparkasse München
  '71151020': 'https://hbci-pintan-by.s-hbci.de/PinTanServlet', // Sparkasse Altötting-Mühldorf
};

// FinTS Product registration ID
// NOTE: For production use, register at https://www.hbci-zka.de/register/prod_register.htm
// This is a placeholder - real registration is free but required for production
const FINTS_PRODUCT_ID = process.env['FINTS_PRODUCT_ID'] || '9FA6681DEC0CF3046BFC2F8A6';
const FINTS_PRODUCT_VERSION = '1.0.0';

interface PendingOperation {
  type: 'connect' | 'fetch';
  tanReference?: string;
  dateRange?: DateRange;
  accountNumber?: string;
}

export class SparkasseConnector extends BaseConnector {
  private client?: FinTSClientType;
  private config?: FinTSConfigType;
  private bankingInfo?: BankingInformationType;
  private connected: boolean = false;
  private accounts: AccountInfo[] = [];
  private pendingOperation?: PendingOperation;
  private selectedTanMethodId?: number;

  constructor(connectorId: string) {
    super(connectorId);
  }

  /**
   * Get FinTS endpoint URL for a given BLZ
   */
  private getEndpointForBLZ(blz: string): string | null {
    // Check known endpoints
    if (SPARKASSE_ENDPOINTS[blz]) {
      return SPARKASSE_ENDPOINTS[blz];
    }

    // Try to construct endpoint based on BLZ pattern
    // Most Sparkassen use regional servers
    const region = blz.substring(0, 2);

    // Regional fallback endpoints - may not work for all banks
    // For best results, add specific BLZ to SPARKASSE_ENDPOINTS above
    const regionalEndpoints: Record<string, string> = {
      '10': 'https://banking-be3.s-fints-pt-be.de/fints30', // Berlin/Brandenburg
      '20': 'https://banking-hh7.s-fints-pt-hh.de/fints30', // Hamburg
      '25': 'https://banking.s-fints-pt-ni.de/PinTanServlet', // Niedersachsen
      '30': 'https://hbci-pintan-rl.s-hbci.de/PinTanServlet', // NRW
      '37': 'https://hbci-pintan-rl.s-hbci.de/PinTanServlet', // Köln area
      '50': 'https://banking-hs3.s-fints-pt-hs.de/fints30', // Hessen
      '60': 'https://hbci-pintan-bw.s-hbci.de/PinTanServlet', // Baden-Württemberg
      '66': 'https://hbci-pintan-bw.s-hbci.de/PinTanServlet', // Baden-Württemberg
      '70': 'https://hbci-pintan-by.s-hbci.de/PinTanServlet', // Bayern
      '76': 'https://hbci-pintan-by.s-hbci.de/PinTanServlet', // Bayern (Franken)
      '80': 'https://hbci-pintan-by.s-hbci.de/PinTanServlet', // Bayern
      '86': 'https://banking-sn3.s-fints-pt-sn.de/fints30', // Sachsen
    };

    return regionalEndpoints[region] || null;
  }

  async initialize(credentials: ConnectorCredentials): Promise<void> {
    this.credentials = credentials;

    if (!credentials.bankCode) {
      throw new Error('Bank code (BLZ) is required for Sparkasse');
    }

    const endpoint = this.getEndpointForBLZ(credentials.bankCode);
    if (!endpoint) {
      throw new Error(
        `Unknown Sparkasse BLZ: ${credentials.bankCode}. Please check your bank code or contact support.`
      );
    }

    console.log(`[Sparkasse] Initializing connector for BLZ ${credentials.bankCode}`);
    console.log(`[Sparkasse] Using endpoint: ${endpoint}`);

    // Create initial FinTS configuration using dynamic import
    const { FinTSConfig, FinTSClient } = await getLibFints();

    this.config = FinTSConfig.forFirstTimeUse(
      FINTS_PRODUCT_ID,
      FINTS_PRODUCT_VERSION,
      endpoint,
      credentials.bankCode,
      credentials.userId,
      credentials.pin
    );

    this.client = new FinTSClient(this.config);

    // Enable debug logging in development
    if (process.env['NODE_ENV'] === 'development') {
      this.config.debugEnabled = true;
    }
  }

  async connect(): Promise<ConnectResult> {
    if (!this.client || !this.config) {
      return {
        success: false,
        connected: false,
        requiresMFA: false,
        error: 'Connector not initialized. Call initialize() first.'
      };
    }

    try {
      console.log('[Sparkasse] Starting synchronization...');

      // First synchronization to get bank parameters and TAN methods
      let syncResponse = await this.client.synchronize();

      if (!syncResponse.success) {
        const errorMsg = syncResponse.bankAnswers
          .map(a => a.text)
          .join('; ') || 'Synchronization failed';

        console.error('[Sparkasse] Sync failed:', errorMsg);
        return {
          success: false,
          connected: false,
          requiresMFA: false,
          error: errorMsg
        };
      }

      // Check if TAN is required for sync
      if (syncResponse.requiresTan) {
        console.log('[Sparkasse] TAN required for synchronization');
        this.pendingOperation = {
          type: 'connect',
          tanReference: syncResponse.tanReference
        };

        return {
          success: true,
          connected: false,
          requiresMFA: true,
          mfaChallenge: this.createMFAChallenge(
            syncResponse.tanChallenge || 'Please confirm in your banking app',
            syncResponse.tanReference
          )
        };
      }

      // Get available TAN methods
      const bankingInfo = syncResponse.bankingInformation;
      this.bankingInfo = bankingInfo;

      const availableTanMethods = bankingInfo?.bpd?.availableTanMethodIds;
      if (availableTanMethods && availableTanMethods.length > 0) {
        // Select first available TAN method
        // In production, let user choose or prefer decoupled methods
        const tanMethodId = availableTanMethods[0];
        this.selectedTanMethodId = tanMethodId;
        this.client.selectTanMethod(tanMethodId);

        console.log(`[Sparkasse] Selected TAN method: ${tanMethodId}`);

        // Check if TAN media selection is required
        const tanMethod = this.config.selectedTanMethod;
        if (tanMethod?.tanMediaRequirement === TAN_MEDIA_REQUIRED) {
          if (tanMethod.activeTanMedia && tanMethod.activeTanMedia.length > 0) {
            this.client.selectTanMedia(tanMethod.activeTanMedia[0]);
            console.log(`[Sparkasse] Selected TAN media: ${tanMethod.activeTanMedia[0]}`);
          }
        }

        // Re-sync to get account information (UPD)
        syncResponse = await this.client.synchronize();

        if (syncResponse.requiresTan) {
          console.log('[Sparkasse] TAN required after TAN method selection');
          this.pendingOperation = {
            type: 'connect',
            tanReference: syncResponse.tanReference
          };

          return {
            success: true,
            connected: false,
            requiresMFA: true,
            mfaChallenge: this.createMFAChallenge(
              syncResponse.tanChallenge || 'Please confirm in your banking app',
              syncResponse.tanReference
            )
          };
        }
      }

      // Extract account information
      this.accounts = this.extractAccounts();
      this.connected = true;

      console.log(`[Sparkasse] Connected successfully. Found ${this.accounts.length} accounts.`);

      return {
        success: true,
        connected: true,
        requiresMFA: false,
        accounts: this.accounts
      };

    } catch (error) {
      console.error('[Sparkasse] Connection error:', error);
      return {
        success: false,
        connected: false,
        requiresMFA: false,
        error: error instanceof Error ? error.message : 'Unknown connection error'
      };
    }
  }

  async submitMFA(code: string, reference?: string): Promise<ConnectResult> {
    if (!this.client || !this.config) {
      return {
        success: false,
        connected: false,
        requiresMFA: false,
        error: 'Connector not initialized'
      };
    }

    const tanRef = reference || this.pendingOperation?.tanReference;
    if (!tanRef) {
      return {
        success: false,
        connected: false,
        requiresMFA: false,
        error: 'No pending MFA challenge'
      };
    }

    try {
      console.log('[Sparkasse] Submitting TAN...');

      // For decoupled TAN (pushTAN), code might be empty
      // The user confirms in their app, we just need to poll
      const isDecoupled = this.config.selectedTanMethod?.decoupled;

      let syncResponse;
      if (isDecoupled && (!code || code === 'push_confirmed')) {
        // For decoupled TAN, continue without code
        syncResponse = await this.client.synchronizeWithTan(tanRef);
      } else {
        // Traditional TAN entry
        syncResponse = await this.client.synchronizeWithTan(tanRef, code);
      }

      if (!syncResponse.success) {
        const errorMsg = syncResponse.bankAnswers
          .map(a => a.text)
          .join('; ') || 'TAN verification failed';

        return {
          success: false,
          connected: false,
          requiresMFA: false,
          error: errorMsg
        };
      }

      // Check if another TAN is required
      if (syncResponse.requiresTan) {
        this.pendingOperation = {
          type: 'connect',
          tanReference: syncResponse.tanReference
        };

        return {
          success: true,
          connected: false,
          requiresMFA: true,
          mfaChallenge: this.createMFAChallenge(
            syncResponse.tanChallenge || 'Additional verification required',
            syncResponse.tanReference
          )
        };
      }

      // Connection successful
      this.bankingInfo = syncResponse.bankingInformation;
      this.accounts = this.extractAccounts();
      this.connected = true;
      this.pendingOperation = undefined;

      console.log(`[Sparkasse] MFA successful. Found ${this.accounts.length} accounts.`);

      return {
        success: true,
        connected: true,
        requiresMFA: false,
        accounts: this.accounts
      };

    } catch (error) {
      console.error('[Sparkasse] MFA error:', error);
      return {
        success: false,
        connected: false,
        requiresMFA: false,
        error: error instanceof Error ? error.message : 'MFA verification failed'
      };
    }
  }

  async fetchTransactions(
    dateRange: DateRange,
    accountNumber?: string
  ): Promise<FetchResult | { requiresMFA: true; mfaChallenge: MFAChallenge }> {
    if (!this.client || !this.connected) {
      return {
        success: false,
        transactions: [],
        errors: ['Not connected. Please connect first.']
      };
    }

    // Use first account if none specified
    const account = accountNumber || this.accounts[0]?.accountNumber;
    if (!account) {
      return {
        success: false,
        transactions: [],
        errors: ['No account available']
      };
    }

    try {
      console.log(`[Sparkasse] Fetching transactions for account ${account}`);
      console.log(`[Sparkasse] Date range: ${dateRange.startDate.toISOString()} to ${dateRange.endDate.toISOString()}`);

      // Check if we can fetch statements for this account
      if (!this.client.canGetAccountStatements(account)) {
        return {
          success: false,
          transactions: [],
          errors: ['Account statements not available for this account']
        };
      }

      const response = await this.client.getAccountStatements(
        account,
        dateRange.startDate,
        dateRange.endDate
      );

      // Check if TAN is required
      if (response.requiresTan) {
        console.log('[Sparkasse] TAN required for fetching statements');
        this.pendingOperation = {
          type: 'fetch',
          tanReference: response.tanReference,
          dateRange,
          accountNumber: account
        };

        return {
          requiresMFA: true,
          mfaChallenge: this.createMFAChallenge(
            response.tanChallenge || 'Please confirm to fetch transactions',
            response.tanReference
          )
        };
      }

      if (!response.success) {
        const errorMsg = response.bankAnswers
          .map(a => a.text)
          .join('; ') || 'Failed to fetch statements';

        return {
          success: false,
          transactions: [],
          errors: [errorMsg]
        };
      }

      // Parse statements
      const transactions = this.parseStatements(response.statements || []);

      console.log(`[Sparkasse] Fetched ${transactions.length} transactions`);

      return {
        success: true,
        transactions
      };

    } catch (error) {
      console.error('[Sparkasse] Fetch error:', error);
      return {
        success: false,
        transactions: [],
        errors: [error instanceof Error ? error.message : 'Failed to fetch transactions']
      };
    }
  }

  async fetchTransactionsWithMFA(
    code: string,
    reference: string
  ): Promise<FetchResult> {
    if (!this.client || !this.pendingOperation) {
      return {
        success: false,
        transactions: [],
        errors: ['No pending fetch operation']
      };
    }

    try {
      const isDecoupled = this.config?.selectedTanMethod?.decoupled;

      let response;
      if (isDecoupled && (!code || code === 'push_confirmed')) {
        response = await this.client.getAccountStatementsWithTan(reference);
      } else {
        response = await this.client.getAccountStatementsWithTan(reference, code);
      }

      if (!response.success) {
        const errorMsg = response.bankAnswers
          .map(a => a.text)
          .join('; ') || 'TAN verification failed';

        return {
          success: false,
          transactions: [],
          errors: [errorMsg]
        };
      }

      const transactions = this.parseStatements(response.statements || []);
      this.pendingOperation = undefined;

      console.log(`[Sparkasse] Fetched ${transactions.length} transactions after MFA`);

      return {
        success: true,
        transactions
      };

    } catch (error) {
      console.error('[Sparkasse] Fetch with MFA error:', error);
      return {
        success: false,
        transactions: [],
        errors: [error instanceof Error ? error.message : 'Failed to fetch transactions']
      };
    }
  }

  async disconnect(): Promise<void> {
    console.log('[Sparkasse] Disconnecting...');
    this.connected = false;
    this.client = undefined;
    this.config = undefined;
    this.bankingInfo = undefined;
    this.accounts = [];
    this.pendingOperation = undefined;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getAccounts(): AccountInfo[] {
    return this.accounts;
  }

  /**
   * Get stored banking information for session persistence
   */
  getBankingInfo(): BankingInformationType | undefined {
    return this.bankingInfo;
  }

  /**
   * Create MFA challenge object from FinTS response
   */
  private createMFAChallenge(message: string, reference?: string): MFAChallenge {
    const tanMethod = this.config?.selectedTanMethod;

    // Check if it's a decoupled TAN (user confirms in external app)
    // Detection methods:
    // 1. lib-fints decoupled property
    // 2. Message contains phrases indicating app confirmation
    // 3. TAN method name suggests push/app-based confirmation
    const messageLC = message.toLowerCase();
    const tanNameLC = tanMethod?.name?.toLowerCase() || '';

    const isDecoupledByProperty = tanMethod?.decoupled === true;
    const isDecoupledByMessage =
      messageLC.includes('app freigeben') ||
      messageLC.includes('in ihrer app') ||
      messageLC.includes('pushtan') ||
      messageLC.includes('s-pushtan') ||
      messageLC.includes('bestätigen sie') ||
      messageLC.includes('freigabe in der app');
    const isDecoupledByName =
      tanNameLC.includes('push') ||
      tanNameLC.includes('decoupled') ||
      tanNameLC.includes('s-pushtan');

    const isDecoupled = isDecoupledByProperty || isDecoupledByMessage || isDecoupledByName;

    // Determine MFA type based on TAN method
    let type: MFAChallenge['type'] = 'push';

    if (isDecoupled) {
      type = 'decoupled';
    } else if (tanMethod) {
      if (tanNameLC.includes('photo')) {
        type = 'photo_tan';
      } else if (tanNameLC.includes('chip')) {
        type = 'chip_tan';
      } else if (tanNameLC.includes('sms')) {
        type = 'sms';
      } else if (tanNameLC.includes('push') || tanNameLC.includes('app')) {
        type = 'app_tan';
      }
    }

    console.log(`[Sparkasse] Creating MFA challenge - type: ${type}, decoupled: ${isDecoupled}`);
    console.log(`[Sparkasse] Detection: byProperty=${isDecoupledByProperty}, byMessage=${isDecoupledByMessage}, byName=${isDecoupledByName}`);

    return {
      type,
      message,
      reference,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      decoupled: isDecoupled
    };
  }

  /**
   * Extract account information from banking info
   */
  private extractAccounts(): AccountInfo[] {
    const accounts: AccountInfo[] = [];

    if (!this.bankingInfo?.upd?.bankAccounts) {
      return accounts;
    }

    for (const account of this.bankingInfo.upd.bankAccounts) {
      accounts.push({
        accountNumber: account.accountNumber,
        iban: account.iban,
        bic: account.bic,
        accountType: account.accountType?.toString() || 'checking',
        currency: account.currency || 'EUR',
        ownerName: account.holder1
      });
    }

    return accounts;
  }

  /**
   * Parse FinTS statements into our transaction format
   */
  private parseStatements(statements: any[]): FetchedTransaction[] {
    const transactions: FetchedTransaction[] = [];

    for (const statement of statements) {
      // Handle MT940 format (most common)
      if (statement.transactions) {
        for (const tx of statement.transactions) {
          const transaction: FetchedTransaction = {
            externalId: tx.reference || `${tx.date?.toISOString()}-${tx.amount}-${Math.random()}`,
            date: tx.date || new Date(),
            description: this.buildDescription(tx),
            amount: tx.amount || 0,
            beneficiary: tx.partnerName || tx.ultimatePartnerName,
            rawData: tx
          };
          transactions.push(transaction);
        }
      }

      // Handle CAMT format
      if (statement.entries) {
        for (const entry of statement.entries) {
          const transaction: FetchedTransaction = {
            externalId: entry.reference || entry.accountServicerReference ||
                       `${entry.bookingDate?.toISOString()}-${entry.amount}-${Math.random()}`,
            date: entry.bookingDate || entry.valueDate || new Date(),
            description: entry.remittanceInformation || entry.additionalInfo || '',
            amount: entry.creditDebitIndicator === 'CRDT' ?
                   Math.abs(entry.amount) : -Math.abs(entry.amount),
            beneficiary: entry.debtorName || entry.creditorName,
            rawData: entry
          };
          transactions.push(transaction);
        }
      }
    }

    return transactions;
  }

  /**
   * Build description from transaction data
   */
  private buildDescription(tx: any): string {
    const parts: string[] = [];

    if (tx.postingText) {
      parts.push(tx.postingText);
    }
    if (tx.purpose) {
      parts.push(tx.purpose);
    }
    if (tx.partnerName && !parts.some(p => p.includes(tx.partnerName))) {
      parts.push(tx.partnerName);
    }

    return parts.join(' - ') || 'No description';
  }
}

/**
 * Factory function to create Sparkasse connector
 */
export function createSparkasseConnector(connectorId: string): SparkasseConnector {
  return new SparkasseConnector(connectorId);
}
