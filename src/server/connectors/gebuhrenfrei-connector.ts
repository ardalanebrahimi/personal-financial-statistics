/**
 * Gebührfrei Mastercard Gold Connector (Advanzia Bank)
 *
 * Connects to the Advanzia Bank portal using browser automation.
 * Portal: https://mein.gebuhrenfrei.com
 *
 * Authentication:
 * - Username/Password login
 * - SMS code or Advanzia App for 2FA
 *
 * Features:
 * - View credit card transactions
 * - View current balance and credit limit
 * - Access PDF statements
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

// Advanzia Portal URLs
const ADVANZIA_BASE_URL = 'https://mein.gebuhrenfrei.com';
const ADVANZIA_LOGIN_URL = `${ADVANZIA_BASE_URL}/meine.karte-Login/`;
const ADVANZIA_DASHBOARD_URL = `${ADVANZIA_BASE_URL}/dashboard`;
const ADVANZIA_TRANSACTIONS_URL = `${ADVANZIA_BASE_URL}/transactions`;
const ADVANZIA_STATEMENTS_URL = `${ADVANZIA_BASE_URL}/statements`;

// Selectors for Advanzia portal (these may need adjustment based on actual page structure)
const SELECTORS = {
  // Login page
  usernameInput: '#username, input[name="username"], input[type="text"]',
  passwordInput: '#password, input[name="password"], input[type="password"]',
  loginButton: 'button[type="submit"], .login-button, #loginButton',

  // MFA page
  mfaSmsOption: '.sms-option, [data-method="sms"], button[data-method="sms"]',
  mfaAppOption: '.app-option, [data-method="app"], button[data-method="app"]',
  mfaCodeInput: '#code, input[name="code"], input[name="otp"], .otp-input',
  mfaSubmitButton: 'button[type="submit"], .submit-button, #verifyButton',
  mfaMessage: '.mfa-message, .verification-message, .otp-description',

  // Dashboard/logged in indicators
  loggedInIndicator: '.dashboard, .account-overview, [data-testid="dashboard"]',
  balanceElement: '.balance, .current-balance, [data-testid="balance"]',
  creditLimitElement: '.credit-limit, [data-testid="credit-limit"]',
  cardNumberElement: '.card-number, [data-testid="card-number"]',

  // Transactions page
  transactionList: '.transactions-list, .transaction-table, table',
  transactionRow: '.transaction-row, tr[data-transaction], tbody tr',
  transactionDate: '.transaction-date, td:nth-child(1)',
  transactionDescription: '.transaction-description, td:nth-child(2)',
  transactionAmount: '.transaction-amount, td:nth-child(3)',
  transactionStatus: '.transaction-status, td:nth-child(4)',

  // Navigation
  transactionsLink: 'a[href*="transaction"], .nav-transactions',
  statementsLink: 'a[href*="statement"], .nav-statements',

  // Date filter
  dateFilterFrom: 'input[name="fromDate"], #fromDate',
  dateFilterTo: 'input[name="toDate"], #toDate',
  applyFilterButton: '.apply-filter, button[type="submit"]',

  // Pagination
  nextPageButton: '.pagination-next, .next-page, [aria-label="Next"]',
  loadMoreButton: '.load-more, [class*="load-more"], button.more'
};

interface PendingOperation {
  type: 'connect' | 'fetch';
  dateRange?: DateRange;
}

export class GebuhrenfreiConnector extends BaseConnector {
  private page: Page | null = null;
  private _connected: boolean = false;
  private _accounts: AccountInfo[] = [];
  private pendingOperation?: PendingOperation;
  private balance?: number;
  private creditLimit?: number;
  private cardNumber?: string;

  constructor(connectorId: string) {
    super(connectorId);
  }

  /**
   * Initialize the connector with credentials
   */
  async initialize(credentials: ConnectorCredentials): Promise<void> {
    this.credentials = credentials;
    console.log('[Gebührenfrei] Initialized');
  }

  /**
   * Connect to Advanzia portal using browser automation
   */
  async connect(): Promise<ConnectResult> {
    try {
      console.log('[Gebührenfrei] Launching browser...');

      const browserService = getBrowserService();
      await browserService.launch(true); // Try to use Chrome profile

      // Create a page for Advanzia
      this.page = await browserService.createPage(this.connectorId);

      // Navigate to login page
      console.log('[Gebührenfrei] Navigating to login page...');
      await browserService.navigateTo(this.page, ADVANZIA_LOGIN_URL);

      // Handle cookie consent if present
      await browserService.handleCookieConsent(this.page);

      // Check if already logged in
      const alreadyLoggedIn = await this.isLoggedIn();
      if (alreadyLoggedIn) {
        console.log('[Gebührenfrei] Already logged in from Chrome profile');
        this._connected = true;
        await this.fetchAccountInfo();
        return {
          success: true,
          connected: true,
          requiresMFA: false,
          accounts: this._accounts
        };
      }

      // Enter credentials if provided
      if (this.credentials?.userId && this.credentials?.pin) {
        try {
          await this.enterCredentials();
        } catch (e) {
          console.log('[Gebührenfrei] Auto-login failed, waiting for manual login');
        }
      }

      // Wait a bit for page to process
      await browserService.randomDelay(2000, 3000);

      // Check for MFA requirement
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
      console.error('[Gebührenfrei] Connection error:', error);
      return {
        success: false,
        connected: false,
        requiresMFA: false,
        error: error.message || 'Failed to connect to Advanzia'
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
      console.log('[Gebührenfrei] Submitting MFA code...');

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
      await browserService.randomDelay(2000, 3000);

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
      console.error('[Gebührenfrei] MFA error:', error);
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
      console.log('[Gebührenfrei] Fetching transactions...');

      const browserService = getBrowserService();

      // Navigate to transactions page
      await this.navigateToTransactions();
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

      // Try to set date filter
      await this.setDateFilter(dateRange);

      // Scrape transactions
      const transactions = await this.scrapeTransactions();

      console.log(`[Gebührenfrei] Fetched ${transactions.length} transactions`);

      return {
        success: true,
        transactions
      };

    } catch (error: any) {
      console.error('[Gebührenfrei] Fetch error:', error);
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
   * Disconnect from Advanzia
   */
  async disconnect(): Promise<void> {
    const browserService = getBrowserService();
    await browserService.closePage(this.connectorId);
    this.page = null;
    this._connected = false;
    this._accounts = [];
    this.pendingOperation = undefined;
    console.log('[Gebührenfrei] Disconnected');
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
   * Check if logged in to Advanzia portal
   */
  private async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;

    try {
      // Check URL
      const currentUrl = this.page.url();
      if (currentUrl.includes('/dashboard') ||
          currentUrl.includes('/transactions') ||
          currentUrl.includes('/overview')) {
        return true;
      }

      // Check for logged-in indicators
      const indicators = [
        SELECTORS.loggedInIndicator,
        SELECTORS.balanceElement,
        '.logout-button',
        '[data-testid="user-menu"]'
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

    // Wait for login form
    await this.page.waitForSelector(SELECTORS.usernameInput, { timeout: 10000 }).catch(() => {});

    // Enter username
    const usernameInput = await this.page.$(SELECTORS.usernameInput);
    if (usernameInput) {
      await browserService.typeHumanLike(this.page, SELECTORS.usernameInput, this.credentials.userId);
      await browserService.randomDelay(500, 1000);
    }

    // Enter password
    const passwordInput = await this.page.$(SELECTORS.passwordInput);
    if (passwordInput) {
      await browserService.typeHumanLike(this.page, SELECTORS.passwordInput, this.credentials.pin);
      await browserService.randomDelay(500, 1000);
    }

    // Click login button
    const loginBtn = await this.page.$(SELECTORS.loginButton);
    if (loginBtn) {
      await loginBtn.click();
      console.log('[Gebührenfrei] Login form submitted');
    }
  }

  /**
   * Check for MFA challenge
   */
  private async checkForMFA(): Promise<MFAChallenge | null> {
    if (!this.page) return null;

    const browserService = getBrowserService();
    await browserService.randomDelay(1000, 2000);

    // Check for MFA code input
    const mfaInput = await this.page.$(SELECTORS.mfaCodeInput);
    if (mfaInput) {
      // Get MFA message
      let message = 'Bitte geben Sie den Bestätigungscode ein, der an Ihre Handynummer gesendet wurde.';
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

    // Check for SMS/App selection page
    const smsOption = await this.page.$(SELECTORS.mfaSmsOption);
    const appOption = await this.page.$(SELECTORS.mfaAppOption);

    if (smsOption || appOption) {
      // If both options available, prefer SMS for automation
      if (smsOption) {
        await smsOption.click();
        await browserService.randomDelay(1000, 2000);
        return this.checkForMFA(); // Re-check after selecting SMS
      }

      // App-based authentication (decoupled)
      return {
        type: 'push',
        message: 'Bitte bestätigen Sie die Anmeldung in der Advanzia App.',
        decoupled: true
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
    const timeout = 60000; // 1 minute
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check if logged in
      if (await this.isLoggedIn()) {
        return { success: true };
      }

      // Check for error messages
      const errorSelectors = [
        '.error-message',
        '.alert-danger',
        '[data-testid="error"]',
        '.login-error'
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

    return { success: false, error: 'Login timeout - bitte erneut versuchen' };
  }

  /**
   * Fetch account info (balance, card number, etc.)
   */
  private async fetchAccountInfo(): Promise<void> {
    if (!this.page) return;

    try {
      const browserService = getBrowserService();

      // Try to find balance
      const balanceElement = await this.page.$(SELECTORS.balanceElement);
      if (balanceElement) {
        const balanceText = await this.page.evaluate(el => el.textContent, balanceElement);
        if (balanceText) {
          const match = balanceText.match(/[€$]?\s*([\d.,]+)/);
          if (match) {
            this.balance = parseFloat(match[1].replace('.', '').replace(',', '.'));
          }
        }
      }

      // Try to find credit limit
      const limitElement = await this.page.$(SELECTORS.creditLimitElement);
      if (limitElement) {
        const limitText = await this.page.evaluate(el => el.textContent, limitElement);
        if (limitText) {
          const match = limitText.match(/[€$]?\s*([\d.,]+)/);
          if (match) {
            this.creditLimit = parseFloat(match[1].replace('.', '').replace(',', '.'));
          }
        }
      }

      // Try to find card number (usually masked)
      const cardElement = await this.page.$(SELECTORS.cardNumberElement);
      if (cardElement) {
        const cardText = await this.page.evaluate(el => el.textContent, cardElement);
        if (cardText) {
          this.cardNumber = cardText.trim();
        }
      }

      this._accounts = [{
        accountNumber: this.cardNumber || 'Mastercard Gold',
        accountType: 'credit_card',
        currency: 'EUR'
      }];

    } catch (error) {
      console.error('[Gebührenfrei] Failed to fetch account info:', error);
    }
  }

  /**
   * Navigate to transactions page
   */
  private async navigateToTransactions(): Promise<void> {
    if (!this.page) return;

    const browserService = getBrowserService();

    // Try clicking transactions link
    const txLink = await this.page.$(SELECTORS.transactionsLink);
    if (txLink) {
      await txLink.click();
      await browserService.randomDelay(2000, 3000);
      return;
    }

    // Try direct navigation
    await browserService.navigateTo(this.page, ADVANZIA_TRANSACTIONS_URL);
  }

  /**
   * Set date filter on transactions page
   */
  private async setDateFilter(dateRange: DateRange): Promise<void> {
    if (!this.page) return;

    const browserService = getBrowserService();

    try {
      // Format dates as DD.MM.YYYY (German format)
      const formatDate = (d: Date) => {
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const year = d.getFullYear();
        return `${day}.${month}.${year}`;
      };

      const fromDate = formatDate(dateRange.startDate);
      const toDate = formatDate(dateRange.endDate);

      // Try to fill date filter inputs
      const fromInput = await this.page.$(SELECTORS.dateFilterFrom);
      const toInput = await this.page.$(SELECTORS.dateFilterTo);

      if (fromInput && toInput) {
        // Clear and fill from date
        await fromInput.click({ clickCount: 3 }); // Select all
        await browserService.typeHumanLike(this.page, SELECTORS.dateFilterFrom, fromDate);
        await browserService.randomDelay(300, 500);

        // Clear and fill to date
        await toInput.click({ clickCount: 3 });
        await browserService.typeHumanLike(this.page, SELECTORS.dateFilterTo, toDate);
        await browserService.randomDelay(300, 500);

        // Apply filter
        const applyBtn = await this.page.$(SELECTORS.applyFilterButton);
        if (applyBtn) {
          await applyBtn.click();
          await browserService.randomDelay(2000, 3000);
        }
      }
    } catch (error) {
      console.log('[Gebührenfrei] Date filter not available, fetching all visible transactions');
    }
  }

  /**
   * Scrape transactions from the page
   */
  private async scrapeTransactions(): Promise<FetchedTransaction[]> {
    if (!this.page) return [];

    const browserService = getBrowserService();
    const transactions: FetchedTransaction[] = [];

    try {
      // Wait for transaction table/list to load
      await this.page.waitForSelector(SELECTORS.transactionList, { timeout: 10000 }).catch(() => {});

      // Try to load more transactions if button exists
      let loadMoreAttempts = 0;
      while (loadMoreAttempts < 10) {
        const loadMoreBtn = await this.page.$(SELECTORS.loadMoreButton);
        const nextPageBtn = await this.page.$(SELECTORS.nextPageButton);

        if (loadMoreBtn) {
          await loadMoreBtn.click();
          await browserService.randomDelay(2000, 3000);
          loadMoreAttempts++;
        } else if (nextPageBtn) {
          await nextPageBtn.click();
          await browserService.randomDelay(2000, 3000);
          loadMoreAttempts++;
        } else {
          break;
        }
      }

      // Scrape transactions from the DOM
      const scraped = await this.page.evaluate((selectors) => {
        const rows = document.querySelectorAll(selectors.transactionRow);
        const results: Array<{
          date: string;
          description: string;
          amount: string;
          status: string;
        }> = [];

        rows.forEach((row) => {
          try {
            // Try to extract data from table cells
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
              results.push({
                date: cells[0]?.textContent?.trim() || '',
                description: cells[1]?.textContent?.trim() || '',
                amount: cells[2]?.textContent?.trim() || '',
                status: cells[3]?.textContent?.trim() || ''
              });
            } else {
              // Try specific selectors
              const dateEl = row.querySelector(selectors.transactionDate);
              const descEl = row.querySelector(selectors.transactionDescription);
              const amountEl = row.querySelector(selectors.transactionAmount);
              const statusEl = row.querySelector(selectors.transactionStatus);

              results.push({
                date: dateEl?.textContent?.trim() || '',
                description: descEl?.textContent?.trim() || '',
                amount: amountEl?.textContent?.trim() || '',
                status: statusEl?.textContent?.trim() || ''
              });
            }
          } catch {
            // Skip problematic rows
          }
        });

        return results;
      }, SELECTORS);

      // Transform scraped data
      for (let i = 0; i < scraped.length; i++) {
        const tx = scraped[i];
        try {
          const parsed = this.parseTransaction(tx, i);
          if (parsed) {
            transactions.push(parsed);
          }
        } catch (error) {
          console.log('[Gebührenfrei] Failed to parse transaction:', tx, error);
        }
      }

    } catch (error) {
      console.error('[Gebührenfrei] Error scraping transactions:', error);
    }

    return transactions;
  }

  /**
   * Parse a scraped transaction into FetchedTransaction format
   */
  private parseTransaction(
    raw: { date: string; description: string; amount: string; status: string },
    index: number
  ): FetchedTransaction | null {
    // Skip empty rows
    if (!raw.description && !raw.amount) {
      return null;
    }

    // Parse date (German format DD.MM.YYYY or DD.MM.YY)
    let date: Date;
    try {
      const dateParts = raw.date.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
      if (dateParts) {
        let year = parseInt(dateParts[3]);
        if (year < 100) {
          year += 2000;
        }
        date = new Date(year, parseInt(dateParts[2]) - 1, parseInt(dateParts[1]));
      } else {
        date = new Date(raw.date) || new Date();
      }

      if (isNaN(date.getTime())) {
        date = new Date();
      }
    } catch {
      date = new Date();
    }

    // Parse amount (German format with comma as decimal separator)
    let amount = 0;
    try {
      // Handle formats like "-12,34 €" or "12.345,67 €" or "+ 100,00"
      const amountStr = raw.amount
        .replace('€', '')
        .replace(/\s/g, '')
        .trim();

      const isNegative = amountStr.includes('-');
      const cleanAmount = amountStr
        .replace(/[+-]/g, '')
        .replace('.', '') // Remove thousand separator
        .replace(',', '.'); // Convert decimal separator

      amount = parseFloat(cleanAmount);
      if (isNegative) {
        amount = -amount;
      }

      // Credit card purchases are typically negative (money spent)
      // but some portals show them as positive, so we may need to negate
      if (isNaN(amount)) {
        amount = 0;
      }
    } catch {
      // Keep amount as 0
    }

    // Generate external ID
    const externalId = `gebuhrenfrei-${date.toISOString().split('T')[0]}-${index}-${Math.abs(amount).toFixed(2)}`;

    return {
      externalId,
      date,
      description: raw.description || 'Mastercard Transaction',
      amount,
      beneficiary: raw.description,
      rawData: {
        status: raw.status,
        originalAmount: raw.amount,
        originalDate: raw.date
      }
    };
  }
}

export default GebuhrenfreiConnector;
