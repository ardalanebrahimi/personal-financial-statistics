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
  template: `
    <div class="import-dialog">
      <div class="dialog-header">
        <h2 mat-dialog-title>Import Transactions</h2>
        <button mat-icon-button (click)="close()" class="close-button">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-dialog-content>
        <mat-tab-group [(selectedIndex)]="selectedTab" animationDuration="200ms">
          <!-- CSV Import Tab -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>description</mat-icon>
              <span>Bank Statement (CSV)</span>
            </ng-template>

            <div class="tab-content">
              <input type="file" #csvInput hidden accept=".csv" (change)="onFileSelected($event, 'csv')">
              <app-import-drop-zone
                [file]="csvFile"
                placeholder="Drop your bank statement CSV file here or click to browse"
                [acceptedExtensions]="['.csv']"
                (fileInputClick)="csvInput.click()"
                (fileSelected)="setFile($event, 'csv')">
              </app-import-drop-zone>

              <div class="format-hint">
                <mat-icon>info</mat-icon>
                <span>Supported formats: Sparkasse, N26, generic CSV with semicolon delimiter</span>
              </div>

              <div class="progress-section" *ngIf="csvImporting">
                <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                <p>Importing transactions...</p>
              </div>

              <app-import-result [result]="csvResult"></app-import-result>
            </div>
          </mat-tab>

          <!-- Amazon Import Tab -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>shopping_cart</mat-icon>
              <span>Amazon</span>
            </ng-template>

            <div class="tab-content amazon-content">
              <mat-expansion-panel class="instructions-panel">
                <mat-expansion-panel-header>
                  <mat-panel-title>
                    <mat-icon>help_outline</mat-icon>
                    How to get your Amazon data
                  </mat-panel-title>
                </mat-expansion-panel-header>
                <div class="instructions">
                  <ol>
                    <li>Go to <a href="https://www.amazon.com/gp/privacycentral/dsar/preview.html" target="_blank">Amazon Privacy Central</a></li>
                    <li>Sign in and click "Request My Data"</li>
                    <li>Select "Your Orders" and wait for the email</li>
                    <li>Orders: <code>Retail.OrderHistory.1/Retail.OrderHistory.csv</code></li>
                    <li>Returns: <code>Retail.CustomerReturns.X/Retail.CustomerReturns.csv</code></li>
                  </ol>
                </div>
              </mat-expansion-panel>

              <div class="amazon-sections">
                <!-- Orders Section -->
                <div class="amazon-section">
                  <h3><mat-icon>shopping_cart</mat-icon> Orders</h3>
                  <input type="file" #amazonInput hidden accept=".csv" (change)="onFileSelected($event, 'amazon')">
                  <app-import-drop-zone
                    [file]="amazonFile"
                    placeholder="Drop Retail.OrderHistory.csv here"
                    [acceptedExtensions]="['.csv']"
                    [small]="true"
                    (fileInputClick)="amazonInput.click()"
                    (fileSelected)="setFile($event, 'amazon')">
                  </app-import-drop-zone>

                  <div class="date-filter" *ngIf="amazonFile">
                    <mat-form-field appearance="outline">
                      <mat-label>Start Date</mat-label>
                      <input matInput [matDatepicker]="startPicker" [(ngModel)]="amazonStartDate">
                      <mat-datepicker-toggle matSuffix [for]="startPicker"></mat-datepicker-toggle>
                      <mat-datepicker #startPicker></mat-datepicker>
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>End Date</mat-label>
                      <input matInput [matDatepicker]="endPicker" [(ngModel)]="amazonEndDate">
                      <mat-datepicker-toggle matSuffix [for]="endPicker"></mat-datepicker-toggle>
                      <mat-datepicker #endPicker></mat-datepicker>
                    </mat-form-field>
                  </div>

                  <div class="progress-section" *ngIf="amazonImporting">
                    <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                    <p>Importing orders...</p>
                  </div>

                  <app-import-result [result]="amazonResult" [compact]="true"></app-import-result>
                </div>

                <!-- Returns Section -->
                <div class="amazon-section">
                  <h3><mat-icon>currency_exchange</mat-icon> Returns</h3>
                  <input type="file" #amazonRefundsInput hidden accept=".csv" (change)="onFileSelected($event, 'amazonRefunds')">
                  <app-import-drop-zone
                    [file]="amazonRefundsFile"
                    placeholder="Drop Retail.CustomerReturns.csv here"
                    [acceptedExtensions]="['.csv']"
                    [small]="true"
                    (fileInputClick)="amazonRefundsInput.click()"
                    (fileSelected)="setFile($event, 'amazonRefunds')">
                  </app-import-drop-zone>

                  <div class="progress-section" *ngIf="amazonRefundsImporting">
                    <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                    <p>Importing returns...</p>
                  </div>

                  <app-import-result [result]="amazonRefundsResult" [compact]="true"></app-import-result>
                </div>
              </div>
            </div>
          </mat-tab>

          <!-- PayPal Import Tab -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>account_balance_wallet</mat-icon>
              <span>PayPal</span>
            </ng-template>

            <div class="tab-content">
              <mat-expansion-panel class="instructions-panel">
                <mat-expansion-panel-header>
                  <mat-panel-title>
                    <mat-icon>help_outline</mat-icon>
                    How to export PayPal transactions
                  </mat-panel-title>
                </mat-expansion-panel-header>
                <div class="instructions">
                  <ol>
                    <li>Open the PayPal app on your phone</li>
                    <li>Go to Activity / Transactions</li>
                    <li>Select all transactions and copy them</li>
                    <li>Paste into a text file and save as .txt</li>
                  </ol>
                  <p class="hint">Note: PayPal transactions are stored as context data and matched to bank "PayPal" entries.</p>
                </div>
              </mat-expansion-panel>

              <input type="file" #paypalInput hidden accept=".txt,.csv" (change)="onFileSelected($event, 'paypal')">
              <app-import-drop-zone
                [file]="paypalFile"
                placeholder="Drop your PayPal text file here or click to browse"
                [acceptedExtensions]="['.txt', '.csv']"
                (fileInputClick)="paypalInput.click()"
                (fileSelected)="setFile($event, 'paypal')">
              </app-import-drop-zone>

              <div class="format-hint">
                <mat-icon>info</mat-icon>
                <span>Supports PayPal app text export format (.txt)</span>
              </div>

              <div class="progress-section" *ngIf="paypalImporting">
                <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                <p>Importing PayPal transactions...</p>
              </div>

              <app-import-result [result]="paypalResult" [showRecurring]="true"></app-import-result>
            </div>
          </mat-tab>
        </mat-tab-group>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button (click)="clearCurrentFile()">Clear</button>
        <button mat-raised-button color="primary"
                [disabled]="!canImport || isImporting"
                (click)="import()">
          <mat-icon>upload</mat-icon>
          Import
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .import-dialog { min-width: 600px; }

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px 0;
    }

    .dialog-header h2 { margin: 0; }
    .close-button { margin: -8px -8px 0 0; }

    mat-dialog-content {
      padding: 0 24px;
      max-height: 65vh;
    }

    .tab-content { padding: 16px 0; }

    mat-tab-group ::ng-deep .mat-mdc-tab .mdc-tab__text-label {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .format-hint {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      font-size: 13px;
      color: #666;
    }

    .format-hint mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #1976d2;
    }

    .instructions-panel { margin-bottom: 16px; }
    .instructions-panel mat-icon { margin-right: 8px; }

    .instructions ol {
      padding-left: 20px;
      line-height: 1.8;
      margin: 0;
    }

    .instructions code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
    }

    .instructions .hint {
      margin-top: 12px;
      font-size: 13px;
      color: #666;
      font-style: italic;
    }

    .date-filter {
      display: flex;
      gap: 16px;
      margin-top: 16px;
    }

    .date-filter mat-form-field { flex: 1; }

    .progress-section {
      margin: 16px 0;
      text-align: center;
    }

    .progress-section p {
      margin-top: 12px;
      color: #666;
    }

    mat-dialog-actions { padding: 16px 24px; }

    /* Amazon sections layout */
    .amazon-content { padding: 8px 0; }

    .amazon-sections {
      display: flex;
      gap: 16px;
    }

    .amazon-section {
      flex: 1;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 12px;
      background: #fafafa;
    }

    .amazon-section h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 500;
      color: #333;
    }

    .amazon-section h3 mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: #ff9800;
    }

    .amazon-section .date-filter {
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
    }

    .amazon-section .date-filter mat-form-field { width: 100%; }

    .amazon-section .progress-section { margin: 12px 0; }
    .amazon-section .progress-section p { font-size: 12px; }
  `]
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
