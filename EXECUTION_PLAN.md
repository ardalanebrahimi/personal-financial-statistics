# Execution Plan: Automated Financial Data Aggregation

## Project Vision

Transform the Personal Financial Statistics app from manual CSV upload to automated multi-source financial data aggregation with intelligent transaction management.

## Requirements Summary

| Requirement | Decision |
|-------------|----------|
| Bank API Approach | FinTS/HBCI for German banks |
| Non-bank Sources | APIs preferred, browser automation fallback |
| Credentials | Browser automation with Chrome profile (auto-fill) |
| MFA Handling | In-app prompts |
| Deployment | Local only |
| Drag & Drop | Category assignment + Merge/Split transactions |
| AI Features | Auto-categorization + Smart rules + Full assistant |

## Connector Priority

1. **Sparkasse** (FinTS/HBCI)
2. **N26** (API or browser automation)
3. **Gebührfrei Mastercard Gold** (Browser automation - Advanzia portal)
4. **Amazon** (Order History API or browser automation)

---

## Phase 1: Foundation & Architecture Refactor

**Goal:** Prepare the codebase for multi-source data ingestion

### Deliverables

#### 1.1 Connector Interface Design
- [ ] Create `Connector` abstract interface
- [ ] Define common methods: `connect()`, `authenticate()`, `fetchTransactions(dateRange)`, `disconnect()`
- [ ] Create `ConnectorConfig` model for storing connector settings
- [ ] Create `ConnectorStatus` enum (disconnected, connecting, mfa_required, connected, error)

#### 1.2 Transaction Source Tracking
- [ ] Add `source` field to Transaction model (e.g., "sparkasse", "n26", "amazon")
- [ ] Add `externalId` field for deduplication across syncs
- [ ] Add `rawData` field to store original data for debugging
- [ ] Migration script for existing transactions

#### 1.3 Backend Connector Service
- [ ] Create `/api/connectors` endpoints
- [ ] GET `/connectors` - List available connectors and their status
- [ ] POST `/connectors/:id/connect` - Initiate connection
- [ ] POST `/connectors/:id/mfa` - Submit MFA code
- [ ] POST `/connectors/:id/fetch` - Fetch transactions for date range
- [ ] DELETE `/connectors/:id/disconnect` - Disconnect

#### 1.4 Frontend Connector Management UI
- [ ] Create ConnectorsComponent with list of available connectors
- [ ] Connection status indicators (colored badges)
- [ ] Date range picker for fetch operation
- [ ] MFA input dialog component
- [ ] Progress indicators during fetch

### Testing Checklist
- [x] Connector interface compiles and is extendable
- [x] New transaction fields work with existing data
- [x] API endpoints respond correctly (mock data)
- [x] UI shows connector list and status

---

## Phase 2: Sparkasse Connector (FinTS/HBCI)

**Goal:** Connect to Sparkasse using German FinTS banking standard

### Research & Setup

#### 2.1 FinTS Library Integration
- [ ] Evaluate FinTS libraries: `nodejs-fints`, `openfin-ts`, or custom implementation
- [ ] Install and configure chosen library
- [ ] Create FinTS configuration (bank BLZ, endpoint URL)

#### 2.2 Sparkasse Connector Implementation
- [ ] Implement `SparkasseConnector` class extending Connector interface
- [ ] Bank selection (BLZ lookup) - Sparkasse has many regional banks
- [ ] Username/PIN authentication flow
- [ ] TAN handling (photoTAN, pushTAN, smsTAN)
- [ ] Account listing (may have multiple accounts)
- [ ] Transaction fetch with date range
- [ ] Parse FinTS transaction format to app Transaction model

#### 2.3 MFA Flow Implementation
- [ ] Detect TAN requirement from FinTS response
- [ ] Send MFA challenge to frontend (type, instructions, image for photoTAN)
- [ ] Accept TAN input from user
- [ ] Submit TAN and complete authentication

#### 2.4 Error Handling
- [ ] Invalid credentials handling
- [ ] Wrong TAN handling (with retry limit)
- [ ] Connection timeout handling
- [ ] Bank maintenance window detection

### Testing Checklist
- [ ] Can connect to Sparkasse with valid credentials
- [ ] TAN challenge displayed correctly in UI
- [ ] TAN submission works
- [ ] Transactions fetched for specified date range
- [ ] Transactions correctly parsed and stored
- [ ] Duplicate detection works across multiple syncs
- [ ] Errors displayed user-friendly in UI

---

## Phase 3: Browser Automation Framework

**Goal:** Set up Puppeteer with Chrome profile for credential auto-fill

### Deliverables

#### 3.1 Puppeteer Setup
- [ ] Install Puppeteer
- [ ] Configure to use existing Chrome installation
- [ ] Configure to use user's Chrome profile (for saved passwords)
- [ ] Handle Chrome profile lock (if Chrome is running)

#### 3.2 Browser Automation Service
- [ ] Create `BrowserService` singleton
- [ ] Method to launch browser with profile
- [ ] Method to create new page/tab
- [ ] Method to wait for user login (detect login success)
- [ ] Method to handle popups and dialogs
- [ ] Screenshot capture for debugging
- [ ] Graceful browser cleanup

#### 3.3 MFA Detection Framework
- [ ] Detect common MFA patterns (SMS code input, authenticator, push notification wait)
- [ ] Pause automation and prompt user in app
- [ ] Resume automation after MFA completion

#### 3.4 Anti-Detection Measures
- [ ] Use realistic viewport sizes
- [ ] Randomized delays between actions
- [ ] Human-like mouse movements (optional)
- [ ] Handle cookie consent popups

### Testing Checklist
- [ ] Browser launches with Chrome profile
- [ ] Saved passwords auto-fill on login pages
- [ ] Can navigate to a test site and extract data
- [ ] MFA detection pauses and prompts correctly
- [ ] Browser closes cleanly

---

## Phase 4: N26 Connector

**Goal:** Fetch transactions from N26

### Research

#### 4.1 API Evaluation
- [ ] Research N26 API availability (they had unofficial API)
- [ ] Check if official PSD2 API is available
- [ ] Decide: API vs browser automation

#### 4.2 Implementation (API Route)
- [ ] Implement N26 authentication (email/password + 2FA)
- [ ] Token management and refresh
- [ ] Fetch transactions endpoint
- [ ] Parse N26 transaction format

#### 4.2 Implementation (Browser Route - if API unavailable)
- [ ] Navigate to N26 web app
- [ ] Wait for user login (Chrome auto-fill)
- [ ] Handle 2FA (push notification to phone)
- [ ] Navigate to transactions
- [ ] Scrape transaction data from DOM
- [ ] Handle pagination/infinite scroll

### Testing Checklist
- [ ] Can authenticate with N26
- [ ] 2FA flow works (push notification wait)
- [ ] Transactions fetched correctly
- [ ] Data parsed to app format
- [ ] Works with date range filter

---

## Phase 5: Gebührfrei Mastercard Gold Connector

**Goal:** Fetch credit card transactions from Advanzia Bank portal

### Deliverables

#### 5.1 Portal Analysis
- [ ] Document login flow for mein.gebuhrenfrei.com
- [ ] Identify transaction page structure
- [ ] Identify date range filter mechanism
- [ ] Document any anti-bot measures

#### 5.2 Browser Automation Implementation
- [ ] Implement `GebuhrenfreiConnector` using BrowserService
- [ ] Navigate to login page
- [ ] Wait for Chrome auto-fill and user login
- [ ] Handle SMS/email verification if required
- [ ] Navigate to transaction history
- [ ] Set date range filter
- [ ] Scrape transaction table
- [ ] Handle pagination

#### 5.3 Transaction Parsing
- [ ] Parse credit card transaction format
- [ ] Handle pending vs posted transactions
- [ ] Extract merchant info, amount, date, category

### Testing Checklist
- [ ] Can log in to Advanzia portal
- [ ] MFA handled correctly
- [ ] Transactions scraped from all pages
- [ ] Data correctly parsed
- [ ] Date range filter works

---

## Phase 6: Amazon Order History Connector

**Goal:** Import Amazon order history as transactions

### Deliverables

#### 6.1 Approach Decision
- [ ] Research Amazon Order History Report (downloadable CSV)
- [ ] Research Amazon API options
- [ ] Decide: automated download vs browser scraping

#### 6.2 Implementation
- [ ] Navigate to Amazon order history
- [ ] Handle login with Chrome auto-fill
- [ ] Handle 2FA (OTP or push)
- [ ] Request order history report OR scrape orders
- [ ] Parse order data (date, items, total, payment method)

#### 6.3 Order to Transaction Mapping
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

## Phase 7: Enhanced Transaction Management UX

**Goal:** Implement drag-and-drop and improved transaction editing

### Deliverables

#### 7.1 Transaction List Redesign
- [ ] Card-based transaction view (instead of table)
- [ ] Compact and expanded view toggle
- [ ] Better visual hierarchy (amount prominent, category as badge)
- [ ] Source indicator (bank logo/icon)
- [ ] Swipe actions on mobile (if applicable)

#### 7.2 Drag & Drop Category Assignment
- [ ] Category sidebar/panel with droppable zones
- [ ] Drag transaction card to category
- [ ] Drag category badge onto transaction
- [ ] Visual feedback during drag (highlight valid targets)
- [ ] Batch select and drag multiple transactions

#### 7.3 Drag & Drop Merge/Split
- [ ] Drag transaction onto another to merge
- [ ] Merge dialog: confirm, set combined description
- [ ] Split button on transaction
- [ ] Split dialog: divide amount, set descriptions
- [ ] Visual indication of merged/split transactions

#### 7.4 Inline Editing
- [ ] Click to edit description
- [ ] Click to edit amount
- [ ] Click to change date
- [ ] Quick category dropdown on click
- [ ] Undo/redo support

#### 7.5 Keyboard Navigation
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

## Phase 8: AI Enhancement

**Goal:** Implement smart learning and AI assistant

### Deliverables

#### 8.1 Smart Rules Engine
- [ ] Create `Rule` model (condition, action, confidence, usage count)
- [ ] Auto-generate rules from user corrections
- [ ] Rule conditions: description contains, amount range, beneficiary matches
- [ ] Rule actions: set category, suggest split, flag for review
- [ ] Rule priority/conflict resolution

#### 8.2 Learning from Corrections
- [ ] Track when user changes AI-suggested category
- [ ] Analyze correction patterns
- [ ] Create/update rules based on corrections
- [ ] Increase rule confidence with repeated confirmations
- [ ] Decrease confidence when rule is overridden

#### 8.3 AI Assistant Chat
- [ ] Chat interface in sidebar or modal
- [ ] Natural language queries: "How much did I spend on groceries last month?"
- [ ] Transaction search via chat: "Show me all Amazon purchases"
- [ ] Insights generation: "What are my top spending categories?"
- [ ] Anomaly alerts: "Unusual transaction detected"

#### 8.4 Proactive Suggestions
- [ ] Suggest category for uncategorized transactions
- [ ] Suggest merging similar transactions
- [ ] Suggest splitting large transactions
- [ ] Monthly spending summary notification
- [ ] Budget alerts (if budget feature added)

#### 8.5 AI Context Enhancement
- [ ] Include transaction history in AI context
- [ ] Include user's rules in AI context
- [ ] Include category definitions in AI context
- [ ] Better prompts for German transaction descriptions

### Testing Checklist
- [ ] Rules created from corrections
- [ ] Rules apply to new transactions
- [ ] Chat responds to queries correctly
- [ ] Insights are accurate
- [ ] Suggestions are relevant
- [ ] German descriptions handled well

---

## Phase 9: Polish & Integration

**Goal:** Full system integration and refinement

### Deliverables

#### 9.1 Unified Sync Flow
- [ ] "Sync All" button to fetch from all connected sources
- [ ] Progress indicator showing each source
- [ ] Error handling with partial success
- [ ] Sync history log

#### 9.2 Dashboard Redesign
- [ ] Overview of all accounts/sources
- [ ] Total balance across sources
- [ ] Recent transactions feed
- [ ] Quick stats (spending this month, vs last month)
- [ ] Pending items requiring attention

#### 9.3 Data Integrity
- [ ] Deduplication across sources
- [ ] Handle same transaction from bank and credit card
- [ ] Reconciliation tools
- [ ] Data export (full backup)
- [ ] Data import (restore from backup)

#### 9.4 Performance Optimization
- [ ] Lazy loading for large transaction lists
- [ ] Virtual scrolling
- [ ] Caching strategies
- [ ] Background sync option

#### 9.5 Documentation & Help
- [ ] In-app help tooltips
- [ ] Connector setup guides
- [ ] Troubleshooting guide
- [ ] Update README with new features

### Testing Checklist
- [ ] Full sync works with all connectors
- [ ] No duplicate transactions
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
    "nodejs-fints": "^x.x",
    "uuid": "^9.x"
  }
}
```

### File Structure Changes

```
src/
├── app/
│   ├── features/
│   │   ├── connectors/        # NEW: Connector management
│   │   ├── dashboard/         # NEW: Overview dashboard
│   │   └── assistant/         # NEW: AI chat assistant
│   ├── services/
│   │   ├── connector.service.ts    # NEW
│   │   ├── browser.service.ts      # NEW
│   │   ├── rules.service.ts        # NEW
│   │   └── assistant.service.ts    # NEW
│   └── connectors/
│       ├── connector.interface.ts  # NEW
│       ├── sparkasse.connector.ts  # NEW
│       ├── n26.connector.ts        # NEW
│       ├── gebuhrenfrei.connector.ts # NEW
│       └── amazon.connector.ts     # NEW
└── server/
    ├── connectors/            # NEW: Backend connector logic
    └── browser/               # NEW: Puppeteer management
```

---

## Progress Tracking

### Phase Status

| Phase | Status | Start Date | End Date |
|-------|--------|------------|----------|
| Phase 1: Foundation | **COMPLETE** | 2026-01-11 | 2026-01-11 |
| Phase 2: Sparkasse | Not Started | | |
| Phase 3: Browser Automation | Not Started | | |
| Phase 4: N26 | Not Started | | |
| Phase 5: Mastercard | Not Started | | |
| Phase 6: Amazon | Not Started | | |
| Phase 7: UX Enhancement | Not Started | | |
| Phase 8: AI Enhancement | Not Started | | |
| Phase 9: Polish | Not Started | | |

---

## Next Steps

1. Review and approve this execution plan
2. Begin Phase 1: Foundation & Architecture Refactor
3. After each phase, test deliverables before proceeding

---

*Last Updated: 2026-01-11*
