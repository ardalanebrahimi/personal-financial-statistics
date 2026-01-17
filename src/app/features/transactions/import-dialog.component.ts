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
import { Category } from '../../core/models/transaction.model';
import { environment } from '../../../environments/environment';

export interface ImportDialogData {
  initialTab: 'csv' | 'amazon';
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
              <span>Amazon Orders</span>
            </ng-template>

            <div class="tab-content">
              <!-- Instructions -->
              <mat-expansion-panel class="instructions-panel">
                <mat-expansion-panel-header>
                  <mat-panel-title>
                    <mat-icon>help_outline</mat-icon>
                    How to get your Amazon order history
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
                    <li>Find: <code>Retail.OrderHistory.1/Retail.OrderHistory.csv</code></li>
                  </ol>
                </div>
              </mat-expansion-panel>

              <!-- File Upload -->
              <div class="upload-section">
                <input type="file" #amazonInput hidden accept=".csv" (change)="onAmazonFileSelected($event)">

                <div class="drop-zone"
                     [class.drag-over]="amazonDragOver"
                     [class.has-file]="amazonFile"
                     (click)="amazonInput.click()"
                     (dragover)="onDragOver($event, 'amazon')"
                     (dragleave)="onDragLeave($event, 'amazon')"
                     (drop)="onDrop($event, 'amazon')">

                  <mat-icon *ngIf="!amazonFile">cloud_upload</mat-icon>
                  <mat-icon *ngIf="amazonFile" class="success">check_circle</mat-icon>

                  <p *ngIf="!amazonFile">
                    Drop your Amazon CSV file here or click to browse
                  </p>
                  <p *ngIf="amazonFile">
                    <strong>{{ amazonFile.name }}</strong>
                    <br>
                    <span class="file-size">{{ formatFileSize(amazonFile.size) }}</span>
                  </p>
                </div>

                <!-- Optional Date Filter -->
                <div class="date-filter" *ngIf="amazonFile">
                  <mat-form-field appearance="outline">
                    <mat-label>Start Date (optional)</mat-label>
                    <input matInput [matDatepicker]="startPicker" [(ngModel)]="amazonStartDate">
                    <mat-datepicker-toggle matSuffix [for]="startPicker"></mat-datepicker-toggle>
                    <mat-datepicker #startPicker></mat-datepicker>
                  </mat-form-field>

                  <mat-form-field appearance="outline">
                    <mat-label>End Date (optional)</mat-label>
                    <input matInput [matDatepicker]="endPicker" [(ngModel)]="amazonEndDate">
                    <mat-datepicker-toggle matSuffix [for]="endPicker"></mat-datepicker-toggle>
                    <mat-datepicker #endPicker></mat-datepicker>
                  </mat-form-field>
                </div>
              </div>

              <!-- Progress -->
              <div class="progress-section" *ngIf="amazonImporting">
                <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                <p>Importing Amazon orders...</p>
              </div>

              <!-- Amazon Result -->
              <div class="result-section" *ngIf="amazonResult">
                <div class="result-card" [class.success]="amazonResult.success" [class.error]="!amazonResult.success">
                  <mat-icon *ngIf="amazonResult.success">check_circle</mat-icon>
                  <mat-icon *ngIf="!amazonResult.success">error</mat-icon>
                  <div class="result-content">
                    <h4>{{ amazonResult.message }}</h4>
                    <div class="stats">
                      <span><strong>{{ amazonResult.stats.newTransactions }}</strong> new orders imported</span>
                      <span><strong>{{ amazonResult.stats.duplicatesSkipped }}</strong> duplicates skipped</span>
                      <span *ngIf="amazonResult.stats.errors > 0" class="errors">
                        <strong>{{ amazonResult.stats.errors }}</strong> errors
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Error Details -->
                <mat-expansion-panel *ngIf="amazonResult.errors && amazonResult.errors.length > 0" class="error-panel">
                  <mat-expansion-panel-header>
                    <mat-panel-title>
                      <mat-icon>warning</mat-icon>
                      {{ amazonResult.errors.length }} parsing errors
                    </mat-panel-title>
                  </mat-expansion-panel-header>
                  <ul>
                    <li *ngFor="let error of amazonResult.errors.slice(0, 20)">{{ error }}</li>
                    <li *ngIf="amazonResult.errors.length > 20">
                      ... and {{ amazonResult.errors.length - 20 }} more
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
  `]
})
export class ImportDialogComponent implements OnInit {
  selectedTab = 0;

  // CSV state
  csvFile: File | null = null;
  csvDragOver = false;
  csvImporting = false;
  csvResult: { success: boolean; message: string; count?: number } | null = null;

  // Amazon state
  amazonFile: File | null = null;
  amazonDragOver = false;
  amazonImporting = false;
  amazonStartDate?: Date;
  amazonEndDate?: Date;
  amazonResult: AmazonImportResult | null = null;

  constructor(
    public dialogRef: MatDialogRef<ImportDialogComponent, ImportDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: ImportDialogData,
    private transactionService: TransactionService,
    private http: HttpClient,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.selectedTab = this.data.initialTab === 'amazon' ? 1 : 0;
  }

  get canImport(): boolean {
    return this.selectedTab === 0 ? !!this.csvFile : !!this.amazonFile;
  }

  get isImporting(): boolean {
    return this.csvImporting || this.amazonImporting;
  }

  close(result?: ImportDialogResult) {
    this.dialogRef.close(result);
  }

  // Drag & drop handlers
  onDragOver(event: DragEvent, type: 'csv' | 'amazon') {
    event.preventDefault();
    event.stopPropagation();
    if (type === 'csv') {
      this.csvDragOver = true;
    } else {
      this.amazonDragOver = true;
    }
  }

  onDragLeave(event: DragEvent, type: 'csv' | 'amazon') {
    event.preventDefault();
    event.stopPropagation();
    if (type === 'csv') {
      this.csvDragOver = false;
    } else {
      this.amazonDragOver = false;
    }
  }

  onDrop(event: DragEvent, type: 'csv' | 'amazon') {
    event.preventDefault();
    event.stopPropagation();

    if (type === 'csv') {
      this.csvDragOver = false;
    } else {
      this.amazonDragOver = false;
    }

    const files = event.dataTransfer?.files;
    if (files?.length) {
      const file = files[0];
      if (file.name.endsWith('.csv')) {
        if (type === 'csv') {
          this.csvFile = file;
          this.csvResult = null;
        } else {
          this.amazonFile = file;
          this.amazonResult = null;
        }
      } else {
        this.snackBar.open('Please select a CSV file', '', { duration: 3000 });
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

  clearCurrentFile() {
    if (this.selectedTab === 0) {
      this.csvFile = null;
      this.csvResult = null;
    } else {
      this.amazonFile = null;
      this.amazonResult = null;
      this.amazonStartDate = undefined;
      this.amazonEndDate = undefined;
    }
  }

  async import() {
    if (this.selectedTab === 0) {
      await this.importCsv();
    } else {
      await this.importAmazon();
    }
  }

  private async importCsv() {
    if (!this.csvFile) return;

    this.csvImporting = true;
    this.csvResult = null;

    try {
      const importedTransactions = await this.transactionService.parseFile(this.csvFile);
      const count = importedTransactions?.length || 0;

      this.csvResult = {
        success: true,
        message: 'Import complete',
        count
      };

      this.close({ imported: true, count });
    } catch (error: any) {
      this.csvResult = {
        success: false,
        message: error.message || 'Import failed'
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

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
