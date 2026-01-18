/**
 * Amazon Order History CSV Parser
 *
 * Parses Amazon Order History data exported via Privacy Central.
 * Users need to request their data at: https://www.amazon.com/gp/privacycentral/dsar/preview.html
 *
 * The export contains a ZIP file with Retail.OrderHistory.X folders containing:
 * - Retail.OrderHistory.csv (main order data)
 * - Retail.OrderHistory.Refunds.csv (refunds data)
 */

import { FetchedTransaction, DateRange } from '../base-connector';

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

export class AmazonCsvParser {
  /**
   * Parse CSV data and extract transactions
   */
  parseOrdersCsv(csvData: string, dateRange?: DateRange): AmazonImportResult {
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
   * Parse refunds/returns from CSV string
   */
  parseRefundsCsv(csvData: string, dateRange?: DateRange): AmazonImportResult {
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

      // Check if this looks like a returns/refunds file
      const headerLower = headers.map(h => h.toLowerCase().trim());
      const isReturnsFile = headerLower.some(h =>
        h.includes('return') || h.includes('refund') || h.includes('dateofreturn')
      );

      if (!isReturnsFile) {
        result.errors.push('This does not appear to be a returns/refunds CSV. Expected columns with "return" or "refund" in the name.');
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
          const transaction = this.parseRefundRow(row);

          if (!transaction) {
            result.stats.skipped++;
            continue;
          }

          // Apply date filter (use refund date)
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

    } catch (error) {
      result.errors.push(`Failed to parse refunds CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
  parseCSVLine(line: string): string[] {
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
   *
   * IMPORTANT: Use 'Total Owed' column for the actual charged amount, NOT 'Unit Price'.
   * 'Unit Price' is just the item price before shipping, tax, and discounts.
   * 'Total Owed' is what was actually charged to the payment method.
   */
  private parsePrivacyCentralRow(row: Record<string, string>): FetchedTransaction | null {
    const orderId = row['Order ID'] || row['order id'];
    const productName = row['Product Name'] || row['product name'];
    const orderDateStr = row['Order Date'] || row['order date'];
    const currency = row['Currency'] || row['currency'] || 'EUR';
    const quantity = row['Quantity'] || row['quantity'] || '1';

    // Use Total Owed as the primary amount - this is what was actually charged
    const totalOwedStr = row['Total Owed'] || row['total owed'];
    const unitPriceStr = row['Unit Price'] || row['unit price'];
    const unitPriceTaxStr = row['Unit Price Tax'] || row['unit price tax'];
    const shippingStr = row['Shipping Charge'] || row['shipping charge'];
    const discountsStr = row['Total Discounts'] || row['total discounts'];
    const shipmentSubtotalStr = row['Shipment Item Subtotal'] || row['shipment item subtotal'];
    const shipmentSubtotalTaxStr = row['Shipment Item Subtotal Tax'] || row['shipment item subtotal tax'];

    if (!orderId || !productName || !orderDateStr) {
      return null;
    }

    const orderDate = this.parseDate(orderDateStr);
    if (!orderDate) {
      return null;
    }

    // Parse all price components
    const totalOwed = this.parseAmount(totalOwedStr, currency);
    const unitPrice = this.parseAmount(unitPriceStr, currency);
    const unitPriceTax = this.parseAmount(unitPriceTaxStr, currency);
    const shipping = this.parseAmount(shippingStr, currency);
    const discounts = this.parseAmount(discountsStr, currency);
    const shipmentSubtotal = this.parseAmount(shipmentSubtotalStr, currency);
    const shipmentSubtotalTax = this.parseAmount(shipmentSubtotalTaxStr, currency);
    const qty = parseInt(quantity) || 1;

    // Determine the actual total amount to use
    let totalAmount: number;
    if (totalOwed > 0) {
      totalAmount = totalOwed;
    } else if (shipmentSubtotal > 0) {
      totalAmount = shipmentSubtotal + shipmentSubtotalTax;
    } else {
      totalAmount = (unitPrice * qty) + unitPriceTax + shipping - discounts;
    }

    if (totalAmount === 0) {
      return null;
    }

    return {
      externalId: `amazon-${orderId}-${this.hashString(productName)}`,
      date: orderDate,
      description: this.truncate(productName, 200),
      amount: -Math.abs(totalAmount),
      beneficiary: 'Amazon',
      rawData: {
        orderId,
        productName,
        quantity: qty,
        unitPrice,
        unitPriceTax,
        shipping,
        discounts,
        totalOwed,
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
   * Parse a single refund/return row
   */
  private parseRefundRow(row: Record<string, string>): FetchedTransaction | null {
    const orderId = row['OrderId'] || row['Order ID'] || row['order id'] || row['order_id'];
    const dateStr = row['DateOfReturn'] || row['Date Of Return'] || row['dateofreturn'] ||
                    row['Refund Date'] || row['refund date'] || row['RefundDate'];
    const returnAmountStr = row['ReturnAmount'] || row['Return Amount'] || row['returnamount'] ||
                            row['Refund Amount'] || row['refund amount'] || row['RefundAmount'];
    const currency = row['ReturnAmountCurrency'] || row['Return Amount Currency'] ||
                     row['Currency'] || row['currency'] || 'EUR';
    const returnReason = row['ReturnReason'] || row['Return Reason'] || row['returnreason'] ||
                         row['Refund Reason'] || row['refund reason'];
    const resolution = row['Resolution'] || row['resolution'];
    const contractId = row['ContractId'] || row['Contract Id'] || row['contractid'];

    if (!orderId || !dateStr) {
      return null;
    }

    const returnDate = this.parseDate(dateStr);
    if (!returnDate) {
      return null;
    }

    const returnAmount = this.parseAmount(returnAmountStr, currency);
    if (returnAmount === 0) {
      return null;
    }

    let description = `Amazon Return: Order ${orderId}`;
    if (returnReason) {
      description += ` - ${this.truncate(returnReason, 100)}`;
    }
    if (resolution && resolution.toLowerCase() === 'refund') {
      description = description.replace('Return:', 'Refund:');
    }

    return {
      externalId: `amazon-return-${orderId}-${contractId || returnDate.getTime()}`,
      date: returnDate,
      description,
      amount: Math.abs(returnAmount),
      beneficiary: 'Amazon Refund',
      rawData: {
        orderId,
        contractId,
        returnAmount,
        returnReason,
        resolution,
        currency,
        isRefund: true
      }
    };
  }

  /**
   * Parse date from various formats
   */
  parseDate(dateStr: string): Date | null {
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
  parseAmount(amountStr: string, currency: string): number {
    if (!amountStr) return 0;

    let cleaned = amountStr
      .replace(/[€$£¥]/g, '')
      .replace(/EUR|USD|GBP/gi, '')
      .trim();

    // Handle German format (1.234,56)
    if (cleaned.includes(',') && cleaned.includes('.')) {
      if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        cleaned = cleaned.replace(/,/g, '');
      }
    } else if (cleaned.includes(',')) {
      const parts = cleaned.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        cleaned = cleaned.replace(',', '.');
      } else {
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
        orderMap.set(tx.externalId, tx);
        continue;
      }

      const existing = orderMap.get(orderId);
      if (existing) {
        existing.amount += tx.amount;
        existing.description = `Amazon Order (${this.countItems(orderMap, orderId) + 1} items)`;

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

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }
}
