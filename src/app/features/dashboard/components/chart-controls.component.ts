/**
 * Chart Controls Component
 *
 * Provides date range selection and chart type toggle.
 */

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { ChartType } from 'chart.js';

@Component({
  selector: 'app-chart-controls',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonToggleModule,
    MatButtonModule
  ],
  template: `
    <div class="chart-controls">
      <mat-form-field appearance="outline">
        <mat-label>Start Date</mat-label>
        <input matInput [matDatepicker]="startPicker" [ngModel]="startDate" (dateChange)="onStartDateChange($event)">
        <mat-datepicker-toggle matIconSuffix [for]="startPicker"></mat-datepicker-toggle>
        <mat-datepicker #startPicker></mat-datepicker>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>End Date</mat-label>
        <input matInput [matDatepicker]="endPicker" [ngModel]="endDate" (dateChange)="onEndDateChange($event)">
        <mat-datepicker-toggle matIconSuffix [for]="endPicker"></mat-datepicker-toggle>
        <mat-datepicker #endPicker></mat-datepicker>
      </mat-form-field>

      <mat-button-toggle-group [value]="chartType" (change)="chartTypeChange.emit($event.value)">
        <mat-button-toggle value="pie">Pie Chart</mat-button-toggle>
        <mat-button-toggle value="bar">Bar Chart</mat-button-toggle>
      </mat-button-toggle-group>

      <div class="date-presets">
        <button mat-stroked-button (click)="presetSelected.emit('thisMonth')">This Month</button>
        <button mat-stroked-button (click)="presetSelected.emit('lastMonth')">Last Month</button>
        <button mat-stroked-button (click)="presetSelected.emit('last3Months')">Last 3 Months</button>
        <button mat-stroked-button (click)="presetSelected.emit('thisYear')">This Year</button>
      </div>
    </div>
  `,
  styles: [`
    .chart-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: center;
      margin-bottom: 1.5rem;
      padding: 1rem;
      background: #fafafa;
      border-radius: 8px;
    }

    .chart-controls mat-form-field {
      width: 160px;
    }

    .date-presets {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .date-presets button {
      font-size: 12px;
    }

    @media (max-width: 768px) {
      .chart-controls {
        flex-direction: column;
        align-items: stretch;
      }

      .chart-controls mat-form-field {
        width: 100%;
      }

      .date-presets {
        justify-content: center;
      }
    }
  `]
})
export class ChartControlsComponent {
  @Input() startDate!: Date;
  @Input() endDate!: Date;
  @Input() chartType: ChartType = 'pie';

  @Output() startDateChange = new EventEmitter<Date>();
  @Output() endDateChange = new EventEmitter<Date>();
  @Output() chartTypeChange = new EventEmitter<ChartType>();
  @Output() presetSelected = new EventEmitter<string>();

  onStartDateChange(event: any): void {
    this.startDateChange.emit(event.value);
  }

  onEndDateChange(event: any): void {
    this.endDateChange.emit(event.value);
  }
}
