import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, interval, Subscription } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Job {
  id: string;
  type: 'csv_import' | 'amazon_import' | 'categorization' | 'order_matching';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  total: number;
  processed: number;
  errors: number;
  errorDetails: string[];
  result?: {
    imported?: number;
    skipped?: number;
    errors?: number;
    total?: number;
  };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  fileName?: string;
}

@Injectable({
  providedIn: 'root'
})
export class JobService {
  private readonly API_URL = `${environment.apiUrl}/jobs`;

  private activeJobsSubject = new BehaviorSubject<Job[]>([]);
  activeJobs$ = this.activeJobsSubject.asObservable();

  private pollingSubscription: Subscription | null = null;
  private isPolling = false;

  constructor(private http: HttpClient) {
    // Don't auto-poll on init - only poll when a job is started
  }

  /**
   * Upload a CSV file and start import job
   */
  async uploadCsv(file: File): Promise<{ jobId: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.http.post<{ success: boolean; jobId: string }>(
      `${this.API_URL}/import/csv`,
      formData
    ).toPromise();

    // Start polling for updates
    this.startPolling();

    return { jobId: response!.jobId };
  }

  /**
   * Get a specific job's status
   */
  async getJob(jobId: string): Promise<Job> {
    const response = await this.http.get<{ job: Job }>(
      `${this.API_URL}/${jobId}`
    ).toPromise();
    return response!.job;
  }

  /**
   * Get all active jobs
   */
  async getActiveJobs(): Promise<Job[]> {
    const response = await this.http.get<{ jobs: Job[] }>(
      `${this.API_URL}/active`
    ).toPromise();
    return response?.jobs || [];
  }

  /**
   * Get recent jobs
   */
  async getRecentJobs(limit: number = 10): Promise<Job[]> {
    const response = await this.http.get<{ jobs: Job[] }>(
      `${this.API_URL}?limit=${limit}`
    ).toPromise();
    return response?.jobs || [];
  }

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string): Promise<void> {
    await this.http.post(`${this.API_URL}/${jobId}/cancel`, {}).toPromise();
  }

  /**
   * Start polling for active job updates
   */
  startPolling(): void {
    if (this.isPolling) return;

    this.isPolling = true;
    this.pollActiveJobs(); // Poll immediately

    this.pollingSubscription = interval(1000).subscribe(() => {
      this.pollActiveJobs();
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
   * Poll for active jobs
   */
  private async pollActiveJobs(): Promise<void> {
    try {
      const jobs = await this.getActiveJobs();
      this.activeJobsSubject.next(jobs);

      // Stop polling if no active jobs
      if (jobs.length === 0 && this.isPolling) {
        this.stopPolling();
      }
    } catch (error) {
      // Stop polling on connection errors to avoid flooding console
      if (this.isPolling) {
        console.warn('Job polling stopped due to connection error');
        this.stopPolling();
      }
    }
  }

  /**
   * Get job type display name
   */
  getJobTypeDisplayName(type: Job['type']): string {
    switch (type) {
      case 'csv_import': return 'CSV Import';
      case 'amazon_import': return 'Amazon Import';
      case 'categorization': return 'Categorization';
      case 'order_matching': return 'Order Matching';
      default: return type;
    }
  }

  /**
   * Get job status display info
   */
  getJobStatusInfo(job: Job): { label: string; color: string; icon: string } {
    switch (job.status) {
      case 'pending':
        return { label: 'Pending', color: '#ff9800', icon: 'hourglass_empty' };
      case 'running':
        return { label: 'Running', color: '#2196f3', icon: 'sync' };
      case 'completed':
        return { label: 'Completed', color: '#4caf50', icon: 'check_circle' };
      case 'failed':
        return { label: 'Failed', color: '#f44336', icon: 'error' };
      case 'cancelled':
        return { label: 'Cancelled', color: '#9e9e9e', icon: 'cancel' };
      default:
        return { label: job.status, color: '#9e9e9e', icon: 'help' };
    }
  }
}
