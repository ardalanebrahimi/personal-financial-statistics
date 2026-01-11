import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective, NgChartsModule } from 'ng2-charts';
import { Chart, ChartConfiguration, ChartType, registerables, ChartData } from 'chart.js';
import { ChartService } from 'src/app/services/chart.service';

// Register all required components for Chart.js
Chart.register(...registerables);

@Component({
  selector: 'app-analytics',
  template: `
    <div class="analytics-container">
      <mat-button-toggle-group [(ngModel)]="selectedView">
        <mat-button-toggle value="pie">Pie Chart</mat-button-toggle>
        <mat-button-toggle value="bar">Bar Chart</mat-button-toggle>
      </mat-button-toggle-group>

      <mat-card *ngIf="chartData">
        <div class="chart-container">
          <canvas baseChart
            [type]="selectedView"
            [datasets]="chartData.datasets"
            [labels]="chartData.labels"
            [options]="chartOptions">
          </canvas>
        </div>
      </mat-card>
    </div>
  `,
  styles: [`
    .analytics-container {
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      align-items: center;
    }
    mat-card {
      width: 70%;
      max-width: 800px;
    }
    .chart-container {
      padding: 16px;
      position: relative;
    }
  `],
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonToggleModule,
    FormsModule,
    NgChartsModule
  ],
  standalone: true
})
export class AnalyticsComponent implements OnInit {
  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;
  selectedView: ChartType = 'pie';
  chartData: ChartData<'pie' | 'bar'> | undefined;
  chartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: true,
        position: 'top'
      }
    }
  };

  constructor(private chartService: ChartService) {}

  async ngOnInit() {
    this.chartData = await this.chartService.getChartData();
  }
}