/**
 * PayPal Text File Parser
 *
 * Parses PayPal transaction history exported as plain text from the PayPal app.
 * Format:
 *   Merchant Name
 *   −50,83 €
 *   16 Jan . Automatic Payment
 *   [Optional note in quotes]
 *   [Optional "Repeat" keyword]
 */

import { FetchedTransaction, DateRange } from '../base-connector';

export interface PayPalTextTransaction {
  merchant: string;
  amount: number;
  currency: string;
  date: Date;
  paymentType: string;
  note?: string;
  isRecurring: boolean;
  rawText: string;
}

export interface PayPalTextImportResult {
  success: boolean;
  transactions: FetchedTransaction[];
  errors: string[];
  stats: {
    totalParsed: number;
    imported: number;
    skipped: number;
    errors: number;
    recurring: number;
  };
}

const SECTION_HEADERS = [
  'pending',
  'completed',
  'this week',
  'last week',
  '2 weeks ago',
  '3 weeks ago',
  'earlier this month'
];

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export class PayPalTextParser {
  private currentYear: number = new Date().getFullYear();

  /**
   * Import transactions from PayPal text export
   */
  importFromText(textData: string, dateRange?: DateRange): PayPalTextImportResult {
    const result: PayPalTextImportResult = {
      success: false,
      transactions: [],
      errors: [],
      stats: {
        totalParsed: 0,
        imported: 0,
        skipped: 0,
        errors: 0,
        recurring: 0
      }
    };

    try {
      const lines = textData.split('\n').map(line => line.trim());
      let i = 0;
      let currentMonthYear: { month: number; year: number } | null = null;

      while (i < lines.length) {
        const line = lines[i];

        // Skip empty lines
        if (!line) {
          i++;
          continue;
        }

        // Check for month header (e.g., "Dec 2025", "Nov 2025")
        const monthHeader = this.parseMonthHeader(line);
        if (monthHeader) {
          currentMonthYear = monthHeader;
          i++;
          continue;
        }

        // Skip section headers
        if (this.isSectionHeader(line)) {
          i++;
          continue;
        }

        // Try to parse a transaction block
        const txResult = this.parseTransactionBlock(lines, i, currentMonthYear);
        if (txResult.transaction) {
          result.stats.totalParsed++;

          // Apply date filter
          if (dateRange) {
            const txDate = txResult.transaction.date;
            if (txDate < dateRange.startDate || txDate > dateRange.endDate) {
              result.stats.skipped++;
              i = txResult.nextIndex;
              continue;
            }
          }

          // Convert to FetchedTransaction
          const fetched = this.toFetchedTransaction(txResult.transaction);
          result.transactions.push(fetched);
          result.stats.imported++;

          if (txResult.transaction.isRecurring) {
            result.stats.recurring++;
          }
        } else if (txResult.error) {
          result.stats.errors++;
          result.errors.push(txResult.error);
        }

        i = txResult.nextIndex;
      }

      result.success = result.stats.imported > 0;

    } catch (error) {
      result.errors.push(`Failed to parse text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  private parseMonthHeader(line: string): { month: number; year: number } | null {
    const match = line.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (match) {
      const monthName = match[1].toLowerCase();
      const monthIndex = MONTH_NAMES.indexOf(monthName.substring(0, 3));
      if (monthIndex >= 0) {
        return { month: monthIndex, year: parseInt(match[2]) };
      }
    }
    return null;
  }

  private isSectionHeader(line: string): boolean {
    const lower = line.toLowerCase();
    return SECTION_HEADERS.some(header => lower === header || lower.includes(header));
  }

  private parseTransactionBlock(
    lines: string[],
    startIndex: number,
    currentMonthYear: { month: number; year: number } | null
  ): { transaction: PayPalTextTransaction | null; nextIndex: number; error?: string } {
    let i = startIndex;
    const rawLines: string[] = [];

    // Line 1: Merchant name
    if (i >= lines.length || !lines[i]) {
      return { transaction: null, nextIndex: i + 1 };
    }

    const merchantLine = lines[i];

    // Skip if this looks like a section header or month header
    if (this.isSectionHeader(merchantLine) || this.parseMonthHeader(merchantLine)) {
      return { transaction: null, nextIndex: i + 1 };
    }

    rawLines.push(merchantLine);
    i++;

    // Line 2: Amount (should contain € or $ and look like an amount)
    if (i >= lines.length) {
      return { transaction: null, nextIndex: i };
    }

    const amountLine = lines[i];
    const amountResult = this.parseAmount(amountLine);

    if (!amountResult) {
      // Not a valid transaction block
      return { transaction: null, nextIndex: startIndex + 1 };
    }

    rawLines.push(amountLine);
    i++;

    // Line 3: Date and payment type
    if (i >= lines.length) {
      return { transaction: null, nextIndex: i };
    }

    const dateLine = lines[i];
    const dateResult = this.parseDate(dateLine, currentMonthYear);

    if (!dateResult) {
      return { transaction: null, nextIndex: startIndex + 1 };
    }

    rawLines.push(dateLine);
    i++;

    // Optional: Note in quotes or "Repeat" keyword
    let note: string | undefined;
    let isRecurring = false;

    while (i < lines.length && lines[i]) {
      const nextLine = lines[i];

      // Check for note (starts and ends with quotes)
      if (nextLine.startsWith('"') && nextLine.endsWith('"')) {
        note = nextLine.slice(1, -1);
        rawLines.push(nextLine);
        i++;
        continue;
      }

      // Check for "Repeat" keyword
      if (nextLine.toLowerCase() === 'repeat') {
        isRecurring = true;
        rawLines.push(nextLine);
        i++;
        continue;
      }

      // If the next line looks like a new merchant (not amount, not date pattern)
      break;
    }

    return {
      transaction: {
        merchant: merchantLine,
        amount: amountResult.amount,
        currency: amountResult.currency,
        date: dateResult.date,
        paymentType: dateResult.paymentType,
        note,
        isRecurring,
        rawText: rawLines.join('\n')
      },
      nextIndex: i
    };
  }

  private parseAmount(line: string): { amount: number; currency: string } | null {
    // Match patterns like "−50,83 €", "−$5,66 USD", "+100,00 €"
    const euroMatch = line.match(/^([−+-]?)([\d.,]+)\s*€$/);
    if (euroMatch) {
      const sign = euroMatch[1] === '−' || euroMatch[1] === '-' ? -1 : 1;
      const amount = this.parseGermanNumber(euroMatch[2]);
      if (!isNaN(amount)) {
        return { amount: sign * amount, currency: 'EUR' };
      }
    }

    const usdMatch = line.match(/^([−+-]?)\$([\d.,]+)\s*USD$/);
    if (usdMatch) {
      const sign = usdMatch[1] === '−' || usdMatch[1] === '-' ? -1 : 1;
      const amount = this.parseGermanNumber(usdMatch[2]);
      if (!isNaN(amount)) {
        return { amount: sign * amount, currency: 'USD' };
      }
    }

    // Generic pattern
    const genericMatch = line.match(/^([−+-]?)([\d.,]+)\s*([€$]|EUR|USD)?$/);
    if (genericMatch) {
      const sign = genericMatch[1] === '−' || genericMatch[1] === '-' ? -1 : 1;
      const amount = this.parseGermanNumber(genericMatch[2]);
      const currency = genericMatch[3]?.replace('$', 'USD').replace('€', 'EUR') || 'EUR';
      if (!isNaN(amount)) {
        return { amount: sign * amount, currency };
      }
    }

    return null;
  }

  private parseGermanNumber(str: string): number {
    const cleaned = str.replace(/\./g, '').replace(',', '.');
    return parseFloat(cleaned);
  }

  private parseDate(
    line: string,
    currentMonthYear: { month: number; year: number } | null
  ): { date: Date; paymentType: string } | null {
    // Pattern: "16 Jan . Payment - Google Pay" or "Today, 17 Jan . Authorization"
    const match = line.match(/^(?:Today,\s*)?(\d{1,2})\s+([A-Za-z]+)\s*\.\s*(.+)$/);
    if (!match) {
      return null;
    }

    const day = parseInt(match[1]);
    const monthStr = match[2].toLowerCase();
    const paymentType = match[3].trim();

    const monthIndex = MONTH_NAMES.indexOf(monthStr.substring(0, 3));
    if (monthIndex < 0) {
      return null;
    }

    // Determine year
    let year = this.currentYear;
    if (currentMonthYear) {
      year = currentMonthYear.year;
      // If the parsed month is after the current month header, it's from the previous year
      if (monthIndex > currentMonthYear.month) {
        year = currentMonthYear.year - 1;
      }
    } else {
      // No month header context - use current year logic
      const today = new Date();
      const currentMonth = today.getMonth();
      // If month is in the future, it's from last year
      if (monthIndex > currentMonth) {
        year = this.currentYear - 1;
      }
    }

    const date = new Date(year, monthIndex, day);
    if (isNaN(date.getTime())) {
      return null;
    }

    return { date, paymentType };
  }

  private toFetchedTransaction(tx: PayPalTextTransaction): FetchedTransaction {
    const externalId = `paypal-${tx.date.toISOString().split('T')[0]}-${this.hashString(tx.merchant + tx.amount)}`;

    let description = tx.merchant;
    if (tx.note) {
      description = `${tx.merchant} - ${tx.note}`;
    }

    return {
      externalId,
      date: tx.date,
      description,
      amount: tx.amount,
      beneficiary: tx.merchant,
      rawData: {
        merchant: tx.merchant,
        amount: tx.amount,
        currency: tx.currency,
        paymentType: tx.paymentType,
        note: tx.note,
        isRecurring: tx.isRecurring,
        rawText: tx.rawText
      }
    };
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
}
