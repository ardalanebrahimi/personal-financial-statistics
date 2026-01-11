/**
 * Amazon Order History CSV Connector
 *
 * Parses Amazon Order History data exported via Privacy Central.
 * Users need to request their data at: https://www.amazon.com/gp/privacycentral/dsar/preview.html
 *
 * The export contains a ZIP file with Retail.OrderHistory.X folders containing:
 * - Retail.OrderHistory.csv (main order data)
 *
 * CSV columns (Privacy Central format):
 * - Website, Order ID, Order Date, Purchase Order Number, Currency,
 * - Unit Price, Unit Price Tax, Shipping Charge, Total Discounts,
 * - Total Owed, Shipment Item Subtotal, Shipment Item Subtotal Tax,
 * - ASIN, Product Condition, Quantity, Payment Instrument Type,
 * - Order Status, Shipment Status, Ship Date, Shipping Option,
 * - Shipping Address, Billing Address, Carrier Name & Tracking Number,
 * - Product Name, Gift Message, Gift Sender Name, Gift Recipient Contact Details
 */

import { BaseConnector, ConnectorCredentials, DateRange, FetchedTransaction, ConnectResult, FetchResult, AccountInfo } from './base-connector';

// Amazon CSV row structure (Privacy Central format)
interface AmazonOrderRow {
  website?: string;
  orderId: string;
  orderDate: string;
  purchaseOrderNumber?: string;
  currency: string;
  unitPrice: string;
  unitPriceTax?: string;
  shippingCharge?: string;
  totalDiscounts?: string;
  totalOwed?: string;
  shipmentItemSubtotal?: string;
  shipmentItemSubtotalTax?: string;
  asin?: string;
  productCondition?: string;
  quantity: string;
  paymentInstrumentType?: string;
  orderStatus?: string;
  shipmentStatus?: string;
  shipDate?: string;
  shippingOption?: string;
  shippingAddress?: string;
  billingAddress?: string;
  carrierNameTrackingNumber?: string;
  productName: string;
  giftMessage?: string;
  giftSenderName?: string;
  giftRecipientContactDetails?: string;
}

// Alternative format (older Amazon exports or third-party tools)
interface AmazonOrderRowAlt {
  'Order Date': string;
  'Order ID': string;
  Title: string;
  Category?: string;
  'Item Total': string;
  Quantity: string;
  'Payment Method'?: string;
}

export interface AmazonImportResult {
  success: boolean;
  transactions: FetchedTransaction[];
  errors: string[];
  stats: {
    totalRows: number;
    imported: number;
    skipped: number;
    errors: number;
  };
}

export class AmazonConnector extends BaseConnector {
  private csvData: string = '';
  private _isConnected: boolean = false;

  constructor(id: string) {
    super(id);
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

    const result = this.parseCsvData(this.csvData, dateRange);
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
    return this.parseCsvData(csvData, dateRange);
  }

  /**
   * Parse CSV data and extract transactions
   */
  private parseCsvData(csvData: string, dateRange?: DateRange): AmazonImportResult {
    const result: AmazonImportResult = {
      success: false,
      transactions: [],
      errors: [],
      stats: {
        totalRows: 0,
        imported: 0,
        skipped: 0,
        errors: 0
      }
    };

    try {
      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        result.errors.push('CSV file is empty or has no data rows');
        return result;
      }

      const headers = this.parseCSVLine(lines[0]);
      result.stats.totalRows = lines.length - 1;

      // Detect format based on headers
      const format = this.detectFormat(headers);

      if (format === 'unknown') {
        result.errors.push('Unknown CSV format. Expected Amazon Privacy Central export or standard Amazon order export.');
        result.errors.push(`Found headers: ${headers.join(', ')}`);
        return result;
      }

      // Process each data row
      for (let i = 1; i < lines.length; i++) {
        try {
          const values = this.parseCSVLine(lines[i]);
          if (values.length < headers.length / 2) {
            result.stats.skipped++;
            continue;
          }

          const row = this.mapToObject(headers, values);
          const transaction = format === 'privacy_central'
            ? this.parsePrivacyCentralRow(row)
            : this.parseAlternativeRow(row);

          if (!transaction) {
            result.stats.skipped++;
            continue;
          }

          // Apply date filter
          if (dateRange) {
            const txDate = transaction.date;
            if (txDate < dateRange.startDate || txDate > dateRange.endDate) {
              result.stats.skipped++;
              continue;
            }
          }

          result.transactions.push(transaction);
          result.stats.imported++;
        } catch (rowError) {
          result.stats.errors++;
          result.errors.push(`Row ${i + 1}: ${rowError instanceof Error ? rowError.message : 'Parse error'}`);
        }
      }

      result.success = result.stats.imported > 0;

      // Aggregate transactions by order ID (multiple items per order)
      result.transactions = this.aggregateByOrder(result.transactions);

    } catch (error) {
      result.errors.push(`Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Detect CSV format from headers
   */
  private detectFormat(headers: string[]): 'privacy_central' | 'alternative' | 'unknown' {
    const headerLower = headers.map(h => h.toLowerCase().trim());

    // Privacy Central format
    if (headerLower.includes('order id') && headerLower.includes('product name') && headerLower.includes('asin')) {
      return 'privacy_central';
    }

    // Alternative format (older exports, third-party tools)
    if (headerLower.includes('order id') && (headerLower.includes('title') || headerLower.includes('item total'))) {
      return 'alternative';
    }

    // Try to match partial headers
    if (headerLower.some(h => h.includes('order')) && headerLower.some(h => h.includes('price') || h.includes('total'))) {
      return 'alternative';
    }

    return 'unknown';
  }

  /**
   * Parse a CSV line handling quoted values
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  /**
   * Map CSV values to object using headers
   */
  private mapToObject(headers: string[], values: string[]): Record<string, string> {
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header.trim()] = values[index]?.trim() || '';
    });
    return obj;
  }

  /**
   * Parse Privacy Central format row
   */
  private parsePrivacyCentralRow(row: Record<string, string>): FetchedTransaction | null {
    const orderId = row['Order ID'] || row['order id'];
    const productName = row['Product Name'] || row['product name'];
    const orderDateStr = row['Order Date'] || row['order date'];
    const unitPriceStr = row['Unit Price'] || row['unit price'] || row['Total Owed'] || row['total owed'];
    const quantity = row['Quantity'] || row['quantity'] || '1';
    const currency = row['Currency'] || row['currency'] || 'EUR';

    if (!orderId || !productName || !orderDateStr) {
      return null;
    }

    const orderDate = this.parseDate(orderDateStr);
    if (!orderDate) {
      return null;
    }

    const unitPrice = this.parseAmount(unitPriceStr, currency);
    const qty = parseInt(quantity) || 1;
    const totalAmount = unitPrice * qty;

    // Skip zero-amount items (free items, etc.)
    if (totalAmount === 0) {
      return null;
    }

    return {
      externalId: `amazon-${orderId}-${this.hashString(productName)}`,
      date: orderDate,
      description: this.truncate(productName, 200),
      amount: -Math.abs(totalAmount), // Expenses are negative
      beneficiary: 'Amazon',
      rawData: {
        orderId,
        productName,
        quantity: qty,
        unitPrice,
        currency,
        asin: row['ASIN'] || row['asin'],
        orderStatus: row['Order Status'] || row['order status'],
        paymentMethod: row['Payment Instrument Type'] || row['payment instrument type']
      }
    };
  }

  /**
   * Parse alternative format row
   */
  private parseAlternativeRow(row: Record<string, string>): FetchedTransaction | null {
    const orderId = row['Order ID'] || row['order_id'] || row['OrderId'];
    const title = row['Title'] || row['title'] || row['Product Name'] || row['Item'];
    const orderDateStr = row['Order Date'] || row['order_date'] || row['Date'];
    const totalStr = row['Item Total'] || row['Total'] || row['Price'] || row['Amount'];

    if (!orderId || !title || !orderDateStr) {
      return null;
    }

    const orderDate = this.parseDate(orderDateStr);
    if (!orderDate) {
      return null;
    }

    const amount = this.parseAmount(totalStr, 'EUR');
    if (amount === 0) {
      return null;
    }

    return {
      externalId: `amazon-${orderId}-${this.hashString(title)}`,
      date: orderDate,
      description: this.truncate(title, 200),
      amount: -Math.abs(amount),
      beneficiary: 'Amazon',
      rawData: {
        orderId,
        title,
        category: row['Category'] || row['category'],
        paymentMethod: row['Payment Method'] || row['payment_method']
      }
    };
  }

  /**
   * Parse date from various formats
   */
  private parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    // Try ISO format first
    let date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }

    // Try MM/DD/YYYY (US format)
    const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usMatch) {
      date = new Date(parseInt(usMatch[3]), parseInt(usMatch[1]) - 1, parseInt(usMatch[2]));
      if (!isNaN(date.getTime())) return date;
    }

    // Try DD.MM.YYYY (German format)
    const deMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (deMatch) {
      date = new Date(parseInt(deMatch[3]), parseInt(deMatch[2]) - 1, parseInt(deMatch[1]));
      if (!isNaN(date.getTime())) return date;
    }

    // Try DD/MM/YYYY (European format)
    const euMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (euMatch) {
      // Assume European if day > 12
      const first = parseInt(euMatch[1]);
      const second = parseInt(euMatch[2]);
      if (first > 12) {
        date = new Date(parseInt(euMatch[3]), second - 1, first);
        if (!isNaN(date.getTime())) return date;
      }
    }

    // Try YYYY-MM-DD
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      date = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
      if (!isNaN(date.getTime())) return date;
    }

    return null;
  }

  /**
   * Parse amount from string
   */
  private parseAmount(amountStr: string, currency: string): number {
    if (!amountStr) return 0;

    // Remove currency symbols and whitespace
    let cleaned = amountStr
      .replace(/[€$£¥]/g, '')
      .replace(/EUR|USD|GBP/gi, '')
      .trim();

    // Handle German format (1.234,56)
    if (cleaned.includes(',') && cleaned.includes('.')) {
      if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
        // German format
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        // US format with thousands separator
        cleaned = cleaned.replace(/,/g, '');
      }
    } else if (cleaned.includes(',')) {
      // Could be German decimal or US thousands
      const parts = cleaned.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        // Likely German decimal
        cleaned = cleaned.replace(',', '.');
      } else {
        // Likely US thousands separator
        cleaned = cleaned.replace(/,/g, '');
      }
    }

    const amount = parseFloat(cleaned);
    return isNaN(amount) ? 0 : amount;
  }

  /**
   * Aggregate multiple items from same order
   */
  private aggregateByOrder(transactions: FetchedTransaction[]): FetchedTransaction[] {
    const orderMap = new Map<string, FetchedTransaction>();

    for (const tx of transactions) {
      const orderId = (tx.rawData as any)?.orderId;
      if (!orderId) {
        // Keep non-order transactions as-is
        orderMap.set(tx.externalId, tx);
        continue;
      }

      const existing = orderMap.get(orderId);
      if (existing) {
        // Merge into existing order
        existing.amount += tx.amount;
        existing.description = `Amazon Order (${this.countItems(orderMap, orderId) + 1} items)`;

        // Store individual items in rawData
        const items = (existing.rawData as any).items || [
          { name: (existing.rawData as any).productName, amount: existing.amount - tx.amount }
        ];
        items.push({ name: tx.description, amount: tx.amount });
        (existing.rawData as any).items = items;
      } else {
        orderMap.set(orderId, { ...tx });
      }
    }

    return Array.from(orderMap.values());
  }

  private countItems(orderMap: Map<string, FetchedTransaction>, orderId: string): number {
    const tx = orderMap.get(orderId);
    return (tx?.rawData as any)?.items?.length || 1;
  }

  /**
   * Simple string hash for generating unique IDs
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Truncate string to max length
   */
  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }
}

export default AmazonConnector;
