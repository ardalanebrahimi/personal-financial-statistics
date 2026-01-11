# Personal Financial Statistics

## Project Overview

A full-stack Angular web application for managing and analyzing personal financial transactions. The application enables users to upload bank transaction data, automatically categorize transactions using AI, manage custom expense categories, and visualize spending patterns through interactive charts.

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | Angular | 19.2.4 |
| UI Framework | Angular Material | 19.2.7 |
| Charting | Chart.js + ng2-charts | 3.4.0 / 4.0.0 |
| Backend | Express.js | 4.21.2 |
| Language | TypeScript | 5.5.2 |
| AI Integration | OpenAI API | GPT-4o-mini |
| Build Tool | Angular CLI | 19.2.4 |

## Architecture

```
src/
├── app/
│   ├── features/
│   │   ├── upload/          # Transaction upload & management
│   │   ├── categories/      # Category management
│   │   └── analytics/       # Charts & visualization
│   ├── models/
│   │   ├── transaction.model.ts
│   │   └── category.model.ts
│   ├── services/
│   │   ├── transaction.service.ts
│   │   ├── category.service.ts
│   │   ├── ai.service.ts
│   │   └── chart.service.ts
│   ├── app.component.ts     # Root with Material sidenav
│   ├── app.routes.ts        # Lazy-loaded routing
│   └── app.config.ts
├── assets/
│   ├── categories.json      # Category persistence
│   └── transactions.json    # Transaction persistence
├── environments/
│   ├── environment.ts       # Development config
│   ├── environment.prod.ts  # Production config
│   └── environment.template.ts
└── server/
    └── server.ts            # Express.js backend
```

## Features

### 1. Transaction Upload & Parsing
- CSV file upload (semicolon-delimited format)
- German date format parsing (DD.MM.YY)
- German amount format parsing (comma as decimal separator)
- Extracts: date, description, amount, beneficiary/payer
- Duplicate transaction detection via server-side matching

### 2. Transaction Management
- Sortable table view (by date and amount)
- Multi-criteria filtering:
  - Date range (start/end)
  - Category selection
  - Beneficiary/payer search
  - Description text search
- Inline category updates
- Delete transactions
- Export filtered results to CSV

### 3. Category Management
- Create categories with name, description, and color
- Delete existing categories
- AI-powered auto-category creation for new transaction types
- Color-coded display

### 4. AI-Powered Categorization
- Automatic category suggestions using OpenAI GPT-4o-mini
- References existing categories to maintain consistency
- Auto-creates new categories when needed
- Generates random colors for new categories

### 5. Analytics & Visualization
- Toggle between Pie Chart and Bar Chart
- Spending breakdown by category
- Filters to expenses only (negative amounts)
- Color-coded visualization matching category colors

### 6. Summary Statistics
- Total transaction amount
- Transaction count
- Average transaction amount
- Category-based breakdown with totals and counts

## Data Models

### Transaction
```typescript
interface Transaction {
  id: string;
  date: Date;
  description: string;
  amount: number;
  category?: string;
  beneficiary?: string;
}
```

### Category
```typescript
interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  keywords?: string[];
}
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/categories` | Retrieve all categories |
| PUT | `/categories` | Save/update categories list |
| GET | `/transactions` | Get all transactions (sorted by date DESC) |
| POST | `/transactions` | Create new transaction |
| PUT | `/transactions/:id` | Update existing transaction |
| DELETE | `/transactions/:id` | Delete transaction |
| GET | `/transactions/match` | Check for duplicate transactions |
| GET | `/transactions/filter` | Filter transactions with criteria |

## Services

### TransactionService (`src/app/services/transaction.service.ts`)
- BehaviorSubject-based state management
- File parsing with German format handling
- Duplicate detection using date/amount/description matching
- Multi-criteria filtering
- CSV export functionality
- Statistics calculation

### CategoryService (`src/app/services/category.service.ts`)
- Category CRUD operations
- JSON file persistence
- Lazy initialization

### AIService (`src/app/services/ai.service.ts`)
- OpenAI API integration
- Category suggestion based on transaction description
- Auto-generates colors for new categories
- Fine-tuned prompts (max 10 tokens, temperature 0.1)

### ChartService (`src/app/services/chart.service.ts`)
- Aggregates transaction data for Chart.js
- Category totals calculation
- Expense filtering (negative amounts only)

## Routing

| Route | Component | Description |
|-------|-----------|-------------|
| `/upload` | UploadComponent | Transaction upload & management (default) |
| `/categories` | CategoriesComponent | Category management |
| `/analytics` | AnalyticsComponent | Charts & visualization |
| `/` | - | Redirects to `/upload` |

All routes use lazy-loaded standalone components.

## Configuration

### Development Environment
```typescript
{
  production: false,
  apiUrl: "http://localhost:3000",
  openAiApiKey: "YOUR_API_KEY"  // Configure in environment.ts
}
```

### Pre-seeded Categories
- Groceries
- Transportation Services
- Utilities
- Fitness Membership
- Online Shopping
- Insurance Payment
- Personal Savings
- Entertainment
- Housing Payment
- Income

## Development Setup

### Prerequisites
- Node.js (see `.nvmrc`)
- npm

### Installation
```bash
npm install
```

### Running the Application
```bash
# Start backend server (terminal 1)
npx ts-node src/server/server.ts

# Start frontend (terminal 2)
ng serve
```

### Build
```bash
ng build
```

### Test
```bash
ng test
```

## Key Implementation Patterns

### State Management
- BehaviorSubject-based reactive state in services
- Observable streams for component subscriptions
- Centralized state management without NgRx

### File Upload Flow
1. User selects CSV file
2. File parsed client-side (German format handling)
3. Duplicate check via `/transactions/match` endpoint
4. AI categorization for new transactions
5. Transaction saved via POST endpoint
6. UI updated via BehaviorSubject

### Duplicate Detection
- Multi-factor matching:
  - Date (day-level comparison)
  - Amount (0.01 tolerance)
  - Description (substring match)
- Server-side validation before persistence

### AI Categorization Flow
1. Transaction description sent to AIService
2. OpenAI API call with existing categories context
3. Category suggestion returned
4. If new category needed, auto-created with random color
5. Category applied to transaction

## Data Persistence

File-based JSON storage:
- `src/assets/transactions.json` - Transaction records
- `src/assets/categories.json` - Category definitions

## Security Notes

- OpenAI API key should be stored in environment variables
- Use `environment.template.ts` as reference for local setup
- Never commit actual API keys to version control
- Consider backend proxy for production API calls

## Build Configuration

- Production optimization enabled
- Output hashing for cache busting
- Build budgets: 2MB warning, 5MB error
- Strict TypeScript mode
- Strict Angular template checking
