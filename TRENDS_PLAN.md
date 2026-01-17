# Monthly Trends Feature - Implementation Plan

## Overview

Add a new `/trends` route with comprehensive monthly financial reports to analyze spending patterns over time.

## Architecture

```
src/app/features/trends/
├── trends.component.ts              # Main container with tab navigation
├── trends.component.html
├── trends.component.scss
├── services/
│   └── trends.service.ts            # Data aggregation for monthly analysis
└── components/
    ├── cash-flow/                   # Report 1: Income vs Expenses
    │   └── cash-flow.component.ts
    ├── category-trends/             # Report 2: Category lines over time
    │   └── category-trends.component.ts
    └── month-comparison/            # Report 3: MoM comparison table
        └── month-comparison.component.ts
```

## Reports to Implement

### Phase 1 (Initial)

| # | Report | Description | Chart Type |
|---|--------|-------------|------------|
| 1 | Monthly Cash Flow | Income vs Expenses per month with net balance line | Grouped bar + line |
| 2 | Category Spending Trends | Each category as separate line over months | Multi-line |
| 3 | Month-over-Month Comparison | Table: Category, This Month, Last Month, Change, % Change | Table |

### Phase 2 (Implemented)

| # | Report | Description | Status |
|---|--------|-------------|--------|
| 4 | Savings Rate Trend | (Income - Expenses) / Income % per month | Done |
| 5 | Rolling Averages | 3-month rolling average to smooth noise | Done |
| 6 | Category Heat Map | Months as columns, categories as rows, color = amount | Done |
| 7 | Anomaly Highlighting | Flag months with spending >1.5x average | Done |
| 8 | Income Sources Breakdown | Track multiple income streams separately | Done |
| 9 | Cumulative Spending Curve | Running total through each month | Done |
| 10 | Year-over-Year Comparison | Compare same months across years | Done |

## Implementation Steps

### Step 1: Create Trends Service
- [ ] Create `trends.service.ts`
- [ ] Implement `getMonthlyData()` - aggregate transactions by month
- [ ] Implement `getCategoryMonthlyData()` - aggregate by category and month
- [ ] Implement `getMonthComparison()` - compare current vs previous month

### Step 2: Create Main Trends Component
- [ ] Create `trends.component.ts` with Material tabs
- [ ] Add date range selector (reusable from dashboard)
- [ ] Add preset buttons (Last 6 months, Last 12 months, This year, All time)

### Step 3: Implement Cash Flow Report
- [ ] Create `cash-flow.component.ts`
- [ ] Grouped bar chart: green bars (income), red bars (expenses)
- [ ] Line overlay showing net balance
- [ ] Summary stats: total income, total expenses, net for period

### Step 4: Implement Category Trends Report
- [ ] Create `category-trends.component.ts`
- [ ] Multi-line chart with each category as a line
- [ ] Use category colors from settings
- [ ] Toggle to show/hide categories
- [ ] Option to show top N categories only

### Step 5: Implement Month Comparison Report
- [ ] Create `month-comparison.component.ts`
- [ ] Table with columns: Category, This Month, Last Month, Change, % Change
- [ ] Color coding: red for increase (expenses), green for decrease
- [ ] Sort by absolute change or % change
- [ ] Summary row with totals

### Step 6: Add Route and Navigation
- [ ] Add `/trends` route to `app.routes.ts`
- [ ] Add "Trends" link to sidenav in `app.component.ts`
- [ ] Use `insights` or `trending_up` icon

### Step 7: Testing & Polish
- [ ] Test with various date ranges
- [ ] Handle edge cases (no data, single month, etc.)
- [ ] Responsive design for mobile
- [ ] Loading states

## Data Structures

```typescript
interface MonthlyData {
  month: string;        // "2024-01"
  label: string;        // "Jan 2024"
  income: number;
  expenses: number;
  net: number;
}

interface CategoryMonthlyData {
  category: string;
  color: string;
  months: { month: string; amount: number }[];
}

interface MonthComparison {
  category: string;
  color: string;
  thisMonth: number;
  lastMonth: number;
  change: number;
  percentChange: number;
}
```

## UI Mockups

### Cash Flow Tab
```
┌─────────────────────────────────────────────────────┐
│ [Last 6 Mo] [Last 12 Mo] [This Year] [All Time]    │
├─────────────────────────────────────────────────────┤
│                                                     │
│   ████      ████      ████      ████      ████     │
│   ████ ▓▓▓▓ ████ ▓▓▓▓ ████ ▓▓▓▓ ████ ▓▓▓▓ ████    │
│   ████ ▓▓▓▓ ████ ▓▓▓▓ ████ ▓▓▓▓ ████ ▓▓▓▓ ████    │
│   ──────────●─────────●─────────●─────────●─────   │ ← net line
│   Jan   Feb   Mar   Apr   May                      │
│                                                     │
│ ████ Income  ▓▓▓▓ Expenses  ── Net Balance         │
├─────────────────────────────────────────────────────┤
│ Total Income: €X,XXX | Expenses: €X,XXX | Net: €XX │
└─────────────────────────────────────────────────────┘
```

### Category Trends Tab
```
┌─────────────────────────────────────────────────────┐
│ Show: [Top 5 ▼]  Categories: [■ Groceries] [■ ...]  │
├─────────────────────────────────────────────────────┤
│      ╱╲                                             │
│     ╱  ╲    ╱╲                                      │
│ ───╱────╲──╱──╲─────────────── Groceries           │
│   ╱      ╲╱    ╲                                    │
│  ────────────────────────────── Transport          │
│   Jan   Feb   Mar   Apr   May                      │
└─────────────────────────────────────────────────────┘
```

### Month Comparison Tab
```
┌─────────────────────────────────────────────────────┐
│ Comparing: January 2024 vs December 2023           │
├──────────────┬──────────┬──────────┬───────┬───────┤
│ Category     │ This Mo  │ Last Mo  │ Change│   %   │
├──────────────┼──────────┼──────────┼───────┼───────┤
│ ● Groceries  │  €450    │  €380    │ +€70  │ +18%  │ 🔴
│ ● Transport  │  €120    │  €150    │ -€30  │ -20%  │ 🟢
│ ● Utilities  │  €200    │  €180    │ +€20  │ +11%  │ 🔴
├──────────────┼──────────┼──────────┼───────┼───────┤
│ TOTAL        │  €770    │  €710    │ +€60  │ +8%   │
└──────────────┴──────────┴──────────┴───────┴───────┘
```

## Progress Tracking

- [x] Step 1: Create Trends Service
- [x] Step 2: Create Main Trends Component
- [x] Step 3: Implement Cash Flow Report
- [x] Step 4: Implement Category Trends Report
- [x] Step 5: Implement Month Comparison Report
- [x] Step 6: Add Route and Navigation
- [x] Step 7: Implement Savings Rate Report
- [x] Step 8: Implement Rolling Averages Report
- [x] Step 9: Implement Category Heat Map Report
- [x] Step 10: Implement Anomaly Highlighting Report
- [x] Step 11: Implement Income Sources Report
- [x] Step 12: Implement Cumulative Spending Report
- [x] Step 13: Implement Year-over-Year Report
- [x] Step 14: All 10 Reports Complete!
