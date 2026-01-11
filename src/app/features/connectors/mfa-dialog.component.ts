import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { ConnectorState, MFAType } from '../../core/models/connector.model';

export interface MfaDialogData {
  connector: ConnectorState;
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
    MatProgressBarModule
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

      <!-- Push Notification Notice -->
      <div class="push-notice" *ngIf="isPushTan">
        <mat-icon>phone_android</mat-icon>
        <p>Please confirm the login request in your banking app</p>
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      </div>

      <!-- Code Input -->
      <mat-form-field appearance="outline" class="full-width" *ngIf="!isPushTan">
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
              [disabled]="!code && !isPushTan"
              (click)="onSubmit()">
        {{ isPushTan ? 'Confirmed in App' : 'Verify' }}
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

    .push-notice {
      text-align: center;
      padding: 1.5rem;
      background: #f5f5f5;
      border-radius: 8px;
      margin: 1rem 0;
    }

    .push-notice mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #1976d2;
    }

    .push-notice p {
      margin: 1rem 0;
      color: #666;
    }

    .push-notice mat-progress-bar {
      margin-top: 1rem;
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
export class MfaDialogComponent {
  code = '';

  constructor(
    public dialogRef: MatDialogRef<MfaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MfaDialogData
  ) {}

  get isPhotoTan(): boolean {
    return this.data.connector.mfaChallenge?.type === MFAType.PHOTO_TAN;
  }

  get isPushTan(): boolean {
    return this.data.connector.mfaChallenge?.type === MFAType.PUSH ||
           this.data.connector.mfaChallenge?.type === MFAType.APP_TAN;
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

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    if (this.isPushTan) {
      // For push notifications, we assume user confirmed in app
      this.dialogRef.close('push_confirmed');
    } else if (this.code) {
      this.dialogRef.close(this.code);
    }
  }
}
