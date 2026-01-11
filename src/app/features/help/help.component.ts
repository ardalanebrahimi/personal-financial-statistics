import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatExpansionModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule
  ],
  template: `
    <div class="help-container">
      <header class="help-header">
        <mat-icon>help_outline</mat-icon>
        <div>
          <h1>Help & Documentation</h1>
          <p>Learn how to use Personal Financial Statistics</p>
        </div>
      </header>

      <!-- Quick Start -->
      <mat-card class="section-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>rocket_launch</mat-icon>
          <mat-card-title>Quick Start Guide</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <ol class="steps">
            <li>
              <strong>Connect your accounts</strong>
              <p>Go to Connectors and add your bank accounts (Sparkasse, N26, PayPal, etc.)</p>
            </li>
            <li>
              <strong>Fetch transactions</strong>
              <p>Set a date range and click "Fetch" to import your transactions</p>
            </li>
            <li>
              <strong>Categorize transactions</strong>
              <p>Drag transactions to categories or use the AI Assistant for auto-categorization</p>
            </li>
            <li>
              <strong>View analytics</strong>
              <p>Check the Analytics page for spending insights and charts</p>
            </li>
          </ol>
        </mat-card-content>
      </mat-card>

      <!-- Features -->
      <h2>Features</h2>

      <mat-accordion>
        <!-- Connectors -->
        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title>
              <mat-icon>account_balance</mat-icon>
              Bank Connectors
            </mat-panel-title>
          </mat-expansion-panel-header>
          <div class="panel-content">
            <h4>Supported Banks</h4>
            <ul>
              <li><strong>Sparkasse</strong> - Connect via FinTS/HBCI. Supports pushTAN and decoupled TAN.</li>
              <li><strong>N26</strong> - Direct API connection. Requires email/password and 2FA.</li>
              <li><strong>PayPal</strong> - Browser automation. Uses saved Chrome credentials.</li>
              <li><strong>Gebührenfrei Mastercard</strong> - Browser automation for Advanzia portal.</li>
              <li><strong>Amazon</strong> - CSV import from Amazon Privacy Central export.</li>
            </ul>

            <h4>Connection Steps</h4>
            <ol>
              <li>Click "Add Connector" and select your bank type</li>
              <li>Enter your credentials (username/PIN or email/password)</li>
              <li>Complete 2FA verification if prompted</li>
              <li>Once connected, use "Fetch" to import transactions</li>
            </ol>

            <h4>Tips</h4>
            <ul>
              <li>For PayPal and Mastercard, make sure Chrome is closed before connecting</li>
              <li>Saved passwords in Chrome will auto-fill during browser automation</li>
              <li>Connection sessions expire - reconnect when needed</li>
            </ul>
          </div>
        </mat-expansion-panel>

        <!-- Transaction Management -->
        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title>
              <mat-icon>receipt_long</mat-icon>
              Transaction Management
            </mat-panel-title>
          </mat-expansion-panel-header>
          <div class="panel-content">
            <h4>Categorizing Transactions</h4>
            <ul>
              <li><strong>Drag & Drop</strong> - Drag transactions to the category sidebar</li>
              <li><strong>Click to Edit</strong> - Click the category chip on a transaction</li>
              <li><strong>Keyboard Shortcuts</strong> - Press 1-9 to assign categories quickly</li>
            </ul>

            <h4>Filtering & Sorting</h4>
            <ul>
              <li>Use the filter panel to search by description, date range, category, or source</li>
              <li>Toggle between card and compact view modes</li>
              <li>Sort by date or amount</li>
            </ul>

            <h4>Merging Transactions</h4>
            <p>When you have multiple related transactions (e.g., PayPal + bank), you can merge them:</p>
            <ol>
              <li>Click the merge icon on a transaction</li>
              <li>Search and select the related transaction</li>
              <li>Confirm the merge</li>
            </ol>

            <h4>Splitting Transactions</h4>
            <p>Split a single transaction into multiple parts:</p>
            <ol>
              <li>Click the split icon on a transaction</li>
              <li>Add split entries with amounts and descriptions</li>
              <li>Ensure the amounts balance</li>
            </ol>
          </div>
        </mat-expansion-panel>

        <!-- Transaction Matching -->
        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title>
              <mat-icon>link</mat-icon>
              Transaction Matching
            </mat-panel-title>
          </mat-expansion-panel-header>
          <div class="panel-content">
            <h4>What is Transaction Matching?</h4>
            <p>Matching links related transactions across different accounts:</p>
            <ul>
              <li>PayPal payments in your bank show as "PAYPAL" - matching links them to the actual PayPal transaction with merchant details</li>
              <li>Credit card payments show as a single debit - matching links to individual purchases</li>
              <li>Transfers between your own accounts are identified and excluded from spending</li>
            </ul>

            <h4>Automatic Matching</h4>
            <p>Click "Run Matching" on the Transactions page to automatically find matches based on:</p>
            <ul>
              <li>Amount (exact or within tolerance)</li>
              <li>Date (same day or within 1-2 days)</li>
              <li>Description patterns (PAYPAL, ADVANZIA, N26)</li>
            </ul>

            <h4>Manual Matching</h4>
            <p>For transactions that weren't automatically matched, you can manually link them via drag & drop or the merge dialog.</p>
          </div>
        </mat-expansion-panel>

        <!-- AI Features -->
        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title>
              <mat-icon>smart_toy</mat-icon>
              AI Features
            </mat-panel-title>
          </mat-expansion-panel-header>
          <div class="panel-content">
            <h4>AI Assistant</h4>
            <p>Chat with the AI assistant to ask questions about your finances:</p>
            <ul>
              <li>"How much did I spend this month?"</li>
              <li>"What are my top spending categories?"</li>
              <li>"Show me recent groceries transactions"</li>
              <li>"Compare this month to last month"</li>
            </ul>

            <h4>Smart Categorization</h4>
            <p>The system learns from your categorization choices:</p>
            <ul>
              <li>When you correct a category, a rule is created</li>
              <li>Future similar transactions will be auto-categorized</li>
              <li>Rules improve over time based on your feedback</li>
            </ul>

            <h4>Cross-Account Intelligence</h4>
            <p>The AI uses data from linked accounts to improve categorization:</p>
            <ul>
              <li>PayPal merchant names help categorize bank transactions</li>
              <li>Credit card purchase details enrich summary payments</li>
              <li>Patterns learned from one account apply to others</li>
            </ul>
          </div>
        </mat-expansion-panel>

        <!-- Analytics -->
        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title>
              <mat-icon>analytics</mat-icon>
              Analytics & Reports
            </mat-panel-title>
          </mat-expansion-panel-header>
          <div class="panel-content">
            <h4>Available Charts</h4>
            <ul>
              <li><strong>Spending by Category</strong> - Pie/Bar chart of expenses by category</li>
              <li><strong>Monthly Trend</strong> - Line chart showing spending over time</li>
              <li><strong>Income vs Expenses</strong> - Compare money in vs money out</li>
            </ul>

            <h4>Dashboard</h4>
            <p>The dashboard provides an overview of:</p>
            <ul>
              <li>Net balance across all accounts</li>
              <li>This month's spending vs last month</li>
              <li>Top spending categories</li>
              <li>Recent transactions</li>
              <li>Items needing attention (uncategorized, unmatched)</li>
            </ul>
          </div>
        </mat-expansion-panel>

        <!-- Data Management -->
        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title>
              <mat-icon>storage</mat-icon>
              Data Management
            </mat-panel-title>
          </mat-expansion-panel-header>
          <div class="panel-content">
            <h4>Data Storage</h4>
            <p>All data is stored locally in JSON files:</p>
            <ul>
              <li>Transactions</li>
              <li>Categories</li>
              <li>Matching rules</li>
              <li>AI categorization rules</li>
            </ul>

            <h4>Export Data</h4>
            <p>Export all your data for backup:</p>
            <ol>
              <li>Go to Dashboard</li>
              <li>Click "Export Data" in Quick Actions</li>
              <li>Save the JSON file</li>
            </ol>

            <h4>Import Data</h4>
            <p>Restore from a backup or merge data from another export.</p>

            <h4>CSV Import</h4>
            <p>Upload bank CSV files via the Upload page. Supports German date and amount formats.</p>
          </div>
        </mat-expansion-panel>
      </mat-accordion>

      <!-- Keyboard Shortcuts -->
      <mat-card class="section-card shortcuts-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>keyboard</mat-icon>
          <mat-card-title>Keyboard Shortcuts</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="shortcuts-grid">
            <div class="shortcut">
              <kbd>↑</kbd> <kbd>↓</kbd>
              <span>Navigate transactions</span>
            </div>
            <div class="shortcut">
              <kbd>Enter</kbd>
              <span>Expand/collapse transaction</span>
            </div>
            <div class="shortcut">
              <kbd>Space</kbd>
              <span>Select transaction</span>
            </div>
            <div class="shortcut">
              <kbd>1</kbd> - <kbd>9</kbd>
              <span>Assign category</span>
            </div>
            <div class="shortcut">
              <kbd>Ctrl</kbd> + <kbd>Z</kbd>
              <span>Undo last action</span>
            </div>
            <div class="shortcut">
              <kbd>Delete</kbd>
              <span>Delete selected</span>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Troubleshooting -->
      <mat-card class="section-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>build</mat-icon>
          <mat-card-title>Troubleshooting</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <h4>Connection Issues</h4>
          <ul>
            <li><strong>Browser automation fails</strong> - Close all Chrome windows before connecting</li>
            <li><strong>TAN timeout</strong> - Complete 2FA within the time limit, then retry</li>
            <li><strong>Invalid credentials</strong> - Double-check username and PIN/password</li>
          </ul>

          <h4>Data Issues</h4>
          <ul>
            <li><strong>Duplicate transactions</strong> - The system detects duplicates by date, amount, and description</li>
            <li><strong>Missing transactions</strong> - Check the date range when fetching</li>
            <li><strong>Wrong category</strong> - Edit the transaction and the system will learn</li>
          </ul>

          <h4>Performance</h4>
          <ul>
            <li><strong>Slow loading</strong> - Use pagination or filters to reduce displayed transactions</li>
            <li><strong>Large exports</strong> - Export regularly to avoid huge backup files</li>
          </ul>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .help-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 1rem;
    }

    .help-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .help-header mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #1976d2;
    }

    .help-header h1 {
      margin: 0;
    }

    .help-header p {
      margin: 0.25rem 0 0;
      color: #666;
    }

    h2 {
      margin: 2rem 0 1rem;
      font-size: 1.25rem;
    }

    .section-card {
      margin-bottom: 1.5rem;
    }

    .section-card mat-card-header {
      margin-bottom: 1rem;
    }

    .steps {
      padding-left: 1.5rem;
    }

    .steps li {
      margin-bottom: 1rem;
    }

    .steps li strong {
      display: block;
      margin-bottom: 0.25rem;
    }

    .steps li p {
      margin: 0;
      color: #666;
    }

    mat-expansion-panel {
      margin-bottom: 0.5rem;
    }

    mat-panel-title {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    mat-panel-title mat-icon {
      color: #1976d2;
    }

    .panel-content {
      padding: 0.5rem 0;
    }

    .panel-content h4 {
      margin: 1rem 0 0.5rem;
      color: #333;
    }

    .panel-content h4:first-child {
      margin-top: 0;
    }

    .panel-content ul, .panel-content ol {
      margin: 0;
      padding-left: 1.5rem;
    }

    .panel-content li {
      margin-bottom: 0.5rem;
    }

    .panel-content p {
      margin: 0.5rem 0;
    }

    .shortcuts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
    }

    .shortcut {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    kbd {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      font-family: monospace;
      font-size: 12px;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-shadow: 0 1px 1px rgba(0,0,0,0.1);
    }

    .shortcut span {
      color: #666;
      font-size: 14px;
    }
  `]
})
export class HelpComponent {}
