import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ConnectorState, MFAType } from '../../core/models/connector.model';
import { ConnectorService } from '../../services/connector.service';

export interface MfaDialogData {
  connector: ConnectorState;
}

export interface MfaDialogResult {
  code?: string;
  action: 'submit' | 'cancel' | 'confirmed';
}

@Component({
  selector: 'app-mfa-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>security</mat-icon>
      Authentication Required
    </h2>
    <mat-dialog-content>
      <div class="mfa-info">
        <p class="connector-name">{{ data.connector.config.name }}</p>
        <p class="mfa-message">{{ data.connector.mfaChallenge?.message }}</p>
      </div>

      <!-- PhotoTAN Image -->
      <div class="photo-tan" *ngIf="isPhotoTan && data.connector.mfaChallenge?.imageData">
        <img [src]="data.connector.mfaChallenge?.imageData" alt="PhotoTAN">
      </div>

      <!-- Decoupled TAN Notice (pushTAN - waiting for app confirmation) -->
      <div class="decoupled-notice" *ngIf="isDecoupled">
        <mat-icon>phone_android</mat-icon>
        <p>Please confirm the request in your banking app</p>
        <mat-spinner diameter="40"></mat-spinner>
        <p class="waiting-text">Waiting for confirmation...</p>
        <p class="poll-status" *ngIf="pollCount > 0">Checking... ({{ pollCount }})</p>
      </div>

      <!-- Code Input (only for non-decoupled TANs) -->
      <mat-form-field appearance="outline" class="full-width" *ngIf="!isDecoupled">
        <mat-label>{{ getCodeLabel() }}</mat-label>
        <input matInput
               [(ngModel)]="code"
               [type]="'text'"
               autocomplete="one-time-code"
               (keyup.enter)="onSubmit()">
        <mat-hint>Enter the code from your {{ getCodeSource() }}</mat-hint>
      </mat-form-field>

      <!-- Expiry Warning -->
      <p class="expiry" *ngIf="data.connector.mfaChallenge?.expiresAt">
        Expires at: {{ data.connector.mfaChallenge?.expiresAt | date:'mediumTime' }}
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-raised-button color="primary"
              *ngIf="!isDecoupled"
              [disabled]="!code"
              (click)="onSubmit()">
        Verify
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2 mat-icon {
      vertical-align: middle;
      margin-right: 8px;
    }

    mat-dialog-content {
      min-width: 300px;
    }

    .mfa-info {
      margin-bottom: 1.5rem;
    }

    .connector-name {
      font-weight: 500;
      margin: 0 0 0.5rem;
    }

    .mfa-message {
      color: #666;
      margin: 0;
    }

    .photo-tan {
      text-align: center;
      margin: 1rem 0;
    }

    .photo-tan img {
      max-width: 200px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }

    .decoupled-notice {
      text-align: center;
      padding: 1.5rem;
      background: #e3f2fd;
      border-radius: 8px;
      margin: 1rem 0;
    }

    .decoupled-notice mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #1976d2;
    }

    .decoupled-notice p {
      margin: 1rem 0 0.5rem;
      color: #666;
    }

    .decoupled-notice .waiting-text {
      font-weight: 500;
      color: #1976d2;
    }

    .decoupled-notice .poll-status {
      font-size: 0.75rem;
      color: #999;
    }

    .decoupled-notice mat-spinner {
      margin: 1rem auto;
    }

    .full-width {
      width: 100%;
    }

    .expiry {
      font-size: 0.75rem;
      color: #999;
      text-align: center;
      margin-top: 1rem;
    }
  `]
})
export class MfaDialogComponent implements OnInit, OnDestroy {
  code = '';
  pollCount = 0;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private maxPollAttempts = 60; // Poll for up to 2 minutes (60 * 2 seconds)

  constructor(
    public dialogRef: MatDialogRef<MfaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MfaDialogData,
    private connectorService: ConnectorService
  ) {}

  ngOnInit(): void {
    // Start polling for decoupled TAN
    if (this.isDecoupled) {
      this.startPolling();
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  get isPhotoTan(): boolean {
    return this.data.connector.mfaChallenge?.type === MFAType.PHOTO_TAN;
  }

  get isDecoupled(): boolean {
    // Check if it's a decoupled TAN (user confirms in external app)
    return this.data.connector.mfaChallenge?.decoupled === true ||
           this.data.connector.mfaChallenge?.type === MFAType.DECOUPLED;
  }

  getCodeLabel(): string {
    switch (this.data.connector.mfaChallenge?.type) {
      case MFAType.SMS:
        return 'SMS Code';
      case MFAType.EMAIL:
        return 'Email Code';
      case MFAType.PHOTO_TAN:
        return 'PhotoTAN Code';
      case MFAType.CHIP_TAN:
        return 'ChipTAN Code';
      case MFAType.TOTP:
        return 'Authenticator Code';
      default:
        return 'Verification Code';
    }
  }

  getCodeSource(): string {
    switch (this.data.connector.mfaChallenge?.type) {
      case MFAType.SMS:
        return 'SMS message';
      case MFAType.EMAIL:
        return 'email';
      case MFAType.PHOTO_TAN:
        return 'PhotoTAN app';
      case MFAType.CHIP_TAN:
        return 'TAN generator';
      case MFAType.TOTP:
        return 'authenticator app';
      default:
        return 'verification device';
    }
  }

  private startPolling(): void {
    console.log('[MFA Dialog] Starting decoupled TAN polling...');

    // Poll every 2 seconds
    this.pollInterval = setInterval(async () => {
      this.pollCount++;

      if (this.pollCount >= this.maxPollAttempts) {
        console.log('[MFA Dialog] Polling timeout reached');
        this.stopPolling();
        return;
      }

      try {
        // Check if the TAN was confirmed by polling the connector status
        await this.checkDecoupledStatus();
      } catch (error) {
        console.error('[MFA Dialog] Polling error:', error);
      }
    }, 2000);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async checkDecoupledStatus(): Promise<void> {
    const connectorId = this.data.connector.config.id;
    const reference = this.data.connector.mfaChallenge?.reference;

    try {
      // Poll the backend to check if decoupled TAN was confirmed
      const result = await this.connectorService.pollDecoupledStatus(connectorId, reference);

      if (result.confirmed) {
        console.log('[MFA Dialog] Decoupled TAN confirmed!');
        this.stopPolling();
        this.dialogRef.close({ action: 'confirmed' } as MfaDialogResult);
      } else if (result.expired) {
        console.log('[MFA Dialog] Decoupled TAN expired');
        this.stopPolling();
        // Keep dialog open so user can cancel
      }
    } catch (error) {
      // Ignore polling errors, keep trying
      console.error('[MFA Dialog] Poll check failed:', error);
    }
  }

  onCancel(): void {
    this.stopPolling();
    this.dialogRef.close({ action: 'cancel' } as MfaDialogResult);
  }

  onSubmit(): void {
    this.stopPolling();
    if (this.code) {
      this.dialogRef.close({ code: this.code, action: 'submit' } as MfaDialogResult);
    }
  }
}
