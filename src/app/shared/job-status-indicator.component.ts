import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { Subscription } from 'rxjs';
import { JobService, Job } from '../services/job.service';

@Component({
  selector: 'app-job-status-indicator',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatMenuModule,
    MatBadgeModule
  ],
  template: `
    <div class="job-indicator" *ngIf="activeJobs.length > 0">
      <button mat-icon-button
              [matMenuTriggerFor]="jobMenu"
              [matBadge]="activeJobs.length"
              matBadgeColor="accent"
              matBadgeSize="small"
              matTooltip="Background jobs running">
        <mat-icon class="spinning">sync</mat-icon>
      </button>

      <mat-menu #jobMenu="matMenu" class="job-menu">
        <div class="job-menu-header" (click)="$event.stopPropagation()">
          <mat-icon>work</mat-icon>
          <span>Active Jobs</span>
        </div>

        <div class="job-list" (click)="$event.stopPropagation()">
          <div class="job-item" *ngFor="let job of activeJobs">
            <div class="job-info">
              <div class="job-title">
                <mat-icon class="job-type-icon">{{ getJobIcon(job.type) }}</mat-icon>
                <span>{{ jobService.getJobTypeDisplayName(job.type) }}</span>
              </div>
              <div class="job-file" *ngIf="job.fileName">{{ job.fileName }}</div>
              <div class="job-progress-info">
                {{ job.processed }} / {{ job.total }} ({{ job.progress }}%)
              </div>
              <mat-progress-bar
                mode="determinate"
                [value]="job.progress"
                [color]="job.errors > 0 ? 'warn' : 'primary'">
              </mat-progress-bar>
              <div class="job-errors" *ngIf="job.errors > 0">
                {{ job.errors }} error(s)
              </div>
            </div>
            <button mat-icon-button
                    color="warn"
                    matTooltip="Cancel job"
                    (click)="cancelJob(job.id); $event.stopPropagation()">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <div class="no-jobs" *ngIf="activeJobs.length === 0">
            No active jobs
          </div>
        </div>
      </mat-menu>
    </div>

    <!-- Compact inline indicator for single job -->
    <div class="inline-progress" *ngIf="activeJobs.length === 1">
      <span class="progress-text">{{ activeJobs[0].progress }}%</span>
      <mat-progress-bar
        mode="determinate"
        [value]="activeJobs[0].progress"
        class="inline-bar">
      </mat-progress-bar>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .job-indicator {
      display: flex;
      align-items: center;
    }

    .spinning {
      animation: spin 1.5s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .job-menu-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      font-weight: 500;
      border-bottom: 1px solid #e0e0e0;
      cursor: default;
    }

    .job-list {
      padding: 8px;
      max-height: 300px;
      overflow-y: auto;
      min-width: 300px;
    }

    .job-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 12px;
      background: #f5f5f5;
      border-radius: 8px;
      margin-bottom: 8px;
    }

    .job-item:last-child {
      margin-bottom: 0;
    }

    .job-info {
      flex: 1;
      min-width: 0;
    }

    .job-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
      margin-bottom: 4px;
    }

    .job-type-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: #666;
    }

    .job-file {
      font-size: 12px;
      color: #666;
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .job-progress-info {
      font-size: 11px;
      color: #888;
      margin-bottom: 4px;
    }

    .job-errors {
      font-size: 11px;
      color: #f44336;
      margin-top: 4px;
    }

    mat-progress-bar {
      border-radius: 4px;
    }

    .no-jobs {
      padding: 16px;
      text-align: center;
      color: #666;
    }

    .inline-progress {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 100px;
    }

    .progress-text {
      font-size: 12px;
      color: #666;
      white-space: nowrap;
    }

    .inline-bar {
      width: 80px;
      height: 4px;
    }
  `]
})
export class JobStatusIndicatorComponent implements OnInit, OnDestroy {
  activeJobs: Job[] = [];
  private subscription: Subscription | null = null;

  constructor(public jobService: JobService) {}

  ngOnInit() {
    this.subscription = this.jobService.activeJobs$.subscribe(jobs => {
      this.activeJobs = jobs;
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  getJobIcon(type: Job['type']): string {
    switch (type) {
      case 'csv_import': return 'upload_file';
      case 'amazon_import': return 'shopping_cart';
      case 'categorization': return 'category';
      case 'order_matching': return 'link';
      default: return 'work';
    }
  }

  async cancelJob(jobId: string) {
    try {
      await this.jobService.cancelJob(jobId);
    } catch (error) {
      console.error('Failed to cancel job:', error);
    }
  }
}
