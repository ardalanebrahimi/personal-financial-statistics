/**
 * Browser Automation Module
 *
 * Exports browser automation utilities for connectors that need
 * web scraping capabilities (N26, Mastercard, Amazon, PayPal fallback)
 */

export { default as BrowserService, getBrowserService } from './browser-service';
export type {
  BrowserServiceConfig,
  MFADetectionResult,
  LoginDetectionResult
} from './browser-service';
