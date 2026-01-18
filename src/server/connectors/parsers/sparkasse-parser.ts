/**
 * Sparkasse Statement Parser
 *
 * Parses FinTS/HBCI bank statements in various formats:
 * - MT940 (standard bank statement format)
 * - CAMT (ISO 20022 XML format)
 * - Raw booked/pending format
 */

import { FetchedTransaction } from '../base-connector';

export class SparkasseStatementParser {
  /**
   * Parse FinTS statements into FetchedTransaction format
   */
  parseStatements(statements: any[]): FetchedTransaction[] {
    const transactions: FetchedTransaction[] = [];

    console.log(`[SparkasseParser] Parsing ${statements.length} statements`);

    for (const statement of statements) {
      // Debug: Log statement structure
      console.log('[SparkasseParser] Statement keys:', Object.keys(statement));

      // Handle MT940 format (most common)
      if (statement.transactions && Array.isArray(statement.transactions)) {
        console.log(`[SparkasseParser] Found ${statement.transactions.length} MT940 transactions`);
        const parsed = this.parseMT940Transactions(statement.transactions, transactions.length === 0);
        transactions.push(...parsed);
      }

      // Handle CAMT format
      if (statement.entries && Array.isArray(statement.entries)) {
        console.log(`[SparkasseParser] Found ${statement.entries.length} CAMT entries`);
        const parsed = this.parseCAMTEntries(statement.entries, transactions.length === 0);
        transactions.push(...parsed);
      }

      // Handle raw booked/pending format (some FinTS responses)
      if (statement.booked && Array.isArray(statement.booked)) {
        console.log(`[SparkasseParser] Found ${statement.booked.length} booked transactions`);
        const parsed = this.parseBookedTransactions(statement.booked);
        transactions.push(...parsed);
      }
    }

    console.log(`[SparkasseParser] Parsed ${transactions.length} valid transactions`);
    return transactions;
  }

  /**
   * Parse MT940 format transactions
   */
  private parseMT940Transactions(transactions: any[], logSample: boolean): FetchedTransaction[] {
    const results: FetchedTransaction[] = [];

    for (const tx of transactions) {
      // Debug: Log first transaction structure
      if (logSample && results.length === 0) {
        console.log('[SparkasseParser] Sample MT940 transaction keys:', Object.keys(tx));
        console.log('[SparkasseParser] Sample MT940 transaction:', JSON.stringify(tx, null, 2).substring(0, 500));
      }

      // Extract date - try multiple fields
      const txDate = tx.date || tx.bookingDate || tx.valueDate || tx.entryDate;
      const parsedDate = txDate ? new Date(txDate) : null;

      // Extract beneficiary - try multiple fields
      const beneficiary = tx.partnerName || tx.ultimatePartnerName ||
                         tx.creditorName || tx.debtorName ||
                         tx.remittanceCreditorName || tx.remittanceDebtorName ||
                         this.extractBeneficiaryFromPurpose(tx.purpose);

      // Generate stable external ID
      const dateStr = parsedDate ? parsedDate.toISOString().split('T')[0] : 'nodate';
      const externalId = tx.reference || tx.transactionReference ||
                        tx.endToEndReference || tx.mandateReference ||
                        `${dateStr}-${tx.amount}-${this.hashString(tx.purpose || tx.description || '')}`;

      const transaction: FetchedTransaction = {
        externalId,
        date: parsedDate || new Date(),
        description: this.buildDescription(tx),
        amount: tx.amount || 0,
        beneficiary,
        rawData: tx
      };

      // Only add if we have a valid date (not current time)
      if (parsedDate) {
        results.push(transaction);
      } else {
        console.warn('[SparkasseParser] Skipping transaction without valid date:', tx);
      }
    }

    return results;
  }

  /**
   * Parse CAMT format entries
   */
  private parseCAMTEntries(entries: any[], logSample: boolean): FetchedTransaction[] {
    const results: FetchedTransaction[] = [];

    for (const entry of entries) {
      // Debug: Log first entry structure
      if (logSample && results.length === 0) {
        console.log('[SparkasseParser] Sample CAMT entry keys:', Object.keys(entry));
        console.log('[SparkasseParser] Sample CAMT entry:', JSON.stringify(entry, null, 2).substring(0, 500));
      }

      // Extract date
      const entryDate = entry.bookingDate || entry.valueDate || entry.date;
      const parsedDate = entryDate ? new Date(entryDate) : null;

      // Extract beneficiary
      const beneficiary = entry.debtorName || entry.creditorName ||
                         entry.ultimateDebtorName || entry.ultimateCreditorName ||
                         this.extractBeneficiaryFromPurpose(entry.remittanceInformation);

      // Generate stable external ID
      const dateStr = parsedDate ? parsedDate.toISOString().split('T')[0] : 'nodate';
      const externalId = entry.reference || entry.accountServicerReference ||
                        entry.endToEndReference || entry.transactionId ||
                        `${dateStr}-${entry.amount}-${this.hashString(entry.remittanceInformation || '')}`;

      const transaction: FetchedTransaction = {
        externalId,
        date: parsedDate || new Date(),
        description: entry.remittanceInformation || entry.additionalInfo || 'No description',
        amount: entry.creditDebitIndicator === 'CRDT' ?
               Math.abs(entry.amount) : -Math.abs(entry.amount),
        beneficiary,
        rawData: entry
      };

      if (parsedDate) {
        results.push(transaction);
      } else {
        console.warn('[SparkasseParser] Skipping CAMT entry without valid date:', entry);
      }
    }

    return results;
  }

  /**
   * Parse raw booked transactions format
   */
  private parseBookedTransactions(transactions: any[]): FetchedTransaction[] {
    const results: FetchedTransaction[] = [];

    for (const tx of transactions) {
      const txDate = tx.bookingDate || tx.valueDate || tx.date;
      const parsedDate = txDate ? new Date(txDate) : null;

      const beneficiary = tx.creditorName || tx.debtorName ||
                         tx.remittanceCreditorName || tx.ultimateCreditorName ||
                         this.extractBeneficiaryFromPurpose(tx.remittanceInformationUnstructured);

      const dateStr = parsedDate ? parsedDate.toISOString().split('T')[0] : 'nodate';
      const externalId = tx.transactionId || tx.internalTransactionId ||
                        `${dateStr}-${tx.transactionAmount?.amount || tx.amount}-${this.hashString(tx.remittanceInformationUnstructured || '')}`;

      const amount = tx.transactionAmount?.amount || tx.amount || 0;
      const amountValue = typeof amount === 'string' ? parseFloat(amount) : amount;

      const transaction: FetchedTransaction = {
        externalId,
        date: parsedDate || new Date(),
        description: tx.remittanceInformationUnstructured || tx.additionalInformation || 'No description',
        amount: amountValue,
        beneficiary,
        rawData: tx
      };

      if (parsedDate) {
        results.push(transaction);
      }
    }

    return results;
  }

  /**
   * Extract beneficiary from purpose/remittance string
   */
  private extractBeneficiaryFromPurpose(purpose?: string): string | undefined {
    if (!purpose) return undefined;

    // Common patterns in German bank statements
    const patterns = [
      /(?:Auftraggeber|Zahlungsempfänger|Empfänger|Begünstigter):\s*([^,\n]+)/i,
      /(?:von|an|für)\s+([A-Za-z][A-Za-z\s\.]+(?:GmbH|AG|KG|e\.V\.|S\.a\.r\.l\.|Ltd|Inc))/i,
    ];

    for (const pattern of patterns) {
      const match = purpose.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return undefined;
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

  /**
   * Simple hash function for generating stable IDs
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
}
