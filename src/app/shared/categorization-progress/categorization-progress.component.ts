import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { Subscription } from 'rxjs';
import {
  CategorizationService,
  CategorizationJob,
  CategorizationJobStatus
} from '../../services/categorization.service';

@Component({
  selector: 'app-categorization-progress',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatChipsModule
  ],
  template: `
    <div class="categorization-progress" *ngIf="job" (click)="openReviewDialog()">
      <div class="progress-header">
        <mat-icon class="category-icon" [class.spinning]="job.status === 'processing'">
          {{ job.status === 'processing' ? 'sync' : 'category' }}
        </mat-icon>
        <span class="progress-label">AI Categorization</span>
        <mat-chip-set class="status-chip">
          <mat-chip [style.background-color]="getStatusInfo().color" class="status-chip-item">
            {{ getStatusInfo().label }}
          </mat-chip>
        </mat-chip-set>
      </div>

      <div class="progress-stats">
        <span class="stat">
          <mat-icon class="stat-icon">check_circle</mat-icon>
          {{ status?.appliedCount || 0 }}
        </span>
        <span class="stat" *ngIf="(status?.correctedCount || 0) > 0">
          <mat-icon class="stat-icon corrected">edit</mat-icon>
          {{ status?.correctedCount || 0 }}
        </span>
        <span class="stat-divider">|</span>
        <span class="stat total">{{ status?.processedCount || 0 }} / {{ status?.totalCount || 0 }}</span>
      </div>

      <mat-progress-bar
        mode="determinate"
        [value]="status?.progress || 0"
        [color]="job.status === 'paused' ? 'warn' : 'primary'"
        class="progress-bar">
      </mat-progress-bar>

      <div class="progress-actions">
        <button mat-icon-button
                *ngIf="job.status === 'processing'"
                (click)="pauseJob($event)"
                matTooltip="Pause categorization">
          <mat-icon>pause</mat-icon>
        </button>
        <button mat-icon-button
                *ngIf="job.status === 'paused'"
                (click)="resumeJob($event)"
                matTooltip="Resume categorization">
          <mat-icon>play_arrow</mat-icon>
        </button>
        <button mat-icon-button
                *ngIf="job.status === 'processing' || job.status === 'paused'"
                (click)="cancelJob($event)"
                matTooltip="Cancel categorization"
                color="warn">
          <mat-icon>close</mat-icon>
        </button>
        <button mat-icon-button
                matTooltip="View details"
                (click)="openReviewDialog($event)">
          <mat-icon>open_in_new</mat-icon>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .categorization-progress {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 1px solid #90caf9;
    }

    .categorization-progress:hover {
      background: linear-gradient(135deg, #bbdefb 0%, #90caf9 100%);
      box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
    }

    .progress-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .category-icon {
      color: #1976d2;
    }

    .spinning {
      animation: spin 1.5s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .progress-label {
      font-weight: 500;
      color: #1565c0;
      white-space: nowrap;
    }

    .status-chip {
      margin-left: 4px;
    }

    .status-chip-item {
      color: white;
      font-size: 11px;
      height: 20px;
      min-height: 20px;
    }

    .progress-stats {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #1565c0;
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .stat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: #4caf50;
    }

    .stat-icon.corrected {
      color: #ff9800;
    }

    .stat-divider {
      color: #90caf9;
    }

    .stat.total {
      font-weight: 500;
    }

    .progress-bar {
      flex: 1;
      min-width: 100px;
      max-width: 200px;
      height: 6px;
      border-radius: 3px;
    }

    .progress-actions {
      display: flex;
      align-items: center;
      gap: 0;
    }

    .progress-actions button {
      width: 32px;
      height: 32px;
    }

    .progress-actions mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
  `]
})
export class CategorizationProgressComponent implements OnInit, OnDestroy {
  @Output() openDialog = new EventEmitter<void>();

  job: CategorizationJob | null = null;
  status: CategorizationJobStatus | null = null;

  private jobSubscription: Subscription | null = null;
  private statusSubscription: Subscription | null = null;

  constructor(private categorizationService: CategorizationService) {}

  ngOnInit() {
    this.jobSubscription = this.categorizationService.activeJob$.subscribe(job => {
      this.job = job;
    });

    this.statusSubscription = this.categorizationService.jobStatus$.subscribe(status => {
      this.status = status;
    });

    // Check for active jobs on init
    this.categorizationService.checkForActiveJobs();
  }

  ngOnDestroy() {
    this.jobSubscription?.unsubscribe();
    this.statusSubscription?.unsubscribe();
  }

  getStatusInfo(): { label: string; color: string } {
    if (!this.job) {
      return { label: 'Unknown', color: '#9e9e9e' };
    }
    const info = this.categorizationService.getStatusInfo(this.job.status);
    return { label: info.label, color: info.color };
  }

  openReviewDialog(event?: Event) {
    event?.stopPropagation();
    this.openDialog.emit();
  }

  async pauseJob(event: Event) {
    event.stopPropagation();
    if (this.job) {
      await this.categorizationService.pauseJob(this.job.id);
    }
  }

  async resumeJob(event: Event) {
    event.stopPropagation();
    if (this.job) {
      await this.categorizationService.resumeJob(this.job.id);
    }
  }

  async cancelJob(event: Event) {
    event.stopPropagation();
    if (this.job && confirm('Are you sure you want to cancel the categorization?')) {
      await this.categorizationService.cancelJob(this.job.id);
    }
  }
}
