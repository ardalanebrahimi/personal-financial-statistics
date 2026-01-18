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
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';

import { ConnectorService } from '../../../services/connector.service';
import {
  ConnectorState,
  ConnectorStatus,
  ConnectorType,
  AvailableConnector,
  DateRange
} from '../../../core/models/connector.model';
import { AddConnectorDialogComponent } from '../../connectors/add-connector-dialog.component';
import { MfaDialogComponent, MfaDialogResult } from '../../connectors/mfa-dialog.component';
import { CredentialsDialogComponent, CredentialsResult } from '../../connectors/credentials-dialog.component';

@Component({
  selector: 'app-connectors-tab',
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
    MatDatepickerModule,
    MatNativeDateModule,
    MatChipsModule,
    MatSnackBarModule
  ],
  templateUrl: './connectors-tab.component.html',
  styleUrl: './connectors-tab.component.scss'
})
export class ConnectorsTabComponent implements OnInit, OnDestroy {
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
      case ConnectorStatus.DISCONNECTED: return 'status-disconnected';
      case ConnectorStatus.CONNECTING:
      case ConnectorStatus.FETCHING: return 'status-connecting';
      case ConnectorStatus.CONNECTED: return 'status-connected';
      case ConnectorStatus.MFA_REQUIRED: return 'status-mfa';
      case ConnectorStatus.ERROR: return 'status-error';
      default: return '';
    }
  }

  getStatusLabel(status: ConnectorStatus): string {
    switch (status) {
      case ConnectorStatus.DISCONNECTED: return 'Disconnected';
      case ConnectorStatus.CONNECTING: return 'Connecting...';
      case ConnectorStatus.CONNECTED: return 'Connected';
      case ConnectorStatus.MFA_REQUIRED: return 'MFA Required';
      case ConnectorStatus.FETCHING: return 'Fetching...';
      case ConnectorStatus.ERROR: return 'Error';
      default: return status;
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
          await this.connectorService.createConnector(result.type, result.name, result.bankCode);
          this.snackBar.open('Connector added successfully', 'Close', { duration: 3000 });
        } catch (error) {
          this.snackBar.open('Failed to add connector', 'Close', { duration: 3000 });
        }
      }
    });
  }

  async connect(connector: ConnectorState): Promise<void> {
    const dialogRef = this.dialog.open(CredentialsDialogComponent, {
      width: '420px',
      disableClose: false,
      data: { connector }
    });

    dialogRef.afterClosed().subscribe(async (credentials: CredentialsResult | undefined) => {
      if (!credentials) return;

      try {
        const state = await this.connectorService.connect(connector.config.id, credentials);

        if (state.status === ConnectorStatus.MFA_REQUIRED) {
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
    if (!currentConnector || currentConnector.status !== ConnectorStatus.MFA_REQUIRED) return;

    const dialogRef = this.dialog.open(MfaDialogComponent, {
      width: '400px',
      disableClose: true,
      data: { connector: currentConnector }
    });

    dialogRef.afterClosed().subscribe(async (result: MfaDialogResult | undefined) => {
      if (!result || result.action === 'cancel') return;

      if (result.action === 'confirmed') {
        this.snackBar.open('Connected successfully', 'Close', { duration: 3000 });
        return;
      }

      if (result.action === 'submit' && result.code) {
        try {
          await this.connectorService.submitMFA(connector.config.id, result.code);
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
      const dateRange: DateRange = { startDate: this.startDate, endDate: this.endDate };
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
