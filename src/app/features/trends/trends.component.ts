import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CashFlowComponent } from './components/cash-flow/cash-flow.component';
import { CategoryTrendsComponent } from './components/category-trends/category-trends.component';
import { MonthComparisonComponent } from './components/month-comparison/month-comparison.component';
import { SavingsRateComponent } from './components/savings-rate/savings-rate.component';
import { RollingAverageComponent } from './components/rolling-average/rolling-average.component';
import { HeatMapComponent } from './components/heat-map/heat-map.component';
import { AnomaliesComponent } from './components/anomalies/anomalies.component';
import { IncomeSourcesComponent } from './components/income-sources/income-sources.component';
import { CumulativeSpendingComponent } from './components/cumulative-spending/cumulative-spending.component';
import { YearOverYearComponent } from './components/year-over-year/year-over-year.component';

export type DatePreset = 'last6Months' | 'last12Months' | 'thisYear' | 'lastYear' | 'allTime';

@Component({
  selector: 'app-trends',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTabsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatFormFieldModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatInputModule,
    MatSelectModule,
    CashFlowComponent,
    CategoryTrendsComponent,
    MonthComparisonComponent,
    SavingsRateComponent,
    RollingAverageComponent,
    HeatMapComponent,
    AnomaliesComponent,
    IncomeSourcesComponent,
    CumulativeSpendingComponent,
    YearOverYearComponent
  ],
  template: `
    <div class="trends-container">
      <header class="trends-header">
        <div class="header-content">
          <h1>Trends & Analysis</h1>
          <p>Track your financial patterns over time</p>
        </div>
      </header>

      <!-- Global Date Range Controls -->
      <mat-card class="controls-card">
        <mat-card-content>
          <div class="controls-row">
            <div class="date-presets">
              <mat-button-toggle-group [(ngModel)]="selectedPreset" (change)="onPresetChange()">
                <mat-button-toggle value="last6Months">Last 6 Months</mat-button-toggle>
                <mat-button-toggle value="last12Months">Last 12 Months</mat-button-toggle>
                <mat-button-toggle value="thisYear">This Year</mat-button-toggle>
                <mat-button-toggle value="lastYear">Last Year</mat-button-toggle>
                <mat-button-toggle value="allTime">All Time</mat-button-toggle>
              </mat-button-toggle-group>
            </div>

            <div class="custom-date-range">
              <mat-form-field appearance="outline">
                <mat-label>Start Date</mat-label>
                <input matInput [matDatepicker]="startPicker" [(ngModel)]="startDate" (dateChange)="onCustomDateChange()">
                <mat-datepicker-toggle matIconSuffix [for]="startPicker"></mat-datepicker-toggle>
                <mat-datepicker #startPicker></mat-datepicker>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>End Date</mat-label>
                <input matInput [matDatepicker]="endPicker" [(ngModel)]="endDate" (dateChange)="onCustomDateChange()">
                <mat-datepicker-toggle matIconSuffix [for]="endPicker"></mat-datepicker-toggle>
                <mat-datepicker #endPicker></mat-datepicker>
              </mat-form-field>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Report Tabs -->
      <mat-tab-group animationDuration="200ms" (selectedIndexChange)="onTabChange($event)">
        <!-- Tab 1: Cash Flow -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>account_balance_wallet</mat-icon>
            <span class="tab-label">Cash Flow</span>
          </ng-template>
          <ng-template matTabContent>
            <app-cash-flow [startDate]="startDate" [endDate]="endDate"></app-cash-flow>
          </ng-template>
        </mat-tab>

        <!-- Tab 2: Category Trends -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>show_chart</mat-icon>
            <span class="tab-label">Categories</span>
          </ng-template>
          <ng-template matTabContent>
            <app-category-trends [startDate]="startDate" [endDate]="endDate"></app-category-trends>
          </ng-template>
        </mat-tab>

        <!-- Tab 3: Month Comparison -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>compare_arrows</mat-icon>
            <span class="tab-label">MoM</span>
          </ng-template>
          <ng-template matTabContent>
            <app-month-comparison></app-month-comparison>
          </ng-template>
        </mat-tab>

        <!-- Tab 4: Savings Rate -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>savings</mat-icon>
            <span class="tab-label">Savings</span>
          </ng-template>
          <ng-template matTabContent>
            <app-savings-rate [startDate]="startDate" [endDate]="endDate"></app-savings-rate>
          </ng-template>
        </mat-tab>

        <!-- Tab 5: Rolling Averages -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>auto_graph</mat-icon>
            <span class="tab-label">Rolling Avg</span>
          </ng-template>
          <ng-template matTabContent>
            <app-rolling-average [startDate]="startDate" [endDate]="endDate"></app-rolling-average>
          </ng-template>
        </mat-tab>

        <!-- Tab 6: Heat Map -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>grid_on</mat-icon>
            <span class="tab-label">Heat Map</span>
          </ng-template>
          <ng-template matTabContent>
            <app-heat-map [startDate]="startDate" [endDate]="endDate"></app-heat-map>
          </ng-template>
        </mat-tab>

        <!-- Tab 7: Anomalies -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>bolt</mat-icon>
            <span class="tab-label">Anomalies</span>
          </ng-template>
          <ng-template matTabContent>
            <app-anomalies [startDate]="startDate" [endDate]="endDate"></app-anomalies>
          </ng-template>
        </mat-tab>

        <!-- Tab 8: Income Sources -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>paid</mat-icon>
            <span class="tab-label">Income</span>
          </ng-template>
          <ng-template matTabContent>
            <app-income-sources [startDate]="startDate" [endDate]="endDate"></app-income-sources>
          </ng-template>
        </mat-tab>

        <!-- Tab 9: Cumulative Spending -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>timeline</mat-icon>
            <span class="tab-label">Cumulative</span>
          </ng-template>
          <ng-template matTabContent>
            <app-cumulative-spending [startDate]="startDate" [endDate]="endDate"></app-cumulative-spending>
          </ng-template>
        </mat-tab>

        <!-- Tab 10: Year over Year -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>calendar_month</mat-icon>
            <span class="tab-label">YoY</span>
          </ng-template>
          <ng-template matTabContent>
            <app-year-over-year [startDate]="startDate" [endDate]="endDate"></app-year-over-year>
          </ng-template>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .trends-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1rem;
    }

    .trends-header {
      margin-bottom: 1.5rem;
    }

    .header-content h1 {
      margin: 0;
      font-size: 2rem;
    }

    .header-content p {
      margin: 0.5rem 0 0;
      color: #666;
    }

    .controls-card {
      margin-bottom: 1.5rem;
    }

    .controls-row {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      align-items: center;
    }

    .date-presets {
      flex: 1;
    }

    .date-presets mat-button-toggle-group {
      flex-wrap: wrap;
    }

    .custom-date-range {
      display: flex;
      gap: 1rem;
      align-items: center;
    }

    .custom-date-range mat-form-field {
      width: 150px;
    }

    mat-tab-group {
      background: white;
      border-radius: 8px;
    }

    .tab-label {
      margin-left: 8px;
    }

    ::ng-deep .mat-mdc-tab-body-wrapper {
      padding: 1.5rem;
    }

    /* Make tabs scrollable on smaller screens */
    ::ng-deep .mat-mdc-tab-header {
      overflow-x: auto;
    }

    ::ng-deep .mat-mdc-tab-labels {
      flex-wrap: nowrap;
    }

    @media (max-width: 1200px) {
      .tab-label {
        display: none;
      }
    }

    @media (max-width: 900px) {
      .controls-row {
        flex-direction: column;
        align-items: stretch;
      }

      .date-presets mat-button-toggle-group {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
      }

      .custom-date-range {
        justify-content: center;
      }
    }

    @media (max-width: 600px) {
      .custom-date-range {
        flex-direction: column;
      }

      .custom-date-range mat-form-field {
        width: 100%;
      }
    }
  `]
})
export class TrendsComponent implements OnInit {
  selectedPreset: DatePreset = 'last6Months';
  startDate: Date;
  endDate: Date;
  selectedTab = 0;

  constructor() {
    const now = new Date();
    this.endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0); // End of current month
    this.startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1); // 6 months ago
  }

  ngOnInit(): void {
    this.applyPreset(this.selectedPreset);
  }

  onPresetChange(): void {
    this.applyPreset(this.selectedPreset);
  }

  onCustomDateChange(): void {
    // When user manually changes dates, clear the preset selection
    this.selectedPreset = 'allTime'; // or could set to null with a custom type
  }

  onTabChange(index: number): void {
    this.selectedTab = index;
  }

  private applyPreset(preset: DatePreset): void {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    switch (preset) {
      case 'last6Months':
        this.startDate = new Date(currentYear, currentMonth - 5, 1);
        this.endDate = new Date(currentYear, currentMonth + 1, 0);
        break;
      case 'last12Months':
        this.startDate = new Date(currentYear, currentMonth - 11, 1);
        this.endDate = new Date(currentYear, currentMonth + 1, 0);
        break;
      case 'thisYear':
        this.startDate = new Date(currentYear, 0, 1);
        this.endDate = new Date(currentYear, 11, 31);
        break;
      case 'lastYear':
        this.startDate = new Date(currentYear - 1, 0, 1);
        this.endDate = new Date(currentYear - 1, 11, 31);
        break;
      case 'allTime':
        // Set to a very early date and today
        this.startDate = new Date(2000, 0, 1);
        this.endDate = new Date(currentYear, currentMonth + 1, 0);
        break;
    }
  }
}
