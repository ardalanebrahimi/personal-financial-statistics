/**
 * Selection Bar Component
 *
 * Selection controls and progress indicator for transactions.
 */

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'app-selection-bar',
  standalone: true,
  imports: [
    CommonModule,
    MatCheckboxModule,
    MatButtonModule,
    MatProgressBarModule
  ],
  template: `
    <div class="selection-bar">
      <mat-checkbox
        [checked]="allVisibleSelected"
        [indeterminate]="someVisibleSelected && !allVisibleSelected"
        (change)="toggleSelectAll.emit($event.checked)"
        matTooltip="Select all visible">
        Select All
      </mat-checkbox>
      <span class="selection-info" *ngIf="selectedCount > 0">
        {{ selectedCount }} selected
        <button mat-button (click)="clearSelection.emit()">Clear</button>
      </span>
      <div class="categorization-progress" *ngIf="isCategorizing">
        <span>Categorizing {{ progressCurrent }} / {{ progressTotal }}</span>
        <mat-progress-bar mode="determinate" [value]="(progressCurrent / progressTotal) * 100"></mat-progress-bar>
      </div>
    </div>
  `,
  styles: [`
    .selection-bar {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 8px 24px;
      background: #e3f2fd;
      border-bottom: 1px solid #bbdefb;
    }

    .selection-info {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: #1976d2;
    }

    .categorization-progress {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-left: auto;
      font-size: 13px;
      color: #666;
    }

    .categorization-progress mat-progress-bar {
      width: 200px;
    }
  `]
})
export class SelectionBarComponent {
  @Input() selectedCount = 0;
  @Input() allVisibleSelected = false;
  @Input() someVisibleSelected = false;
  @Input() isCategorizing = false;
  @Input() progressCurrent = 0;
  @Input() progressTotal = 0;

  @Output() toggleSelectAll = new EventEmitter<boolean>();
  @Output() clearSelection = new EventEmitter<void>();
}
