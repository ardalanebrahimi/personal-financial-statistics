/**
 * Dashboard Sync Service
 *
 * Handles synchronization logic for all connected accounts.
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface SyncProgress {
  connectorId: string;
  connectorName: string;
  status: 'pending' | 'syncing' | 'success' | 'error';
  message?: string;
  transactionsCount?: number;
}

export interface SyncResult {
  totalNew: number;
  totalDuplicates: number;
  errors: string[];
}

export interface ConnectorState {
  config: {
    id: string;
    type: string;
    name: string;
    lastSyncAt?: string;
    lastSyncStatus?: string;
  };
  status: string;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardSyncService {
  private _isSyncing = new BehaviorSubject<boolean>(false);
  private _syncProgress = new BehaviorSubject<SyncProgress[]>([]);

  isSyncing$ = this._isSyncing.asObservable();
  syncProgress$ = this._syncProgress.asObservable();

  get isSyncing(): boolean {
    return this._isSyncing.value;
  }

  get syncProgress(): SyncProgress[] {
    return this._syncProgress.value;
  }

  constructor(private http: HttpClient) {}

  /**
   * Load all connectors from the API.
   */
  async loadConnectors(): Promise<ConnectorState[]> {
    try {
      const response = await this.http.get<{ connectors: ConnectorState[] }>(
        `${environment.apiUrl}/connectors`
      ).toPromise();
      return response?.connectors || [];
    } catch (error) {
      console.error('Failed to load connectors:', error);
      return [];
    }
  }

  /**
   * Sync all connected accounts.
   */
  async syncAll(connectors: ConnectorState[]): Promise<SyncResult> {
    const connectedConnectors = connectors.filter(c => c.status === 'connected');

    if (connectedConnectors.length === 0) {
      return { totalNew: 0, totalDuplicates: 0, errors: ['No connected accounts to sync'] };
    }

    this._isSyncing.next(true);
    this._syncProgress.next(connectedConnectors.map(c => ({
      connectorId: c.config.id,
      connectorName: c.config.name,
      status: 'pending' as const,
      message: 'Waiting...'
    })));

    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);

    let totalNew = 0;
    let totalDuplicates = 0;
    const errors: string[] = [];

    for (const connector of connectedConnectors) {
      this.updateProgress(connector.config.id, {
        status: 'syncing',
        message: 'Fetching transactions...'
      });

      try {
        const result = await this.http.post<any>(
          `${environment.apiUrl}/connectors/${connector.config.id}/fetch`,
          {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          }
        ).toPromise();

        this.updateProgress(connector.config.id, {
          status: 'success',
          transactionsCount: result?.newTransactionsCount || 0,
          message: `${result?.newTransactionsCount || 0} new transactions`
        });

        totalNew += result?.newTransactionsCount || 0;
        totalDuplicates += result?.duplicatesSkipped || 0;
      } catch (error: any) {
        const errorMessage = error.error?.error || 'Sync failed';
        this.updateProgress(connector.config.id, {
          status: 'error',
          message: errorMessage
        });
        errors.push(`${connector.config.name}: ${errorMessage}`);
      }
    }

    // Run matching after sync
    try {
      await this.http.post(`${environment.apiUrl}/matching/run`, {}).toPromise();
    } catch (error) {
      console.error('Matching failed:', error);
    }

    this._isSyncing.next(false);

    return { totalNew, totalDuplicates, errors };
  }

  /**
   * Update progress for a specific connector.
   */
  private updateProgress(connectorId: string, updates: Partial<SyncProgress>): void {
    const progress = this._syncProgress.value.map(p =>
      p.connectorId === connectorId ? { ...p, ...updates } : p
    );
    this._syncProgress.next(progress);
  }

  /**
   * Clear sync progress.
   */
  clearProgress(): void {
    this._syncProgress.next([]);
  }

  /**
   * Get icon for connector type.
   */
  getConnectorIcon(type: string): string {
    const icons: Record<string, string> = {
      sparkasse: 'account_balance',
      n26: 'smartphone',
      paypal: 'payment',
      gebuhrenfrei: 'credit_card',
      amazon: 'shopping_cart'
    };
    return icons[type] || 'account_balance';
  }
}
