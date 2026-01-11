import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { MatExpansionModule } from '@angular/material/expansion';
import { environment } from '../../../environments/environment';

interface ImportResult {
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
  selector: 'app-amazon-import',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatInputModule,
    MatExpansionModule
  ],
  template: `
    <mat-card class="import-card">
      <mat-card-header>
        <mat-icon mat-card-avatar>shopping_cart</mat-icon>
        <mat-card-title>Amazon Order Import</mat-card-title>
        <mat-card-subtitle>Import your Amazon order history from CSV</mat-card-subtitle>
      </mat-card-header>

      <mat-card-content>
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
              <li>
                Go to <a href="https://www.amazon.com/gp/privacycentral/dsar/preview.html" target="_blank">
                  Amazon Privacy Central
                </a>
              </li>
              <li>Sign in to your Amazon account</li>
              <li>Click "Request My Data"</li>
              <li>Select "Your Orders" or all data</li>
              <li>Wait for the email (can take 24-48 hours)</li>
              <li>Download and extract the ZIP file</li>
              <li>Find the file: <code>Retail.OrderHistory.1/Retail.OrderHistory.csv</code></li>
              <li>Upload that CSV file below</li>
            </ol>
            <p class="note">
              <mat-icon>info</mat-icon>
              The file should contain columns like: Order ID, Order Date, Product Name, Unit Price, etc.
            </p>
          </div>
        </mat-expansion-panel>

        <!-- File Upload -->
        <div class="upload-section">
          <input type="file"
                 #fileInput
                 hidden
                 accept=".csv"
                 (change)="onFileSelected($event)">

          <div class="drop-zone"
               [class.drag-over]="isDragOver"
               [class.has-file]="selectedFile"
               (click)="fileInput.click()"
               (dragover)="onDragOver($event)"
               (dragleave)="onDragLeave($event)"
               (drop)="onDrop($event)">

            <mat-icon *ngIf="!selectedFile">cloud_upload</mat-icon>
            <mat-icon *ngIf="selectedFile" class="success">check_circle</mat-icon>

            <p *ngIf="!selectedFile">
              Drop your Amazon CSV file here or click to browse
            </p>
            <p *ngIf="selectedFile">
              <strong>{{ selectedFile.name }}</strong>
              <br>
              <span class="file-size">{{ formatFileSize(selectedFile.size) }}</span>
            </p>
          </div>

          <!-- Optional Date Filter -->
          <div class="date-filter" *ngIf="selectedFile">
            <mat-form-field appearance="outline">
              <mat-label>Start Date (optional)</mat-label>
              <input matInput [matDatepicker]="startPicker" [(ngModel)]="startDate">
              <mat-datepicker-toggle matSuffix [for]="startPicker"></mat-datepicker-toggle>
              <mat-datepicker #startPicker></mat-datepicker>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>End Date (optional)</mat-label>
              <input matInput [matDatepicker]="endPicker" [(ngModel)]="endDate">
              <mat-datepicker-toggle matSuffix [for]="endPicker"></mat-datepicker-toggle>
              <mat-datepicker #endPicker></mat-datepicker>
            </mat-form-field>
          </div>
        </div>

        <!-- Progress -->
        <div class="progress-section" *ngIf="isImporting">
          <mat-progress-bar mode="indeterminate"></mat-progress-bar>
          <p>Importing orders...</p>
        </div>

        <!-- Results -->
        <div class="results-section" *ngIf="importResult">
          <div class="result-card" [class.success]="importResult.success" [class.error]="!importResult.success">
            <mat-icon *ngIf="importResult.success">check_circle</mat-icon>
            <mat-icon *ngIf="!importResult.success">error</mat-icon>

            <div class="result-content">
              <h4>{{ importResult.message }}</h4>
              <div class="stats">
                <span><strong>{{ importResult.stats.newTransactions }}</strong> new transactions imported</span>
                <span><strong>{{ importResult.stats.duplicatesSkipped }}</strong> duplicates skipped</span>
                <span *ngIf="importResult.stats.errors > 0" class="errors">
                  <strong>{{ importResult.stats.errors }}</strong> errors
                </span>
              </div>
            </div>
          </div>

          <!-- Error Details -->
          <div class="error-details" *ngIf="importResult.errors && importResult.errors.length > 0">
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <mat-icon>warning</mat-icon>
                  {{ importResult.errors!.length }} parsing errors
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul>
                <li *ngFor="let error of importResult.errors! | slice:0:20">{{ error }}</li>
                <li *ngIf="importResult.errors!.length > 20">
                  ... and {{ importResult.errors!.length - 20 }} more
                </li>
              </ul>
            </mat-expansion-panel>
          </div>
        </div>
      </mat-card-content>

      <mat-card-actions>
        <button mat-raised-button
                color="primary"
                [disabled]="!selectedFile || isImporting"
                (click)="importOrders()">
          <mat-icon>upload</mat-icon>
          Import Orders
        </button>
        <button mat-button
                *ngIf="selectedFile"
                (click)="clearFile()">
          Clear
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    .import-card {
      max-width: 800px;
      margin: 0 auto;
    }

    mat-card-header mat-icon[mat-card-avatar] {
      font-size: 40px;
      width: 40px;
      height: 40px;
      color: #ff9900;
    }

    .instructions-panel {
      margin-bottom: 24px;
    }

    .instructions-panel mat-icon {
      margin-right: 8px;
    }

    .instructions ol {
      padding-left: 20px;
      line-height: 1.8;
    }

    .instructions code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
    }

    .instructions .note {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 16px;
      padding: 12px;
      background: #e3f2fd;
      border-radius: 8px;
      font-size: 13px;
    }

    .instructions .note mat-icon {
      color: #1976d2;
    }

    .upload-section {
      margin: 24px 0;
    }

    .drop-zone {
      border: 2px dashed #ccc;
      border-radius: 12px;
      padding: 48px;
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
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #999;
    }

    .drop-zone mat-icon.success {
      color: #4caf50;
    }

    .drop-zone p {
      margin: 16px 0 0;
      color: #666;
    }

    .file-size {
      color: #999;
      font-size: 13px;
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
      margin: 24px 0;
      text-align: center;
    }

    .progress-section p {
      margin-top: 12px;
      color: #666;
    }

    .results-section {
      margin: 24px 0;
    }

    .result-card {
      display: flex;
      align-items: flex-start;
      gap: 16px;
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
      font-size: 32px;
      width: 32px;
      height: 32px;
    }

    .result-content h4 {
      margin: 0 0 8px;
    }

    .stats {
      display: flex;
      gap: 16px;
      font-size: 14px;
      color: #666;
    }

    .stats .errors {
      color: #f44336;
    }

    .error-details {
      margin-top: 16px;
    }

    .error-details ul {
      margin: 0;
      padding-left: 20px;
      font-size: 13px;
      max-height: 200px;
      overflow-y: auto;
    }

    mat-card-actions {
      padding: 16px;
    }
  `]
})
export class AmazonImportComponent {
  selectedFile: File | null = null;
  startDate?: Date;
  endDate?: Date;
  isImporting = false;
  isDragOver = false;
  importResult: ImportResult | null = null;

  constructor(
    private http: HttpClient,
    private snackBar: MatSnackBar
  ) {}

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.selectedFile = input.files[0];
      this.importResult = null;
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    const files = event.dataTransfer?.files;
    if (files?.length) {
      const file = files[0];
      if (file.name.endsWith('.csv')) {
        this.selectedFile = file;
        this.importResult = null;
      } else {
        this.snackBar.open('Please select a CSV file', '', { duration: 3000 });
      }
    }
  }

  clearFile() {
    this.selectedFile = null;
    this.importResult = null;
    this.startDate = undefined;
    this.endDate = undefined;
  }

  async importOrders() {
    if (!this.selectedFile) return;

    this.isImporting = true;
    this.importResult = null;

    try {
      const csvData = await this.selectedFile.text();

      const body: any = { csvData };
      if (this.startDate) body.startDate = this.startDate.toISOString();
      if (this.endDate) body.endDate = this.endDate.toISOString();

      const result = await this.http.post<ImportResult>(
        `${environment.apiUrl}/import/amazon`,
        body
      ).toPromise();

      this.importResult = result!;

      if (result?.success) {
        this.snackBar.open(
          `Imported ${result.stats.newTransactions} orders from Amazon`,
          '',
          { duration: 4000 }
        );
      }
    } catch (error: any) {
      this.importResult = {
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

    this.isImporting = false;
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
