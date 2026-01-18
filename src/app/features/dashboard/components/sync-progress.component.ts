/**
 * Sync Progress Component
 *
 * Displays the sync progress for all connectors.
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SyncProgress } from '../services/dashboard-sync.service';

@Component({
  selector: 'app-sync-progress',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule
  ],
  template: `
    <mat-card class="sync-progress-card" *ngIf="syncProgress.length > 0">
      <mat-card-content>
        <h3>Sync Progress</h3>
        <div class="sync-items">
          <div *ngFor="let item of syncProgress" class="sync-item" [class]="'status-' + item.status">
            <div class="sync-item-header">
              <mat-icon *ngIf="item.status === 'pending'">schedule</mat-icon>
              <mat-spinner *ngIf="item.status === 'syncing'" diameter="20"></mat-spinner>
              <mat-icon *ngIf="item.status === 'success'" class="success">check_circle</mat-icon>
              <mat-icon *ngIf="item.status === 'error'" class="error">error</mat-icon>
              <span class="connector-name">{{ item.connectorName }}</span>
            </div>
            <span class="sync-message">{{ item.message }}</span>
          </div>
        </div>
        <mat-progress-bar *ngIf="isSyncing" mode="indeterminate"></mat-progress-bar>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .sync-progress-card {
      margin-bottom: 1.5rem;
      background: #fafafa;
    }

    .sync-progress-card h3 {
      margin: 0 0 1rem;
    }

    .sync-items {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .sync-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 0.5rem 1rem;
      background: white;
      border-radius: 8px;
      min-width: 150px;
    }

    .sync-item-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .sync-item .success { color: #4caf50; }
    .sync-item .error { color: #f44336; }

    .sync-message {
      font-size: 12px;
      color: #666;
    }
  `]
})
export class SyncProgressComponent {
  @Input() syncProgress: SyncProgress[] = [];
  @Input() isSyncing = false;
}
