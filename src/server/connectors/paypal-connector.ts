/**
 * PayPal Connector
 *
 * Connects to PayPal using browser automation since the official REST API
 * requires a Business account for transaction history access.
 *
 * Uses Puppeteer with Chrome profile for credential auto-fill.
 *
 * Key pages:
 * - Login: https://www.paypal.com/signin
 * - Activity: https://www.paypal.com/myaccount/transactions
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
import { getBrowserService } from '../browser';
import { Page } from 'puppeteer';

// PayPal URLs
const PAYPAL_LOGIN_URL = 'https://www.paypal.com/signin';
const PAYPAL_ACTIVITY_URL = 'https://www.paypal.com/myaccount/transactions';
const PAYPAL_SUMMARY_URL = 'https://www.paypal.com/myaccount/summary';

// Selectors for PayPal pages
const SELECTORS = {
  // Login page
  emailInput: '#email',
  passwordInput: '#password',
  nextButton: '#btnNext',
  loginButton: '#btnLogin',

  // MFA page
  mfaCodeInput: '#otpCode, #security-code, input[name="security_code"]',
  mfaSubmitButton: '#btnSubmit, button[type="submit"]',
  mfaMessage: '.mfaDescription, .otp-header-text',

  // Logged in indicators
  loggedInIndicator: '.myAccountTab, [data-testid="account-balance"], .pp-header__account',
  profileName: '.pp-header__full-name, [data-testid="username-label"]',

  // Activity page
  transactionList: '[data-testid="transaction-list"], .js-transactionList, .transaction-list',
  transactionRow: '[data-testid="transaction-row"], .transaction-row, .js-transactionRow',
  loadMoreButton: '[data-testid="load-more-button"], .loadMoreBtn, .js-load-more',

  // Transaction details
  transactionAmount: '[data-testid="transaction-amount"], .transactionAmount',
  transactionDate: '[data-testid="transaction-date"], .transactionDate',
  transactionName: '[data-testid="transaction-name"], .transactionName',
  transactionType: '[data-testid="transaction-type"], .transactionType',
  transactionStatus: '[data-testid="transaction-status"], .transactionStatus',

  // Date filter
  dateFilterButton: '[data-testid="date-filter"], .date-filter-btn',
  customDateOption: '[data-testid="custom-date-range"]',
  startDateInput: '[data-testid="start-date"], input[name="startDate"]',
  endDateInput: '[data-testid="end-date"], input[name="endDate"]',
  applyFilterButton: '[data-testid="apply-filter"], .apply-btn'
};

interface ParsedTransaction {
  id: string;
  date: Date;
  name: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  email?: string;
  note?: string;
}

interface PendingOperation {
  type: 'connect' | 'fetch';
  dateRange?: DateRange;
}

export class PayPalConnector extends BaseConnector {
  private page: Page | null = null;
  private _connected: boolean = false;
  private _accounts: AccountInfo[] = [];
  private pendingOperation?: PendingOperation;
  private balance?: number;

  constructor(connectorId: string) {
    super(connectorId);
  }

  /**
   * Initialize the connector with credentials (optional for browser auth)
   */
  async initialize(credentials: ConnectorCredentials): Promise<void> {
    this.credentials = credentials;
    console.log('[PayPal] Initialized');
  }

  /**
   * Connect to PayPal using browser automation
   */
  async connect(): Promise<ConnectResult> {
    try {
      console.log('[PayPal] Launching browser...');

      const browserService = getBrowserService();
      await browserService.launch(true); // Try to use Chrome profile

      // Create a page for PayPal
      this.page = await browserService.createPage(this.connectorId);

      // Navigate to login page
      console.log('[PayPal] Navigating to login page...');
      await browserService.navigateTo(this.page, PAYPAL_LOGIN_URL);

      // Handle cookie consent if present
      await browserService.handleCookieConsent(this.page);

      // Check if already logged in
      const alreadyLoggedIn = await this.isLoggedIn();
      if (alreadyLoggedIn) {
        console.log('[PayPal] Already logged in from Chrome profile');
        this._connected = true;
        await this.fetchAccountInfo();
        return {
          success: true,
          connected: true,
          requiresMFA: false,
          accounts: this._accounts
        };
      }

      // Wait for user to log in (Chrome auto-fill should help)
      console.log('[PayPal] Waiting for login...');

      // If credentials provided, try to enter them
      if (this.credentials?.userId) {
        try {
          await this.enterCredentials();
        } catch (e) {
          console.log('[PayPal] Auto-login failed, waiting for manual login');
        }
      }

      // Check for MFA
      const mfaResult = await this.checkForMFA();
      if (mfaResult) {
        this.pendingOperation = { type: 'connect' };
        return {
          success: false,
          connected: false,
          requiresMFA: true,
          mfaChallenge: mfaResult
        };
      }

      // Wait for login to complete
      const loginResult = await this.waitForLogin();
      if (!loginResult.success) {
        return {
          success: false,
          connected: false,
          requiresMFA: false,
          error: loginResult.error || 'Login failed'
        };
      }

      this._connected = true;
      await this.fetchAccountInfo();

      return {
        success: true,
        connected: true,
        requiresMFA: false,
        accounts: this._accounts
      };

    } catch (error: any) {
      console.error('[PayPal] Connection error:', error);
      return {
        success: false,
        connected: false,
        requiresMFA: false,
        error: error.message || 'Failed to connect to PayPal'
      };
    }
  }

  /**
   * Submit MFA code
   */
  async submitMFA(code: string, reference?: string): Promise<ConnectResult> {
    if (!this.page) {
      return {
        success: false,
        connected: false,
        requiresMFA: false,
        error: 'No browser session active'
      };
    }

    try {
      console.log('[PayPal] Submitting MFA code...');

      const browserService = getBrowserService();

      // Find and fill MFA code input
      const mfaInput = await this.page.$(SELECTORS.mfaCodeInput);
      if (mfaInput) {
        await browserService.typeHumanLike(this.page, SELECTORS.mfaCodeInput, code);
        await browserService.randomDelay(500, 1000);

        // Click submit button
        const submitBtn = await this.page.$(SELECTORS.mfaSubmitButton);
        if (submitBtn) {
          await submitBtn.click();
        }
      }

      // Wait for login to complete after MFA
      const loginResult = await this.waitForLogin();
      if (!loginResult.success) {
        // Check if another MFA is required
        const mfaResult = await this.checkForMFA();
        if (mfaResult) {
          return {
            success: false,
            connected: false,
            requiresMFA: true,
            mfaChallenge: mfaResult
          };
        }

        return {
          success: false,
          connected: false,
          requiresMFA: false,
          error: loginResult.error || 'MFA verification failed'
        };
      }

      this._connected = true;
      this.pendingOperation = undefined;
      await this.fetchAccountInfo();

      return {
        success: true,
        connected: true,
        requiresMFA: false,
        accounts: this._accounts
      };

    } catch (error: any) {
      console.error('[PayPal] MFA error:', error);
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
    if (!this.page || !this._connected) {
      return {
        success: false,
        transactions: [],
        errors: ['Not connected. Please connect first.']
      };
    }

    try {
      console.log('[PayPal] Fetching transactions...');

      const browserService = getBrowserService();

      // Navigate to activity page
      await browserService.navigateTo(this.page, PAYPAL_ACTIVITY_URL);
      await browserService.randomDelay(2000, 3000);

      // Check if still logged in
      if (!await this.isLoggedIn()) {
        this._connected = false;
        return {
          success: false,
          transactions: [],
          errors: ['Session expired. Please reconnect.']
        };
      }

      // Set date filter
      await this.setDateFilter(dateRange);

      // Scrape transactions
      const transactions = await this.scrapeTransactions();

      console.log(`[PayPal] Fetched ${transactions.length} transactions`);

      return {
        success: true,
        transactions
      };

    } catch (error: any) {
      console.error('[PayPal] Fetch error:', error);
      return {
        success: false,
        transactions: [],
        errors: [error.message || 'Failed to fetch transactions']
      };
    }
  }

  /**
   * Continue fetch after MFA
   */
  async fetchTransactionsWithMFA(code: string, reference: string): Promise<FetchResult> {
    const dateRange = this.pendingOperation?.dateRange;
    if (!dateRange) {
      return {
        success: false,
        transactions: [],
        errors: ['No pending fetch operation']
      };
    }

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
   * Disconnect from PayPal
   */
  async disconnect(): Promise<void> {
    const browserService = getBrowserService();
    await browserService.closePage(this.connectorId);
    this.page = null;
    this._connected = false;
    this._accounts = [];
    this.pendingOperation = undefined;
    console.log('[PayPal] Disconnected');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this._connected && this.page !== null;
  }

  /**
   * Get available accounts
   */
  getAccounts(): AccountInfo[] {
    return this._accounts;
  }

  /**
   * Check if logged in to PayPal
   */
  private async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;

    try {
      // Check if we're on a logged-in page
      const currentUrl = this.page.url();
      if (currentUrl.includes('/myaccount') || currentUrl.includes('/summary')) {
        return true;
      }

      // Check for logged-in indicators
      const indicators = [
        SELECTORS.loggedInIndicator,
        SELECTORS.profileName
      ];

      for (const selector of indicators) {
        const element = await this.page.$(selector);
        if (element) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Enter login credentials
   */
  private async enterCredentials(): Promise<void> {
    if (!this.page || !this.credentials) return;

    const browserService = getBrowserService();

    // Enter email
    const emailInput = await this.page.$(SELECTORS.emailInput);
    if (emailInput) {
      await browserService.typeHumanLike(this.page, SELECTORS.emailInput, this.credentials.userId);
      await browserService.randomDelay(500, 1000);

      // Click next button
      const nextBtn = await this.page.$(SELECTORS.nextButton);
      if (nextBtn) {
        await nextBtn.click();
        await browserService.randomDelay(2000, 3000);
      }
    }

    // Enter password
    if (this.credentials.pin) {
      const passwordInput = await this.page.$(SELECTORS.passwordInput);
      if (passwordInput) {
        await browserService.typeHumanLike(this.page, SELECTORS.passwordInput, this.credentials.pin);
        await browserService.randomDelay(500, 1000);

        // Click login button
        const loginBtn = await this.page.$(SELECTORS.loginButton);
        if (loginBtn) {
          await loginBtn.click();
        }
      }
    }
  }

  /**
   * Check for MFA challenge
   */
  private async checkForMFA(): Promise<MFAChallenge | null> {
    if (!this.page) return null;

    await getBrowserService().randomDelay(2000, 3000);

    // Check for MFA input field
    const mfaInput = await this.page.$(SELECTORS.mfaCodeInput);
    if (mfaInput) {
      // Get MFA message
      let message = 'Please enter the security code sent to your device.';
      const mfaMsgElement = await this.page.$(SELECTORS.mfaMessage);
      if (mfaMsgElement) {
        const msgText = await this.page.evaluate(el => el.textContent, mfaMsgElement);
        if (msgText) {
          message = msgText.trim();
        }
      }

      return {
        type: 'sms',
        message,
        decoupled: false
      };
    }

    return null;
  }

  /**
   * Wait for login to complete
   */
  private async waitForLogin(): Promise<{ success: boolean; error?: string }> {
    if (!this.page) return { success: false, error: 'No browser session' };

    const browserService = getBrowserService();
    const timeout = 120000; // 2 minutes
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check if logged in
      if (await this.isLoggedIn()) {
        return { success: true };
      }

      // Check for error messages
      const errorSelectors = [
        '.notifications-error',
        '.notification--error',
        '[data-testid="error-message"]'
      ];

      for (const selector of errorSelectors) {
        const errorElement = await this.page.$(selector);
        if (errorElement) {
          const errorText = await this.page.evaluate(el => el.textContent, errorElement);
          if (errorText?.trim()) {
            return { success: false, error: errorText.trim() };
          }
        }
      }

      await browserService.randomDelay(1000, 2000);
    }

    return { success: false, error: 'Login timeout - please try again' };
  }

  /**
   * Fetch account info
   */
  private async fetchAccountInfo(): Promise<void> {
    if (!this.page) return;

    try {
      const browserService = getBrowserService();

      // Navigate to summary page
      await browserService.navigateTo(this.page, PAYPAL_SUMMARY_URL);
      await browserService.randomDelay(2000, 3000);

      // Try to get balance
      const balanceSelectors = [
        '[data-testid="balance-amount"]',
        '.balance-value',
        '.js-balance'
      ];

      for (const selector of balanceSelectors) {
        const balanceElement = await this.page.$(selector);
        if (balanceElement) {
          const balanceText = await this.page.evaluate(el => el.textContent, balanceElement);
          if (balanceText) {
            // Parse balance (e.g., "€123.45" or "$123.45")
            const match = balanceText.match(/[€$£]?\s*([\d,]+\.?\d*)/);
            if (match) {
              this.balance = parseFloat(match[1].replace(',', ''));
            }
          }
          break;
        }
      }

      // Get email/account identifier
      let accountId = 'PayPal Account';
      const emailSelectors = [
        '[data-testid="email-address"]',
        '.profile-email'
      ];

      for (const selector of emailSelectors) {
        const emailElement = await this.page.$(selector);
        if (emailElement) {
          const emailText = await this.page.evaluate(el => el.textContent, emailElement);
          if (emailText?.trim()) {
            accountId = emailText.trim();
            break;
          }
        }
      }

      this._accounts = [{
        accountNumber: accountId,
        accountType: 'wallet',
        currency: 'EUR'
      }];

    } catch (error) {
      console.error('[PayPal] Failed to fetch account info:', error);
    }
  }

  /**
   * Set date filter on activity page
   */
  private async setDateFilter(dateRange: DateRange): Promise<void> {
    if (!this.page) return;

    const browserService = getBrowserService();

    try {
      // PayPal's activity page has various date filter implementations
      // Try to use URL parameters for date filtering
      const fromDate = dateRange.startDate.toISOString().split('T')[0];
      const toDate = dateRange.endDate.toISOString().split('T')[0];

      // Try URL-based filtering
      const activityUrl = `${PAYPAL_ACTIVITY_URL}?free_text_search=&activity_from=${fromDate}&activity_to=${toDate}`;
      await browserService.navigateTo(this.page, activityUrl);
      await browserService.randomDelay(2000, 3000);

    } catch (error) {
      console.log('[PayPal] URL-based date filter not supported, using page filter');
      // If URL filtering doesn't work, we'll just scrape all visible transactions
    }
  }

  /**
   * Scrape transactions from the activity page
   */
  private async scrapeTransactions(): Promise<FetchedTransaction[]> {
    if (!this.page) return [];

    const browserService = getBrowserService();
    const transactions: FetchedTransaction[] = [];

    try {
      // Wait for transaction list to load
      await this.page.waitForSelector(SELECTORS.transactionList, { timeout: 10000 }).catch(() => {});

      // Load more transactions if button exists
      let loadMoreAttempts = 0;
      while (loadMoreAttempts < 10) {
        const loadMoreBtn = await this.page.$(SELECTORS.loadMoreButton);
        if (loadMoreBtn) {
          await loadMoreBtn.click();
          await browserService.randomDelay(2000, 3000);
          loadMoreAttempts++;
        } else {
          break;
        }
      }

      // Scrape transactions from the DOM
      const scraped = await this.page.evaluate(() => {
        const txElements = document.querySelectorAll('[data-testid="transaction-row"], .transaction-row, .js-transactionRow');
        const results: Array<{
          id: string;
          date: string;
          name: string;
          type: string;
          amount: string;
          status: string;
        }> = [];

        txElements.forEach((el, index) => {
          try {
            // Try various selectors for transaction data
            const dateEl = el.querySelector('[data-testid="transaction-date"], .transactionDate, .date');
            const nameEl = el.querySelector('[data-testid="transaction-name"], .transactionName, .name');
            const amountEl = el.querySelector('[data-testid="transaction-amount"], .transactionAmount, .amount');
            const typeEl = el.querySelector('[data-testid="transaction-type"], .transactionType, .type');
            const statusEl = el.querySelector('[data-testid="transaction-status"], .transactionStatus, .status');

            // Extract transaction ID from data attribute or generate one
            const id = el.getAttribute('data-transaction-id') ||
                       el.getAttribute('data-testid') ||
                       `paypal-tx-${index}`;

            results.push({
              id,
              date: dateEl?.textContent?.trim() || '',
              name: nameEl?.textContent?.trim() || '',
              type: typeEl?.textContent?.trim() || '',
              amount: amountEl?.textContent?.trim() || '',
              status: statusEl?.textContent?.trim() || ''
            });
          } catch {
            // Skip problematic elements
          }
        });

        return results;
      });

      // Transform scraped data
      for (const tx of scraped) {
        try {
          const parsed = this.parseTransactionData(tx);
          if (parsed) {
            transactions.push(parsed);
          }
        } catch (error) {
          console.log('[PayPal] Failed to parse transaction:', tx, error);
        }
      }

    } catch (error) {
      console.error('[PayPal] Error scraping transactions:', error);
    }

    return transactions;
  }

  /**
   * Parse raw transaction data into FetchedTransaction format
   */
  private parseTransactionData(raw: {
    id: string;
    date: string;
    name: string;
    type: string;
    amount: string;
    status: string;
  }): FetchedTransaction | null {
    // Parse date (various formats possible)
    let date: Date;
    try {
      // Try common formats
      const dateStr = raw.date;
      if (dateStr.includes('/')) {
        // MM/DD/YYYY or DD/MM/YYYY
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          // Assume MM/DD/YYYY for US PayPal
          date = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
        } else {
          date = new Date(dateStr);
        }
      } else {
        date = new Date(dateStr);
      }

      if (isNaN(date.getTime())) {
        date = new Date(); // Fallback to current date
      }
    } catch {
      date = new Date();
    }

    // Parse amount
    let amount = 0;
    try {
      // Extract number from amount string (e.g., "-€12.34", "+$56.78")
      const amountMatch = raw.amount.match(/([+-])?\s*[€$£]?\s*([\d,]+\.?\d*)/);
      if (amountMatch) {
        const sign = amountMatch[1] === '-' ? -1 : 1;
        amount = sign * parseFloat(amountMatch[2].replace(',', ''));
      }
    } catch {
      // Keep amount as 0
    }

    // Skip if no meaningful data
    if (!raw.name && !raw.amount) {
      return null;
    }

    // Build description
    let description = raw.name || 'PayPal Transaction';
    if (raw.type && raw.type !== description) {
      description = `${raw.type}: ${raw.name}`;
    }

    return {
      externalId: raw.id,
      date,
      description,
      amount,
      beneficiary: raw.name,
      rawData: {
        type: raw.type,
        status: raw.status,
        originalAmount: raw.amount
      }
    };
  }
}

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

export default PayPalConnector;
