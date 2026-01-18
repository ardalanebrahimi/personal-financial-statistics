import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { Subscription } from 'rxjs';
import {
  CategorizationService,
  CategorizationJob,
  CategorizationJobStatus,
  CategorizationResult,
  ConversationMessage
} from '../../services/categorization.service';
import { CategoryService } from '../../services/category.service';
import { Category } from '../../core/models/transaction.model';

export interface CategorizationDialogData {
  jobId?: string;
}

@Component({
  selector: 'app-categorization-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatChipsModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatCheckboxModule,
    MatExpansionModule
  ],
  templateUrl: './categorization-dialog.component.html',
  styleUrl: './categorization-dialog.component.scss'
})
export class CategorizationDialogComponent implements OnInit, OnDestroy {
  job: CategorizationJob | null = null;
  status: CategorizationJobStatus | null = null;
  categories: Category[] = [];

  // Correction data for each result
  correctionData: Record<string, {
    category: string;
    newCategory: string;
    subcategory: string;
    createRule: boolean;
  }> = {};

  // Chat
  chatMessage = '';
  isSendingMessage = false;

  private jobSubscription: Subscription | null = null;
  private statusSubscription: Subscription | null = null;

  constructor(
    private dialogRef: MatDialogRef<CategorizationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CategorizationDialogData,
    private categorizationService: CategorizationService,
    private categoryService: CategoryService,
    private snackBar: MatSnackBar
  ) {}

  async ngOnInit() {
    // Load categories
    this.categories = await this.categoryService.getCategories();

    // Subscribe to job updates
    this.jobSubscription = this.categorizationService.activeJob$.subscribe(job => {
      this.job = job;
      this.initCorrectionData();
    });

    this.statusSubscription = this.categorizationService.jobStatus$.subscribe(status => {
      this.status = status;
    });

    // If a specific job ID was provided, load it
    if (this.data?.jobId) {
      const { job } = await this.categorizationService.getJob(this.data.jobId);
      this.job = job;
      this.categorizationService.startPolling(job.id);
    }
  }

  ngOnDestroy() {
    this.jobSubscription?.unsubscribe();
    this.statusSubscription?.unsubscribe();
  }

  private initCorrectionData() {
    if (!this.job?.results) return;

    for (const result of this.job.results) {
      if (!this.correctionData[result.transactionId]) {
        this.correctionData[result.transactionId] = {
          category: result.suggestedCategory,
          newCategory: '',
          subcategory: result.suggestedSubcategory || '',
          createRule: true
        };
      }
    }
  }

  getDisplayResults(): CategorizationResult[] {
    if (!this.job?.results) return [];
    // Show most recent first, limit to 50
    return [...this.job.results].reverse().slice(0, 50);
  }

  getStatusColor(): string {
    return this.categorizationService.getStatusInfo(this.job?.status || 'pending').color;
  }

  getStatusLabel(): string {
    return this.categorizationService.getStatusInfo(this.job?.status || 'pending').label;
  }

  getResultStatusIcon(result: CategorizationResult): string {
    switch (result.status) {
      case 'applied': return 'check_circle';
      case 'corrected': return 'edit';
      case 'skipped': return 'skip_next';
      case 'error': return 'error';
      default: return 'pending';
    }
  }

  getResultStatusTooltip(result: CategorizationResult): string {
    switch (result.status) {
      case 'applied': return 'Category applied';
      case 'corrected': return 'User corrected';
      case 'skipped': return 'Skipped (low confidence)';
      case 'error': return 'Error occurred';
      default: return 'Pending';
    }
  }

  getConfidenceColor(confidence: number): string {
    return this.categorizationService.getConfidenceInfo(confidence).color;
  }

  canCorrect(transactionId: string): boolean {
    const data = this.correctionData[transactionId];
    if (!data) return false;

    if (data.category === '__new__') {
      return data.newCategory.trim().length > 0;
    }
    return data.category.trim().length > 0;
  }

  async submitCorrection(result: CategorizationResult) {
    const data = this.correctionData[result.transactionId];
    if (!data || !this.job) return;

    const category = data.category === '__new__' ? data.newCategory : data.category;

    try {
      await this.categorizationService.correctCategorization(this.job.id, {
        transactionId: result.transactionId,
        correctedCategory: category,
        correctedSubcategory: data.subcategory || undefined,
        createRule: data.createRule
      });

      this.snackBar.open('Correction applied', '', { duration: 2000 });

      // Reload categories in case a new one was created
      this.categories = await this.categoryService.getCategories();
    } catch (error) {
      this.snackBar.open('Failed to apply correction', '', { duration: 3000 });
    }
  }

  async sendMessage() {
    if (!this.chatMessage.trim() || !this.job || this.isSendingMessage) return;

    this.isSendingMessage = true;
    const message = this.chatMessage;
    this.chatMessage = '';

    try {
      await this.categorizationService.chat(this.job.id, message);
    } catch (error) {
      this.snackBar.open('Failed to send message', '', { duration: 3000 });
    } finally {
      this.isSendingMessage = false;
    }
  }

  async pauseJob() {
    if (this.job) {
      await this.categorizationService.pauseJob(this.job.id);
    }
  }

  async resumeJob() {
    if (this.job) {
      await this.categorizationService.resumeJob(this.job.id);
    }
  }

  async cancelJob() {
    if (this.job && confirm('Are you sure you want to cancel the categorization?')) {
      await this.categorizationService.cancelJob(this.job.id);
      this.close();
    }
  }

  close() {
    this.dialogRef.close();
  }
}
