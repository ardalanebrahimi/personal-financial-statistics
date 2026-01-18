/**
 * Amazon Order History CSV Connector
 *
 * Parses Amazon Order History data exported via Privacy Central.
 * Uses AmazonCsvParser for parsing logic.
 */

import { BaseConnector, ConnectorCredentials, DateRange, FetchedTransaction, ConnectResult, FetchResult, AccountInfo } from './base-connector';
import { AmazonCsvParser, AmazonImportResult } from './parsers/amazon-parser';

// Re-export parser types for backward compatibility
export { AmazonImportResult } from './parsers/amazon-parser';

export class AmazonConnector extends BaseConnector {
  private csvData: string = '';
  private _isConnected: boolean = false;
  private parser: AmazonCsvParser;

  constructor(id: string) {
    super(id);
    this.parser = new AmazonCsvParser();
  }

  async initialize(credentials: ConnectorCredentials): Promise<void> {
    // CSV connector doesn't need credentials
  }

  async connect(): Promise<ConnectResult> {
    // CSV connector is always "connected" - just needs data
    this._isConnected = true;
    return {
      success: true,
      connected: true,
      requiresMFA: false
    };
  }

  async submitMFA(code: string, reference?: string): Promise<ConnectResult> {
    // CSV connector doesn't use MFA
    return { success: true, connected: true, requiresMFA: false };
  }

  async fetchTransactions(dateRange: DateRange): Promise<FetchResult> {
    // This method expects csvData to be set via setCsvData first
    if (!this.csvData) {
      return {
        success: false,
        transactions: [],
        errors: ['No CSV data provided. Use importFromCsv() instead.']
      };
    }

    const result = this.parser.parseOrdersCsv(this.csvData, dateRange);
    return {
      success: result.success,
      transactions: result.transactions,
      errors: result.errors
    };
  }

  async fetchTransactionsWithMFA(code: string, reference: string): Promise<FetchResult> {
    // CSV connector doesn't use MFA
    return {
      success: false,
      transactions: [],
      errors: ['MFA not supported for CSV import']
    };
  }

  async disconnect(): Promise<void> {
    this.csvData = '';
    this._isConnected = false;
  }

  isConnected(): boolean {
    return this._isConnected;
  }

  getAccounts(): AccountInfo[] {
    return [{
      accountNumber: 'amazon',
      accountType: 'order_history',
      currency: 'EUR',
      ownerName: 'Amazon Order History'
    }];
  }

  /**
   * Set CSV data for processing
   */
  setCsvData(csvData: string): void {
    this.csvData = csvData;
  }

  /**
   * Import transactions directly from CSV string
   */
  importFromCsv(csvData: string, dateRange?: DateRange): AmazonImportResult {
    return this.parser.parseOrdersCsv(csvData, dateRange);
  }

  /**
   * Import refunds/returns from CSV string
   */
  importRefundsFromCsv(csvData: string, dateRange?: DateRange): AmazonImportResult {
    return this.parser.parseRefundsCsv(csvData, dateRange);
  }
}

export default AmazonConnector;
