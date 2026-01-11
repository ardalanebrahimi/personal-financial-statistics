import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  ConnectorState,
  ConnectorType,
  ConnectorStatus,
  DateRange,
  AVAILABLE_CONNECTORS,
  AvailableConnector
} from '../core/models/connector.model';

@Injectable({
  providedIn: 'root'
})
export class ConnectorService {
  private readonly API_URL = `${environment.apiUrl}/connectors`;

  private connectors = new BehaviorSubject<ConnectorState[]>([]);
  connectors$ = this.connectors.asObservable();

  private loading = new BehaviorSubject<boolean>(false);
  loading$ = this.loading.asObservable();

  constructor(private http: HttpClient) {
    this.loadConnectors();
  }

  /**
   * Get list of all available connector types
   */
  getAvailableConnectors(): AvailableConnector[] {
    return AVAILABLE_CONNECTORS;
  }

  /**
   * Load all configured connectors from the server
   */
  async loadConnectors(): Promise<void> {
    try {
      this.loading.next(true);
      const response = await firstValueFrom(
        this.http.get<{ connectors: ConnectorState[] }>(this.API_URL)
      );
      this.connectors.next(response.connectors);
    } catch (error) {
      console.error('Failed to load connectors:', error);
      this.connectors.next([]);
    } finally {
      this.loading.next(false);
    }
  }

  /**
   * Create a new connector configuration
   */
  async createConnector(
    type: ConnectorType,
    name: string,
    bankCode?: string
  ): Promise<ConnectorState> {
    try {
      const response = await firstValueFrom(
        this.http.post<ConnectorState>(this.API_URL, {
          type,
          name,
          bankCode
        })
      );
      await this.loadConnectors();
      return response;
    } catch (error) {
      console.error('Failed to create connector:', error);
      throw error;
    }
  }

  /**
   * Delete a connector
   */
  async deleteConnector(connectorId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.delete(`${this.API_URL}/${connectorId}`)
      );
      await this.loadConnectors();
    } catch (error) {
      console.error('Failed to delete connector:', error);
      throw error;
    }
  }

  /**
   * Initiate connection to a financial service
   */
  async connect(connectorId: string): Promise<ConnectorState> {
    try {
      const response = await firstValueFrom(
        this.http.post<ConnectorState>(`${this.API_URL}/${connectorId}/connect`, {})
      );
      await this.loadConnectors();
      return response;
    } catch (error) {
      console.error('Failed to connect:', error);
      throw error;
    }
  }

  /**
   * Submit MFA code for authentication
   */
  async submitMFA(connectorId: string, code: string): Promise<ConnectorState> {
    try {
      const response = await firstValueFrom(
        this.http.post<ConnectorState>(`${this.API_URL}/${connectorId}/mfa`, { code })
      );
      await this.loadConnectors();
      return response;
    } catch (error) {
      console.error('Failed to submit MFA:', error);
      throw error;
    }
  }

  /**
   * Fetch transactions for a date range
   */
  async fetchTransactions(
    connectorId: string,
    dateRange: DateRange
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(`${this.API_URL}/${connectorId}/fetch`, {
          startDate: dateRange.startDate.toISOString(),
          endDate: dateRange.endDate.toISOString()
        })
      );
      // Start polling for status updates
      this.pollConnectorStatus(connectorId);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
      throw error;
    }
  }

  /**
   * Disconnect from a financial service
   */
  async disconnect(connectorId: string): Promise<ConnectorState> {
    try {
      const response = await firstValueFrom(
        this.http.post<ConnectorState>(`${this.API_URL}/${connectorId}/disconnect`, {})
      );
      await this.loadConnectors();
      return response;
    } catch (error) {
      console.error('Failed to disconnect:', error);
      throw error;
    }
  }

  /**
   * Get current status of a connector
   */
  async getStatus(connectorId: string): Promise<ConnectorState> {
    try {
      return await firstValueFrom(
        this.http.get<ConnectorState>(`${this.API_URL}/${connectorId}/status`)
      );
    } catch (error) {
      console.error('Failed to get connector status:', error);
      throw error;
    }
  }

  /**
   * Poll connector status until it's no longer in a transitional state
   */
  private async pollConnectorStatus(connectorId: string): Promise<void> {
    const poll = async () => {
      try {
        const state = await this.getStatus(connectorId);
        await this.loadConnectors();

        // Continue polling if still in transitional state
        if (
          state.status === ConnectorStatus.CONNECTING ||
          state.status === ConnectorStatus.FETCHING
        ) {
          setTimeout(poll, 1000);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    setTimeout(poll, 1000);
  }

  /**
   * Get a connector by ID from current state
   */
  getConnectorById(id: string): ConnectorState | undefined {
    return this.connectors.value.find(c => c.config.id === id);
  }

  /**
   * Check if any connector is currently in a busy state
   */
  hasBusyConnector(): boolean {
    return this.connectors.value.some(
      c =>
        c.status === ConnectorStatus.CONNECTING ||
        c.status === ConnectorStatus.FETCHING
    );
  }
}
