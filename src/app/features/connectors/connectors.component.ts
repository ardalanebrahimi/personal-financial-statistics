import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';

import { ConnectorService } from '../../services/connector.service';
import {
  ConnectorState,
  ConnectorStatus,
  ConnectorType,
  AvailableConnector,
  DateRange
} from '../../core/models/connector.model';
import { AddConnectorDialogComponent } from './add-connector-dialog.component';
import { MfaDialogComponent } from './mfa-dialog.component';
import { CredentialsDialogComponent, CredentialsResult } from './credentials-dialog.component';

@Component({
  selector: 'app-connectors',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatChipsModule,
    MatSnackBarModule
  ],
  template: `
    <div class="connectors-container">
      <header class="page-header">
        <h1>Data Connectors</h1>
        <p>Connect to your financial accounts to automatically import transactions</p>
      </header>

      <!-- Date Range Selector -->
      <mat-card class="date-range-card">
        <mat-card-content>
          <h3>Fetch Date Range</h3>
          <div class="date-range-inputs">
            <mat-form-field appearance="outline">
              <mat-label>Start Date</mat-label>
              <input matInput [matDatepicker]="startPicker" [(ngModel)]="startDate">
              <mat-datepicker-toggle matIconSuffix [for]="startPicker"></mat-datepicker-toggle>
              <mat-datepicker #startPicker></mat-datepicker>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>End Date</mat-label>
              <input matInput [matDatepicker]="endPicker" [(ngModel)]="endDate">
              <mat-datepicker-toggle matIconSuffix [for]="endPicker"></mat-datepicker-toggle>
              <mat-datepicker #endPicker></mat-datepicker>
            </mat-form-field>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Configured Connectors -->
      <section class="connectors-section">
        <div class="section-header">
          <h2>Your Connectors</h2>
          <button mat-raised-button color="primary" (click)="openAddConnectorDialog()">
            <mat-icon>add</mat-icon>
            Add Connector
          </button>
        </div>

        <div class="connectors-grid" *ngIf="connectors.length > 0; else noConnectors">
          <mat-card *ngFor="let connector of connectors" class="connector-card">
            <mat-card-header>
              <mat-icon mat-card-avatar>{{ getConnectorIcon(connector.config.type) }}</mat-icon>
              <mat-card-title>{{ connector.config.name }}</mat-card-title>
              <mat-card-subtitle>{{ getConnectorTypeName(connector.config.type) }}</mat-card-subtitle>
            </mat-card-header>

            <mat-card-content>
              <!-- Status Badge -->
              <div class="status-container">
                <mat-chip [ngClass]="getStatusClass(connector.status)">
                  <mat-icon *ngIf="isLoading(connector.status)" class="spinning">sync</mat-icon>
                  {{ getStatusLabel(connector.status) }}
                </mat-chip>
              </div>

              <!-- Status Message -->
              <p class="status-message" *ngIf="connector.statusMessage">
                {{ connector.statusMessage }}
              </p>

              <!-- MFA Challenge -->
              <div class="mfa-prompt" *ngIf="connector.status === ConnectorStatus.MFA_REQUIRED">
                <p>{{ connector.mfaChallenge?.message }}</p>
                <button mat-stroked-button color="primary" (click)="openMfaDialog(connector)">
                  Enter Code
                </button>
              </div>

              <!-- Last Sync Info -->
              <p class="last-sync" *ngIf="connector.config.lastSyncAt">
                Last sync: {{ connector.config.lastSyncAt | date:'medium' }}
              </p>
            </mat-card-content>

            <mat-card-actions>
              <ng-container [ngSwitch]="connector.status">
                <!-- Disconnected -->
                <ng-container *ngSwitchCase="ConnectorStatus.DISCONNECTED">
                  <button mat-button color="primary" (click)="connect(connector)">
                    <mat-icon>link</mat-icon>
                    Connect
                  </button>
                </ng-container>

                <!-- Connected -->
                <ng-container *ngSwitchCase="ConnectorStatus.CONNECTED">
                  <button mat-button color="primary" (click)="fetchTransactions(connector)">
                    <mat-icon>download</mat-icon>
                    Fetch
                  </button>
                  <button mat-button (click)="disconnect(connector)">
                    <mat-icon>link_off</mat-icon>
                    Disconnect
                  </button>
                </ng-container>

                <!-- Loading States -->
                <ng-container *ngSwitchCase="ConnectorStatus.CONNECTING">
                  <mat-spinner diameter="24"></mat-spinner>
                  <span>Connecting...</span>
                </ng-container>

                <ng-container *ngSwitchCase="ConnectorStatus.FETCHING">
                  <mat-spinner diameter="24"></mat-spinner>
                  <span>Fetching...</span>
                </ng-container>

                <!-- Error -->
                <ng-container *ngSwitchCase="ConnectorStatus.ERROR">
                  <button mat-button color="warn" (click)="connect(connector)">
                    <mat-icon>refresh</mat-icon>
                    Retry
                  </button>
                </ng-container>
              </ng-container>

              <button mat-icon-button color="warn" (click)="deleteConnector(connector)"
                      [disabled]="isLoading(connector.status)">
                <mat-icon>delete</mat-icon>
              </button>
            </mat-card-actions>
          </mat-card>
        </div>

        <ng-template #noConnectors>
          <div class="empty-state">
            <mat-icon>account_balance_wallet</mat-icon>
            <h3>No connectors configured</h3>
            <p>Add a connector to start importing transactions automatically</p>
            <button mat-raised-button color="primary" (click)="openAddConnectorDialog()">
              <mat-icon>add</mat-icon>
              Add Your First Connector
            </button>
          </div>
        </ng-template>
      </section>

      <!-- Available Connectors -->
      <section class="available-section">
        <h2>Available Connectors</h2>
        <div class="available-grid">
          <mat-card *ngFor="let available of availableConnectors" class="available-card"
                    [class.not-implemented]="!available.implemented">
            <mat-card-header>
              <mat-icon mat-card-avatar>{{ available.icon }}</mat-icon>
              <mat-card-title>{{ available.name }}</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <p>{{ available.description }}</p>
              <mat-chip *ngIf="!available.implemented" class="coming-soon">Coming Soon</mat-chip>
            </mat-card-content>
          </mat-card>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .connectors-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 1rem;
    }

    .page-header {
      margin-bottom: 2rem;
    }

    .page-header h1 {
      margin: 0;
      font-size: 2rem;
    }

    .page-header p {
      color: #666;
      margin: 0.5rem 0 0;
    }

    .date-range-card {
      margin-bottom: 2rem;
    }

    .date-range-card h3 {
      margin: 0 0 1rem;
    }

    .date-range-inputs {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .date-range-inputs mat-form-field {
      flex: 1;
      min-width: 200px;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .section-header h2 {
      margin: 0;
    }

    .connectors-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1rem;
    }

    .connector-card {
      height: 100%;
    }

    .connector-card mat-card-header {
      margin-bottom: 1rem;
    }

    .status-container {
      margin-bottom: 0.5rem;
    }

    .status-message {
      font-size: 0.875rem;
      color: #666;
      margin: 0.5rem 0;
    }

    .last-sync {
      font-size: 0.75rem;
      color: #999;
      margin: 0.5rem 0 0;
    }

    .mfa-prompt {
      background: #f5f5f5;
      padding: 1rem;
      border-radius: 4px;
      margin: 1rem 0;
    }

    .mfa-prompt p {
      margin: 0 0 0.5rem;
    }

    mat-card-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
    }

    mat-card-actions button:last-child {
      margin-left: auto;
    }

    .status-disconnected {
      background-color: #e0e0e0 !important;
    }

    .status-connecting, .status-fetching {
      background-color: #fff3e0 !important;
      color: #e65100 !important;
    }

    .status-connected {
      background-color: #e8f5e9 !important;
      color: #2e7d32 !important;
    }

    .status-mfa {
      background-color: #e3f2fd !important;
      color: #1565c0 !important;
    }

    .status-error {
      background-color: #ffebee !important;
      color: #c62828 !important;
    }

    .spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .empty-state {
      text-align: center;
      padding: 3rem;
      background: #fafafa;
      border-radius: 8px;
    }

    .empty-state mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: #ccc;
    }

    .empty-state h3 {
      margin: 1rem 0 0.5rem;
    }

    .empty-state p {
      color: #666;
      margin-bottom: 1rem;
    }

    .available-section {
      margin-top: 3rem;
    }

    .available-section h2 {
      margin-bottom: 1rem;
    }

    .available-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 1rem;
    }

    .available-card {
      opacity: 1;
      transition: opacity 0.2s;
    }

    .available-card.not-implemented {
      opacity: 0.6;
    }

    .coming-soon {
      background-color: #f5f5f5 !important;
      font-size: 0.75rem;
    }
  `]
})
export class ConnectorsComponent implements OnInit, OnDestroy {
  connectors: ConnectorState[] = [];
  availableConnectors: AvailableConnector[] = [];
  loading = false;

  startDate: Date = new Date(new Date().setMonth(new Date().getMonth() - 1));
  endDate: Date = new Date();

  ConnectorStatus = ConnectorStatus;

  private subscriptions: Subscription[] = [];

  constructor(
    private connectorService: ConnectorService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.availableConnectors = this.connectorService.getAvailableConnectors();

    this.subscriptions.push(
      this.connectorService.connectors$.subscribe(connectors => {
        this.connectors = connectors;
      }),
      this.connectorService.loading$.subscribe(loading => {
        this.loading = loading;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  getConnectorIcon(type: ConnectorType): string {
    const connector = this.availableConnectors.find(c => c.type === type);
    return connector?.icon || 'account_balance';
  }

  getConnectorTypeName(type: ConnectorType): string {
    const connector = this.availableConnectors.find(c => c.type === type);
    return connector?.name || type;
  }

  getStatusClass(status: ConnectorStatus): string {
    switch (status) {
      case ConnectorStatus.DISCONNECTED:
        return 'status-disconnected';
      case ConnectorStatus.CONNECTING:
      case ConnectorStatus.FETCHING:
        return 'status-connecting';
      case ConnectorStatus.CONNECTED:
        return 'status-connected';
      case ConnectorStatus.MFA_REQUIRED:
        return 'status-mfa';
      case ConnectorStatus.ERROR:
        return 'status-error';
      default:
        return '';
    }
  }

  getStatusLabel(status: ConnectorStatus): string {
    switch (status) {
      case ConnectorStatus.DISCONNECTED:
        return 'Disconnected';
      case ConnectorStatus.CONNECTING:
        return 'Connecting...';
      case ConnectorStatus.CONNECTED:
        return 'Connected';
      case ConnectorStatus.MFA_REQUIRED:
        return 'MFA Required';
      case ConnectorStatus.FETCHING:
        return 'Fetching...';
      case ConnectorStatus.ERROR:
        return 'Error';
      default:
        return status;
    }
  }

  isLoading(status: ConnectorStatus): boolean {
    return status === ConnectorStatus.CONNECTING || status === ConnectorStatus.FETCHING;
  }

  openAddConnectorDialog(): void {
    const dialogRef = this.dialog.open(AddConnectorDialogComponent, {
      width: '400px',
      data: { availableConnectors: this.availableConnectors }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result) {
        try {
          await this.connectorService.createConnector(
            result.type,
            result.name,
            result.bankCode
          );
          this.snackBar.open('Connector added successfully', 'Close', { duration: 3000 });
        } catch (error) {
          this.snackBar.open('Failed to add connector', 'Close', { duration: 3000 });
        }
      }
    });
  }

  async connect(connector: ConnectorState): Promise<void> {
    // Open credentials dialog first
    const dialogRef = this.dialog.open(CredentialsDialogComponent, {
      width: '420px',
      disableClose: false,
      data: { connector }
    });

    dialogRef.afterClosed().subscribe(async (credentials: CredentialsResult | undefined) => {
      if (!credentials) {
        return; // User cancelled
      }

      try {
        const state = await this.connectorService.connect(
          connector.config.id,
          credentials
        );

        if (state.status === ConnectorStatus.MFA_REQUIRED) {
          // Show MFA dialog after a short delay
          setTimeout(() => this.openMfaDialog(connector), 500);
        } else if (state.status === ConnectorStatus.CONNECTED) {
          this.snackBar.open('Connected successfully', 'Close', { duration: 3000 });
        } else if (state.status === ConnectorStatus.ERROR) {
          this.snackBar.open(state.statusMessage || 'Connection failed', 'Close', { duration: 5000 });
        }
      } catch (error) {
        this.snackBar.open('Failed to connect', 'Close', { duration: 3000 });
      }
    });
  }

  openMfaDialog(connector: ConnectorState): void {
    const currentConnector = this.connectorService.getConnectorById(connector.config.id);
    if (!currentConnector || currentConnector.status !== ConnectorStatus.MFA_REQUIRED) {
      return;
    }

    const dialogRef = this.dialog.open(MfaDialogComponent, {
      width: '400px',
      disableClose: true,
      data: { connector: currentConnector }
    });

    dialogRef.afterClosed().subscribe(async code => {
      if (code) {
        try {
          await this.connectorService.submitMFA(connector.config.id, code);
          this.snackBar.open('Connected successfully', 'Close', { duration: 3000 });
        } catch (error) {
          this.snackBar.open('MFA verification failed', 'Close', { duration: 3000 });
        }
      }
    });
  }

  async fetchTransactions(connector: ConnectorState): Promise<void> {
    if (!this.startDate || !this.endDate) {
      this.snackBar.open('Please select a date range', 'Close', { duration: 3000 });
      return;
    }

    try {
      const dateRange: DateRange = {
        startDate: this.startDate,
        endDate: this.endDate
      };
      await this.connectorService.fetchTransactions(connector.config.id, dateRange);
      this.snackBar.open('Fetching transactions...', 'Close', { duration: 2000 });
    } catch (error) {
      this.snackBar.open('Failed to fetch transactions', 'Close', { duration: 3000 });
    }
  }

  async disconnect(connector: ConnectorState): Promise<void> {
    try {
      await this.connectorService.disconnect(connector.config.id);
      this.snackBar.open('Disconnected', 'Close', { duration: 3000 });
    } catch (error) {
      this.snackBar.open('Failed to disconnect', 'Close', { duration: 3000 });
    }
  }

  async deleteConnector(connector: ConnectorState): Promise<void> {
    if (confirm(`Delete connector "${connector.config.name}"?`)) {
      try {
        await this.connectorService.deleteConnector(connector.config.id);
        this.snackBar.open('Connector deleted', 'Close', { duration: 3000 });
      } catch (error) {
        this.snackBar.open('Failed to delete connector', 'Close', { duration: 3000 });
      }
    }
  }
}
