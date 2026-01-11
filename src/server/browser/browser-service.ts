/**
 * Browser Automation Service
 *
 * Provides Puppeteer-based browser automation with Chrome profile support
 * for credential auto-fill and persistent sessions.
 */

import puppeteer, { Browser, Page, ElementHandle, LaunchOptions } from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface BrowserServiceConfig {
  headless?: boolean;
  userDataDir?: string;
  slowMo?: number;
  defaultTimeout?: number;
  screenshotDir?: string;
}

export interface MFADetectionResult {
  detected: boolean;
  type?: 'sms' | 'email' | 'authenticator' | 'push' | 'unknown';
  inputSelector?: string;
  message?: string;
}

export interface LoginDetectionResult {
  loggedIn: boolean;
  username?: string;
  redirectedTo?: string;
}

// Common MFA patterns found on various banking sites
const MFA_PATTERNS = {
  sms: [
    /sms.*code/i, /code.*sms/i, /tan.*sms/i, /sms.*tan/i,
    /verification.*code/i, /bestätigungscode/i, /sicherheitscode/i
  ],
  email: [
    /email.*code/i, /code.*email/i, /e-mail.*verifizierung/i
  ],
  authenticator: [
    /authenticator/i, /google.*auth/i, /totp/i, /2fa.*code/i
  ],
  push: [
    /push.*notification/i, /app.*bestätigen/i, /freigabe.*app/i,
    /bestätigen.*sie.*app/i, /approve.*app/i
  ]
};

// Cookie consent button patterns
const COOKIE_CONSENT_SELECTORS = [
  '[data-testid="cookie-accept"]',
  '[id*="cookie"] button[id*="accept"]',
  '[class*="cookie"] button[class*="accept"]',
  'button[id*="accept-cookies"]',
  'button[class*="accept-cookies"]',
  '#onetrust-accept-btn-handler',
  '.cc-accept',
  '[aria-label*="accept cookies"]',
  '[aria-label*="akzeptieren"]',
  'button:has-text("Accept")',
  'button:has-text("Akzeptieren")',
  'button:has-text("Alle akzeptieren")',
  'button:has-text("Accept all")'
];

class BrowserService {
  private static instance: BrowserService;
  private browser: Browser | null = null;
  private config: BrowserServiceConfig;
  private pages: Map<string, Page> = new Map();

  private constructor(config: BrowserServiceConfig = {}) {
    this.config = {
      headless: false, // Default to visible browser for credential auto-fill
      slowMo: 50, // Slow down actions for stability
      defaultTimeout: 30000,
      screenshotDir: path.join(os.tmpdir(), 'pfs-screenshots'),
      ...config
    };

    // Create screenshot directory if it doesn't exist
    if (!fs.existsSync(this.config.screenshotDir!)) {
      fs.mkdirSync(this.config.screenshotDir!, { recursive: true });
    }
  }

  /**
   * Get singleton instance of BrowserService
   */
  static getInstance(config?: BrowserServiceConfig): BrowserService {
    if (!BrowserService.instance) {
      BrowserService.instance = new BrowserService(config);
    }
    return BrowserService.instance;
  }

  /**
   * Get the default Chrome user data directory for this platform
   */
  private getDefaultChromeUserDataDir(): string {
    const homeDir = os.homedir();

    switch (process.platform) {
      case 'win32':
        return path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
      case 'darwin':
        return path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome');
      case 'linux':
        return path.join(homeDir, '.config', 'google-chrome');
      default:
        throw new Error(`Unsupported platform: ${process.platform}`);
    }
  }

  /**
   * Get the path to a dedicated Puppeteer profile directory
   * This is used as fallback if the main Chrome profile is locked
   */
  private getPuppeteerProfileDir(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.pfs-browser-profile');
  }

  /**
   * Check if Chrome is running (profile may be locked)
   */
  private async isChromeRunning(): Promise<boolean> {
    return new Promise((resolve) => {
      const { exec } = require('child_process');
      const cmd = process.platform === 'win32'
        ? 'tasklist /FI "IMAGENAME eq chrome.exe"'
        : 'pgrep -x "chrome" || pgrep -x "Google Chrome"';

      exec(cmd, (error: Error | null, stdout: string) => {
        if (error) {
          resolve(false);
          return;
        }
        // On Windows, check if chrome.exe appears in the output
        if (process.platform === 'win32') {
          resolve(stdout.toLowerCase().includes('chrome.exe'));
        } else {
          resolve(stdout.trim().length > 0);
        }
      });
    });
  }

  /**
   * Launch browser with Chrome profile for credential auto-fill
   */
  async launch(useDefaultProfile: boolean = true): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    let userDataDir: string;
    const chromeRunning = await this.isChromeRunning();

    if (useDefaultProfile && !chromeRunning) {
      // Use the user's default Chrome profile (has saved passwords)
      userDataDir = this.config.userDataDir || this.getDefaultChromeUserDataDir();
      console.log('[BrowserService] Using default Chrome profile:', userDataDir);
    } else {
      // Chrome is running or we don't want to use default profile
      // Use dedicated Puppeteer profile
      userDataDir = this.getPuppeteerProfileDir();
      console.log('[BrowserService] Chrome is running or profile specified, using dedicated profile:', userDataDir);

      if (chromeRunning) {
        console.log('[BrowserService] Note: Chrome is running. Using separate profile. Saved passwords from main Chrome won\'t be available.');
      }
    }

    // Ensure user data directory exists
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    const launchOptions: LaunchOptions = {
      headless: this.config.headless,
      userDataDir,
      slowMo: this.config.slowMo,
      defaultViewport: {
        width: 1366,
        height: 768
      },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        `--window-size=1366,768`
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    };

    try {
      this.browser = await puppeteer.launch(launchOptions);
      console.log('[BrowserService] Browser launched successfully');

      // Handle browser disconnect
      this.browser.on('disconnected', () => {
        console.log('[BrowserService] Browser disconnected');
        this.browser = null;
        this.pages.clear();
      });

      return this.browser;
    } catch (error: any) {
      console.error('[BrowserService] Failed to launch browser:', error.message);

      // If launch failed due to profile lock, try with dedicated profile
      if (useDefaultProfile && error.message.includes('lock')) {
        console.log('[BrowserService] Profile appears locked, retrying with dedicated profile...');
        return this.launch(false);
      }

      throw error;
    }
  }

  /**
   * Create a new page/tab with standard configuration
   */
  async createPage(id: string): Promise<Page> {
    if (!this.browser) {
      await this.launch();
    }

    const page = await this.browser!.newPage();

    // Set realistic viewport
    await page.setViewport({
      width: 1366,
      height: 768,
      deviceScaleFactor: 1
    });

    // Set user agent to avoid detection
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set timeout
    page.setDefaultTimeout(this.config.defaultTimeout!);

    // Store page reference
    this.pages.set(id, page);

    return page;
  }

  /**
   * Get an existing page by ID
   */
  getPage(id: string): Page | undefined {
    return this.pages.get(id);
  }

  /**
   * Close a specific page
   */
  async closePage(id: string): Promise<void> {
    const page = this.pages.get(id);
    if (page) {
      await page.close();
      this.pages.delete(id);
    }
  }

  /**
   * Navigate to URL with retry logic
   */
  async navigateTo(page: Page, url: string, waitUntil: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2' = 'networkidle2'): Promise<void> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        await page.goto(url, { waitUntil, timeout: this.config.defaultTimeout });
        await this.randomDelay(500, 1500);
        return;
      } catch (error: any) {
        lastError = error;
        console.log(`[BrowserService] Navigation attempt ${i + 1} failed:`, error.message);
        await this.randomDelay(1000, 2000);
      }
    }

    throw lastError;
  }

  /**
   * Wait for user login to complete
   * Monitors the page for indicators that login was successful
   */
  async waitForLogin(
    page: Page,
    options: {
      successIndicators: string[];  // Selectors or URLs indicating successful login
      failureIndicators?: string[]; // Selectors indicating login failure
      timeout?: number;
      pollInterval?: number;
    }
  ): Promise<LoginDetectionResult> {
    const timeout = options.timeout || 120000; // 2 minutes default
    const pollInterval = options.pollInterval || 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check for success indicators
      for (const indicator of options.successIndicators) {
        // Check if it's a URL pattern
        if (indicator.startsWith('http') || indicator.startsWith('/')) {
          if (page.url().includes(indicator)) {
            return { loggedIn: true, redirectedTo: page.url() };
          }
        } else {
          // It's a selector
          const element = await page.$(indicator);
          if (element) {
            return { loggedIn: true };
          }
        }
      }

      // Check for failure indicators
      if (options.failureIndicators) {
        for (const indicator of options.failureIndicators) {
          const element = await page.$(indicator);
          if (element) {
            const text = await page.evaluate(el => el.textContent, element);
            return { loggedIn: false, username: undefined, redirectedTo: text || undefined };
          }
        }
      }

      await this.randomDelay(pollInterval, pollInterval + 500);
    }

    return { loggedIn: false };
  }

  /**
   * Detect MFA challenge on the current page
   */
  async detectMFA(page: Page): Promise<MFADetectionResult> {
    const pageContent = await page.content();
    const pageText = pageContent.toLowerCase();

    // Check for push notification MFA (no input needed)
    for (const pattern of MFA_PATTERNS.push) {
      if (pattern.test(pageText)) {
        return {
          detected: true,
          type: 'push',
          message: 'Please confirm in your banking app'
        };
      }
    }

    // Check for SMS MFA
    for (const pattern of MFA_PATTERNS.sms) {
      if (pattern.test(pageText)) {
        const inputSelector = await this.findMFAInput(page);
        return {
          detected: true,
          type: 'sms',
          inputSelector,
          message: 'Please enter the SMS code'
        };
      }
    }

    // Check for email MFA
    for (const pattern of MFA_PATTERNS.email) {
      if (pattern.test(pageText)) {
        const inputSelector = await this.findMFAInput(page);
        return {
          detected: true,
          type: 'email',
          inputSelector,
          message: 'Please enter the email code'
        };
      }
    }

    // Check for authenticator MFA
    for (const pattern of MFA_PATTERNS.authenticator) {
      if (pattern.test(pageText)) {
        const inputSelector = await this.findMFAInput(page);
        return {
          detected: true,
          type: 'authenticator',
          inputSelector,
          message: 'Please enter the authenticator code'
        };
      }
    }

    return { detected: false };
  }

  /**
   * Find MFA code input field on the page
   */
  private async findMFAInput(page: Page): Promise<string | undefined> {
    const inputSelectors = [
      'input[type="tel"]',
      'input[type="number"]',
      'input[name*="code"]',
      'input[name*="otp"]',
      'input[name*="tan"]',
      'input[id*="code"]',
      'input[id*="otp"]',
      'input[id*="tan"]',
      'input[placeholder*="code"]',
      'input[autocomplete="one-time-code"]'
    ];

    for (const selector of inputSelectors) {
      const input = await page.$(selector);
      if (input) {
        return selector;
      }
    }

    return undefined;
  }

  /**
   * Handle cookie consent dialogs
   */
  async handleCookieConsent(page: Page): Promise<boolean> {
    console.log('[BrowserService] Checking for cookie consent dialog...');

    for (const selector of COOKIE_CONSENT_SELECTORS) {
      try {
        // Wait briefly for the selector
        const button = await page.$(selector);
        if (button) {
          await this.randomDelay(500, 1000);
          await button.click();
          console.log('[BrowserService] Cookie consent accepted');
          await this.randomDelay(500, 1000);
          return true;
        }
      } catch {
        // Selector not found, continue
      }
    }

    // Try finding by button text content
    try {
      const acceptButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const btn of buttons) {
          const text = btn.textContent?.toLowerCase() || '';
          if (text.includes('accept') || text.includes('akzeptieren') || text.includes('agree')) {
            // Check if it's likely a cookie button (parent has cookie-related class/id)
            let parent: HTMLElement | null = btn.parentElement;
            for (let i = 0; i < 5 && parent; i++) {
              const id = parent.id?.toLowerCase() || '';
              const className = parent.className?.toLowerCase() || '';
              if (id.includes('cookie') || className.includes('cookie') ||
                  id.includes('consent') || className.includes('consent')) {
                return btn;
              }
              parent = parent.parentElement;
            }
          }
        }
        return null;
      });

      if (acceptButton && acceptButton.asElement()) {
        await this.randomDelay(500, 1000);
        await (acceptButton as ElementHandle<Element>).click();
        console.log('[BrowserService] Cookie consent accepted (by text search)');
        await this.randomDelay(500, 1000);
        return true;
      }
    } catch {
      // No cookie consent found
    }

    console.log('[BrowserService] No cookie consent dialog found');
    return false;
  }

  /**
   * Type text with human-like delays
   */
  async typeHumanLike(page: Page, selector: string, text: string): Promise<void> {
    await page.click(selector);
    await this.randomDelay(100, 300);

    for (const char of text) {
      await page.type(selector, char, { delay: this.randomInt(50, 150) });
    }
  }

  /**
   * Click with human-like behavior
   */
  async clickHumanLike(page: Page, selector: string): Promise<void> {
    const element = await page.$(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    // Get element position
    const box = await element.boundingBox();
    if (!box) {
      throw new Error(`Cannot get bounding box for: ${selector}`);
    }

    // Click at a random position within the element
    const x = box.x + this.randomInt(5, Math.max(5, box.width - 5));
    const y = box.y + this.randomInt(5, Math.max(5, box.height - 5));

    await this.randomDelay(100, 300);
    await page.mouse.click(x, y);
  }

  /**
   * Wait for element with random additional delay
   */
  async waitForElement(page: Page, selector: string, timeout?: number): Promise<ElementHandle<Element>> {
    const element = await page.waitForSelector(selector, { timeout: timeout || this.config.defaultTimeout });
    await this.randomDelay(200, 500);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    return element;
  }

  /**
   * Take a screenshot for debugging
   */
  async takeScreenshot(page: Page, name: string): Promise<string> {
    const filename = `${name}-${Date.now()}.png`;
    const filepath = path.join(this.config.screenshotDir!, filename);

    await page.screenshot({ path: filepath, fullPage: true });
    console.log(`[BrowserService] Screenshot saved: ${filepath}`);

    return filepath;
  }

  /**
   * Random delay between min and max milliseconds
   */
  async randomDelay(min: number, max: number): Promise<void> {
    const delay = this.randomInt(min, max);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Random integer between min and max (inclusive)
   */
  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Extract text content from element
   */
  async getTextContent(page: Page, selector: string): Promise<string | null> {
    const element = await page.$(selector);
    if (!element) return null;
    return page.evaluate(el => el.textContent, element);
  }

  /**
   * Extract all matching elements' text content
   */
  async getAllTextContent(page: Page, selector: string): Promise<string[]> {
    return page.$$eval(selector, elements =>
      elements.map(el => el.textContent?.trim() || '')
    );
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(page: Page, options?: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2' }): Promise<void> {
    await page.waitForNavigation({
      timeout: options?.timeout || this.config.defaultTimeout,
      waitUntil: options?.waitUntil || 'networkidle2'
    });
    await this.randomDelay(500, 1000);
  }

  /**
   * Scroll page to load dynamic content
   */
  async scrollToBottom(page: Page): Promise<void> {
    await page.evaluate(async () => {
      await new Promise<void>(resolve => {
        let totalHeight = 0;
        const distance = 300;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 200);
      });
    });
    await this.randomDelay(500, 1000);
  }

  /**
   * Close the browser and cleanup
   */
  async close(): Promise<void> {
    if (this.browser) {
      // Close all pages
      for (const [id] of this.pages) {
        await this.closePage(id);
      }

      await this.browser.close();
      this.browser = null;
      console.log('[BrowserService] Browser closed');
    }
  }

  /**
   * Check if browser is currently running
   */
  isRunning(): boolean {
    return this.browser !== null;
  }
}

// Export singleton instance getter
export const getBrowserService = (config?: BrowserServiceConfig): BrowserService => {
  return BrowserService.getInstance(config);
};

export default BrowserService;
