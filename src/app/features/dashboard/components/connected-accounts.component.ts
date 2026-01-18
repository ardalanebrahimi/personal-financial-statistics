/**
 * Connected Accounts Component
 *
 * Displays the list of connected financial accounts.
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { ConnectorState } from '../services/dashboard-sync.service';

@Component({
  selector: 'app-connected-accounts',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatIconModule,
    MatChipsModule,
    MatButtonModule
  ],
  template: `
    <mat-card class="accounts-card">
      <mat-card-header>
        <mat-icon mat-card-avatar>account_balance</mat-icon>
        <mat-card-title>Connected Accounts</mat-card-title>
        <mat-card-subtitle>{{ connectors.length }} sources</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div class="account-list">
          <div *ngFor="let connector of connectors" class="account-item">
            <div class="account-icon">
              <mat-icon>{{ getConnectorIcon(connector.config.type) }}</mat-icon>
            </div>
            <div class="account-info">
              <span class="account-name">{{ connector.config.name }}</span>
              <span class="account-sync" *ngIf="connector.config.lastSyncAt">
                Last sync: {{ connector.config.lastSyncAt | date:'short' }}
              </span>
            </div>
            <mat-chip [class]="'status-' + connector.status">
              {{ connector.status }}
            </mat-chip>
          </div>
          <div *ngIf="connectors.length === 0" class="empty-accounts">
            <p>No accounts connected</p>
            <a mat-button color="primary" routerLink="/settings" [queryParams]="{tab: 'connectors'}">Add Account</a>
          </div>
        </div>
      </mat-card-content>
      <mat-card-actions>
        <a mat-button routerLink="/settings" [queryParams]="{tab: 'connectors'}">Manage Connectors</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    .account-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .account-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem;
      border-radius: 8px;
      background: #fafafa;
    }

    .account-icon {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
      border-radius: 50%;
    }

    .account-info {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .account-name {
      font-weight: 500;
    }

    .account-sync {
      font-size: 12px;
      color: #666;
    }

    .status-connected { background: #e8f5e9 !important; color: #2e7d32 !important; }
    .status-disconnected { background: #f5f5f5 !important; color: #666 !important; }
    .status-error { background: #ffebee !important; color: #c62828 !important; }

    .empty-accounts {
      text-align: center;
      padding: 1rem;
      color: #666;
    }

    mat-card-actions {
      padding: 0.5rem 1rem !important;
    }

    mat-card-actions a {
      margin: 0 !important;
    }
  `]
})
export class ConnectedAccountsComponent {
  @Input() connectors: ConnectorState[] = [];

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
