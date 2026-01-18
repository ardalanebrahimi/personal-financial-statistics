/**
 * Import Dialog Component
 *
 * Dialog for importing transactions from CSV, Amazon, and PayPal.
 */

import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Category } from '../../core/models/transaction.model';
import { ImportService, ImportResult } from './services/import.service';
import { ImportDropZoneComponent } from './components/import/import-drop-zone.component';
import { ImportResultComponent } from './components/import/import-result.component';

export interface ImportDialogData {
  initialTab: 'csv' | 'amazon' | 'paypal';
  categories: Category[];
}

export interface ImportDialogResult {
  imported: boolean;
  count: number;
}

@Component({
  selector: 'app-import-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatProgressBarModule,
    MatExpansionModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatInputModule,
    MatFormFieldModule,
    MatSnackBarModule,
    ImportDropZoneComponent,
    ImportResultComponent
  ],
  templateUrl: './import-dialog.component.html',
  styleUrl: './import-dialog.component.scss'
})
export class ImportDialogComponent implements OnInit {
  selectedTab = 0;

  // CSV state
  csvFile: File | null = null;
  csvImporting = false;
  csvResult: ImportResult | null = null;

  // Amazon state
  amazonFile: File | null = null;
  amazonImporting = false;
  amazonStartDate?: Date;
  amazonEndDate?: Date;
  amazonResult: ImportResult | null = null;

  // Amazon Refunds state
  amazonRefundsFile: File | null = null;
  amazonRefundsImporting = false;
  amazonRefundsResult: ImportResult | null = null;

  // PayPal state
  paypalFile: File | null = null;
  paypalImporting = false;
  paypalResult: ImportResult | null = null;

  constructor(
    public dialogRef: MatDialogRef<ImportDialogComponent, ImportDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: ImportDialogData,
    private importService: ImportService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    const tabMap = { csv: 0, amazon: 1, paypal: 2 };
    this.selectedTab = tabMap[this.data.initialTab] ?? 0;
  }

  get canImport(): boolean {
    if (this.selectedTab === 0) return !!this.csvFile;
    if (this.selectedTab === 1) return !!this.amazonFile || !!this.amazonRefundsFile;
    if (this.selectedTab === 2) return !!this.paypalFile;
    return false;
  }

  get isImporting(): boolean {
    return this.csvImporting || this.amazonImporting ||
           this.amazonRefundsImporting || this.paypalImporting;
  }

  close(result?: ImportDialogResult): void {
    this.dialogRef.close(result);
  }

  onFileSelected(event: Event, type: string): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.setFile(input.files[0], type);
    }
  }

  setFile(file: File, type: string): void {
    switch (type) {
      case 'csv':
        this.csvFile = file;
        this.csvResult = null;
        break;
      case 'amazon':
        this.amazonFile = file;
        this.amazonResult = null;
        break;
      case 'amazonRefunds':
        this.amazonRefundsFile = file;
        this.amazonRefundsResult = null;
        break;
      case 'paypal':
        this.paypalFile = file;
        this.paypalResult = null;
        break;
    }
  }

  clearCurrentFile(): void {
    if (this.selectedTab === 0) {
      this.csvFile = null;
      this.csvResult = null;
    } else if (this.selectedTab === 1) {
      this.amazonFile = null;
      this.amazonResult = null;
      this.amazonStartDate = undefined;
      this.amazonEndDate = undefined;
      this.amazonRefundsFile = null;
      this.amazonRefundsResult = null;
    } else if (this.selectedTab === 2) {
      this.paypalFile = null;
      this.paypalResult = null;
    }
  }

  async import(): Promise<void> {
    if (this.selectedTab === 0) {
      await this.importCsv();
    } else if (this.selectedTab === 1) {
      const promises: Promise<void>[] = [];
      if (this.amazonFile) promises.push(this.importAmazon());
      if (this.amazonRefundsFile) promises.push(this.importAmazonRefunds());
      await Promise.all(promises);
    } else if (this.selectedTab === 2) {
      await this.importPayPal();
    }
  }

  private async importCsv(): Promise<void> {
    if (!this.csvFile) return;

    this.csvImporting = true;
    this.csvResult = null;

    try {
      await this.importService.importCsv(this.csvFile);

      this.csvResult = {
        success: true,
        message: 'Import job started! Processing continues in background.',
        stats: { imported: 0, skipped: 0, errors: 0, newTransactions: 0, duplicatesSkipped: 0 }
      };

      this.snackBar.open(
        'Import started! Processing continues in background.',
        'OK',
        { duration: 5000 }
      );

      setTimeout(() => this.close({ imported: true, count: 0 }), 1500);
    } catch (error: any) {
      this.csvResult = {
        success: false,
        message: error.message || 'Failed to start import',
        stats: { imported: 0, skipped: 0, errors: 1, newTransactions: 0, duplicatesSkipped: 0 }
      };
    }

    this.csvImporting = false;
  }

  private async importAmazon(): Promise<void> {
    if (!this.amazonFile) return;

    this.amazonImporting = true;
    this.amazonResult = null;

    const csvData = await this.importService.readFileAsText(this.amazonFile);
    this.amazonResult = await this.importService.importAmazonOrders({
      csvData,
      startDate: this.amazonStartDate?.toISOString(),
      endDate: this.amazonEndDate?.toISOString()
    });

    if (this.amazonResult.success && this.amazonResult.stats.newTransactions > 0) {
      this.close({ imported: true, count: this.amazonResult.stats.newTransactions });
    }

    this.amazonImporting = false;
  }

  private async importAmazonRefunds(): Promise<void> {
    if (!this.amazonRefundsFile) return;

    this.amazonRefundsImporting = true;
    this.amazonRefundsResult = null;

    const csvData = await this.importService.readFileAsText(this.amazonRefundsFile);
    this.amazonRefundsResult = await this.importService.importAmazonRefunds(csvData);

    this.amazonRefundsImporting = false;
  }

  private async importPayPal(): Promise<void> {
    if (!this.paypalFile) return;

    this.paypalImporting = true;
    this.paypalResult = null;

    const textData = await this.importService.readFileAsText(this.paypalFile);
    this.paypalResult = await this.importService.importPayPal(textData);

    if (this.paypalResult.success && this.paypalResult.stats.newTransactions > 0) {
      this.close({ imported: true, count: this.paypalResult.stats.newTransactions });
    }

    this.paypalImporting = false;
  }
}
