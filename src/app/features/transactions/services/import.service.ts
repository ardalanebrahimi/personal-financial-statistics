/**
 * Import Service
 *
 * Handles file import logic for CSV, Amazon, and PayPal data.
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { JobService } from '../../../services/job.service';
import { environment } from '../../../../environments/environment';

export interface ImportResult {
  success: boolean;
  message: string;
  stats: {
    totalRows?: number;
    totalParsed?: number;
    imported: number;
    skipped: number;
    errors: number;
    newTransactions: number;
    duplicatesSkipped: number;
    recurringTransactions?: number;
  };
  errors?: string[];
}

export interface AmazonImportOptions {
  csvData: string;
  startDate?: string;
  endDate?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ImportService {
  constructor(
    private http: HttpClient,
    private jobService: JobService
  ) {}

  /**
   * Import CSV file via background job.
   */
  async importCsv(file: File): Promise<{ jobId: string }> {
    return this.jobService.uploadCsv(file);
  }

  /**
   * Import Amazon orders.
   */
  async importAmazonOrders(options: AmazonImportOptions): Promise<ImportResult> {
    try {
      const result = await this.http.post<ImportResult>(
        `${environment.apiUrl}/import/amazon`,
        options
      ).toPromise();
      return result!;
    } catch (error: any) {
      return this.createErrorResult(error);
    }
  }

  /**
   * Import Amazon refunds.
   */
  async importAmazonRefunds(csvData: string): Promise<ImportResult> {
    try {
      const result = await this.http.post<ImportResult>(
        `${environment.apiUrl}/import/amazon/refunds`,
        { csvData }
      ).toPromise();
      return result!;
    } catch (error: any) {
      return this.createErrorResult(error);
    }
  }

  /**
   * Import PayPal transactions.
   */
  async importPayPal(textData: string): Promise<ImportResult> {
    try {
      const result = await this.http.post<ImportResult>(
        `${environment.apiUrl}/import/paypal`,
        { textData }
      ).toPromise();
      return result!;
    } catch (error: any) {
      return this.createErrorResult(error);
    }
  }

  /**
   * Read file as text.
   */
  async readFileAsText(file: File): Promise<string> {
    return file.text();
  }

  /**
   * Create error result from exception.
   */
  private createErrorResult(error: any): ImportResult {
    return {
      success: false,
      message: error.error?.error || 'Import failed',
      stats: {
        imported: 0,
        skipped: 0,
        errors: 1,
        newTransactions: 0,
        duplicatesSkipped: 0
      },
      errors: error.error?.details ? [error.error.details] : ['Unknown error occurred']
    };
  }

  /**
   * Format file size for display.
   */
  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Validate file type for import.
   */
  isValidFile(file: File, types: string[]): boolean {
    return types.some(type => file.name.toLowerCase().endsWith(type));
  }
}
