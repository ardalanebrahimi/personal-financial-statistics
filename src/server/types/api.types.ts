/**
 * API Types
 *
 * Request and response types for API endpoints.
 */

// Pagination
export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// API Responses
export interface SuccessResponse {
  success: true;
  message?: string;
}

export interface ErrorResponse {
  error: string;
  details?: string;
}

// Transaction endpoints
export interface TransactionFilterParams {
  startDate?: string;
  endDate?: string;
  category?: string;
  beneficiary?: string;
  description?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface DuplicateGroup {
  key: string;
  transactions: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    beneficiary?: string;
    source?: string;
    category?: string;
    linkedOrderIds?: string[];
  }>;
}

export interface FindDuplicatesResponse {
  totalGroups: number;
  totalDuplicates: number;
  groups: DuplicateGroup[];
}

export interface RemoveDuplicatesResponse extends SuccessResponse {
  removedCount: number;
  removedIds: string[];
}

// Import endpoints
export interface ImportResult {
  success: boolean;
  message: string;
  stats: {
    total?: number;
    parsed?: number;
    newTransactions: number;
    duplicatesSkipped: number;
    errors?: number;
  };
  errors?: string[];
}

// Matching endpoints
export interface MatchConfirmRequest {
  primaryTransactionId: string;
  linkedTransactionIds: string[];
  patternType: string;
}

export interface ManualMatchRequest {
  primaryTransactionId: string;
  linkedTransactionIds: string[];
  notes?: string;
}

// Connector endpoints
export interface ConnectRequest {
  userId?: string;
  pin?: string;
  saveCredentials?: boolean;
}

export interface FetchTransactionsRequest {
  startDate: string;
  endDate: string;
}

export interface FetchTransactionsResponse extends SuccessResponse {
  transactionsCount: number;
  newTransactionsCount: number;
  duplicatesSkipped: number;
  automation?: {
    categorized: number;
    matched: number;
  };
}

// Job endpoints
export interface JobStatusResponse {
  job: {
    id: string;
    type: string;
    status: string;
    progress: number;
    total: number;
    processed: number;
    errors: number;
    errorDetails: string[];
    result?: any;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
    fileName?: string;
  };
}

// Stats endpoint
export interface StatsResponse {
  transactions: {
    total: number;
    uncategorized: number;
    matched: number;
  };
  financial: {
    totalSpending: number;
    totalIncome: number;
    netBalance: number;
    thisMonthSpending: number;
  };
  categories: {
    total: number;
    topCategories: Array<{
      name: string;
      total: number;
      color?: string;
    }>;
  };
  sources: Record<string, number>;
  matches: {
    total: number;
  };
  rules: {
    total: number;
    enabled: number;
    totalApplications: number;
  };
}
