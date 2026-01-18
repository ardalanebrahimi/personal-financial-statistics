import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
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
import { TransactionService } from '../../services/transaction.service';
import { JobService } from '../../services/job.service';
import { Category } from '../../core/models/transaction.model';
import { environment } from '../../../environments/environment';

export interface ImportDialogData {
  initialTab: 'csv' | 'amazon' | 'paypal';
  categories: Category[];
}

export interface ImportDialogResult {
  imported: boolean;
  count: number;
}

interface AmazonImportResult {
  success: boolean;
  message: string;
  stats: {
    totalRows: number;
    imported: number;
    skipped: number;
    errors: number;
    newTransactions: number;
    duplicatesSkipped: number;
  };
  errors?: string[];
}

interface PayPalImportResult {
  success: boolean;
  message: string;
  stats: {
    totalParsed: number;
    imported: number;
    skipped: number;
    errors: number;
    newTransactions: number;
    duplicatesSkipped: number;
    recurringTransactions: number;
  };
  errors?: string[];
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
    MatSnackBarModule
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
              <div class="upload-section">
                <input type="file" #csvInput hidden accept=".csv" (change)="onCsvFileSelected($event)">

                <div class="drop-zone"
                     [class.drag-over]="csvDragOver"
                     [class.has-file]="csvFile"
                     (click)="csvInput.click()"
                     (dragover)="onDragOver($event, 'csv')"
                     (dragleave)="onDragLeave($event, 'csv')"
                     (drop)="onDrop($event, 'csv')">

                  <mat-icon *ngIf="!csvFile">cloud_upload</mat-icon>
                  <mat-icon *ngIf="csvFile" class="success">check_circle</mat-icon>

                  <p *ngIf="!csvFile">
                    Drop your bank statement CSV file here or click to browse
                  </p>
                  <p *ngIf="csvFile">
                    <strong>{{ csvFile.name }}</strong>
                    <br>
                    <span class="file-size">{{ formatFileSize(csvFile.size) }}</span>
                  </p>
                </div>

                <div class="format-hint">
                  <mat-icon>info</mat-icon>
                  <span>Supported formats: Sparkasse, N26, generic CSV with semicolon delimiter</span>
                </div>
              </div>

              <!-- Progress -->
              <div class="progress-section" *ngIf="csvImporting">
                <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                <p>Importing transactions...</p>
              </div>

              <!-- CSV Result -->
              <div class="result-section" *ngIf="csvResult">
                <div class="result-card" [class.success]="csvResult.success" [class.error]="!csvResult.success">
                  <mat-icon *ngIf="csvResult.success">check_circle</mat-icon>
                  <mat-icon *ngIf="!csvResult.success">error</mat-icon>
                  <div class="result-content">
                    <h4>{{ csvResult.message }}</h4>
                    <div class="stats" *ngIf="csvResult.count !== undefined">
                      <span><strong>{{ csvResult.count }}</strong> transactions imported</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </mat-tab>

          <!-- Amazon Import Tab -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>shopping_cart</mat-icon>
              <span>Amazon</span>
            </ng-template>

            <div class="tab-content amazon-content">
              <!-- Instructions -->
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
                    <li>Sign in to your Amazon account</li>
                    <li>Click "Request My Data"</li>
                    <li>Select "Your Orders" or all data</li>
                    <li>Wait for the email (can take 24-48 hours)</li>
                    <li>Download and extract the ZIP file</li>
                    <li>Orders: <code>Retail.OrderHistory.1/Retail.OrderHistory.csv</code></li>
                    <li>Returns: <code>Retail.CustomerReturns.X/Retail.CustomerReturns.csv</code></li>
                  </ol>
                </div>
              </mat-expansion-panel>

              <div class="amazon-sections">
                <!-- Orders Section -->
                <div class="amazon-section">
                  <h3><mat-icon>shopping_cart</mat-icon> Orders</h3>

                  <div class="upload-section">
                    <input type="file" #amazonInput hidden accept=".csv" (change)="onAmazonFileSelected($event)">

                    <div class="drop-zone small"
                         [class.drag-over]="amazonDragOver"
                         [class.has-file]="amazonFile"
                         (click)="amazonInput.click()"
                         (dragover)="onDragOver($event, 'amazon')"
                         (dragleave)="onDragLeave($event, 'amazon')"
                         (drop)="onDrop($event, 'amazon')">

                      <mat-icon *ngIf="!amazonFile">cloud_upload</mat-icon>
                      <mat-icon *ngIf="amazonFile" class="success">check_circle</mat-icon>

                      <p *ngIf="!amazonFile">
                        Drop Retail.OrderHistory.csv here
                      </p>
                      <p *ngIf="amazonFile">
                        <strong>{{ amazonFile.name }}</strong>
                        <span class="file-size">{{ formatFileSize(amazonFile.size) }}</span>
                      </p>
                    </div>

                    <!-- Optional Date Filter -->
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
                  </div>

                  <!-- Progress -->
                  <div class="progress-section" *ngIf="amazonImporting">
                    <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                    <p>Importing orders...</p>
                  </div>

                  <!-- Result -->
                  <div class="result-section" *ngIf="amazonResult">
                    <div class="result-card" [class.success]="amazonResult.success" [class.error]="!amazonResult.success">
                      <mat-icon *ngIf="amazonResult.success">check_circle</mat-icon>
                      <mat-icon *ngIf="!amazonResult.success">error</mat-icon>
                      <div class="result-content">
                        <h4>{{ amazonResult.message }}</h4>
                        <div class="stats">
                          <span><strong>{{ amazonResult.stats.newTransactions }}</strong> imported</span>
                          <span><strong>{{ amazonResult.stats.duplicatesSkipped }}</strong> skipped</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Returns Section -->
                <div class="amazon-section">
                  <h3><mat-icon>currency_exchange</mat-icon> Returns</h3>

                  <div class="upload-section">
                    <input type="file" #amazonRefundsInput hidden accept=".csv" (change)="onAmazonRefundsFileSelected($event)">

                    <div class="drop-zone small"
                         [class.drag-over]="amazonRefundsDragOver"
                         [class.has-file]="amazonRefundsFile"
                         (click)="amazonRefundsInput.click()"
                         (dragover)="onDragOver($event, 'amazonRefunds')"
                         (dragleave)="onDragLeave($event, 'amazonRefunds')"
                         (drop)="onDrop($event, 'amazonRefunds')">

                      <mat-icon *ngIf="!amazonRefundsFile">cloud_upload</mat-icon>
                      <mat-icon *ngIf="amazonRefundsFile" class="success">check_circle</mat-icon>

                      <p *ngIf="!amazonRefundsFile">
                        Drop Retail.CustomerReturns.csv here
                      </p>
                      <p *ngIf="amazonRefundsFile">
                        <strong>{{ amazonRefundsFile.name }}</strong>
                        <span class="file-size">{{ formatFileSize(amazonRefundsFile.size) }}</span>
                      </p>
                    </div>
                  </div>

                  <!-- Progress -->
                  <div class="progress-section" *ngIf="amazonRefundsImporting">
                    <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                    <p>Importing returns...</p>
                  </div>

                  <!-- Result -->
                  <div class="result-section" *ngIf="amazonRefundsResult">
                    <div class="result-card" [class.success]="amazonRefundsResult.success" [class.error]="!amazonRefundsResult.success">
                      <mat-icon *ngIf="amazonRefundsResult.success">check_circle</mat-icon>
                      <mat-icon *ngIf="!amazonRefundsResult.success">error</mat-icon>
                      <div class="result-content">
                        <h4>{{ amazonRefundsResult.message }}</h4>
                        <div class="stats">
                          <span><strong>{{ amazonRefundsResult.stats.newTransactions }}</strong> imported</span>
                          <span><strong>{{ amazonRefundsResult.stats.duplicatesSkipped }}</strong> skipped</span>
                        </div>
                      </div>
                    </div>
                  </div>
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
              <!-- Instructions -->
              <mat-expansion-panel class="instructions-panel">
                <mat-expansion-panel-header>
                  <mat-panel-title>
                    <mat-icon>help_outline</mat-icon>
                    How to export your PayPal transactions
                  </mat-panel-title>
                </mat-expansion-panel-header>

                <div class="instructions">
                  <ol>
                    <li>Open the PayPal app on your phone</li>
                    <li>Go to Activity / Transactions</li>
                    <li>Select all transactions and copy them</li>
                    <li>Paste into a text file and save as .txt</li>
                    <li>Or use PayPal website: Activity → Download → CSV</li>
                  </ol>
                  <p class="hint">Note: PayPal transactions are stored as context data and matched to bank "PayPal" entries.</p>
                </div>
              </mat-expansion-panel>

              <!-- File Upload -->
              <div class="upload-section">
                <input type="file" #paypalInput hidden accept=".txt,.csv" (change)="onPayPalFileSelected($event)">

                <div class="drop-zone"
                     [class.drag-over]="paypalDragOver"
                     [class.has-file]="paypalFile"
                     (click)="paypalInput.click()"
                     (dragover)="onDragOver($event, 'paypal')"
                     (dragleave)="onDragLeave($event, 'paypal')"
                     (drop)="onDrop($event, 'paypal')">

                  <mat-icon *ngIf="!paypalFile">cloud_upload</mat-icon>
                  <mat-icon *ngIf="paypalFile" class="success">check_circle</mat-icon>

                  <p *ngIf="!paypalFile">
                    Drop your PayPal text file here or click to browse
                  </p>
                  <p *ngIf="paypalFile">
                    <strong>{{ paypalFile.name }}</strong>
                    <br>
                    <span class="file-size">{{ formatFileSize(paypalFile.size) }}</span>
                  </p>
                </div>

                <div class="format-hint">
                  <mat-icon>info</mat-icon>
                  <span>Supports PayPal app text export format (.txt)</span>
                </div>
              </div>

              <!-- Progress -->
              <div class="progress-section" *ngIf="paypalImporting">
                <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                <p>Importing PayPal transactions...</p>
              </div>

              <!-- PayPal Result -->
              <div class="result-section" *ngIf="paypalResult">
                <div class="result-card" [class.success]="paypalResult.success" [class.error]="!paypalResult.success">
                  <mat-icon *ngIf="paypalResult.success">check_circle</mat-icon>
                  <mat-icon *ngIf="!paypalResult.success">error</mat-icon>
                  <div class="result-content">
                    <h4>{{ paypalResult.message }}</h4>
                    <div class="stats">
                      <span><strong>{{ paypalResult.stats.newTransactions }}</strong> new transactions imported</span>
                      <span><strong>{{ paypalResult.stats.duplicatesSkipped }}</strong> duplicates skipped</span>
                      <span><strong>{{ paypalResult.stats.recurringTransactions }}</strong> recurring detected</span>
                      <span *ngIf="paypalResult.stats.errors > 0" class="errors">
                        <strong>{{ paypalResult.stats.errors }}</strong> errors
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Error Details -->
                <mat-expansion-panel *ngIf="paypalResult.errors && paypalResult.errors.length > 0" class="error-panel">
                  <mat-expansion-panel-header>
                    <mat-panel-title>
                      <mat-icon>warning</mat-icon>
                      {{ paypalResult.errors.length }} parsing errors
                    </mat-panel-title>
                  </mat-expansion-panel-header>
                  <ul>
                    <li *ngFor="let error of paypalResult.errors.slice(0, 20)">{{ error }}</li>
                    <li *ngIf="paypalResult.errors.length > 20">
                      ... and {{ paypalResult.errors.length - 20 }} more
                    </li>
                  </ul>
                </mat-expansion-panel>
              </div>
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
    .import-dialog {
      min-width: 600px;
    }

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px 0;
    }

    .dialog-header h2 {
      margin: 0;
    }

    .close-button {
      margin: -8px -8px 0 0;
    }

    mat-dialog-content {
      padding: 0 24px;
      max-height: 65vh;
    }

    .tab-content {
      padding: 16px 0;
    }

    mat-tab-group ::ng-deep .mat-mdc-tab .mdc-tab__text-label {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .upload-section {
      margin: 16px 0;
    }

    .drop-zone {
      border: 2px dashed #ccc;
      border-radius: 12px;
      padding: 40px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }

    .drop-zone:hover {
      border-color: #1976d2;
      background: #f5f5f5;
    }

    .drop-zone.drag-over {
      border-color: #1976d2;
      background: #e3f2fd;
    }

    .drop-zone.has-file {
      border-color: #4caf50;
      border-style: solid;
      background: #e8f5e9;
    }

    .drop-zone mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      color: #999;
    }

    .drop-zone mat-icon.success {
      color: #4caf50;
    }

    .drop-zone p {
      margin: 12px 0 0;
      color: #666;
    }

    .file-size {
      color: #999;
      font-size: 13px;
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

    .instructions-panel {
      margin-bottom: 16px;
    }

    .instructions-panel mat-icon {
      margin-right: 8px;
    }

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

    .date-filter mat-form-field {
      flex: 1;
    }

    .progress-section {
      margin: 16px 0;
      text-align: center;
    }

    .progress-section p {
      margin-top: 12px;
      color: #666;
    }

    .result-section {
      margin: 16px 0;
    }

    .result-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      border-radius: 8px;
    }

    .result-card.success {
      background: #e8f5e9;
    }

    .result-card.success mat-icon {
      color: #4caf50;
    }

    .result-card.error {
      background: #ffebee;
    }

    .result-card.error mat-icon {
      color: #f44336;
    }

    .result-card mat-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
    }

    .result-content h4 {
      margin: 0 0 8px;
    }

    .stats {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 13px;
      color: #666;
    }

    .stats .errors {
      color: #f44336;
    }

    .error-panel {
      margin-top: 12px;
    }

    .error-panel ul {
      margin: 0;
      padding-left: 20px;
      font-size: 12px;
      max-height: 150px;
      overflow-y: auto;
    }

    mat-dialog-actions {
      padding: 16px 24px;
    }

    /* Amazon sections layout */
    .amazon-content {
      padding: 8px 0;
    }

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

    .amazon-section .upload-section {
      margin: 0;
    }

    .drop-zone.small {
      padding: 20px;
    }

    .drop-zone.small mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
    }

    .drop-zone.small p {
      margin: 8px 0 0;
      font-size: 13px;
    }

    .amazon-section .date-filter {
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
    }

    .amazon-section .date-filter mat-form-field {
      width: 100%;
    }

    .amazon-section .progress-section {
      margin: 12px 0;
    }

    .amazon-section .progress-section p {
      font-size: 12px;
    }

    .amazon-section .result-section {
      margin: 12px 0 0;
    }

    .amazon-section .result-card {
      padding: 12px;
    }

    .amazon-section .result-card mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .amazon-section .result-content h4 {
      font-size: 13px;
      margin-bottom: 4px;
    }

    .amazon-section .stats {
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
    }
  `]
})
export class ImportDialogComponent implements OnInit {
  selectedTab = 0;

  // CSV state
  csvFile: File | null = null;
  csvDragOver = false;
  csvImporting = false;
  csvResult: { success: boolean; message: string; count?: number } | null = null;

  // Amazon Orders state
  amazonFile: File | null = null;
  amazonDragOver = false;
  amazonImporting = false;
  amazonStartDate?: Date;
  amazonEndDate?: Date;
  amazonResult: AmazonImportResult | null = null;

  // Amazon Refunds state
  amazonRefundsFile: File | null = null;
  amazonRefundsDragOver = false;
  amazonRefundsImporting = false;
  amazonRefundsResult: AmazonImportResult | null = null;

  // PayPal state
  paypalFile: File | null = null;
  paypalDragOver = false;
  paypalImporting = false;
  paypalResult: PayPalImportResult | null = null;

  constructor(
    public dialogRef: MatDialogRef<ImportDialogComponent, ImportDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: ImportDialogData,
    private transactionService: TransactionService,
    private jobService: JobService,
    private http: HttpClient,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    if (this.data.initialTab === 'amazon') {
      this.selectedTab = 1;
    } else if (this.data.initialTab === 'paypal') {
      this.selectedTab = 2;
    } else {
      this.selectedTab = 0;
    }
  }

  get canImport(): boolean {
    if (this.selectedTab === 0) return !!this.csvFile;
    if (this.selectedTab === 1) return !!this.amazonFile || !!this.amazonRefundsFile;
    if (this.selectedTab === 2) return !!this.paypalFile;
    return false;
  }

  get isImporting(): boolean {
    return this.csvImporting || this.amazonImporting || this.amazonRefundsImporting || this.paypalImporting;
  }

  close(result?: ImportDialogResult) {
    this.dialogRef.close(result);
  }

  // Drag & drop handlers
  onDragOver(event: DragEvent, type: 'csv' | 'amazon' | 'amazonRefunds' | 'paypal') {
    event.preventDefault();
    event.stopPropagation();
    if (type === 'csv') {
      this.csvDragOver = true;
    } else if (type === 'amazon') {
      this.amazonDragOver = true;
    } else if (type === 'amazonRefunds') {
      this.amazonRefundsDragOver = true;
    } else {
      this.paypalDragOver = true;
    }
  }

  onDragLeave(event: DragEvent, type: 'csv' | 'amazon' | 'amazonRefunds' | 'paypal') {
    event.preventDefault();
    event.stopPropagation();
    if (type === 'csv') {
      this.csvDragOver = false;
    } else if (type === 'amazon') {
      this.amazonDragOver = false;
    } else if (type === 'amazonRefunds') {
      this.amazonRefundsDragOver = false;
    } else {
      this.paypalDragOver = false;
    }
  }

  onDrop(event: DragEvent, type: 'csv' | 'amazon' | 'amazonRefunds' | 'paypal') {
    event.preventDefault();
    event.stopPropagation();

    if (type === 'csv') {
      this.csvDragOver = false;
    } else if (type === 'amazon') {
      this.amazonDragOver = false;
    } else if (type === 'amazonRefunds') {
      this.amazonRefundsDragOver = false;
    } else {
      this.paypalDragOver = false;
    }

    const files = event.dataTransfer?.files;
    if (files?.length) {
      const file = files[0];
      if (type === 'paypal' && (file.name.endsWith('.txt') || file.name.endsWith('.csv'))) {
        this.paypalFile = file;
        this.paypalResult = null;
      } else if (file.name.endsWith('.csv')) {
        if (type === 'csv') {
          this.csvFile = file;
          this.csvResult = null;
        } else if (type === 'amazon') {
          this.amazonFile = file;
          this.amazonResult = null;
        } else if (type === 'amazonRefunds') {
          this.amazonRefundsFile = file;
          this.amazonRefundsResult = null;
        }
      } else {
        this.snackBar.open('Please select a valid file', '', { duration: 3000 });
      }
    }
  }

  // File selection handlers
  onCsvFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.csvFile = input.files[0];
      this.csvResult = null;
    }
  }

  onAmazonFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.amazonFile = input.files[0];
      this.amazonResult = null;
    }
  }

  onAmazonRefundsFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.amazonRefundsFile = input.files[0];
      this.amazonRefundsResult = null;
    }
  }

  onPayPalFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.paypalFile = input.files[0];
      this.paypalResult = null;
    }
  }

  clearCurrentFile() {
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

  async import() {
    if (this.selectedTab === 0) {
      await this.importCsv();
    } else if (this.selectedTab === 1) {
      // Import both orders and refunds if files are selected
      const promises: Promise<void>[] = [];
      if (this.amazonFile) promises.push(this.importAmazon());
      if (this.amazonRefundsFile) promises.push(this.importAmazonRefunds());
      await Promise.all(promises);
    } else if (this.selectedTab === 2) {
      await this.importPayPal();
    }
  }

  private async importCsv() {
    if (!this.csvFile) return;

    this.csvImporting = true;
    this.csvResult = null;

    try {
      // Upload file to backend and start background job
      const { jobId } = await this.jobService.uploadCsv(this.csvFile);

      this.csvResult = {
        success: true,
        message: 'Import job started! Processing continues in background.',
        count: 0
      };

      this.snackBar.open(
        'Import started! You can close this dialog - processing continues in background.',
        'OK',
        { duration: 5000 }
      );

      // Close dialog after short delay
      setTimeout(() => {
        this.close({ imported: true, count: 0 });
      }, 1500);

    } catch (error: any) {
      this.csvResult = {
        success: false,
        message: error.message || 'Failed to start import'
      };
    }

    this.csvImporting = false;
  }

  private async importAmazon() {
    if (!this.amazonFile) return;

    this.amazonImporting = true;
    this.amazonResult = null;

    try {
      const csvData = await this.amazonFile.text();

      const body: any = { csvData };
      if (this.amazonStartDate) body.startDate = this.amazonStartDate.toISOString();
      if (this.amazonEndDate) body.endDate = this.amazonEndDate.toISOString();

      const result = await this.http.post<AmazonImportResult>(
        `${environment.apiUrl}/import/amazon`,
        body
      ).toPromise();

      this.amazonResult = result!;

      if (result?.success && result.stats.newTransactions > 0) {
        this.close({ imported: true, count: result.stats.newTransactions });
      }
    } catch (error: any) {
      this.amazonResult = {
        success: false,
        message: error.error?.error || 'Import failed',
        stats: {
          totalRows: 0,
          imported: 0,
          skipped: 0,
          errors: 1,
          newTransactions: 0,
          duplicatesSkipped: 0
        },
        errors: error.error?.details ? [error.error.details] : ['Unknown error occurred']
      };
    }

    this.amazonImporting = false;
  }

  private async importAmazonRefunds() {
    if (!this.amazonRefundsFile) return;

    this.amazonRefundsImporting = true;
    this.amazonRefundsResult = null;

    try {
      const csvData = await this.amazonRefundsFile.text();

      const result = await this.http.post<AmazonImportResult>(
        `${environment.apiUrl}/import/amazon/refunds`,
        { csvData }
      ).toPromise();

      this.amazonRefundsResult = result!;
    } catch (error: any) {
      this.amazonRefundsResult = {
        success: false,
        message: error.error?.error || 'Refunds import failed',
        stats: {
          totalRows: 0,
          imported: 0,
          skipped: 0,
          errors: 1,
          newTransactions: 0,
          duplicatesSkipped: 0
        },
        errors: error.error?.details ? [error.error.details] : ['Unknown error occurred']
      };
    }

    this.amazonRefundsImporting = false;
  }

  private async importPayPal() {
    if (!this.paypalFile) return;

    this.paypalImporting = true;
    this.paypalResult = null;

    try {
      const textData = await this.paypalFile.text();

      const result = await this.http.post<PayPalImportResult>(
        `${environment.apiUrl}/import/paypal`,
        { textData }
      ).toPromise();

      this.paypalResult = result!;

      if (result?.success && result.stats.newTransactions > 0) {
        this.close({ imported: true, count: result.stats.newTransactions });
      }
    } catch (error: any) {
      this.paypalResult = {
        success: false,
        message: error.error?.error || 'Import failed',
        stats: {
          totalParsed: 0,
          imported: 0,
          skipped: 0,
          errors: 1,
          newTransactions: 0,
          duplicatesSkipped: 0,
          recurringTransactions: 0
        },
        errors: error.error?.details ? [error.error.details] : ['Unknown error occurred']
      };
    }

    this.paypalImporting = false;
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
