import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { environment } from '../../../environments/environment';

interface AutomationConfig {
  autoCategorize: boolean;
  autoMatch: boolean;
  scheduledSync: {
    enabled: boolean;
    intervalMinutes: number;
  };
  notifyOnNewTransactions: boolean;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule
  ],
  template: `
    <div class="settings-container">
      <header class="settings-header">
        <mat-icon>settings</mat-icon>
        <div>
          <h1>Settings</h1>
          <p>Configure automation and preferences</p>
        </div>
      </header>

      <!-- Automation Settings -->
      <mat-card class="settings-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>smart_toy</mat-icon>
          <mat-card-title>Automation</mat-card-title>
          <mat-card-subtitle>AI-powered features that work automatically</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="setting-item" *ngIf="config">
            <div class="setting-info">
              <h4>Auto-Categorize Transactions</h4>
              <p>Automatically categorize new transactions using AI rules and cross-account intelligence</p>
            </div>
            <mat-slide-toggle
              [(ngModel)]="config.autoCategorize"
              (change)="saveConfig()"
              color="primary">
            </mat-slide-toggle>
          </div>

          <mat-divider></mat-divider>

          <div class="setting-item" *ngIf="config">
            <div class="setting-info">
              <h4>Auto-Match Transactions</h4>
              <p>Automatically link related transactions across accounts (PayPal payments, credit card purchases, etc.)</p>
            </div>
            <mat-slide-toggle
              [(ngModel)]="config.autoMatch"
              (change)="saveConfig()"
              color="primary">
            </mat-slide-toggle>
          </div>

          <mat-divider></mat-divider>

          <div class="setting-item" *ngIf="config">
            <div class="setting-info">
              <h4>New Transaction Notifications</h4>
              <p>Show notifications when new transactions are imported</p>
            </div>
            <mat-slide-toggle
              [(ngModel)]="config.notifyOnNewTransactions"
              (change)="saveConfig()"
              color="primary">
            </mat-slide-toggle>
          </div>

          <mat-divider></mat-divider>

          <div class="setting-item scheduled-sync" *ngIf="config">
            <div class="setting-info">
              <h4>Scheduled Sync</h4>
              <p>Automatically sync connected accounts at regular intervals</p>
            </div>
            <mat-slide-toggle
              [(ngModel)]="config.scheduledSync.enabled"
              (change)="saveConfig()"
              color="primary">
            </mat-slide-toggle>
          </div>

          <div class="sync-interval" *ngIf="config?.scheduledSync?.enabled">
            <mat-form-field appearance="outline">
              <mat-label>Sync interval (minutes)</mat-label>
              <input matInput type="number"
                     [ngModel]="config?.scheduledSync?.intervalMinutes"
                     (ngModelChange)="config && config.scheduledSync && (config.scheduledSync.intervalMinutes = $event)"
                     (change)="saveConfig()"
                     min="15"
                     max="1440">
              <mat-hint>Minimum 15 minutes, maximum 24 hours</mat-hint>
            </mat-form-field>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Quick Actions -->
      <mat-card class="settings-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>bolt</mat-icon>
          <mat-card-title>Quick Actions</mat-card-title>
          <mat-card-subtitle>Run automation tasks manually</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="quick-actions">
            <button mat-stroked-button
                    color="primary"
                    (click)="runAutoCategorize()"
                    [disabled]="isProcessing">
              <mat-icon>category</mat-icon>
              Auto-Categorize All
              <mat-progress-spinner *ngIf="isProcessing === 'categorize'"
                                    mode="indeterminate"
                                    diameter="20">
              </mat-progress-spinner>
            </button>

            <button mat-stroked-button
                    color="primary"
                    (click)="runAutoMatch()"
                    [disabled]="isProcessing">
              <mat-icon>link</mat-icon>
              Run Matching
              <mat-progress-spinner *ngIf="isProcessing === 'match'"
                                    mode="indeterminate"
                                    diameter="20">
              </mat-progress-spinner>
            </button>

            <button mat-stroked-button
                    color="primary"
                    (click)="processAll()"
                    [disabled]="isProcessing">
              <mat-icon>auto_fix_high</mat-icon>
              Process All New
              <mat-progress-spinner *ngIf="isProcessing === 'process'"
                                    mode="indeterminate"
                                    diameter="20">
              </mat-progress-spinner>
            </button>
          </div>

          <div class="last-result" *ngIf="lastResult">
            <mat-icon>check_circle</mat-icon>
            <span>{{ lastResult }}</span>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- AI Rules Stats -->
      <mat-card class="settings-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>psychology</mat-icon>
          <mat-card-title>AI Learning</mat-card-title>
          <mat-card-subtitle>Statistics about learned categorization rules</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="stats-grid" *ngIf="ruleStats">
            <div class="stat">
              <span class="stat-value">{{ ruleStats.totalRules }}</span>
              <span class="stat-label">Rules</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ ruleStats.activeRules }}</span>
              <span class="stat-label">Active</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ ruleStats.totalTimesApplied }}</span>
              <span class="stat-label">Applications</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ (ruleStats.averageConfidence || 0).toFixed(0) }}%</span>
              <span class="stat-label">Avg Confidence</span>
            </div>
          </div>

          <p class="info-text">
            Rules are automatically created when you categorize transactions.
            The system learns from your choices and improves over time.
          </p>

          <div class="rule-actions">
            <button mat-stroked-button (click)="consolidateRules()" [disabled]="isProcessing">
              <mat-icon>merge_type</mat-icon>
              Consolidate Rules
            </button>
          </div>
        </mat-card-content>
      </mat-card>

      <div class="loading-overlay" *ngIf="loading">
        <mat-progress-spinner mode="indeterminate"></mat-progress-spinner>
      </div>
    </div>
  `,
  styles: [`
    .settings-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 1rem;
      position: relative;
    }

    .settings-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .settings-header mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #1976d2;
    }

    .settings-header h1 {
      margin: 0;
    }

    .settings-header p {
      margin: 0.25rem 0 0;
      color: #666;
    }

    .settings-card {
      margin-bottom: 1.5rem;
    }

    .settings-card mat-card-header {
      margin-bottom: 1rem;
    }

    .setting-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 0;
    }

    .setting-info {
      flex: 1;
      margin-right: 1rem;
    }

    .setting-info h4 {
      margin: 0 0 0.25rem;
      font-weight: 500;
    }

    .setting-info p {
      margin: 0;
      color: #666;
      font-size: 14px;
    }

    .sync-interval {
      padding: 1rem 0;
      padding-left: 1rem;
    }

    .quick-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .quick-actions button {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .last-result {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem;
      background: #e8f5e9;
      border-radius: 4px;
      color: #2e7d32;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .stat {
      text-align: center;
      padding: 1rem;
      background: #f5f5f5;
      border-radius: 8px;
    }

    .stat-value {
      display: block;
      font-size: 1.5rem;
      font-weight: 600;
      color: #1976d2;
    }

    .stat-label {
      font-size: 12px;
      color: #666;
    }

    .info-text {
      font-size: 14px;
      color: #666;
      margin: 1rem 0;
    }

    .rule-actions {
      margin-top: 1rem;
    }

    .loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    mat-divider {
      margin: 0;
    }

    @media (max-width: 600px) {
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .quick-actions {
        flex-direction: column;
      }

      .quick-actions button {
        width: 100%;
      }
    }
  `]
})
export class SettingsComponent implements OnInit {
  config: AutomationConfig | null = null;
  ruleStats: any = null;
  loading = true;
  isProcessing: string | null = null;
  lastResult: string | null = null;

  constructor(
    private http: HttpClient,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadConfig();
    this.loadRuleStats();
  }

  async loadConfig(): Promise<void> {
    try {
      this.config = await this.http
        .get<AutomationConfig>(`${environment.apiUrl}/automation/config`)
        .toPromise() as AutomationConfig;
    } catch (error) {
      console.error('Failed to load automation config:', error);
      // Use defaults
      this.config = {
        autoCategorize: true,
        autoMatch: true,
        scheduledSync: { enabled: false, intervalMinutes: 60 },
        notifyOnNewTransactions: true
      };
    } finally {
      this.loading = false;
    }
  }

  async loadRuleStats(): Promise<void> {
    try {
      const response = await this.http
        .get<{ rules: any[]; stats: any }>(`${environment.apiUrl}/rules`)
        .toPromise();
      this.ruleStats = response?.stats;
    } catch (error) {
      console.error('Failed to load rule stats:', error);
    }
  }

  async saveConfig(): Promise<void> {
    if (!this.config) return;

    try {
      await this.http
        .put(`${environment.apiUrl}/automation/config`, this.config)
        .toPromise();
      this.snackBar.open('Settings saved', 'Dismiss', { duration: 2000 });
    } catch (error) {
      console.error('Failed to save config:', error);
      this.snackBar.open('Failed to save settings', 'Dismiss', { duration: 3000 });
    }
  }

  async runAutoCategorize(): Promise<void> {
    this.isProcessing = 'categorize';
    this.lastResult = null;

    try {
      const result = await this.http
        .post<{ categorized: number }>(`${environment.apiUrl}/automation/categorize`, {})
        .toPromise();
      this.lastResult = `Auto-categorized ${result?.categorized || 0} transactions`;
    } catch (error) {
      console.error('Auto-categorize failed:', error);
      this.snackBar.open('Auto-categorization failed', 'Dismiss', { duration: 3000 });
    } finally {
      this.isProcessing = null;
    }
  }

  async runAutoMatch(): Promise<void> {
    this.isProcessing = 'match';
    this.lastResult = null;

    try {
      const result = await this.http
        .post<{ newMatches: number }>(`${environment.apiUrl}/matching/run`, {})
        .toPromise();
      this.lastResult = `Created ${result?.newMatches || 0} new matches`;
    } catch (error) {
      console.error('Matching failed:', error);
      this.snackBar.open('Matching failed', 'Dismiss', { duration: 3000 });
    } finally {
      this.isProcessing = null;
    }
  }

  async processAll(): Promise<void> {
    this.isProcessing = 'process';
    this.lastResult = null;

    try {
      const result = await this.http
        .post<{ categorized: number; matched: number }>(`${environment.apiUrl}/automation/process-new`, {})
        .toPromise();
      this.lastResult = `Categorized ${result?.categorized || 0}, matched ${result?.matched || 0}`;
    } catch (error) {
      console.error('Processing failed:', error);
      this.snackBar.open('Processing failed', 'Dismiss', { duration: 3000 });
    } finally {
      this.isProcessing = null;
    }
  }

  async consolidateRules(): Promise<void> {
    this.isProcessing = 'consolidate';

    try {
      await this.http.post(`${environment.apiUrl}/rules/consolidate`, {}).toPromise();
      await this.loadRuleStats();
      this.snackBar.open('Rules consolidated', 'Dismiss', { duration: 2000 });
    } catch (error) {
      console.error('Consolidation failed:', error);
      this.snackBar.open('Rule consolidation failed', 'Dismiss', { duration: 3000 });
    } finally {
      this.isProcessing = null;
    }
  }
}
