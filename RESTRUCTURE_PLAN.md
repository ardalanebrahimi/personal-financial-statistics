# Application Restructuring Plan

## Executive Summary

Consolidate the current 10-page navigation into a streamlined 3-page structure with a global AI assistant, improving user experience and reducing navigation complexity.

---

## Current vs Target Structure

### Current Navigation (10 items)
```
Dashboard
Connectors
Transactions
Upload Data
Amazon Import
Categories
Analytics
AI Assistant
Settings
Help
```

### Target Navigation (3 items + FAB)
```
Dashboard (with Analytics)
Transactions (with all imports, detail modal, pagination)
Settings (with Connectors, Categories, Automation, Help tabs)
[FAB] AI Assistant (global, context-aware)
```

---

## Phase 1: Transaction Detail Modal & Pagination

**Goal:** Enhance the Transactions page with detail view and handle large datasets.

### 1.1 Transaction Detail Modal
**File:** `src/app/features/transactions/transaction-detail-dialog.component.ts` (new)

**Features:**
- Full transaction details view (date, amount, description, beneficiary, category)
- Source information (which connector imported it)
- Linked/matched transactions display
- Edit all fields inline
- Action buttons:
  - Change Category (with dropdown)
  - Split Transaction
  - Merge with Another
  - Exclude from Stats toggle
  - Delete
  - "Ask AI about this" button (opens AI FAB with context)

**UI Layout:**
```
┌─────────────────────────────────────────────────────┐
│ Transaction Details                              X  │
├─────────────────────────────────────────────────────┤
│ Date: Jan 15, 2026                    Amount: -€50  │
│ ─────────────────────────────────────────────────── │
│ Description:                                        │
│ REWE SAGT DANKE 12345                              │
│                                                     │
│ Beneficiary: REWE Markt GmbH                       │
│ Category: [Groceries ▼]                            │
│                                                     │
│ Source: Sparkasse • Imported Jan 16, 2026          │
│ ─────────────────────────────────────────────────── │
│ Linked Transactions (2):                           │
│   • PayPal payment €50 (Jan 14)                    │
│   • Refund €5 (Jan 20)                             │
│ ─────────────────────────────────────────────────── │
│ [Split] [Merge] [Exclude] [Delete] [Ask AI]        │
└─────────────────────────────────────────────────────┘
```

**Implementation:**
1. Create `TransactionDetailDialogComponent` with Material Dialog
2. Add double-click handler on transaction rows to open modal
3. Add "View Details" context menu option
4. Implement all action handlers

### 1.2 Pagination
**File:** `src/app/features/transactions/transactions.component.ts` (modify)

**Approach:** Client-side pagination with virtual scrolling fallback for performance.

**Features:**
- Page size selector: 25, 50, 100, All
- Page navigation: First, Prev, 1 2 3 ... N, Next, Last
- Show: "Showing 1-25 of 1,234 transactions"
- Remember preference in localStorage
- Works with all filters applied

**Implementation:**
1. Add `MatPaginatorModule` import
2. Add pagination state: `pageSize`, `pageIndex`
3. Create `paginatedTransactions` getter that slices `filteredTransactions`
4. Add `<mat-paginator>` below the transaction list
5. Update template to use `paginatedTransactions`

### 1.3 Enhanced Filters
**File:** `src/app/features/transactions/transactions.component.ts` (modify)

**New Filters:**
| Filter | Type | Description |
|--------|------|-------------|
| Amount Min | Number input | Minimum transaction amount |
| Amount Max | Number input | Maximum transaction amount |
| Beneficiary | Text input | Dedicated beneficiary search |
| Has Match | Toggle | Show only linked/unlinked |
| Excluded | Toggle | Show/hide excluded transactions |
| Quick Date | Chip buttons | This Month, Last Month, This Year, Last Year, All Time |

**UI:**
```
[Search...] [Start Date] [End Date] [Category ▼] [Type ▼] [Source ▼]
[Amount: Min] [Amount: Max] [Beneficiary...] [☑ Has Match] [☐ Excluded]
[This Month] [Last Month] [This Year] [Last Year] [All Time] [Reset]
```

---

## Phase 2: AI Assistant FAB

**Goal:** Make AI assistant globally accessible with transaction context awareness.

### 2.1 AI FAB Component
**File:** `src/app/shared/ai-fab/ai-fab.component.ts` (new)

**Features:**
- Floating action button in bottom-right corner
- Badge showing unread AI responses
- Click expands to chat panel
- Panel slides in from right side
- Can be minimized back to FAB
- Persists across route changes

**States:**
1. **Collapsed (FAB):** Just the button with AI icon
2. **Expanded (Panel):** Full chat interface
3. **With Context:** Shows attached transaction(s)

### 2.2 AI Context Service
**File:** `src/app/services/ai-context.service.ts` (new)

```typescript
interface AIContext {
  attachedTransactions: Transaction[];
  suggestedPrompts: string[];
  lastAction?: {
    type: 'categorize' | 'explain' | 'similar';
    result: any;
  };
}

class AIContextService {
  private context$ = new BehaviorSubject<AIContext>({...});

  attachTransaction(tx: Transaction): void;
  attachMultiple(txs: Transaction[]): void;
  clearContext(): void;

  // Called from transaction detail or selection
  askAboutTransaction(tx: Transaction): void;
  categorizeWithAI(tx: Transaction): Promise<string>;
  findSimilarTransactions(tx: Transaction): Promise<Transaction[]>;
  applyToSimilar(tx: Transaction, category: string): Promise<number>;
}
```

### 2.3 Transaction-Aware AI Features

**"Ask AI about this transaction":**
- Attaches transaction to AI context
- Opens AI FAB panel
- Pre-populates suggested prompts:
  - "What is this transaction?"
  - "Suggest a category"
  - "Find similar transactions"
  - "Is this a recurring expense?"

**"Apply to Similar" Flow:**
1. User categorizes a transaction
2. AI suggests: "Found 15 similar transactions. Apply same category?"
3. User confirms
4. Backend applies category to all matches

### 2.4 Backend Endpoint for Similar Transactions
**File:** `src/server/server.ts` (modify)

```typescript
// POST /api/transactions/find-similar
// Body: { transactionId: string, matchFields: ['description', 'beneficiary', 'amount'] }
// Returns: Transaction[]

// POST /api/transactions/apply-category-to-similar
// Body: { sourceTransactionId: string, category: string, targetIds: string[] }
// Returns: { updated: number }
```

### 2.5 UI Layout
```
┌─ App ─────────────────────────────────────┐
│ ┌─ Main Content ────────────────────────┐ │
│ │                                       │ │
│ │                                       │ │
│ │                                       │ │
│ └───────────────────────────────────────┘ │
│                                     [AI]  │  ← FAB (collapsed)
└───────────────────────────────────────────┘

┌─ App ─────────────────────────────────────┐
│ ┌─ Main ──────────────┐ ┌─ AI Panel ────┐ │
│ │                     │ │ Attached:     │ │
│ │                     │ │ [TX: -€50.00] │ │
│ │                     │ │ ────────────  │ │
│ │                     │ │ Chat history  │ │
│ │                     │ │ ...           │ │
│ │                     │ │ ────────────  │ │
│ │                     │ │ [Ask...]  [→] │ │
│ └─────────────────────┘ └───────────────┘ │
└───────────────────────────────────────────┘
```

---

## Phase 3: Merge Imports into Transactions

**Goal:** All data import functionality accessible from Transactions page.

### 3.1 Import Button & Menu
**File:** `src/app/features/transactions/transactions.component.ts` (modify)

**Add to toolbar:**
```html
<button mat-raised-button [matMenuTriggerFor]="importMenu">
  <mat-icon>cloud_upload</mat-icon>
  Import
</button>
<mat-menu #importMenu>
  <button mat-menu-item (click)="openImportDialog('csv')">
    <mat-icon>description</mat-icon>
    Upload CSV (Bank Statement)
  </button>
  <button mat-menu-item (click)="openImportDialog('amazon')">
    <mat-icon>shopping_cart</mat-icon>
    Amazon Orders
  </button>
  <mat-divider></mat-divider>
  <button mat-menu-item disabled>
    <mat-icon>add</mat-icon>
    More sources coming soon...
  </button>
</mat-menu>
```

### 3.2 Unified Import Dialog
**File:** `src/app/features/transactions/import-dialog.component.ts` (new)

**Features:**
- Tab-based interface: CSV | Amazon | (future tabs)
- Drag-and-drop file upload area
- Preview of transactions to import
- Duplicate detection summary
- Progress indicator during import
- Success/error summary after import

**CSV Tab:**
- File selection
- Auto-detect format (Sparkasse, N26, generic)
- Preview parsed transactions
- Categorization options (import without categories, queue for AI, etc.)

**Amazon Tab:**
- Move existing Amazon import logic here
- Same UX but in dialog form

### 3.3 Import Service Consolidation
**File:** `src/app/services/import.service.ts` (new)

Consolidate import logic from:
- `TransactionService.parseFile()`
- `AmazonImportComponent` import logic

```typescript
class ImportService {
  parseCSV(file: File, format: 'sparkasse' | 'n26' | 'auto'): Transaction[];
  parseAmazonCSV(file: File): Transaction[];
  detectDuplicates(transactions: Transaction[]): DuplicateReport;
  importTransactions(transactions: Transaction[]): Promise<ImportResult>;
}
```

### 3.4 Remove Standalone Pages
After migration:
- Delete `src/app/features/upload/` directory
- Delete `src/app/features/amazon-import/` directory
- Update `app.routes.ts` to remove routes (or redirect to /transactions)

---

## Phase 4: Consolidate Settings

**Goal:** Single Settings page with tabs for all configuration.

### 4.1 Tabbed Settings Page
**File:** `src/app/features/settings/settings.component.ts` (rewrite)

**Tabs:**
1. **Connectors** - Bank connections (move from `/connectors`)
2. **Categories** - Category management (move from `/categories`)
3. **Automation** - Auto-categorize, matching, sync settings (existing)
4. **Help** - Documentation (move from `/help`)

**URL Structure:**
- `/settings` → Connectors tab (default)
- `/settings/connectors`
- `/settings/categories`
- `/settings/automation`
- `/settings/help`

### 4.2 Tab Components
Keep existing component logic, just embed as tabs:

```typescript
@Component({
  template: `
    <mat-tab-group [(selectedIndex)]="selectedTab" (selectedTabChange)="onTabChange($event)">
      <mat-tab label="Connectors">
        <app-connectors-tab></app-connectors-tab>
      </mat-tab>
      <mat-tab label="Categories">
        <app-categories-tab></app-categories-tab>
      </mat-tab>
      <mat-tab label="Automation">
        <app-automation-tab></app-automation-tab>
      </mat-tab>
      <mat-tab label="Help">
        <app-help-tab></app-help-tab>
      </mat-tab>
    </mat-tab-group>
  `
})
```

### 4.3 Migration Steps
1. Create tab wrapper components that use existing logic
2. Update Settings component to use tabs
3. Add route parameters for deep linking
4. Update navigation to point to new structure
5. Remove standalone Connectors, Categories, Help pages
6. Set up redirects for old URLs

---

## Phase 5: Dashboard + Analytics

**Goal:** Integrate charts into Dashboard for unified overview.

### 5.1 Enhanced Dashboard Layout
**File:** `src/app/features/dashboard/dashboard.component.ts` (modify)

**New Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard                                      [Sync All]   │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│ │ Balance │ │ Income  │ │Expenses │ │  Count  │            │
│ │ €1,234  │ │ €2,000  │ │ -€766   │ │   45    │            │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘            │
├─────────────────────────────────────────────────────────────┤
│ [Overview] [Charts]                                         │
├─────────────────────────────────────────────────────────────┤
│ ┌─ Overview Tab ──────────────────────────────────────────┐ │
│ │ Connected Accounts    │ Pending Items                   │ │
│ │ ● Sparkasse          │ • 5 uncategorized               │ │
│ │ ● N26                │ • 3 unmatched                   │ │
│ │                      │                                  │ │
│ │ Recent Transactions  │ Top Categories (This Month)     │ │
│ │ ...                  │ Groceries: €250                 │ │
│ │                      │ Transport: €120                 │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Charts Tab ────────────────────────────────────────────┐ │
│ │ [Pie Chart ▼]  [This Month ▼]                          │ │
│ │                                                         │ │
│ │         ┌──────────────────┐                           │ │
│ │         │   PIE/BAR CHART  │                           │ │
│ │         │   (from Analytics)│                           │ │
│ │         └──────────────────┘                           │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Move Analytics Logic
1. Move chart components from Analytics to shared or Dashboard
2. Add tab toggle between Overview and Charts
3. Add date range selector for charts
4. Remove standalone Analytics page

---

## Phase 6: Cleanup & Polish

### 6.1 Update Navigation
**File:** `src/app/app.component.ts` (modify)

**New Sidenav:**
```html
<mat-nav-list>
  <a mat-list-item routerLink="/dashboard" routerLinkActive="active">
    <mat-icon>dashboard</mat-icon>
    <span>Dashboard</span>
  </a>
  <a mat-list-item routerLink="/transactions" routerLinkActive="active">
    <mat-icon>receipt_long</mat-icon>
    <span>Transactions</span>
  </a>
  <a mat-list-item routerLink="/settings" routerLinkActive="active">
    <mat-icon>settings</mat-icon>
    <span>Settings</span>
  </a>
</mat-nav-list>
```

### 6.2 Update Routes
**File:** `src/app/app.routes.ts` (modify)

```typescript
export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component') },
  { path: 'transactions', loadComponent: () => import('./features/transactions/transactions.component') },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings.component'),
    children: [
      { path: '', redirectTo: 'connectors', pathMatch: 'full' },
      { path: 'connectors', loadComponent: () => ... },
      { path: 'categories', loadComponent: () => ... },
      { path: 'automation', loadComponent: () => ... },
      { path: 'help', loadComponent: () => ... },
    ]
  },
  // Redirects for old URLs
  { path: 'upload', redirectTo: '/transactions' },
  { path: 'import/amazon', redirectTo: '/transactions' },
  { path: 'categories', redirectTo: '/settings/categories' },
  { path: 'connectors', redirectTo: '/settings/connectors' },
  { path: 'analytics', redirectTo: '/dashboard' },
  { path: 'ai-assistant', redirectTo: '/dashboard' }, // AI is now FAB
  { path: 'help', redirectTo: '/settings/help' },
];
```

### 6.3 Remove Deprecated Files
```
Delete:
- src/app/features/upload/
- src/app/features/amazon-import/
- src/app/features/categories/ (after moving to settings)
- src/app/features/connectors/ (after moving to settings)
- src/app/features/analytics/ (after moving to dashboard)
- src/app/features/ai-chat/ (after creating FAB)
- src/app/features/help/ (after moving to settings)
```

### 6.4 Testing Checklist
- [ ] Dashboard loads with stats and charts
- [ ] Transactions page shows all transactions with pagination
- [ ] Transaction detail modal opens and all actions work
- [ ] Import dialog works for CSV and Amazon
- [ ] AI FAB appears on all pages
- [ ] AI FAB can receive transaction context
- [ ] "Apply to similar" works correctly
- [ ] Settings tabs all load correctly
- [ ] All old URLs redirect properly
- [ ] No console errors
- [ ] Mobile responsive

---

## Implementation Order

| Phase | Priority | Effort | Dependencies |
|-------|----------|--------|--------------|
| 1.1 Transaction Detail Modal | High | Medium | None |
| 1.2 Pagination | High | Low | None |
| 1.3 Enhanced Filters | Medium | Low | None |
| 2.1-2.5 AI FAB | High | High | 1.1 (for context) |
| 3.1-3.4 Merge Imports | Medium | Medium | None |
| 4.1-4.3 Consolidate Settings | Medium | Medium | None |
| 5.1-5.2 Dashboard + Analytics | Low | Medium | None |
| 6.1-6.4 Cleanup | Low | Low | All above |

**Recommended Start:** Phase 1 (Modal + Pagination + Filters) as it provides immediate value with no dependencies.

---

## File Summary

### New Files to Create
```
src/app/features/transactions/transaction-detail-dialog.component.ts
src/app/features/transactions/import-dialog.component.ts
src/app/shared/ai-fab/ai-fab.component.ts
src/app/services/ai-context.service.ts
src/app/services/import.service.ts
src/app/features/settings/tabs/connectors-tab.component.ts
src/app/features/settings/tabs/categories-tab.component.ts
src/app/features/settings/tabs/automation-tab.component.ts
src/app/features/settings/tabs/help-tab.component.ts
```

### Files to Modify
```
src/app/features/transactions/transactions.component.ts (pagination, filters, import menu)
src/app/features/dashboard/dashboard.component.ts (add charts)
src/app/features/settings/settings.component.ts (add tabs)
src/app/app.component.ts (update nav, add AI FAB)
src/app/app.routes.ts (update routes)
src/server/server.ts (add similar transactions endpoints)
```

### Files to Delete (after migration)
```
src/app/features/upload/
src/app/features/amazon-import/
src/app/features/categories/
src/app/features/connectors/
src/app/features/analytics/
src/app/features/ai-chat/
src/app/features/help/
```

---

## Backend API Changes

### New Endpoints

```typescript
// Find similar transactions based on patterns
POST /api/transactions/find-similar
Request: {
  transactionId: string;
  matchCriteria: {
    description?: boolean;  // Match similar descriptions
    beneficiary?: boolean;  // Same beneficiary
    amountRange?: number;   // Within ±X amount
  };
  limit?: number;
}
Response: {
  similar: Transaction[];
  matchReasons: { [id: string]: string[] };
}

// Apply category to multiple transactions
POST /api/transactions/bulk-categorize
Request: {
  transactionIds: string[];
  category: string;
  createRule?: boolean;  // Auto-create rule for future
}
Response: {
  updated: number;
  ruleCreated?: boolean;
}

// Get paginated transactions (optional, for server-side pagination)
GET /api/transactions/paginated?page=1&pageSize=50&filters=...
Response: {
  transactions: Transaction[];
  total: number;
  page: number;
  pageSize: number;
}
```

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing functionality | High | Comprehensive testing, keep old routes as redirects |
| Performance with large datasets | Medium | Virtual scrolling, pagination, lazy loading |
| Complex AI FAB state management | Medium | Use dedicated service, clear state lifecycle |
| User confusion with new navigation | Low | Keep URLs similar, show migration tooltips |

---

## Success Metrics

- Navigation items reduced from 10 to 3
- All imports accessible from one location
- AI accessible from anywhere with context
- Transaction detail viewable without page navigation
- Pages handle 10,000+ transactions smoothly
- Zero broken links after migration
