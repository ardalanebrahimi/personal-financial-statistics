/**
 * Categorization Job Model
 *
 * Handles background AI categorization of transactions with:
 * - Unbiased AI suggestions (no existing category bias)
 * - Real-time progress and immediate application
 * - User corrections that teach the AI (creates rules)
 * - Conversation history for explaining decisions
 */

export interface CategorizationJob {
  id: string;
  status: 'pending' | 'processing' | 'paused' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;

  // Scope - which transactions to process
  transactionIds: string[];
  includeAlreadyCategorized: boolean;

  // Progress tracking
  totalCount: number;
  processedCount: number;
  appliedCount: number;        // Successfully categorized
  skippedCount: number;        // Skipped (errors, low confidence)
  correctedCount: number;      // User corrections made

  // Results - each transaction's categorization result
  results: CategorizationResult[];

  // AI conversation for this job
  conversationHistory: ConversationMessage[];

  // Error tracking
  errors: string[];
}

export interface CategorizationResult {
  transactionId: string;
  transactionDescription: string;
  transactionAmount: number;
  transactionBeneficiary?: string;

  // AI suggestion
  suggestedCategory: string;
  suggestedSubcategory?: string;
  confidence: number;            // 0-100
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
  linkedOrderDetails?: string[];  // Amazon/PayPal order product names
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  relatedTransactionId?: string;  // If discussing a specific transaction
  relatedResultIndex?: number;    // Index in results array
}

// Request to start a new categorization job
export interface StartCategorizationRequest {
  transactionIds: string[];       // Specific IDs to categorize
  includeAlreadyCategorized?: boolean;  // Re-categorize even if has category
  scope?: 'selected' | 'uncategorized' | 'filtered' | 'all';
}

// Request to correct a categorization result
export interface CorrectCategorizationRequest {
  jobId: string;
  transactionId: string;
  correctedCategory: string;
  correctedSubcategory?: string;
  reason?: string;                // Why user is correcting (helps AI learn)
  createRule?: boolean;           // Should we create a rule from this correction?
}

// Request to chat about categorization
export interface CategorizationChatRequest {
  jobId: string;
  message: string;
  transactionId?: string;         // If discussing specific transaction
}

// Response for job status
export interface CategorizationJobStatus {
  id: string;
  status: CategorizationJob['status'];
  progress: number;               // 0-100 percentage
  totalCount: number;
  processedCount: number;
  appliedCount: number;
  correctedCount: number;

  // Recent results for UI display (last N)
  recentResults: CategorizationResult[];

  // Current processing (if running)
  currentTransaction?: {
    id: string;
    description: string;
  };
}

// Unbiased AI prompt template
export const CATEGORIZATION_PROMPT = `
Analyze this financial transaction and suggest a category.

Transaction:
- Description: {description}
- Amount: {amount} EUR
- Beneficiary: {beneficiary}
- Date: {date}
{linkedOrdersContext}

Instructions:
1. Suggest a specific, meaningful CATEGORY
2. Suggest a SUBCATEGORY only if truly helpful (most transactions don't need one)
3. Rate your confidence (0-100)
4. Explain your reasoning briefly

IMPORTANT RULES:
- Be SPECIFIC. Avoid generic categories like "Shopping", "Online Shopping", "Purchases", "Miscellaneous", "Other"
- Good category examples: "Groceries", "Electronics", "Subscriptions", "Restaurants", "Utilities", "Insurance", "Healthcare", "Books", "Clothing"
- Use linked order details (if provided) to determine the actual product category
- Subcategory is OPTIONAL and should be rare - only use when it adds meaningful distinction
- If you cannot determine a category with reasonable confidence, say so

Respond in JSON format only:
{
  "category": "CategoryName",
  "subcategory": "SubcategoryName or null",
  "confidence": 85,
  "reasoning": "Brief explanation"
}
`;

// List of generic categories to reject/avoid
export const GENERIC_CATEGORIES_TO_AVOID = [
  'shopping',
  'online shopping',
  'purchases',
  'miscellaneous',
  'other',
  'general',
  'various',
  'mixed',
  'unknown',
  'uncategorized',
  'misc',
  'stuff',
  'things',
  'items',
  'expenses',
  'spending',
  'payment',
  'payments',
  'transaction',
  'transactions',
  'debit',
  'credit',
  'charge',
  'charges'
];

/**
 * Check if a category name is too generic
 */
export function isGenericCategory(categoryName: string): boolean {
  const normalized = categoryName.toLowerCase().trim();
  return GENERIC_CATEGORIES_TO_AVOID.includes(normalized);
}
