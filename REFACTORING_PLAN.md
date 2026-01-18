# Comprehensive Refactoring Plan

## Executive Summary

This plan addresses critical code quality issues in the personal-financial-statistics application. The codebase currently has **17 files exceeding 500 LOC** with the most critical being `server.ts` at **4,512 lines** - a file so large it cannot be read by standard tooling.

### Priority Levels
- **P0 (Critical)**: Must fix - blocks maintainability
- **P1 (High)**: Important for code quality
- **P2 (Medium)**: Improves maintainability
- **P3 (Low)**: Nice to have

---

## Current State Analysis

### Files Exceeding 500 LOC Limit

| File | Lines | Severity | Priority |
|------|-------|----------|----------|
| `server.ts` | 4,512 | CRITICAL | P0 |
| `transactions.component.ts` | 1,892 | CRITICAL | P0 |
| `database.ts` | 1,592 | HIGH | P1 |
| `dashboard.component.ts` | 1,418 | HIGH | P1 |
| `paypal-connector.ts` | 1,147 | MEDIUM | P2 |
| `matching-overview-dialog.component.ts` | 1,099 | HIGH | P1 |
| `import-dialog.component.ts` | 1,081 | HIGH | P1 |
| `recurring.component.ts` | 939 | MEDIUM | P2 |
| `gebuhrenfrei-connector.ts` | 845 | MEDIUM | P2 |
| `sparkasse-connector.ts` | 841 | MEDIUM | P2 |
| `transaction-card.component.ts` | 833 | MEDIUM | P2 |
| `ai-fab.component.ts` | 815 | MEDIUM | P2 |
| `amazon-connector.ts` | 757 | MEDIUM | P2 |
| `trends.service.ts` | 728 | MEDIUM | P2 |
| `n26-connector.ts` | 668 | MEDIUM | P2 |
| `ai-assistant.ts` | 654 | MEDIUM | P2 |
| `browser-service.ts` | 653 | MEDIUM | P2 |

---

## Phase 1: Server Refactoring (P0 - Critical)

### 1.1 Create Backend Directory Structure

```
src/server/
├── server.ts                    # ~100 lines: Express setup only
├── routes/
│   ├── index.ts                 # Route aggregator
│   ├── categories.routes.ts     # ~50 lines
│   ├── transactions.routes.ts   # ~100 lines
│   ├── jobs.routes.ts           # ~80 lines
│   ├── categorization.routes.ts # ~150 lines
│   ├── connectors.routes.ts     # ~200 lines
│   ├── matching.routes.ts       # ~150 lines
│   ├── order-matching.routes.ts # ~80 lines
│   ├── recurring.routes.ts      # ~60 lines
│   ├── rules.routes.ts          # ~100 lines
│   ├── ai.routes.ts             # ~150 lines
│   ├── automation.routes.ts     # ~100 lines
│   ├── import.routes.ts         # ~150 lines
│   ├── browser.routes.ts        # ~50 lines
│   └── export.routes.ts         # ~80 lines
├── controllers/
│   ├── categories.controller.ts
│   ├── transactions.controller.ts
│   ├── jobs.controller.ts
│   ├── categorization.controller.ts
│   ├── connectors.controller.ts
│   ├── matching.controller.ts
│   ├── rules.controller.ts
│   ├── ai.controller.ts
│   ├── automation.controller.ts
│   └── import.controller.ts
├── services/
│   ├── transaction.service.ts   # Business logic
│   ├── category.service.ts
│   ├── connector.service.ts     # Connector state management
│   ├── matching.service.ts
│   ├── import.service.ts        # Unified import logic
│   └── automation.service.ts    # Already exists, enhance
├── middleware/
│   ├── error-handler.ts         # Centralized error handling
│   ├── validation.ts            # Request validation
│   └── async-wrapper.ts         # Async route wrapper
├── types/
│   ├── index.ts                 # Export all types
│   ├── connector.types.ts       # ConnectorStatus, ConnectorConfig, etc.
│   ├── transaction.types.ts
│   └── api.types.ts             # Request/Response types
├── utils/
│   ├── duplicate-detector.ts    # Centralized duplicate detection
│   ├── transaction-converter.ts # Convert between formats
│   └── helpers.ts
├── database/                    # Existing
├── connectors/                  # Existing
├── matching/                    # Existing
├── ai/                          # Existing
├── jobs/                        # Existing
├── browser/                     # Existing
├── recurring/                   # Existing
└── automation/                  # Existing
```

### 1.2 Extract Routes from server.ts

**Task 1.2.1: Create route files**

Each route file follows this pattern:
```typescript
// routes/categories.routes.ts
import { Router } from 'express';
import * as categoriesController from '../controllers/categories.controller';

const router = Router();

router.get('/', categoriesController.getAll);
router.put('/', categoriesController.save);
router.post('/cleanup', categoriesController.cleanup);

export default router;
```

**Route Mapping (from current server.ts):**

| Endpoint Group | Current Lines | New File |
|----------------|---------------|----------|
| Categories (3 endpoints) | 170-231 | `categories.routes.ts` |
| Transactions (10 endpoints) | 233-631 | `transactions.routes.ts` |
| Jobs (5 endpoints) | 633-731 | `jobs.routes.ts` |
| Categorization Jobs (9 endpoints) | 733-1064 | `categorization.routes.ts` |
| Connectors (11 endpoints) | 1066-1821 | `connectors.routes.ts` |
| Browser (3 endpoints) | 1823-1891 | `browser.routes.ts` |
| Amazon Import (3 endpoints) | 1893-2027 | `import.routes.ts` |
| PayPal Import (2 endpoints) | 2113-2291 | `import.routes.ts` |
| Matching (8 endpoints) | 2306-2644 | `matching.routes.ts` |
| Order Matching (3 endpoints) | 2645-2862 | `order-matching.routes.ts` |
| Recurring (4 endpoints) | 2863-3080 | `recurring.routes.ts` |
| Rules (8 endpoints) | 3513-3659 | `rules.routes.ts` |
| AI Assistant (7 endpoints) | 3661-3984 | `ai.routes.ts` |
| Cross-Account AI (4 endpoints) | 3890-4038 | `ai.routes.ts` |
| Export/Import (2 endpoints) | 4040-4142 | `export.routes.ts` |
| Automation (4 endpoints) | 4144-4346 | `automation.routes.ts` |
| Stats (1 endpoint) | 4348-4430 | `stats.routes.ts` |

### 1.3 Create Controller Layer

Controllers handle request/response, delegate to services:

```typescript
// controllers/transactions.controller.ts
import { Request, Response, NextFunction } from 'express';
import * as transactionService from '../services/transaction.service';

export async function getAll(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, sort, order } = req.query;
    const result = await transactionService.getAll({ page, limit, sort, order });
    res.json(result);
  } catch (error) {
    next(error);
  }
}
```

### 1.4 Create Centralized Error Handler

```typescript
// middleware/error-handler.ts
import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}
```

### 1.5 Extract Types to Shared Module

Move from server.ts lines 65-112:
```typescript
// types/connector.types.ts
export enum ConnectorStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  MFA_REQUIRED = 'mfa_required',
  CONNECTED = 'connected',
  FETCHING = 'fetching',
  ERROR = 'error'
}

export enum ConnectorType {
  SPARKASSE = 'sparkasse',
  N26 = 'n26',
  PAYPAL = 'paypal',
  GEBUHRENFREI = 'gebuhrenfrei',
  AMAZON = 'amazon'
}

export interface ConnectorConfig { /* ... */ }
export interface ConnectorState { /* ... */ }
```

### 1.6 Consolidate Duplicate Detection

Currently duplicated in:
- `server.ts` lines 245-321 (find-duplicates)
- `server.ts` lines 336-409 (remove-duplicates-auto)
- `csv-import-processor.ts`

**Create unified utility:**
```typescript
// utils/duplicate-detector.ts
export interface DuplicateGroup {
  key: string;
  transactions: Transaction[];
}

export function detectDuplicates(transactions: Transaction[]): DuplicateGroup[] {
  // Single implementation
}

export function extractAmazonOrderNumber(description: string): string | null {
  const match = description.match(/\d{7}-\d{7}/);
  return match ? match[0] : null;
}

export function generateDuplicateKey(tx: Transaction): string {
  // Unified key generation
}

export function scoreTx(tx: Transaction): number {
  // Unified scoring for duplicate resolution
}
```

### 1.7 Consolidate Import Logic

Currently duplicated in:
- Amazon import (lines 1894-1976)
- Amazon refunds import (lines 2029-2111)
- PayPal import (lines 2116-2204)
- PayPal file import (lines 2206-2291)

**Create unified import service:**
```typescript
// services/import.service.ts
export interface ImportResult {
  success: boolean;
  newCount: number;
  duplicateCount: number;
  errors: string[];
}

export async function importTransactions(
  transactions: FetchedTransaction[],
  source: 'amazon' | 'paypal' | 'csv',
  options: ImportOptions
): Promise<ImportResult> {
  // Single import logic with source-specific handling
}
```

---

## Phase 2: Frontend Component Refactoring (P0-P1)

### 2.1 TransactionsComponent (1,892 lines → ~400 lines)

**Split into:**

```
features/transactions/
├── transactions.component.ts         # ~400 lines: Container/orchestrator
├── components/
│   ├── transaction-list.component.ts # ~200 lines: List display
│   ├── transaction-filters.component.ts # ~250 lines: Filter panel
│   ├── category-sidebar.component.ts # ~150 lines: Category drop zones
│   ├── selection-bar.component.ts    # ~100 lines: Selection actions
│   └── keyboard-shortcuts-overlay.component.ts # ~80 lines
├── services/
│   ├── transaction-filter.service.ts # Filter logic (~150 lines)
│   └── transaction-selection.service.ts # Selection state (~100 lines)
└── dialogs/                          # Existing dialogs
```

**Extract from component:**
- Filter logic (lines 949-1071) → `transaction-filter.service.ts`
- Categorization logic (lines 1736-1793) → existing `AIService` or new service
- Duplicate detection (lines 1818-1891) → share with backend util
- Undo/redo logic → `transaction-undo.service.ts`

### 2.2 DashboardComponent (1,418 lines → ~350 lines)

**Split into:**

```
features/dashboard/
├── dashboard.component.ts            # ~350 lines: Container
├── components/
│   ├── stats-cards.component.ts      # ~100 lines
│   ├── category-breakdown.component.ts # ~150 lines
│   ├── spending-chart.component.ts   # ~150 lines
│   ├── monthly-trend-chart.component.ts # ~150 lines
│   ├── recent-transactions.component.ts # ~100 lines
│   └── sync-progress.component.ts    # ~80 lines
└── services/
    └── dashboard-stats.service.ts    # Stats calculation (~200 lines)
```

**Extract:**
- Stats calculation (lines 1062-1141) → `dashboard-stats.service.ts`
- Chart data transformation (lines 1302-1388) → `chart-data.service.ts`
- Sync orchestration (lines 1168-1241) → `connector.service.ts`

### 2.3 MatchingOverviewDialogComponent (1,099 lines → ~350 lines)

**Split into:**

```
features/transactions/dialogs/matching-overview/
├── matching-overview-dialog.component.ts # ~350 lines: Container
├── components/
│   ├── bank-transactions-panel.component.ts # ~150 lines
│   ├── context-transactions-panel.component.ts # ~150 lines
│   ├── match-indicator.component.ts  # ~80 lines
│   └── match-filters.component.ts    # ~100 lines
└── services/
    └── matching-dialog.service.ts    # ~200 lines: Matching logic
```

### 2.4 ImportDialogComponent (1,081 lines → ~300 lines)

**Split into:**

```
features/transactions/dialogs/import/
├── import-dialog.component.ts        # ~300 lines: Container
├── components/
│   ├── csv-import-tab.component.ts   # ~150 lines
│   ├── amazon-import-tab.component.ts # ~200 lines
│   ├── paypal-import-tab.component.ts # ~150 lines
│   └── file-drop-zone.component.ts   # ~80 lines (SHARED)
└── services/
    └── import-dialog.service.ts      # ~150 lines
```

### 2.5 Create Shared Components

**Reusable components identified:**

```
shared/
├── file-drop-zone/
│   └── file-drop-zone.component.ts   # ~80 lines
├── transaction-list-item/
│   └── transaction-list-item.component.ts # ~120 lines
├── result-card/
│   └── result-card.component.ts      # ~60 lines
├── stats-card/
│   └── stats-card.component.ts       # ~50 lines
└── platform-icon/
    └── platform-icon.component.ts    # ~40 lines
```

---

## Phase 3: Database Layer Refactoring (P1)

### 3.1 Split database.ts (1,592 lines → ~300 lines each)

```
database/
├── database.ts                       # ~100 lines: Connection setup
├── schema.ts                         # ~150 lines: Schema definitions
├── migrations.ts                     # ~100 lines: Migrations
├── repositories/
│   ├── transaction.repository.ts     # ~250 lines
│   ├── category.repository.ts        # ~80 lines
│   ├── connector.repository.ts       # ~100 lines
│   ├── match.repository.ts           # ~80 lines
│   ├── rule.repository.ts            # ~100 lines
│   ├── job.repository.ts             # ~150 lines
│   ├── categorization-job.repository.ts # ~200 lines
│   └── recurring-pattern.repository.ts # ~100 lines
└── index.ts                          # Re-export all
```

**Pattern:**
```typescript
// repositories/transaction.repository.ts
import { db } from '../database';
import { StoredTransaction } from '../types';

export function getAll(): StoredTransaction[] { /* ... */ }
export function getById(id: string): StoredTransaction | null { /* ... */ }
export function insert(tx: Omit<StoredTransaction, 'timestamp'>): void { /* ... */ }
export function update(tx: StoredTransaction): void { /* ... */ }
export function delete(id: string): boolean { /* ... */ }
// etc.
```

---

## Phase 4: Connector Refactoring (P2)

### 4.1 Extract Common Connector Logic

```
connectors/
├── base-connector.ts                 # ~150 lines: Abstract base
├── browser-connector.ts              # ~200 lines: Browser automation base
├── parsers/
│   ├── amazon-parser.ts              # ~150 lines
│   ├── paypal-parser.ts              # ~150 lines
│   └── csv-parser.ts                 # ~100 lines
├── connectors/
│   ├── sparkasse-connector.ts        # ~400 lines (was 841)
│   ├── n26-connector.ts              # ~350 lines (was 668)
│   ├── paypal-connector.ts           # ~450 lines (was 1147)
│   ├── gebuhrenfrei-connector.ts     # ~400 lines (was 845)
│   └── amazon-connector.ts           # ~350 lines (was 757)
└── connector-manager.ts              # Existing
```

**Extract from each connector:**
- Common browser navigation → `browser-connector.ts`
- Parsing logic → `parsers/[name]-parser.ts`
- MFA handling patterns → `base-connector.ts`

---

## Phase 5: Shared Types Module (P1)

### 5.1 Create Shared Types Package

Currently duplicated between frontend and backend:
- `MatchPatternType`, `MatchSource`, `MatchConfidence`
- `ConnectorType`, `ConnectorStatus`
- `TransactionMatch`, `MatchSuggestion`
- `MFAChallenge`

**Create shared types:**

```
src/shared/
├── types/
│   ├── transaction.types.ts
│   ├── category.types.ts
│   ├── connector.types.ts
│   ├── match.types.ts
│   └── index.ts
└── constants/
    ├── categories.ts                 # Forbidden categories list
    ├── colors.ts                     # Color utilities
    └── index.ts
```

**Update tsconfig paths:**
```json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["src/shared/*"]
    }
  }
}
```

---

## Phase 6: Service Layer Improvements (P2)

### 6.1 Frontend Services Cleanup

**AIService (447 lines) - Split:**
- AI categorization → `ai-categorization.service.ts`
- Rules management → `rules.service.ts`
- Transaction insights → `ai-insights.service.ts`

**TrendsService (728 lines) - Split:**
- Cash flow calculations → `cash-flow.service.ts`
- Category trends → `category-trends.service.ts`
- Anomaly detection → `anomaly.service.ts`

### 6.2 Create Polling Abstraction

Currently duplicated in `ConnectorService` and `JobService`:

```typescript
// shared/services/polling.service.ts
export function createPoller<T>(
  pollFn: () => Promise<T>,
  options: { interval: number; shouldStop: (result: T) => boolean }
): Observable<T> {
  return interval(options.interval).pipe(
    switchMap(() => from(pollFn())),
    takeWhile(result => !options.shouldStop(result), true)
  );
}
```

---

## Phase 7: Code Quality Improvements (P2-P3)

### 7.1 Add Request Validation

```typescript
// middleware/validation.ts
import { z } from 'zod';

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  date: z.string().datetime(),
  description: z.string().min(1),
  amount: z.number(),
  category: z.string().optional(),
  beneficiary: z.string().optional()
});

export function validate<T>(schema: z.Schema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues });
    }
    req.body = result.data;
    next();
  };
}
```

### 7.2 Standardize Error Handling

Replace 55+ similar try-catch blocks with:

```typescript
// middleware/async-wrapper.ts
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Usage in routes:
router.get('/', asyncHandler(controller.getAll));
```

### 7.3 Remove Magic Numbers/Strings

Create constants file:
```typescript
// constants/index.ts
export const POLLING_INTERVAL_MS = 1000;
export const AI_MAX_TOKENS = 15;
export const AI_TEMPERATURE = 0.1;
export const CONFIDENCE_THRESHOLD_LOW = 60;
export const CONFIDENCE_THRESHOLD_HIGH = 70;
export const FORBIDDEN_CATEGORIES = [
  'online shopping', 'new category', 'uncategorized',
  'other', 'misc', 'miscellaneous', 'general', 'shopping'
];
```

### 7.4 Fix Identified Bugs

**TransactionService duplicate fallback (lines 207, 231):**
```typescript
// Current (bug):
t.category || t.category ||

// Fixed:
t.category || ''
```

---

## Implementation Order

### Sprint 1 (Week 1-2): Critical Backend
1. Create route files structure
2. Extract routes from server.ts
3. Create controller layer
4. Add error handling middleware
5. Create shared types module

### Sprint 2 (Week 3-4): Critical Frontend
1. Split TransactionsComponent
2. Split DashboardComponent
3. Create shared components (file-drop-zone, etc.)
4. Extract filter logic to services

### Sprint 3 (Week 5-6): Database & Dialogs
1. Split database.ts into repositories
2. Split MatchingOverviewDialog
3. Split ImportDialog
4. Consolidate duplicate detection

### Sprint 4 (Week 7-8): Connectors & AI
1. Extract connector parsers
2. Create browser-connector base
3. Split AIService
4. Split TrendsService

### Sprint 5 (Week 9-10): Polish
1. Add request validation
2. Standardize error handling
3. Remove magic numbers
4. Fix identified bugs
5. Update documentation

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Max file LOC | 4,512 | <500 |
| Files >500 LOC | 17 | 0 |
| Duplicated code blocks | 15+ | <3 |
| Type duplication | 5+ types | 0 |
| Test coverage | ~0% | >60% |

---

## Risk Mitigation

1. **Regression risk**: Create integration tests before refactoring
2. **Feature parity**: No new features during refactoring sprints
3. **Incremental delivery**: Each sprint delivers working code
4. **Rollback plan**: Git branches per sprint, easy rollback

---

## Notes

- All refactoring should preserve existing API contracts
- Frontend components should maintain their Angular Material styling
- Database migrations must be backward compatible
- No breaking changes to file formats (JSON exports, CSV imports)
