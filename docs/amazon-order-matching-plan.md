# Amazon Order Matching Plan

## Problem Statement

Amazon orders imported into the system contain detailed product information (e.g., "Logitech C922 PRO Webcam"), but they are not actual bank transactions. The real bank transactions show generic descriptions like "AMAZON.DE" or "AMAZON PAYMENTS EUROPE".

**Current Issues:**
1. Amazon orders appear as standalone "transactions" but don't represent actual money movement
2. Bank transactions from Amazon have no context for AI categorization
3. No linkage between the detailed order data and the actual bank charge

**Goal:** Link Amazon orders to their corresponding bank transactions so AI can use product details for better categorization.

---

## Architecture: Two-Tier Data Model

```
┌─────────────────────────┐              ┌─────────────────────────┐
│      Transaction        │              │      OrderDetail        │
│    (Bank Records)       │◄────────────►│    (Context Data)       │
├─────────────────────────┤    Link      ├─────────────────────────┤
│ id                      │              │ id                      │
│ date                    │              │ date                    │
│ amount: -€50.41         │              │ amount: -€50.41         │
│ description: AMAZON.DE  │              │ description: Webcam...  │
│ category: Electronics   │              │ source: amazon          │
│ source: n26             │              │ linkedTransactionId     │
│ linkedOrderIds: [...]   │              │ productDetails          │
└─────────────────────────┘              └─────────────────────────┘
```

---

## Phase 1: Data Model Changes ✅

### Transaction Model Updates
- Add `linkedOrderIds: string[]` - references to linked order details
- Add `isContextOnly: boolean` - true for Amazon orders (not real transactions)

### Database Schema
```sql
-- Add to transactions table
ALTER TABLE transactions ADD COLUMN is_context_only INTEGER DEFAULT 0;
ALTER TABLE transactions ADD COLUMN linked_order_ids TEXT DEFAULT '[]';
```

### Migration
- Mark existing Amazon-sourced transactions as `isContextOnly = true`
- Bank transactions (N26, Sparkasse, etc.) remain `isContextOnly = false`

---

## Phase 2: Matching Engine 🔄

### Matching Algorithm

**Match Criteria:**
| Field | Matching Rule |
|-------|---------------|
| Date | Within ±3 days (order date vs charge date) |
| Amount | Exact match OR sum of orders within €0.05 tolerance |
| Source | Bank transaction (N26, etc.) ↔ Amazon orders |

**Match Scenarios:**

1. **1:1 Match** - Single order matches single transaction
   - Order: €50.41 on Dec 19 → Transaction: €50.41 on Dec 21

2. **Many:1 Match** - Multiple orders combined into one charge
   - Orders: €6.71 + €18.90 + €50.41 = €76.02 → Transaction: €76.02

3. **1:Many Match** - One order split across charges (rare)
   - Large order → Multiple smaller charges

### Matching Service API

```typescript
interface MatchResult {
  transactionId: string;
  matchedOrderIds: string[];
  confidence: 'high' | 'medium' | 'low';
  matchType: '1:1' | 'many:1' | '1:many';
}

// Endpoints
POST /api/matching/run          - Run auto-matching algorithm
GET  /api/matching/suggestions  - Get suggested matches for review
POST /api/matching/link         - Manually link order to transaction
POST /api/matching/unlink       - Remove link between order and transaction
```

### UI Components

1. **"Run Matching" Button** - Already exists in toolbar, needs implementation
2. **Match Review Dialog** - Show suggested matches for user confirmation
3. **Linked Orders Badge** - Show count of linked orders on transaction card

---

## Phase 3: UI Changes

### Transaction List
- Filter toggle: "Hide context-only items" (default: on)
- Visual indicator for transactions with linked orders
- Different styling for context-only items if shown

### Transaction Detail Modal
- New section: "Linked Orders"
- Show product names, individual amounts
- Manual link/unlink buttons

### Matching Dialog
- Table showing suggested matches
- Confidence indicator (high/medium/low)
- Confirm/Reject buttons per match
- "Confirm All High Confidence" bulk action

---

## Phase 4: AI Enhancement

### Enhanced Categorization Prompt

**Before:**
```
Categorize this transaction: AMAZON.DE -€50.41
```

**After:**
```
Categorize this transaction: AMAZON.DE -€50.41
Linked order details:
- Logitech C922 PRO Webcam mit Stativ, Full-HD 1080p, 78° Sichtfeld
```

### Implementation
1. When categorizing, check for `linkedOrderIds`
2. Fetch order details and include in AI prompt
3. AI can make informed category decisions based on actual products

---

## Implementation Checklist

### Phase 1: Data Model ✅
- [ ] Add `isContextOnly` to Transaction model
- [ ] Add `linkedOrderIds` to Transaction model
- [ ] Update database schema
- [ ] Migrate existing Amazon data to set `isContextOnly = true`

### Phase 2: Matching Engine
- [ ] Create MatchingService with algorithm
- [ ] Add API endpoints for matching operations
- [ ] Implement "Run Matching" button functionality
- [ ] Create match review/confirmation UI

### Phase 3: UI Updates
- [ ] Add filter for context-only transactions
- [ ] Show linked orders in transaction detail
- [ ] Add linked orders badge to transaction cards
- [ ] Manual link/unlink UI

### Phase 4: AI Enhancement
- [ ] Update AI service to fetch linked orders
- [ ] Enhance categorization prompt with order details
- [ ] Test improved categorization accuracy

---

## Technical Notes

### Matching Performance
- Index transactions by date range and amount for fast lookups
- Cache Amazon orders in memory during matching run
- Process in batches for large datasets

### Edge Cases
- Partial refunds: May create negative amount orders
- Currency conversion: Amazon EU charges may have slight variations
- Subscription charges: Recurring amounts need special handling
- Gift cards: May not have corresponding orders

### Future Enhancements
- Support other order sources (eBay, PayPal, etc.)
- Receipt scanning and OCR for physical purchases
- Automatic periodic matching (background job)
- Machine learning for match confidence scoring
