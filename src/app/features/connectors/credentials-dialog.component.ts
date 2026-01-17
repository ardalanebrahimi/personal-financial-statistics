import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { ConnectorState } from '../../core/models/connector.model';

export interface CredentialsDialogData {
  connector: ConnectorState;
}

export interface CredentialsResult {
  userId: string;
  pin: string;
  saveCredentials: boolean;
}

@Component({
  selector: 'app-credentials-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>lock</mat-icon>
      Connect to {{ data.connector.config.name }}
    </h2>
    <mat-dialog-content>
      <p class="info-text">
        Enter your online banking credentials to connect.
        <span *ngIf="!saveCredentials">Your credentials are only used for this session and are not stored.</span>
        <span *ngIf="saveCredentials">Your credentials will be encrypted and stored for automatic reconnection.</span>
      </p>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>User ID / Login</mat-label>
        <input matInput
               [(ngModel)]="userId"
               placeholder="Your online banking user ID"
               autocomplete="username">
        <mat-hint>Usually your Anmeldename or Legitimations-ID</mat-hint>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>PIN</mat-label>
        <input matInput
               [(ngModel)]="pin"
               [type]="showPin ? 'text' : 'password'"
               placeholder="Your online banking PIN"
               autocomplete="current-password"
               (keyup.enter)="onConnect()">
        <button mat-icon-button matSuffix (click)="showPin = !showPin" type="button">
          <mat-icon>{{ showPin ? 'visibility_off' : 'visibility' }}</mat-icon>
        </button>
      </mat-form-field>

      <div class="bank-info" *ngIf="data.connector.config.bankCode">
        <mat-icon>account_balance</mat-icon>
        <span>Bank Code (BLZ): {{ data.connector.config.bankCode }}</span>
      </div>

      <mat-checkbox [(ngModel)]="saveCredentials" class="save-credentials">
        Remember credentials for automatic reconnection
      </mat-checkbox>

      <p class="security-note">
        <mat-icon>security</mat-icon>
        Connection uses FinTS/HBCI protocol with TLS encryption.
        You may need to confirm with TAN/2FA.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-raised-button color="primary"
              [disabled]="!isValid()"
              (click)="onConnect()">
        Connect
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2 mat-icon {
      vertical-align: middle;
      margin-right: 8px;
    }

    mat-dialog-content {
      min-width: 350px;
    }

    .info-text {
      color: #666;
      font-size: 0.875rem;
      margin-bottom: 1.5rem;
    }

    .full-width {
      width: 100%;
      margin-bottom: 1rem;
    }

    .bank-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem;
      background: #f5f5f5;
      border-radius: 4px;
      margin-bottom: 1rem;
      font-size: 0.875rem;
    }

    .bank-info mat-icon {
      color: #666;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .security-note {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      font-size: 0.75rem;
      color: #888;
      margin-top: 1rem;
    }

    .security-note mat-icon {
      color: #4caf50;
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .save-credentials {
      display: block;
      margin: 1rem 0;
    }
  `]
})
export class CredentialsDialogComponent {
  userId = '';
  pin = '';
  showPin = false;
  saveCredentials = true;

  constructor(
    public dialogRef: MatDialogRef<CredentialsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CredentialsDialogData
  ) {}

  isValid(): boolean {
    return this.userId.trim().length > 0 && this.pin.length > 0;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConnect(): void {
    if (this.isValid()) {
      this.dialogRef.close({
        userId: this.userId.trim(),
        pin: this.pin,
        saveCredentials: this.saveCredentials
      } as CredentialsResult);
    }
  }
}
