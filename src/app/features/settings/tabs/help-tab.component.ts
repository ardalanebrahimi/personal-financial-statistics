import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-help-tab',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatExpansionModule,
    MatIconModule,
    MatButtonModule
  ],
  template: `
    <div class="help-tab">
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
              <p>Go to the Connectors tab and add your bank accounts</p>
            </li>
            <li>
              <strong>Fetch transactions</strong>
              <p>Set a date range and click "Fetch" to import your transactions</p>
            </li>
            <li>
              <strong>Categorize transactions</strong>
              <p>Drag transactions to categories or use the AI Assistant</p>
            </li>
            <li>
              <strong>View analytics</strong>
              <p>Check the Analytics page for spending insights</p>
            </li>
          </ol>
        </mat-card-content>
      </mat-card>

      <!-- Features -->
      <h2>Features</h2>

      <mat-accordion>
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
              <li><strong>Sparkasse</strong> - Connect via FinTS/HBCI with pushTAN</li>
              <li><strong>N26</strong> - Direct API connection with 2FA</li>
              <li><strong>PayPal</strong> - Browser automation</li>
              <li><strong>Mastercard (Advanzia)</strong> - Browser automation</li>
              <li><strong>Amazon</strong> - CSV import</li>
            </ul>
          </div>
        </mat-expansion-panel>

        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title>
              <mat-icon>receipt_long</mat-icon>
              Transaction Management
            </mat-panel-title>
          </mat-expansion-panel-header>
          <div class="panel-content">
            <h4>Categorizing</h4>
            <ul>
              <li><strong>Drag & Drop</strong> - Drag to category sidebar</li>
              <li><strong>Keyboard</strong> - Press 1-9 for quick assignment</li>
              <li><strong>Click</strong> - Click transaction to edit</li>
            </ul>

            <h4>Filtering</h4>
            <ul>
              <li>Filter by date range, category, source</li>
              <li>Search by description or beneficiary</li>
              <li>Sort by date or amount</li>
            </ul>
          </div>
        </mat-expansion-panel>

        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title>
              <mat-icon>link</mat-icon>
              Transaction Matching
            </mat-panel-title>
          </mat-expansion-panel-header>
          <div class="panel-content">
            <p>Matching links related transactions across accounts:</p>
            <ul>
              <li>PayPal bank entries → actual PayPal transactions</li>
              <li>Credit card payments → individual purchases</li>
              <li>Internal transfers between your accounts</li>
            </ul>
            <p>Run "Matching" on the Transactions page to auto-detect matches.</p>
          </div>
        </mat-expansion-panel>

        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title>
              <mat-icon>smart_toy</mat-icon>
              AI Features
            </mat-panel-title>
          </mat-expansion-panel-header>
          <div class="panel-content">
            <h4>AI Assistant (FAB Button)</h4>
            <ul>
              <li>Ask about your spending patterns</li>
              <li>Get category suggestions</li>
              <li>Find similar transactions</li>
              <li>Apply categories in bulk</li>
            </ul>

            <h4>Smart Categorization</h4>
            <p>The system learns from your choices and auto-categorizes similar transactions.</p>
          </div>
        </mat-expansion-panel>

        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title>
              <mat-icon>analytics</mat-icon>
              Analytics
            </mat-panel-title>
          </mat-expansion-panel-header>
          <div class="panel-content">
            <ul>
              <li><strong>Spending by Category</strong> - Pie/Bar charts</li>
              <li><strong>Monthly Trends</strong> - Track over time</li>
              <li><strong>Income vs Expenses</strong> - Balance overview</li>
            </ul>
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
              <span>Expand transaction</span>
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
              <span>Undo</span>
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
            <li><strong>Browser automation fails</strong> - Close Chrome first</li>
            <li><strong>TAN timeout</strong> - Complete 2FA quickly, then retry</li>
            <li><strong>Invalid credentials</strong> - Double-check username/PIN</li>
          </ul>

          <h4>Data Issues</h4>
          <ul>
            <li><strong>Duplicates</strong> - System auto-detects by date/amount</li>
            <li><strong>Missing transactions</strong> - Check date range</li>
            <li><strong>Wrong category</strong> - Edit to correct, AI learns</li>
          </ul>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .help-tab {
      max-width: 900px;
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

    .panel-content ul {
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
export class HelpTabComponent {}
