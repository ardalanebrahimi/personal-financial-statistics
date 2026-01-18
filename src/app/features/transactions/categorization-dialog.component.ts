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
  template: `
    <div class="categorization-dialog">
      <!-- Header -->
      <div class="dialog-header">
        <div class="header-left">
          <mat-icon [class.spinning]="job?.status === 'processing'">
            {{ job?.status === 'processing' ? 'sync' : 'category' }}
          </mat-icon>
          <h2>AI Categorization</h2>
          <mat-chip-set *ngIf="job">
            <mat-chip [style.background-color]="getStatusColor()" class="status-chip">
              {{ getStatusLabel() }}
            </mat-chip>
          </mat-chip-set>
        </div>
        <div class="header-actions">
          <button mat-icon-button
                  *ngIf="job?.status === 'processing'"
                  (click)="pauseJob()"
                  matTooltip="Pause">
            <mat-icon>pause</mat-icon>
          </button>
          <button mat-icon-button
                  *ngIf="job?.status === 'paused'"
                  (click)="resumeJob()"
                  matTooltip="Resume">
            <mat-icon>play_arrow</mat-icon>
          </button>
          <button mat-icon-button (click)="close()">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      </div>

      <mat-dialog-content>
        <!-- Progress Stats -->
        <div class="stats-bar" *ngIf="status">
          <div class="stat-item">
            <div class="stat-value">{{ status.processedCount }}</div>
            <div class="stat-label">Processed</div>
          </div>
          <div class="stat-item success">
            <div class="stat-value">{{ status.appliedCount }}</div>
            <div class="stat-label">Applied</div>
          </div>
          <div class="stat-item corrected" *ngIf="status.correctedCount > 0">
            <div class="stat-value">{{ status.correctedCount }}</div>
            <div class="stat-label">Corrected</div>
          </div>
          <div class="stat-item total">
            <div class="stat-value">{{ status.totalCount }}</div>
            <div class="stat-label">Total</div>
          </div>
          <div class="progress-section">
            <mat-progress-bar
              mode="determinate"
              [value]="status.progress"
              [color]="job?.status === 'paused' ? 'warn' : 'primary'">
            </mat-progress-bar>
            <span class="progress-text">{{ status.progress }}%</span>
          </div>
        </div>

        <!-- Results List -->
        <div class="results-section">
          <h3>
            <mat-icon>list</mat-icon>
            Recent Results
            <span class="results-count">({{ job?.results?.length || 0 }})</span>
          </h3>

          <div class="results-list" *ngIf="job?.results?.length">
            <mat-expansion-panel *ngFor="let result of getDisplayResults(); let i = index"
                                  [class.applied]="result.status === 'applied'"
                                  [class.corrected]="result.status === 'corrected'"
                                  [class.error]="result.status === 'error'"
                                  [class.skipped]="result.status === 'skipped'">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <div class="result-header">
                    <mat-icon class="status-icon" [matTooltip]="getResultStatusTooltip(result)">
                      {{ getResultStatusIcon(result) }}
                    </mat-icon>
                    <div class="result-info">
                      <span class="result-description">{{ result.transactionDescription | slice:0:50 }}</span>
                      <span class="result-amount">{{ result.transactionAmount | currency:'EUR' }}</span>
                    </div>
                  </div>
                </mat-panel-title>
                <mat-panel-description>
                  <div class="result-category">
                    <span class="category-name">
                      {{ result.correctedCategory || result.suggestedCategory }}
                      <span *ngIf="result.correctedSubcategory || result.suggestedSubcategory">
                        > {{ result.correctedSubcategory || result.suggestedSubcategory }}
                      </span>
                    </span>
                    <mat-chip class="confidence-chip"
                              [style.background-color]="getConfidenceColor(result.confidence)">
                      {{ result.confidence }}%
                    </mat-chip>
                  </div>
                </mat-panel-description>
              </mat-expansion-panel-header>

              <div class="result-detail">
                <div class="detail-row">
                  <span class="detail-label">Beneficiary:</span>
                  <span class="detail-value">{{ result.transactionBeneficiary || 'N/A' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Reasoning:</span>
                  <span class="detail-value">{{ result.reasoning }}</span>
                </div>
                <div class="detail-row" *ngIf="result.linkedOrderDetails?.length">
                  <span class="detail-label">Linked Orders:</span>
                  <span class="detail-value">{{ result.linkedOrderDetails!.join(', ') }}</span>
                </div>
                <div class="detail-row" *ngIf="result.errorMessage">
                  <span class="detail-label error">Error:</span>
                  <span class="detail-value error">{{ result.errorMessage }}</span>
                </div>

                <!-- Correction Form -->
                <div class="correction-form" *ngIf="result.status !== 'error'">
                  <mat-divider></mat-divider>
                  <h4>Correct this categorization</h4>
                  <div class="correction-fields">
                    <mat-form-field appearance="outline">
                      <mat-label>Category</mat-label>
                      <mat-select [(ngModel)]="correctionData[result.transactionId].category">
                        <mat-option *ngFor="let cat of categories" [value]="cat.name">
                          {{ cat.name }}
                        </mat-option>
                        <mat-option value="__new__">+ Add New Category</mat-option>
                      </mat-select>
                    </mat-form-field>
                    <mat-form-field appearance="outline" *ngIf="correctionData[result.transactionId].category === '__new__'">
                      <mat-label>New Category Name</mat-label>
                      <input matInput [(ngModel)]="correctionData[result.transactionId].newCategory">
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>Subcategory (optional)</mat-label>
                      <input matInput [(ngModel)]="correctionData[result.transactionId].subcategory">
                    </mat-form-field>
                  </div>
                  <div class="correction-options">
                    <mat-checkbox [(ngModel)]="correctionData[result.transactionId].createRule">
                      Create rule from this correction
                    </mat-checkbox>
                  </div>
                  <div class="correction-actions">
                    <button mat-stroked-button
                            color="primary"
                            [disabled]="!canCorrect(result.transactionId)"
                            (click)="submitCorrection(result)">
                      <mat-icon>check</mat-icon>
                      Apply Correction
                    </button>
                  </div>
                </div>
              </div>
            </mat-expansion-panel>
          </div>

          <div class="no-results" *ngIf="!job?.results?.length">
            <mat-icon>hourglass_empty</mat-icon>
            <span>Waiting for results...</span>
          </div>
        </div>

        <!-- Conversation Section -->
        <div class="conversation-section" *ngIf="job">
          <mat-divider></mat-divider>
          <h3>
            <mat-icon>chat</mat-icon>
            Ask AI
          </h3>
          <div class="conversation-messages" *ngIf="job.conversationHistory?.length">
            <div *ngFor="let msg of job.conversationHistory"
                 class="message"
                 [class.user]="msg.role === 'user'"
                 [class.assistant]="msg.role === 'assistant'">
              <mat-icon class="message-icon">{{ msg.role === 'user' ? 'person' : 'smart_toy' }}</mat-icon>
              <div class="message-content">{{ msg.content }}</div>
            </div>
          </div>
          <div class="chat-input">
            <mat-form-field appearance="outline" class="chat-field">
              <mat-label>Ask about categorizations...</mat-label>
              <input matInput
                     [(ngModel)]="chatMessage"
                     (keyup.enter)="sendMessage()"
                     [disabled]="isSendingMessage">
            </mat-form-field>
            <button mat-icon-button
                    color="primary"
                    [disabled]="!chatMessage.trim() || isSendingMessage"
                    (click)="sendMessage()">
              <mat-icon>send</mat-icon>
            </button>
          </div>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button (click)="close()">Close</button>
        <button mat-raised-button
                color="warn"
                *ngIf="job?.status === 'processing' || job?.status === 'paused'"
                (click)="cancelJob()">
          <mat-icon>stop</mat-icon>
          Cancel Job
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .categorization-dialog {
      width: 800px;
      max-width: 95vw;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 24px;
      border-bottom: 1px solid #e0e0e0;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header-left h2 {
      margin: 0;
      font-size: 20px;
    }

    .header-left mat-icon {
      color: #1976d2;
    }

    .spinning {
      animation: spin 1.5s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .status-chip {
      color: white;
      font-size: 12px;
    }

    .header-actions {
      display: flex;
      gap: 4px;
    }

    mat-dialog-content {
      padding: 0 !important;
      max-height: 70vh;
    }

    .stats-bar {
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 16px 24px;
      background: #f5f5f5;
      border-bottom: 1px solid #e0e0e0;
    }

    .stat-item {
      text-align: center;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 600;
      color: #333;
    }

    .stat-label {
      font-size: 12px;
      color: #666;
    }

    .stat-item.success .stat-value {
      color: #4caf50;
    }

    .stat-item.corrected .stat-value {
      color: #ff9800;
    }

    .progress-section {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .progress-section mat-progress-bar {
      flex: 1;
    }

    .progress-text {
      font-weight: 500;
      color: #666;
      min-width: 45px;
    }

    .results-section {
      padding: 16px 24px;
    }

    .results-section h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 16px 0;
      font-size: 16px;
    }

    .results-count {
      color: #666;
      font-weight: normal;
    }

    .results-list {
      max-height: 400px;
      overflow-y: auto;
    }

    mat-expansion-panel {
      margin-bottom: 8px;
    }

    mat-expansion-panel.applied {
      border-left: 3px solid #4caf50;
    }

    mat-expansion-panel.corrected {
      border-left: 3px solid #ff9800;
    }

    mat-expansion-panel.error {
      border-left: 3px solid #f44336;
    }

    mat-expansion-panel.skipped {
      border-left: 3px solid #9e9e9e;
    }

    .result-header {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .status-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .result-info {
      display: flex;
      flex-direction: column;
    }

    .result-description {
      font-weight: 500;
    }

    .result-amount {
      font-size: 12px;
      color: #666;
    }

    .result-category {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .category-name {
      font-weight: 500;
      color: #1976d2;
    }

    .confidence-chip {
      color: white;
      font-size: 11px;
      height: 20px;
      min-height: 20px;
    }

    .result-detail {
      padding: 16px 0;
    }

    .detail-row {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }

    .detail-label {
      font-weight: 500;
      color: #666;
      min-width: 100px;
    }

    .detail-label.error, .detail-value.error {
      color: #f44336;
    }

    .correction-form {
      margin-top: 16px;
      padding-top: 16px;
    }

    .correction-form h4 {
      margin: 16px 0 12px 0;
      font-size: 14px;
    }

    .correction-fields {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }

    .correction-fields mat-form-field {
      flex: 1;
      min-width: 200px;
    }

    .correction-options {
      margin: 8px 0 16px 0;
    }

    .correction-actions {
      display: flex;
      justify-content: flex-end;
    }

    .no-results {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 40px;
      color: #666;
    }

    .conversation-section {
      padding: 16px 24px;
    }

    .conversation-section h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 16px 0;
      font-size: 16px;
    }

    .conversation-messages {
      max-height: 200px;
      overflow-y: auto;
      margin-bottom: 16px;
    }

    .message {
      display: flex;
      gap: 12px;
      padding: 12px;
      margin-bottom: 8px;
      border-radius: 8px;
    }

    .message.user {
      background: #e3f2fd;
    }

    .message.assistant {
      background: #f5f5f5;
    }

    .message-icon {
      color: #666;
    }

    .message-content {
      flex: 1;
    }

    .chat-input {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .chat-field {
      flex: 1;
    }
  `]
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
