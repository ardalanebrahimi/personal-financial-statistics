import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { TrendsService, YearOverYearData } from '../../services/trends.service';

@Component({
  selector: 'app-year-over-year',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    NgChartsModule
  ],
  templateUrl: './year-over-year.component.html',
  styleUrl: './year-over-year.component.scss'
})
export class YearOverYearComponent implements OnInit, OnChanges {
  @Input() startDate!: Date;
  @Input() endDate!: Date;

  loading = false;
  yoyData: YearOverYearData[] = [];
  years: number[] = [];
  yoyChange = 0;
  highestMonth = '';
  lowestMonth = '';

  yearColors = ['#1976d2', '#f44336', '#4caf50', '#ff9800', '#9c27b0'];

  chartData: ChartData<'bar'> | undefined;

  seasonalPatterns: { season: string; months: string; avgSpending: number; icon: string; color: string }[] = [];

  chartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top'
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.raw as number;
            return `${context.dataset.label}: €${value.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => `€${value.toLocaleString('de-DE')}`
        }
      }
    }
  };

  constructor(private trendsService: TrendsService) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['startDate'] || changes['endDate']) && !changes['startDate']?.firstChange) {
      this.loadData();
    }
  }

  private loadData(): void {
    if (!this.startDate || !this.endDate) return;

    this.loading = true;
    this.trendsService.getYearOverYearData(this.startDate, this.endDate).subscribe({
      next: (data) => {
        this.yoyData = data;
        this.extractYears();
        this.calculateStats();
        this.calculateSeasonalPatterns();
        this.buildChart();
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load year-over-year data:', err);
        this.loading = false;
      }
    });
  }

  private extractYears(): void {
    const yearSet = new Set<number>();
    this.yoyData.forEach(d => d.years.forEach(y => yearSet.add(y.year)));
    this.years = Array.from(yearSet).sort();
  }

  private calculateStats(): void {
    if (this.years.length < 2 || this.yoyData.length === 0) {
      this.yoyChange = 0;
      return;
    }

    const lastYear = this.years[this.years.length - 1];
    const prevYear = this.years[this.years.length - 2];

    let lastYearTotal = 0;
    let prevYearTotal = 0;

    this.yoyData.forEach(d => {
      const lastYearData = d.years.find(y => y.year === lastYear);
      const prevYearData = d.years.find(y => y.year === prevYear);
      lastYearTotal += lastYearData?.amount || 0;
      prevYearTotal += prevYearData?.amount || 0;
    });

    this.yoyChange = prevYearTotal > 0
      ? ((lastYearTotal - prevYearTotal) / prevYearTotal) * 100
      : 0;

    // Find highest and lowest months
    const monthTotals = this.yoyData.map(d => ({
      month: d.monthLabel,
      total: d.years.reduce((s, y) => s + y.amount, 0)
    }));

    const sorted = monthTotals.filter(m => m.total > 0).sort((a, b) => b.total - a.total);
    this.highestMonth = sorted[0]?.month || '';
    this.lowestMonth = sorted[sorted.length - 1]?.month || '';
  }

  private calculateSeasonalPatterns(): void {
    const seasons = [
      { season: 'Winter', months: 'Dec-Feb', monthIndices: [11, 0, 1], icon: 'ac_unit', color: '#2196f3' },
      { season: 'Spring', months: 'Mar-May', monthIndices: [2, 3, 4], icon: 'local_florist', color: '#4caf50' },
      { season: 'Summer', months: 'Jun-Aug', monthIndices: [5, 6, 7], icon: 'wb_sunny', color: '#ff9800' },
      { season: 'Fall', months: 'Sep-Nov', monthIndices: [8, 9, 10], icon: 'eco', color: '#795548' }
    ];

    this.seasonalPatterns = seasons.map(s => {
      let total = 0;
      let count = 0;

      this.yoyData
        .filter(d => s.monthIndices.includes(d.month))
        .forEach(d => {
          d.years.forEach(y => {
            if (y.amount > 0) {
              total += y.amount;
              count++;
            }
          });
        });

      return {
        ...s,
        avgSpending: count > 0 ? total / count : 0
      };
    });
  }

  private buildChart(): void {
    if (this.yoyData.length === 0 || this.years.length === 0) {
      this.chartData = undefined;
      return;
    }

    const labels = this.yoyData.map(d => d.monthLabel);

    this.chartData = {
      labels,
      datasets: this.years.map((year, idx) => ({
        label: String(year),
        data: this.yoyData.map(d => d.years.find(y => y.year === year)?.amount || 0),
        backgroundColor: this.yearColors[idx % this.yearColors.length] + 'cc',
        borderColor: this.yearColors[idx % this.yearColors.length],
        borderWidth: 1
      }))
    };
  }

  getChange(row: YearOverYearData): number | null {
    if (this.years.length < 2) return null;

    const lastYear = this.years[this.years.length - 1];
    const prevYear = this.years[this.years.length - 2];

    const lastYearAmount = row.years.find(y => y.year === lastYear)?.amount || 0;
    const prevYearAmount = row.years.find(y => y.year === prevYear)?.amount || 0;

    if (prevYearAmount === 0) return null;
    return ((lastYearAmount - prevYearAmount) / prevYearAmount) * 100;
  }
}
