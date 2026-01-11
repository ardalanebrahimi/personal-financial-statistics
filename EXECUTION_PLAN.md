# Execution Plan: Automated Financial Data Aggregation

## Project Vision

Transform the Personal Financial Statistics app from manual CSV upload to automated multi-source financial data aggregation with intelligent transaction management and cross-account reconciliation.

## Requirements Summary

| Requirement | Decision |
|-------------|----------|
| Bank API Approach | FinTS/HBCI for German banks |
| Non-bank Sources | APIs preferred, browser automation fallback |
| Credentials | Browser automation with Chrome profile (auto-fill) |
| MFA Handling | In-app prompts |
| Deployment | Local only |
| Drag & Drop | Category assignment + Merge/Split transactions |
| AI Features | Auto-categorization + Smart rules + Full assistant + Cross-account matching |
| Transaction Matching | Match & reconcile transactions across accounts |

## Account Ecosystem

Understanding the user's financial flow:

```
                    ┌─────────────────┐
                    │    INCOME       │
                    └────────┬────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │         SPARKASSE            │
              │      (Main Account)          │
              │  - Receives all income       │
              │  - Daily expenses            │
              │  - Hub for all transfers     │
              └──────────────────────────────┘
                   │         │         │
         ┌─────────┘         │         └─────────┐
         ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│     PAYPAL      │  │       N26       │  │   MASTERCARD    │
│  (Better detail)│  │    (Savings)    │  │  (Credit Card)  │
│  Connected to   │  │   Transfers     │  │   Detailed      │
│  Sparkasse      │  │   back & forth  │  │   purchases     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                   │                   │
         └───────────────────┴───────────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │    TRANSACTION MATCHING      │
              │  - Link related transactions │
              │  - Balance internal transfers│
              │  - Enrich with details       │
              └──────────────────────────────┘
```

## Connector Priority

1. **Sparkasse** (FinTS/HBCI) - COMPLETE
2. **N26** (API or browser automation)
3. **PayPal** (API preferred - good documentation)
4. **Gebührfrei Mastercard Gold** (Browser automation - Advanzia portal)
5. **Amazon** (Order History API or browser automation)

---

## Phase 1: Foundation & Architecture Refactor - COMPLETE

**Goal:** Prepare the codebase for multi-source data ingestion

### Deliverables

#### 1.1 Connector Interface Design
- [x] Create `Connector` abstract interface
- [x] Define common methods: `connect()`, `authenticate()`, `fetchTransactions(dateRange)`, `disconnect()`
- [x] Create `ConnectorConfig` model for storing connector settings
- [x] Create `ConnectorStatus` enum (disconnected, connecting, mfa_required, connected, error)

#### 1.2 Transaction Source Tracking
- [x] Add `source` field to Transaction model (e.g., "sparkasse", "n26", "amazon")
- [x] Add `externalId` field for deduplication across syncs
- [x] Add `rawData` field to store original data for debugging
- [x] Migration script for existing transactions

#### 1.3 Backend Connector Service
- [x] Create `/api/connectors` endpoints
- [x] GET `/connectors` - List available connectors and their status
- [x] POST `/connectors/:id/connect` - Initiate connection
- [x] POST `/connectors/:id/mfa` - Submit MFA code
- [x] POST `/connectors/:id/fetch` - Fetch transactions for date range
- [x] DELETE `/connectors/:id/disconnect` - Disconnect

#### 1.4 Frontend Connector Management UI
- [x] Create ConnectorsComponent with list of available connectors
- [x] Connection status indicators (colored badges)
- [x] Date range picker for fetch operation
- [x] MFA input dialog component
- [x] Progress indicators during fetch

### Testing Checklist
- [x] Connector interface compiles and is extendable
- [x] New transaction fields work with existing data
- [x] API endpoints respond correctly (mock data)
- [x] UI shows connector list and status

---

## Phase 2: Sparkasse Connector (FinTS/HBCI) - COMPLETE

**Goal:** Connect to Sparkasse using German FinTS banking standard

### Deliverables

#### 2.1 FinTS Library Integration
- [x] Evaluate FinTS libraries - chose `lib-fints`
- [x] Install and configure library with ESM support
- [x] Create FinTS configuration (bank BLZ, endpoint URL)
- [x] Handle TAN media type workaround for Berliner Sparkasse

#### 2.2 Sparkasse Connector Implementation
- [x] Implement `SparkasseConnector` class extending Connector interface
- [x] Bank selection (BLZ lookup with verified endpoints)
- [x] Username/PIN authentication flow
- [x] TAN handling (pushTAN/decoupled TAN with auto-polling)
- [x] Account listing
- [x] Transaction fetch with date range
- [x] Parse FinTS transaction format to app Transaction model

#### 2.3 MFA Flow Implementation
- [x] Detect TAN requirement from FinTS response
- [x] Send MFA challenge to frontend (type, instructions)
- [x] Detect decoupled TAN and show waiting UI
- [x] Auto-poll for TAN confirmation
- [x] Submit TAN and complete authentication

#### 2.4 Error Handling
- [x] Invalid credentials handling
- [x] Connection timeout handling
- [x] TAN media type error workaround (MDC15920000020)

### Testing Checklist
- [x] Can connect to Sparkasse with valid credentials
- [x] TAN challenge displayed correctly in UI
- [x] Decoupled TAN polling works
- [x] Transactions fetched for specified date range
- [x] Transactions correctly parsed and stored

---

## Phase 3: Browser Automation Framework - COMPLETE

**Goal:** Set up Puppeteer with Chrome profile for credential auto-fill

### Deliverables

#### 3.1 Puppeteer Setup
- [x] Install Puppeteer
- [x] Configure to use existing Chrome installation
- [x] Configure to use user's Chrome profile (for saved passwords)
- [x] Handle Chrome profile lock (if Chrome is running)

#### 3.2 Browser Automation Service
- [x] Create `BrowserService` singleton
- [x] Method to launch browser with profile
- [x] Method to create new page/tab
- [x] Method to wait for user login (detect login success)
- [x] Method to handle popups and dialogs
- [x] Screenshot capture for debugging
- [x] Graceful browser cleanup

#### 3.3 MFA Detection Framework
- [x] Detect common MFA patterns (SMS code input, authenticator, push notification wait)
- [x] Pause automation and prompt user in app
- [x] Resume automation after MFA completion

#### 3.4 Anti-Detection Measures
- [x] Use realistic viewport sizes
- [x] Randomized delays between actions
- [x] Human-like typing and clicking
- [x] Handle cookie consent popups

### Testing Checklist
- [x] Browser launches with Chrome profile
- [x] Saved passwords auto-fill on login pages (when Chrome not running)
- [x] Can navigate to a test site and extract data
- [x] MFA detection framework implemented
- [x] Browser closes cleanly

---

## Phase 4: N26 Connector - COMPLETE

**Goal:** Fetch transactions from N26 (savings account with transfers to/from Sparkasse)

### Research

#### 4.1 API Evaluation
- [x] Research N26 API availability (unofficial API at api.tech26.de)
- [x] Check if official PSD2 API is available (N26 uses unofficial OAuth)
- [x] Decide: API vs browser automation → **API route chosen**

#### 4.2 Implementation (API Route)
- [x] Implement N26 authentication (email/password + 2FA)
- [x] Token management and refresh
- [x] Fetch transactions endpoint (`/smrt/transactions`)
- [x] Parse N26 transaction format

#### 4.3 Implementation Details
- OAuth 2.0 authentication with password grant
- MFA support: SMS code or push notification (decoupled)
- Automatic token refresh before expiry
- Device token for session consistency

### Testing Checklist
- [x] N26Connector class implemented
- [x] 2FA flow implemented (SMS + push notification polling)
- [x] Transaction parsing to FetchedTransaction format
- [x] Date range filter support
- [ ] Live testing with N26 account (requires credentials)

---

## Phase 5: PayPal Connector - COMPLETE

**Goal:** Fetch PayPal transactions to get detailed merchant info for Sparkasse payments

### Why PayPal?
- PayPal is connected to Sparkasse account
- In Sparkasse, PayPal transactions show as "PAYPAL" with minimal detail
- PayPal has the actual merchant name, item description, and exact timestamp
- Essential for accurate categorization of PayPal purchases

### Research

#### 5.1 API Evaluation
- [x] Research PayPal Transaction API (REST API available)
- [x] Check API access requirements (developer account, OAuth)
- [x] Evaluate rate limits and data availability
- [x] Decide: API vs browser automation → **Browser route chosen** (API requires Business account)

#### 5.2 Implementation (Browser Route)
- [x] Navigate to PayPal activity page
- [x] Wait for user login (Chrome auto-fill)
- [x] Handle 2FA if required (SMS code input)
- [x] Navigate to transaction history
- [x] Set date range filter via URL parameters
- [x] Scrape transaction details (merchant, amount, date, status)
- [x] Handle "Load More" button for pagination

#### 5.3 Transaction Data Extraction
- [x] Extract merchant name (counterparty)
- [x] Extract transaction type (payment, refund, transfer)
- [x] Parse amounts with currency symbols
- [x] Store PayPal transaction ID for matching
- [x] Preserve raw data in rawData field

### Implementation Notes
- Uses BrowserService from Phase 3
- Tries Chrome profile for saved credentials
- Cookie consent handling included
- Human-like delays to avoid detection

### Testing Checklist
- [x] PayPalConnector class implemented
- [x] MFA handling implemented
- [x] Transaction scraping implemented
- [x] Date filtering via URL parameters
- [ ] Live testing with PayPal account (requires credentials)

---

## Phase 6: Gebührfrei Mastercard Gold Connector - COMPLETE

**Goal:** Fetch credit card transactions from Advanzia Bank portal

### Why Mastercard Details Matter
- Sparkasse shows Mastercard payments as single "ADVANZIA" debit
- Mastercard portal has individual purchases with merchant names
- Essential for understanding what purchases made up the credit card bill

### Deliverables

#### 6.1 Portal Analysis
- [x] Document login flow for mein.gebuhrenfrei.com
- [x] Identify transaction page structure (table-based)
- [x] Identify date range filter mechanism (German date format DD.MM.YYYY)
- [x] Document authentication (username/password + SMS/App 2FA)

#### 6.2 Browser Automation Implementation
- [x] Implement `GebuhrenfreiConnector` using BrowserService
- [x] Navigate to login page
- [x] Wait for Chrome auto-fill and user login
- [x] Handle SMS verification (code input)
- [x] Handle App-based verification (decoupled push)
- [x] Navigate to transaction history
- [x] Set date range filter (German format)
- [x] Scrape transaction table
- [x] Handle pagination (load more / next page)

#### 6.3 Transaction Parsing
- [x] Parse credit card transaction format
- [x] Parse German amount format (1.234,56 €)
- [x] Parse German date format (DD.MM.YYYY)
- [x] Extract merchant info, amount, date, status
- [x] Generate unique external IDs for deduplication

### Implementation Notes
- Portal: mein.gebuhrenfrei.com
- Uses BrowserService from Phase 3
- Cookie consent handling included
- Human-like delays for bot detection avoidance

### Testing Checklist
- [x] GebuhrenfreiConnector class implemented
- [x] MFA handling implemented (SMS + App)
- [x] Transaction scraping implemented
- [x] German date/amount parsing
- [ ] Live testing with Mastercard account (requires credentials)

---

## Phase 7: Amazon Order History Connector

**Goal:** Import Amazon order history as transactions

### Deliverables

#### 7.1 Approach Decision
- [ ] Research Amazon Order History Report (downloadable CSV)
- [ ] Research Amazon API options
- [ ] Decide: automated download vs browser scraping

#### 7.2 Implementation
- [ ] Navigate to Amazon order history
- [ ] Handle login with Chrome auto-fill
- [ ] Handle 2FA (OTP or push)
- [ ] Request order history report OR scrape orders
- [ ] Parse order data (date, items, total, payment method)

#### 7.3 Order to Transaction Mapping
- [ ] Map Amazon orders to Transaction model
- [ ] Handle multi-item orders (single transaction or split?)
- [ ] Extract item descriptions for categorization
- [ ] Link to original Amazon order URL

### Testing Checklist
- [ ] Can authenticate with Amazon
- [ ] Order history retrieved
- [ ] Orders correctly mapped to transactions
- [ ] Items/descriptions preserved
- [ ] Date range filter works

---

## Phase 8: Transaction Matching & Reconciliation

**Goal:** Match and link related transactions across accounts for accurate tracking

### Why Transaction Matching?

| Scenario | Problem | Solution |
|----------|---------|----------|
| PayPal via Sparkasse | Sparkasse shows "PAYPAL €50" | Match with PayPal transactions showing actual merchants |
| Mastercard payment | Sparkasse shows "ADVANZIA €200" | Match with individual Mastercard purchases |
| N26 transfers | Sparkasse shows "N26 TRANSFER €100" | Match with N26 to balance accounts |
| Internal transfers | Money moving between own accounts | Mark as transfer, not expense/income |

### Deliverables

#### 8.1 Transaction Linking Model
- [ ] Add `linkedTransactions` field to Transaction model
- [ ] Add `transactionType` enum: expense, income, transfer, matched
- [ ] Add `matchConfidence` field (auto, manual, suggested)
- [ ] Add `parentTransaction` for split/matched hierarchies
- [ ] Create `TransactionMatch` model for match metadata

#### 8.2 Automatic Matching Algorithm
- [ ] Match by amount (exact or within tolerance for fees)
- [ ] Match by date (same day or within 1-2 days for processing)
- [ ] Match by description patterns:
  - "PAYPAL" in Sparkasse → PayPal transactions
  - "ADVANZIA" in Sparkasse → Mastercard transactions
  - "N26" in Sparkasse → N26 transfers
- [ ] Match by reference numbers (if available)
- [ ] Calculate match confidence score

#### 8.3 PayPal ↔ Sparkasse Matching
- [ ] Identify Sparkasse transactions with "PAYPAL" in description
- [ ] Find corresponding PayPal transactions by amount and date
- [ ] Link transactions and inherit PayPal merchant details
- [ ] Handle PayPal batch payments (multiple small = one large)
- [ ] Handle PayPal refunds

#### 8.4 Mastercard ↔ Sparkasse Matching
- [ ] Identify Sparkasse transactions with Advanzia/Mastercard
- [ ] Find Mastercard transactions within the billing period
- [ ] Link credit card bill to individual purchases
- [ ] Handle partial payments and pending transactions
- [ ] Display breakdown of credit card bill

#### 8.5 N26 ↔ Sparkasse Transfer Balancing
- [ ] Identify transfers between Sparkasse and N26
- [ ] Match outgoing Sparkasse with incoming N26 (and vice versa)
- [ ] Mark as "internal transfer" (not expense/income)
- [ ] Auto-exclude from spending calculations
- [ ] Track account balance reconciliation

#### 8.6 Manual Matching UI
- [ ] "Match" button on unmatched transactions
- [ ] Search/filter to find matching transaction
- [ ] Drag-drop to link transactions
- [ ] Confirm/reject suggested matches
- [ ] Split transaction to match partial amounts
- [ ] Unlink incorrectly matched transactions

#### 8.7 Match Visualization
- [ ] Visual indicator for matched transactions
- [ ] Expand to see linked transactions
- [ ] Show match source (auto/manual/suggested)
- [ ] Filter by match status
- [ ] Reconciliation dashboard

### Testing Checklist
- [ ] PayPal matches correctly identify merchant details
- [ ] Mastercard bill breakdown shows all purchases
- [ ] N26 transfers correctly balanced
- [ ] Manual matching works with drag-drop
- [ ] Match confidence displayed correctly
- [ ] Internal transfers excluded from spending

---

## Phase 9: Enhanced Transaction Management UX

**Goal:** Implement drag-and-drop and improved transaction editing

### Deliverables

#### 9.1 Transaction List Redesign
- [ ] Card-based transaction view (instead of table)
- [ ] Compact and expanded view toggle
- [ ] Better visual hierarchy (amount prominent, category as badge)
- [ ] Source indicator (bank logo/icon)
- [ ] Match indicator (linked transaction count)
- [ ] Swipe actions on mobile (if applicable)

#### 9.2 Drag & Drop Category Assignment
- [ ] Category sidebar/panel with droppable zones
- [ ] Drag transaction card to category
- [ ] Drag category badge onto transaction
- [ ] Visual feedback during drag (highlight valid targets)
- [ ] Batch select and drag multiple transactions

#### 9.3 Drag & Drop Merge/Split
- [ ] Drag transaction onto another to merge
- [ ] Merge dialog: confirm, set combined description
- [ ] Split button on transaction
- [ ] Split dialog: divide amount, set descriptions
- [ ] Visual indication of merged/split transactions

#### 9.4 Inline Editing
- [ ] Click to edit description
- [ ] Click to edit amount
- [ ] Click to change date
- [ ] Quick category dropdown on click
- [ ] Undo/redo support

#### 9.5 Keyboard Navigation
- [ ] Arrow keys to navigate transactions
- [ ] Enter to expand/edit
- [ ] Number keys for quick category assignment
- [ ] Delete key with confirmation
- [ ] Ctrl+Z undo, Ctrl+Y redo

### Testing Checklist
- [ ] Drag and drop works smoothly
- [ ] Category assignment via drag works
- [ ] Merge creates combined transaction
- [ ] Split divides transaction correctly
- [ ] Inline editing saves correctly
- [ ] Keyboard navigation works
- [ ] Undo/redo functions properly

---

## Phase 10: AI Enhancement with Cross-Account Intelligence

**Goal:** Implement smart learning and AI assistant with cross-account insights

### Deliverables

#### 10.1 Smart Rules Engine
- [ ] Create `Rule` model (condition, action, confidence, usage count)
- [ ] Auto-generate rules from user corrections
- [ ] Rule conditions: description contains, amount range, beneficiary matches
- [ ] Rule actions: set category, suggest split, flag for review
- [ ] Rule priority/conflict resolution

#### 10.2 Learning from Corrections
- [ ] Track when user changes AI-suggested category
- [ ] Analyze correction patterns
- [ ] Create/update rules based on corrections
- [ ] Increase rule confidence with repeated confirmations
- [ ] Decrease confidence when rule is overridden

#### 10.3 Cross-Account Categorization Intelligence
- [ ] Use PayPal merchant details to categorize vague Sparkasse descriptions
  - Sparkasse: "PAYPAL *MERCHANT" → Look up PayPal for actual store name
- [ ] Use Mastercard details to categorize credit card payments
  - Sparkasse: "ADVANZIA MASTERCARD" → Break down by actual purchases
- [ ] Learn category patterns from one account, apply to others
- [ ] Suggest categories based on matched transaction details

#### 10.4 Smart Transaction Suggestions
- [ ] Suggest matches for unmatched transactions
- [ ] Suggest category based on linked transaction details
- [ ] Detect recurring transactions across accounts
- [ ] Identify subscription payments
- [ ] Alert on unusual transactions

#### 10.5 AI Assistant Chat
- [ ] Chat interface in sidebar or modal
- [ ] Natural language queries:
  - "How much did I spend on groceries last month?"
  - "What did my Mastercard payment cover?"
  - "Show me all transfers to N26"
- [ ] Transaction search via chat: "Show me all Amazon purchases"
- [ ] Insights generation: "What are my top spending categories?"
- [ ] Anomaly alerts: "Unusual transaction detected"

#### 10.6 Proactive Suggestions
- [ ] Suggest category for uncategorized transactions
- [ ] Suggest merging similar transactions
- [ ] Suggest splitting large transactions
- [ ] Suggest matching unlinked transactions
- [ ] Monthly spending summary notification
- [ ] Budget alerts (if budget feature added)

#### 10.7 AI Context Enhancement
- [ ] Include transaction history in AI context
- [ ] Include matched transaction details in context
- [ ] Include user's rules in AI context
- [ ] Include category definitions in AI context
- [ ] Better prompts for German transaction descriptions

### Testing Checklist
- [ ] Rules created from corrections
- [ ] Rules apply to new transactions
- [ ] Cross-account categorization works
- [ ] Chat responds to queries correctly
- [ ] Insights are accurate across all accounts
- [ ] Suggestions are relevant
- [ ] German descriptions handled well

---

## Phase 11: Polish & Integration

**Goal:** Full system integration and refinement

### Deliverables

#### 11.1 Unified Sync Flow
- [ ] "Sync All" button to fetch from all connected sources
- [ ] Progress indicator showing each source
- [ ] Auto-run matching after sync
- [ ] Error handling with partial success
- [ ] Sync history log

#### 11.2 Dashboard Redesign
- [ ] Overview of all accounts/sources with balances
- [ ] Total balance across sources
- [ ] Net worth calculation (excluding internal transfers)
- [ ] Recent transactions feed (all accounts unified)
- [ ] Quick stats (spending this month, vs last month)
- [ ] Pending items requiring attention (unmatched, uncategorized)
- [ ] Account reconciliation status

#### 11.3 Data Integrity
- [ ] Deduplication across sources
- [ ] Handle same transaction from bank and credit card
- [ ] Cross-account reconciliation tools
- [ ] Balance verification across linked accounts
- [ ] Data export (full backup)
- [ ] Data import (restore from backup)

#### 11.4 Performance Optimization
- [ ] Lazy loading for large transaction lists
- [ ] Virtual scrolling
- [ ] Caching strategies
- [ ] Background sync option

#### 11.5 Documentation & Help
- [ ] In-app help tooltips
- [ ] Connector setup guides
- [ ] Transaction matching guide
- [ ] Troubleshooting guide
- [ ] Update README with new features

### Testing Checklist
- [ ] Full sync works with all connectors
- [ ] No duplicate transactions
- [ ] Cross-account matching accurate
- [ ] Dashboard shows accurate data
- [ ] App performs well with large datasets
- [ ] Help content is accessible

---

## Technical Considerations

### Security

| Concern | Mitigation |
|---------|------------|
| Credential storage | Use Chrome profile, no storage in app |
| API keys | Environment variables, never committed |
| Session tokens | In-memory only, cleared on close |
| Bank communication | TLS only, validate certificates |
| Local data | JSON files with filesystem permissions |

### Dependencies to Add

```json
{
  "dependencies": {
    "puppeteer": "^21.x",
    "lib-fints": "^1.4.x",
    "tsx": "^4.x",
    "uuid": "^9.x"
  }
}
```

### File Structure Changes

```
src/
├── app/
│   ├── features/
│   │   ├── connectors/        # Connector management
│   │   ├── dashboard/         # Overview dashboard
│   │   ├── matching/          # NEW: Transaction matching UI
│   │   └── assistant/         # AI chat assistant
│   ├── services/
│   │   ├── connector.service.ts
│   │   ├── browser.service.ts
│   │   ├── matching.service.ts    # NEW: Cross-account matching
│   │   ├── rules.service.ts
│   │   └── assistant.service.ts
│   └── core/
│       └── models/
│           ├── transaction.model.ts
│           ├── connector.model.ts
│           └── match.model.ts     # NEW: Transaction matching
└── server/
    ├── connectors/
    │   ├── sparkasse-connector.ts  # COMPLETE
    │   ├── n26-connector.ts
    │   ├── paypal-connector.ts     # NEW
    │   ├── gebuhrenfrei-connector.ts
    │   └── amazon-connector.ts
    ├── matching/                   # NEW: Matching algorithms
    │   ├── matcher.ts
    │   ├── paypal-matcher.ts
    │   ├── mastercard-matcher.ts
    │   └── transfer-matcher.ts
    └── browser/
```

---

## Progress Tracking

### Phase Status

| Phase | Status | Start Date | End Date |
|-------|--------|------------|----------|
| Phase 1: Foundation | **COMPLETE** | 2026-01-11 | 2026-01-11 |
| Phase 2: Sparkasse | **COMPLETE** | 2026-01-11 | 2026-01-11 |
| Phase 3: Browser Automation | **COMPLETE** | 2026-01-11 | 2026-01-11 |
| Phase 4: N26 | **COMPLETE** | 2026-01-11 | 2026-01-11 |
| Phase 5: PayPal | **COMPLETE** | 2026-01-11 | 2026-01-11 |
| Phase 6: Mastercard | **COMPLETE** | 2026-01-11 | 2026-01-11 |
| Phase 7: Amazon | Not Started | | |
| Phase 8: Transaction Matching | Not Started | | |
| Phase 9: UX Enhancement | Not Started | | |
| Phase 10: AI Enhancement | Not Started | | |
| Phase 11: Polish | Not Started | | |

---

## Next Steps

1. ~~Review and approve this execution plan~~
2. ~~Complete Phase 1: Foundation & Architecture Refactor~~
3. ~~Complete Phase 2: Sparkasse Connector~~
4. ~~Complete Phase 3: Browser Automation Framework~~
5. ~~Complete Phase 4: N26 Connector~~
6. ~~Complete Phase 5: PayPal Connector~~
7. ~~Complete Phase 6: Gebührfrei Mastercard Connector~~
8. Begin Phase 7: Amazon Connector
9. After each phase, test deliverables before proceeding

---

*Last Updated: 2026-01-11*
