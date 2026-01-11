import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AvailableConnector, ConnectorType } from '../../core/models/connector.model';

export interface AddConnectorDialogData {
  availableConnectors: AvailableConnector[];
}

@Component({
  selector: 'app-add-connector-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <h2 mat-dialog-title>Add Connector</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Connector Type</mat-label>
        <mat-select [(ngModel)]="selectedType" (selectionChange)="onTypeChange()">
          <mat-option *ngFor="let connector of implementedConnectors" [value]="connector.type">
            <mat-icon>{{ connector.icon }}</mat-icon>
            {{ connector.name }}
          </mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Display Name</mat-label>
        <input matInput [(ngModel)]="name" placeholder="e.g., My Sparkasse Account">
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width" *ngIf="requiresBankCode">
        <mat-label>Bank Code (BLZ)</mat-label>
        <input matInput [(ngModel)]="bankCode" placeholder="e.g., 70050000">
        <mat-hint>Enter your bank's BLZ number</mat-hint>
      </mat-form-field>

      <p class="description" *ngIf="selectedConnector">
        {{ selectedConnector.description }}
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-raised-button color="primary"
              [disabled]="!isValid()"
              (click)="onAdd()">
        Add Connector
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width {
      width: 100%;
      margin-bottom: 1rem;
    }

    mat-dialog-content {
      min-width: 300px;
    }

    .description {
      color: #666;
      font-size: 0.875rem;
      margin-top: 1rem;
    }

    mat-icon {
      margin-right: 8px;
      vertical-align: middle;
    }
  `]
})
export class AddConnectorDialogComponent {
  selectedType: ConnectorType | null = null;
  name = '';
  bankCode = '';

  implementedConnectors: AvailableConnector[];

  constructor(
    public dialogRef: MatDialogRef<AddConnectorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AddConnectorDialogData
  ) {
    // For Phase 1, show all connectors but allow adding any for testing
    // In later phases, filter to only implemented ones
    this.implementedConnectors = data.availableConnectors;
  }

  get selectedConnector(): AvailableConnector | undefined {
    return this.implementedConnectors.find(c => c.type === this.selectedType);
  }

  get requiresBankCode(): boolean {
    return this.selectedConnector?.requiresBankCode || false;
  }

  onTypeChange(): void {
    if (this.selectedConnector && !this.name) {
      this.name = this.selectedConnector.name;
    }
  }

  isValid(): boolean {
    if (!this.selectedType || !this.name.trim()) {
      return false;
    }
    if (this.requiresBankCode && !this.bankCode.trim()) {
      return false;
    }
    return true;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onAdd(): void {
    if (this.isValid()) {
      this.dialogRef.close({
        type: this.selectedType,
        name: this.name.trim(),
        bankCode: this.bankCode.trim() || undefined
      });
    }
  }
}
