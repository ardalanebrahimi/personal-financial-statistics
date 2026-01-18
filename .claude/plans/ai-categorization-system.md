# AI Categorization System - Redesign Plan

## Executive Summary

Modify the existing categorization system to be:
- **Unbiased**: AI suggests categories freely without being constrained by existing categories
- **Hierarchical**: Support 2-level categorization (Category → Subcategory)
- **Interactive**: Real-time progress dialog with user review and AI conversation
- **Persistent**: Backend-based processing that survives page reloads
- **Flexible**: Allow re-categorization of already-categorized transactions

---

## Current Implementation Analysis

### What Already Exists

#### Frontend (`src/app/`)
| Component | File | Status |
|-----------|------|--------|
| AI Service | `services/ai.service.ts` | ✅ OpenAI GPT-4o-mini integration |
| Category Service | `services/category.service.ts` | ✅ CRUD operations |
| Transaction Service | `services/transaction.service.ts` | ✅ State management |
| Transactions Component | `features/transactions/transactions.component.ts` | ✅ Categorize menu with 3 options |
| Category Model | `core/models/transaction.model.ts` | ⚠️ Flat structure, no subcategory |

#### Backend (`src/server/`)
| Component | File | Status |
|-----------|------|--------|
| Rules Engine | `ai/rules-engine.ts` | ✅ Rule-based categorization |
| Automation Service | `automation/automation-service.ts` | ✅ Auto-categorization during import |
| CSV Import Processor | `jobs/csv-import-processor.ts` | ✅ Background job with progress |
| API Endpoints | `server.ts` | ✅ Categories, rules, AI chat |

### Current Categorization Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CURRENT IMPLEMENTATION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User clicks "Categorize" → Frontend loops through transactions  │
│                                    │                             │
│                                    ▼                             │
│                    AIService.suggestCategory()                   │
│                    (Direct OpenAI call from browser)             │
│                                    │                             │
│                                    ▼                             │
│                    Category applied immediately                  │
│                    (No review, no progress dialog)               │
│                                                                  │
│  PROBLEMS:                                                       │
│  ❌ Runs in frontend - lost on page reload                      │
│  ❌ AI sees existing categories (biased prompt)                 │
│  ❌ Blocks already-categorized transactions                     │
│  ❌ No user review before applying                              │
│  ❌ No subcategory support                                      │
│  ❌ No progress visibility                                      │
│  ❌ No conversation/feedback mechanism                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Current AI Prompt (BIASED)
From `ai.service.ts`:
```typescript
const systemPrompt = `You are a financial transaction categorizer...
Available categories: ${existingCategories.join(', ')}  // ← BIAS!
...`
```

---

## Proposed Changes

### New Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PROPOSED FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User clicks "Categorize" → POST /categorization/jobs                       │
│                                    │                                        │
│                                    ▼                                        │
│                    Backend creates job, returns jobId                       │
│                    Background processor starts                              │
│                                    │                                        │
│         ┌──────────────────────────┼──────────────────────────┐            │
│         │                          │                          │            │
│         ▼                          ▼                          ▼            │
│    Progress bar              AI processes              User can close       │
│    in header                 transactions              browser/reload       │
│    (clickable)               (unbiased)                (job persists)       │
│         │                          │                                        │
│         └──────────────────────────┼──────────────────────────┘            │
│                                    │                                        │
│                                    ▼                                        │
│                    Results queued for review                                │
│                    (high confidence can auto-apply)                         │
│                                    │                                        │
│                                    ▼                                        │
│         ┌──────────────────────────────────────────────────────┐           │
│         │          CATEGORIZATION REVIEW DIALOG                 │           │
│         │  ┌────────────────────────────────────────────────┐  │           │
│         │  │ Progress: 234/350  │  Pending: 12  │ Done: 222 │  │           │
│         │  └────────────────────────────────────────────────┘  │           │
│         │                                                       │           │
│         │  Transaction: REWE SAGT DANKE              -€47.82   │           │
│         │  Suggestion:  [Groceries ▼] → [Supermarket ▼]        │           │
│         │  Confidence: 95%                                      │           │
│         │                                                       │           │
│         │  [✓ Accept] [✏ Edit] [💬 Discuss] [⏭ Skip]           │           │
│         │                                                       │           │
│         │  ┌─ AI Conversation ─────────────────────────────┐   │           │
│         │  │ You: Why Shopping and not Groceries?          │   │           │
│         │  │ AI: REWE is a supermarket, updating to...     │   │           │
│         │  │ [Type message...]                    [Send]   │   │           │
│         │  └───────────────────────────────────────────────┘   │           │
│         │                                                       │           │
│         │  [Accept All High-Confidence] [Pause] [Cancel]       │           │
│         └──────────────────────────────────────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model Changes

### 1. Transaction Model - Add Subcategory
**File:** `src/app/core/models/transaction.model.ts`

```typescript
export interface Transaction {
  // ... existing fields ...

  category?: string;              // Main category (existing)
  subcategory?: string;           // NEW: Sub-category
  categoryConfidence?: number;    // NEW: AI confidence (0-100)
  categorizedAt?: string;         // NEW: Timestamp
  categorizedBy?: 'ai' | 'user' | 'rule';  // NEW: Source
}
```

### 2. Category Model - Add Hierarchy
**File:** `src/app/core/models/transaction.model.ts`

```typescript
export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  keywords?: string[];

  parentId?: string;              // NEW: For subcategories
  isSubcategory?: boolean;        // NEW: Flag
}
```

### 3. Categorization Job Model (NEW)
**File:** `src/server/models/categorization-job.ts`

```typescript
export interface CategorizationJob {
  id: string;
  status: 'pending' | 'processing' | 'paused' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;

  // Scope
  transactionIds: string[];
  includeAlreadyCategorized: boolean;

  // Progress
  totalCount: number;
  processedCount: number;
  pendingReviewCount: number;
  completedCount: number;

  // Results
  results: CategorizationResult[];

  // AI conversation
  conversationHistory: AIMessage[];
}

export interface CategorizationResult {
  transactionId: string;
  suggestedCategory: string;
  suggestedSubcategory?: string;
  confidence: number;
  reasoning: string;
  status: 'pending' | 'accepted' | 'modified' | 'skipped';
}
```

---

## Backend Changes

### 1. New Endpoints
**File:** `src/server/server.ts`

```typescript
// Job management
POST   /categorization/jobs              // Start new job
GET    /categorization/jobs/:id          // Get job status & results
PUT    /categorization/jobs/:id/pause    // Pause
PUT    /categorization/jobs/:id/resume   // Resume
DELETE /categorization/jobs/:id          // Cancel

// Review
POST   /categorization/jobs/:id/review   // Submit review decisions
POST   /categorization/jobs/:id/chat     // Chat about a transaction
```

### 2. Background Job Processor
**File:** `src/server/jobs/categorization-processor.ts` (NEW)

Key changes from current frontend approach:
- Runs in backend (persists across page reloads)
- Uses UNBIASED prompt (doesn't list existing categories)
- Stores results for user review
- Supports pause/resume

### 3. Unbiased AI Prompt

```typescript
const UNBIASED_PROMPT = `
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
4. Explain briefly

IMPORTANT RULES:
- Be SPECIFIC. Avoid generic categories like "Shopping", "Online Shopping", "Purchases", "Miscellaneous"
- Good examples: "Groceries", "Electronics", "Subscriptions", "Restaurants", "Utilities", "Insurance"
- Use linked order details (if provided) to determine the actual product category
- Subcategory is OPTIONAL and should be rare

Respond in JSON:
{
  "category": "...",
  "subcategory": "..." or null,
  "confidence": 0-100,
  "reasoning": "..."
}
`;

// When linked orders exist, add context:
const linkedOrdersContext = `
- Linked Orders:
  ${orders.map(o => `• ${o.productName} (€${o.amount})`).join('\n  ')}
`;
```

---

## Frontend Changes

### 1. Progress Indicator Component (NEW)
**File:** `src/app/shared/categorization-progress.component.ts`

Shows in header when a job is active:
```
[═══════════░░░░ 67%] Categorizing: 234/350 • 12 pending review [Click to open]
```

### 2. Categorization Dialog Component (NEW)
**File:** `src/app/features/transactions/categorization-dialog.component.ts`

**Purpose: Real-time Monitoring & Teaching**
- Live progress: Watch AI categorize transactions in real-time
- Categories applied immediately (no approval needed)
- Correction interface: "This should be X instead of Y" → AI learns
- Conversation panel: Ask AI why it chose a category, teach it patterns
- Rules panel: See learned rules, edit/delete if needed
- Error list: Transactions AI couldn't categorize confidently

### 3. Hierarchical Category Selector (NEW)
**File:** `src/app/shared/category-selector.component.ts`

```
[Groceries          ▼]  →  [Supermarket        ▼]
```

### 4. Modify Transactions Component
**File:** `src/app/features/transactions/transactions.component.ts`

- Remove "already categorized" block
- Change categorize methods to call backend job API
- Add progress indicator integration

---

## Design Decisions (Confirmed)

### 1. Category Creation ✅
**Auto-create new categories immediately**
- AI suggests freely, system creates categories on-the-fly
- Avoid meaningless/generic categories like "Shopping", "Online Shopping"
- Categories should be specific and meaningful (e.g., "Electronics", "Groceries", "Subscriptions")

### 2. Existing Categories ✅
**AI is NOT biased toward existing categories**
- Does NOT prefer existing categories
- Suggests what makes sense for the transaction
- System should actively avoid/reject meaningless generic categories

### 3. Review Mode ✅
**Review is for LEARNING, not approval**
- **Categories applied IMMEDIATELY** as AI processes (no waiting)
- User watches real-time progress, corrects mistakes
- AI learns from corrections → creates rules
- Natural flow: AI improves → fewer mistakes → user stops correcting
- No explicit "trust" toggle - trust emerges naturally from fewer errors

### 4. Linked Orders Context ✅
**YES - Use linked order details as extra context**
- Amazon order product names help determine category
- PayPal transaction details provide context
- This makes categorization more accurate

### 5. Hierarchy Depth ✅
**2 levels is sufficient**
- Category → Subcategory (optional)
- Subcategory should be **rare**, only when truly helpful
- Most transactions only need main category

---

## Implementation Phases

### Phase 1: Backend Infrastructure ✅ COMPLETED
- [x] Create CategorizationJob model (`src/server/jobs/categorization-job.ts`)
- [x] Add job storage to database (`src/server/database/database.ts`)
- [x] Implement job CRUD endpoints (`src/server/server.ts` - /categorization/jobs/*)
- [x] Create background processor with unbiased prompt (`src/server/jobs/categorization-processor.ts`)
- [x] Add job status polling endpoint (GET /categorization/jobs/:id)

### Phase 2: Data Model Updates ✅ COMPLETED
- [x] Add `subcategory` to Transaction model (frontend + backend)
- [x] Add `parentId` to Category model (frontend + backend)
- [x] Update database schema (migrations added)
- [x] Add categorization tracking fields (categorizedAt, categorizedBy, categoryConfidence)

### Phase 3: Frontend - Core UI ✅ COMPLETED
- [x] Create progress indicator component (`src/app/shared/categorization-progress/categorization-progress.component.ts`)
- [x] Create categorization review dialog (`src/app/features/transactions/categorization-dialog.component.ts`)
- [x] Create categorization service (`src/app/services/categorization.service.ts`)
- [x] Modify transactions component to use new flow
- [ ] Create hierarchical category selector (deferred - nice-to-have)

### Phase 4: Interactive Features ✅ COMPLETED (included in Phase 3)
- [x] Add AI conversation in review dialog (built into dialog)
- [x] Add correction interface with rule creation option
- [x] Add pause/resume functionality (built into progress indicator)
- [x] Add rule learning from user corrections (via /categorization/jobs/:id/correct endpoint)

### Phase 5: Polish & Testing
- [ ] Error handling and recovery
- [ ] Performance optimization
- [ ] User preference persistence
- [ ] Documentation

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/app/core/models/transaction.model.ts` | Add subcategory, categoryConfidence, etc. |
| `src/app/services/category.service.ts` | Support hierarchy |
| `src/app/features/transactions/transactions.component.ts` | Use backend jobs, remove bias |
| `src/server/server.ts` | Add categorization job endpoints |
| `src/server/database/database.ts` | Add job storage |

## Files to Create

| File | Purpose |
|------|---------|
| `src/server/jobs/categorization-processor.ts` | Background job processor |
| `src/server/models/categorization-job.ts` | Job data model |
| `src/app/features/transactions/categorization-dialog.component.ts` | Review dialog |
| `src/app/shared/categorization-progress.component.ts` | Progress indicator |
| `src/app/shared/category-selector.component.ts` | Hierarchical selector |

---

## Next Steps

1. **Answer the clarification questions above**
2. Finalize design decisions
3. Begin Phase 1 implementation
