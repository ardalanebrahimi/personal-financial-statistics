import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, interval, Subscription } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Categorization result from AI
 */
export interface CategorizationResult {
  transactionId: string;
  transactionDescription: string;
  transactionAmount: number;
  transactionBeneficiary?: string;

  // AI suggestion
  suggestedCategory: string;
  suggestedSubcategory?: string;
  confidence: number;
  reasoning: string;

  // Status
  status: 'pending' | 'applied' | 'corrected' | 'skipped' | 'error';
  appliedAt?: string;

  // If user corrected
  correctedCategory?: string;
  correctedSubcategory?: string;
  correctionReason?: string;

  // If error occurred
  errorMessage?: string;

  // Context used for categorization
  linkedOrderDetails?: string[];
}

/**
 * Conversation message in categorization job
 */
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  relatedTransactionId?: string;
}

/**
 * Categorization job
 */
export interface CategorizationJob {
  id: string;
  status: 'pending' | 'processing' | 'paused' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;

  // Scope
  transactionIds: string[];
  includeAlreadyCategorized: boolean;

  // Progress tracking
  totalCount: number;
  processedCount: number;
  appliedCount: number;
  skippedCount: number;
  correctedCount: number;

  // Results
  results: CategorizationResult[];

  // Conversation
  conversationHistory: ConversationMessage[];

  // Errors
  errors: string[];
}

/**
 * Job status response with computed progress
 */
export interface CategorizationJobStatus {
  id: string;
  status: CategorizationJob['status'];
  progress: number;
  totalCount: number;
  processedCount: number;
  appliedCount: number;
  correctedCount: number;
  recentResults: CategorizationResult[];
  currentTransaction?: {
    id: string;
    description: string;
  };
}

/**
 * Request to start categorization
 */
export interface StartCategorizationRequest {
  transactionIds: string[];
  includeAlreadyCategorized?: boolean;
  scope?: 'selected' | 'uncategorized' | 'filtered' | 'all';
}

/**
 * Request to correct a categorization
 */
export interface CorrectCategorizationRequest {
  transactionId: string;
  correctedCategory: string;
  correctedSubcategory?: string;
  reason?: string;
  createRule?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class CategorizationService {
  private readonly API_URL = `${environment.apiUrl}/categorization/jobs`;

  // Current active categorization job
  private activeJobSubject = new BehaviorSubject<CategorizationJob | null>(null);
  activeJob$ = this.activeJobSubject.asObservable();

  // Job status updates
  private jobStatusSubject = new BehaviorSubject<CategorizationJobStatus | null>(null);
  jobStatus$ = this.jobStatusSubject.asObservable();

  // Polling
  private pollingSubscription: Subscription | null = null;
  private isPolling = false;

  constructor(private http: HttpClient) {}

  /**
   * Start a new categorization job
   */
  async startCategorization(request: StartCategorizationRequest): Promise<CategorizationJob> {
    const response = await this.http.post<{ success: boolean; job: CategorizationJob }>(
      this.API_URL,
      request
    ).toPromise();

    if (response?.job) {
      this.activeJobSubject.next(response.job);
      this.startPolling(response.job.id);
    }

    return response!.job;
  }

  /**
   * Get a specific categorization job
   */
  async getJob(jobId: string): Promise<{ job: CategorizationJob; status: CategorizationJobStatus }> {
    const response = await this.http.get<{ job: CategorizationJob; status: CategorizationJobStatus }>(
      `${this.API_URL}/${jobId}`
    ).toPromise();
    return response!;
  }

  /**
   * Get all active categorization jobs
   */
  async getActiveJobs(): Promise<CategorizationJob[]> {
    const response = await this.http.get<{ jobs: CategorizationJob[] }>(
      `${this.API_URL}/active`
    ).toPromise();
    return response?.jobs || [];
  }

  /**
   * Get recent categorization jobs
   */
  async getRecentJobs(limit: number = 10): Promise<CategorizationJob[]> {
    const response = await this.http.get<{ jobs: CategorizationJob[] }>(
      `${this.API_URL}?limit=${limit}`
    ).toPromise();
    return response?.jobs || [];
  }

  /**
   * Pause a running categorization job
   */
  async pauseJob(jobId: string): Promise<void> {
    await this.http.put(`${this.API_URL}/${jobId}/pause`, {}).toPromise();
    await this.refreshJobStatus(jobId);
  }

  /**
   * Resume a paused categorization job
   */
  async resumeJob(jobId: string): Promise<void> {
    await this.http.put(`${this.API_URL}/${jobId}/resume`, {}).toPromise();
    this.startPolling(jobId);
  }

  /**
   * Cancel a categorization job
   */
  async cancelJob(jobId: string): Promise<void> {
    await this.http.delete(`${this.API_URL}/${jobId}`).toPromise();
    this.stopPolling();
    this.activeJobSubject.next(null);
    this.jobStatusSubject.next(null);
  }

  /**
   * Correct a categorization result
   */
  async correctCategorization(jobId: string, request: CorrectCategorizationRequest): Promise<void> {
    await this.http.post(`${this.API_URL}/${jobId}/correct`, request).toPromise();
    await this.refreshJobStatus(jobId);
  }

  /**
   * Chat about a categorization
   */
  async chat(jobId: string, message: string, transactionId?: string): Promise<{
    message: string;
    conversationHistory: ConversationMessage[];
  }> {
    const response = await this.http.post<{
      success: boolean;
      message: string;
      conversationHistory: ConversationMessage[];
    }>(`${this.API_URL}/${jobId}/chat`, {
      message,
      transactionId
    }).toPromise();
    return {
      message: response!.message,
      conversationHistory: response!.conversationHistory
    };
  }

  /**
   * Start polling for job updates
   */
  startPolling(jobId: string): void {
    if (this.isPolling) return;

    this.isPolling = true;
    this.refreshJobStatus(jobId);

    this.pollingSubscription = interval(1000).subscribe(() => {
      this.refreshJobStatus(jobId);
    });
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
      this.pollingSubscription = null;
    }
    this.isPolling = false;
  }

  /**
   * Refresh job status
   */
  private async refreshJobStatus(jobId: string): Promise<void> {
    try {
      const { job, status } = await this.getJob(jobId);
      this.activeJobSubject.next(job);
      this.jobStatusSubject.next(status);

      // Stop polling if job is done
      if (['completed', 'failed', 'cancelled'].includes(job.status)) {
        this.stopPolling();
      }
    } catch (error) {
      console.error('Failed to refresh categorization job status:', error);
      this.stopPolling();
    }
  }

  /**
   * Check for any active categorization jobs on init
   */
  async checkForActiveJobs(): Promise<void> {
    const jobs = await this.getActiveJobs();
    if (jobs.length > 0) {
      const mostRecent = jobs[0];
      this.activeJobSubject.next(mostRecent);
      this.startPolling(mostRecent.id);
    }
  }

  /**
   * Get status display info
   */
  getStatusInfo(status: CategorizationJob['status']): { label: string; color: string; icon: string } {
    switch (status) {
      case 'pending':
        return { label: 'Pending', color: '#ff9800', icon: 'hourglass_empty' };
      case 'processing':
        return { label: 'Processing', color: '#2196f3', icon: 'sync' };
      case 'paused':
        return { label: 'Paused', color: '#ff9800', icon: 'pause_circle' };
      case 'completed':
        return { label: 'Completed', color: '#4caf50', icon: 'check_circle' };
      case 'failed':
        return { label: 'Failed', color: '#f44336', icon: 'error' };
      case 'cancelled':
        return { label: 'Cancelled', color: '#9e9e9e', icon: 'cancel' };
      default:
        return { label: status, color: '#9e9e9e', icon: 'help' };
    }
  }

  /**
   * Get confidence level display info
   */
  getConfidenceInfo(confidence: number): { label: string; color: string } {
    if (confidence >= 80) {
      return { label: 'High', color: '#4caf50' };
    } else if (confidence >= 50) {
      return { label: 'Medium', color: '#ff9800' };
    } else {
      return { label: 'Low', color: '#f44336' };
    }
  }
}
