import { Component, Inject, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { environment } from '../../../environments/environment';

interface MatchingSuggestion {
  bankTransactionId: string;
  contextIds: string[];
  confidence: 'high' | 'medium' | 'low';
  totalAmount: number;
  amountDiff: number;
}

interface TransactionData {
  id: string;
  date: string;
  description: string;
  amount: number;
  beneficiary?: string;
  category?: string;
  source?: {
    connectorType: string;
  };
  isContextOnly?: boolean;
  linkedOrderIds?: string[];
}

interface MatchingOverviewData {
  amazon: {
    bankUnlinked: TransactionData[];
    ordersUnlinked: TransactionData[];
    bankLinked: TransactionData[];
    suggestions: MatchingSuggestion[];
    stats: {
      totalBankCharges: number;
      linkedBankCharges: number;
      unlinkedBankCharges: number;
      totalOrders: number;
      unlinkedOrders: number;
      suggestionCount: number;
    };
  };
  paypal: {
    bankUnlinked: TransactionData[];
    importsUnlinked: TransactionData[];
    bankLinked: TransactionData[];
    suggestions: MatchingSuggestion[];
    stats: {
      totalBankCharges: number;
      linkedBankCharges: number;
      unlinkedBankCharges: number;
      totalImports: number;
      unlinkedImports: number;
      suggestionCount: number;
    };
  };
}

export interface MatchingOverviewDialogResult {
  linkedPairs: Array<{
    bankTransactionId: string;
    contextTransactionIds: string[];
  }>;
}

@Component({
  selector: 'app-matching-overview-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatCheckboxModule,
    MatChipsModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatButtonToggleModule,
    MatSliderModule
  ],
  template: `
    <div class="matching-overview-dialog">
      <!-- Header -->
      <div class="dialog-header">
        <div class="header-left">
          <mat-icon>link</mat-icon>
          <h2>Matching Overview</h2>
        </div>
        <mat-button-toggle-group [(ngModel)]="selectedPlatform" (change)="onPlatformChange()">
          <mat-button-toggle value="amazon">
            <mat-icon class="amazon-icon">shopping_cart</mat-icon>
            Amazon
            <span class="badge" *ngIf="data?.amazon">{{ data!.amazon.stats.unlinkedBankCharges }}</span>
          </mat-button-toggle>
          <mat-button-toggle value="paypal">
            <mat-icon class="paypal-icon">account_balance_wallet</mat-icon>
            PayPal
            <span class="badge" *ngIf="data?.paypal">{{ data!.paypal.stats.unlinkedBankCharges }}</span>
          </mat-button-toggle>
        </mat-button-toggle-group>
        <button mat-icon-button (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-dialog-content>
        <!-- Loading state -->
        <div class="loading-state" *ngIf="isLoading">
          <mat-spinner diameter="40"></mat-spinner>
          <span>Loading matching data...</span>
        </div>

        <ng-container *ngIf="!isLoading && data">
          <!-- Stats Bar -->
          <div class="stats-bar">
            <div class="stat-item">
              <span class="stat-value">{{ getCurrentStats().unlinkedBankCharges }}</span>
              <span class="stat-label">Unlinked Bank Charges</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ getUnlinkedContextCount() }}</span>
              <span class="stat-label">Unlinked {{ selectedPlatform === 'amazon' ? 'Orders' : 'Transactions' }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ getCurrentSuggestions().length }}</span>
              <span class="stat-label">Suggestions</span>
            </div>
            <div class="stat-item linked">
              <span class="stat-value">{{ getCurrentStats().linkedBankCharges }}</span>
              <span class="stat-label">Already Linked</span>
            </div>
          </div>

          <!-- Two-Panel Layout -->
          <div class="matching-panels">
            <!-- Left Panel: Bank Transactions -->
            <div class="panel bank-panel">
              <div class="panel-header">
                <h3>
                  <mat-icon>account_balance</mat-icon>
                  Bank Transactions
                </h3>
                <mat-checkbox
                  *ngIf="getBatchSelectableBankTxs().length > 0"
                  [checked]="allSuggestionsSelected()"
                  [indeterminate]="someSuggestionsSelected()"
                  (change)="toggleAllSuggestions($event.checked)"
                  matTooltip="Select all with suggestions">
                  All
                </mat-checkbox>
              </div>
              <p class="panel-hint">Select a bank charge to match, or check multiple with suggestions for batch linking</p>

              <div class="transaction-list" *ngIf="getCurrentBankUnlinked().length > 0">
                <div *ngFor="let tx of getCurrentBankUnlinked()"
                     class="transaction-item"
                     [class.selected]="selectedBankTx?.id === tx.id"
                     [class.has-suggestion]="hasSuggestionFor(tx.id)"
                     [class.batch-selected]="batchSelectedBankIds.has(tx.id)"
                     (click)="selectBankTx(tx)">
                  <mat-checkbox
                    *ngIf="hasSuggestionFor(tx.id)"
                    [checked]="batchSelectedBankIds.has(tx.id)"
                    (click)="$event.stopPropagation()"
                    (change)="toggleBatchSelect(tx.id, $event.checked)"
                    class="batch-checkbox">
                  </mat-checkbox>
                  <div class="tx-main">
                    <div class="tx-date">{{ tx.date | date:'dd.MM.yy' }}</div>
                    <div class="tx-desc" [matTooltip]="tx.description">{{ tx.description | slice:0:35 }}{{ tx.description.length > 35 ? '...' : '' }}</div>
                    <div class="tx-amount" [class.negative]="tx.amount < 0">
                      {{ tx.amount | currency:'EUR':'symbol':'1.2-2' }}
                    </div>
                  </div>
                  <div class="tx-suggestion" *ngIf="hasSuggestionFor(tx.id)">
                    <mat-icon>lightbulb</mat-icon>
                    <span>Suggestion available</span>
                  </div>
                </div>
              </div>

              <div class="empty-state" *ngIf="getCurrentBankUnlinked().length === 0">
                <mat-icon>check_circle</mat-icon>
                <span>All matched!</span>
              </div>
            </div>

            <!-- Center: Link indicator -->
            <div class="link-indicator">
              <mat-icon class="link-arrow" *ngIf="selectedBankTx && selectedContextTxIds.size > 0">link</mat-icon>
              <mat-icon class="link-arrow dimmed" *ngIf="!selectedBankTx || selectedContextTxIds.size === 0">link_off</mat-icon>

              <div class="link-summary" *ngIf="selectedBankTx">
                <div class="summary-row">
                  <span class="label">Bank:</span>
                  <span class="value">{{ selectedBankTx.amount | currency:'EUR':'symbol':'1.2-2' }}</span>
                </div>
                <div class="summary-row" *ngIf="selectedContextTxIds.size > 0">
                  <span class="label">Selected:</span>
                  <span class="value">{{ getSelectedTotal() | currency:'EUR':'symbol':'1.2-2' }}</span>
                </div>
                <div class="summary-row match-status" *ngIf="selectedContextTxIds.size > 0"
                     [class.match]="isAmountMatch()"
                     [class.close-match]="isCloseMatch()"
                     [class.mismatch]="!isAmountMatch() && !isCloseMatch()">
                  <mat-icon *ngIf="isAmountMatch()">check_circle</mat-icon>
                  <mat-icon *ngIf="isCloseMatch() && !isAmountMatch()">warning</mat-icon>
                  <mat-icon *ngIf="!isAmountMatch() && !isCloseMatch()">error</mat-icon>
                  <span *ngIf="isAmountMatch()">Match!</span>
                  <span *ngIf="!isAmountMatch()">Diff: {{ getDifference() | currency:'EUR':'symbol':'1.2-2' }}</span>
                </div>
              </div>
            </div>

            <!-- Right Panel: Context Transactions (Orders/Imports) -->
            <div class="panel context-panel">
              <h3>
                <mat-icon *ngIf="selectedPlatform === 'amazon'">shopping_cart</mat-icon>
                <mat-icon *ngIf="selectedPlatform === 'paypal'">account_balance_wallet</mat-icon>
                {{ selectedPlatform === 'amazon' ? 'Amazon Orders' : 'PayPal Transactions' }}
              </h3>
              <p class="panel-hint">Select items to link</p>

              <!-- Date Range Slider -->
              <div class="date-range-control" *ngIf="selectedBankTx && !hasSuggestionFor(selectedBankTx.id)">
                <div class="date-range-label">
                  <mat-icon>date_range</mat-icon>
                  <span>Search range: {{ dateRangeDays }} days</span>
                </div>
                <mat-slider min="7" max="60" step="1" discrete [displayWith]="formatDays">
                  <input matSliderThumb [(ngModel)]="dateRangeDays" (ngModelChange)="onDateRangeChange()">
                </mat-slider>
                <span class="date-range-hint">Increase to find matches further away</span>
              </div>

              <div class="transaction-list" #contextList *ngIf="getCurrentContextUnlinked().length > 0">
                <div *ngFor="let tx of getFilteredContextTx()"
                     class="transaction-item"
                     [id]="'context-tx-' + tx.id"
                     [class.selected]="selectedContextTxIds.has(tx.id)"
                     [class.suggested]="isSuggestedFor(tx.id)"
                     (click)="toggleContextTx(tx)">
                  <mat-checkbox
                    [checked]="selectedContextTxIds.has(tx.id)"
                    (click)="$event.stopPropagation()"
                    (change)="toggleContextTx(tx)">
                  </mat-checkbox>
                  <div class="tx-main">
                    <div class="tx-date">{{ tx.date | date:'dd.MM.yy' }}</div>
                    <div class="tx-desc" [matTooltip]="tx.description">{{ tx.description | slice:0:35 }}{{ tx.description.length > 35 ? '...' : '' }}</div>
                    <div class="tx-amount" [class.negative]="tx.amount < 0">
                      {{ tx.amount | currency:'EUR':'symbol':'1.2-2' }}
                    </div>
                  </div>
                </div>
              </div>

              <div class="empty-state" *ngIf="getCurrentContextUnlinked().length === 0">
                <mat-icon>info</mat-icon>
                <span>No unlinked {{ selectedPlatform === 'amazon' ? 'orders' : 'transactions' }}</span>
                <p class="hint">Import {{ selectedPlatform === 'amazon' ? 'Amazon orders' : 'PayPal transactions' }} to match</p>
              </div>
            </div>
          </div>
        </ng-container>
      </mat-dialog-content>

      <mat-dialog-actions>
        <button mat-button (click)="close()">Close</button>
        <div class="spacer"></div>
        <button mat-stroked-button
                (click)="autoMatchAll()"
                [disabled]="!hasHighConfidenceSuggestions()">
          <mat-icon>auto_fix_high</mat-icon>
          Auto-Match All ({{ getHighConfidenceSuggestionCount() }})
        </button>
        <button mat-stroked-button
                color="accent"
                (click)="linkBatchSelected()"
                [disabled]="batchSelectedBankIds.size === 0">
          <mat-icon>playlist_add_check</mat-icon>
          Link Selected ({{ batchSelectedBankIds.size }})
        </button>
        <button mat-raised-button color="primary"
                [disabled]="!canLink()"
                (click)="linkSelected()">
          <mat-icon>link</mat-icon>
          Link Manual
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .matching-overview-dialog {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 24px;
      border-bottom: 1px solid #e0e0e0;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-left h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 500;
    }

    .header-left mat-icon {
      color: #1976d2;
    }

    mat-button-toggle-group {
      margin-left: auto;
    }

    .badge {
      background: #f44336;
      color: white;
      border-radius: 12px;
      padding: 2px 8px;
      font-size: 11px;
      margin-left: 8px;
    }

    .amazon-icon {
      color: #ff9800 !important;
    }

    .paypal-icon {
      color: #0070ba !important;
    }

    mat-dialog-content {
      padding: 0 !important;
      flex: 1;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      gap: 16px;
      color: #666;
    }

    .stats-bar {
      display: flex;
      gap: 24px;
      padding: 16px 24px;
      background: #fafafa;
      border-bottom: 1px solid #e0e0e0;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
    }

    .stat-item .stat-value {
      font-size: 24px;
      font-weight: 600;
      color: #333;
    }

    .stat-item .stat-label {
      font-size: 12px;
      color: #666;
    }

    .stat-item.linked .stat-value {
      color: #4caf50;
    }

    .matching-panels {
      display: flex;
      flex: 1;
      overflow: hidden;
      min-height: 0;
    }

    .panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 16px;
      overflow: hidden;
      min-height: 0;
      min-width: 0;
    }

    .panel h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 4px 0;
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      color: #333;
    }

    .panel-hint {
      margin: 0 0 12px 0;
      font-size: 12px;
      color: #666;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .panel-header mat-checkbox {
      font-size: 12px;
    }

    .batch-checkbox {
      margin-right: 8px;
    }

    .transaction-item.batch-selected {
      background: #e8f5e9;
      border-color: #4caf50;
    }

    .date-range-control {
      background: #f5f5f5;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }

    .date-range-label {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 13px;
      color: #333;
    }

    .date-range-label mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #666;
    }

    .date-range-control mat-slider {
      width: 100%;
    }

    .date-range-hint {
      display: block;
      font-size: 11px;
      color: #888;
      margin-top: 4px;
    }

    .bank-panel {
      border-right: 1px solid #e0e0e0;
    }

    .context-panel {
      border-left: 1px solid #e0e0e0;
    }

    .link-indicator {
      width: 120px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: #f5f5f5;
    }

    .link-arrow {
      font-size: 36px;
      width: 36px;
      height: 36px;
      color: #4caf50;
    }

    .link-arrow.dimmed {
      color: #ccc;
    }

    .link-summary {
      margin-top: 16px;
      text-align: center;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      margin-bottom: 4px;
    }

    .summary-row .label {
      color: #666;
    }

    .summary-row .value {
      font-weight: 500;
      font-family: 'Roboto Mono', monospace;
    }

    .match-status {
      margin-top: 8px;
      padding: 4px 8px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }

    .match-status mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .match-status.match {
      background: #c8e6c9;
      color: #2e7d32;
    }

    .match-status.close-match {
      background: #fff9c4;
      color: #f9a825;
    }

    .match-status.mismatch {
      background: #ffcdd2;
      color: #c62828;
    }

    .transaction-list {
      flex: 1;
      overflow-y: auto;
    }

    .transaction-item {
      padding: 10px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .transaction-item:hover {
      background: #f5f5f5;
      border-color: #ccc;
    }

    .transaction-item.selected {
      background: #e3f2fd;
      border-color: #1976d2;
    }

    .transaction-item.has-suggestion {
      border-color: #ff9800;
    }

    .transaction-item.suggested {
      background: #fff3e0;
      border-color: #ff9800;
    }

    .tx-main {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .tx-date {
      font-size: 12px;
      color: #666;
      min-width: 60px;
    }

    .tx-desc {
      flex: 1;
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tx-amount {
      font-size: 13px;
      font-weight: 600;
      font-family: 'Roboto Mono', monospace;
      min-width: 80px;
      text-align: right;
    }

    .tx-amount.negative {
      color: #d32f2f;
    }

    .tx-suggestion {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 6px;
      font-size: 11px;
      color: #ff9800;
    }

    .tx-suggestion mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .context-panel .transaction-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .context-panel .tx-main {
      flex: 1;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px;
      color: #666;
    }

    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #4caf50;
      margin-bottom: 8px;
    }

    .empty-state .hint {
      font-size: 12px;
      color: #999;
      margin-top: 8px;
    }

    mat-dialog-actions {
      padding: 16px 24px;
      border-top: 1px solid #e0e0e0;
      display: flex;
      gap: 8px;
    }

    .spacer {
      flex: 1;
    }
  `]
})
export class MatchingOverviewDialogComponent implements OnInit {
  @ViewChild('contextList') contextListRef!: ElementRef;

  selectedPlatform: 'amazon' | 'paypal' = 'amazon';
  isLoading = true;
  data: MatchingOverviewData | null = null;

  // Selection state
  selectedBankTx: TransactionData | null = null;
  selectedContextTxIds = new Set<string>();

  // Batch selection state
  batchSelectedBankIds = new Set<string>();

  // Date range for manual matching (days)
  dateRangeDays = 7;

  // Current suggestions for selected bank transaction
  currentSuggestion: MatchingSuggestion | null = null;

  constructor(
    private dialogRef: MatDialogRef<MatchingOverviewDialogComponent>,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public dialogData: any
  ) {}

  // Format function for slider display
  formatDays = (value: number): string => `${value}d`;

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.isLoading = true;
    try {
      const response = await fetch(`${environment.apiUrl}/matching/overview`);
      this.data = await response.json();

      // Auto-select platform with most unlinked items
      if (this.data) {
        const amazonUnlinked = this.data.amazon.stats.unlinkedBankCharges;
        const paypalUnlinked = this.data.paypal.stats.unlinkedBankCharges;
        this.selectedPlatform = amazonUnlinked >= paypalUnlinked ? 'amazon' : 'paypal';
      }
    } catch (error) {
      console.error('Error loading matching data:', error);
      this.snackBar.open('Failed to load matching data', '', { duration: 3000 });
    }
    this.isLoading = false;
  }

  onPlatformChange() {
    this.clearSelection();
    this.batchSelectedBankIds.clear();
  }

  clearSelection() {
    this.selectedBankTx = null;
    this.selectedContextTxIds.clear();
    this.currentSuggestion = null;
    this.dateRangeDays = 7;
  }

  onDateRangeChange() {
    // Trigger re-filter of context transactions
  }

  getCurrentStats() {
    const defaultStats = { totalBankCharges: 0, linkedBankCharges: 0, unlinkedBankCharges: 0, totalOrders: 0, unlinkedOrders: 0, suggestionCount: 0, totalImports: 0, unlinkedImports: 0 };
    if (!this.data) return defaultStats;
    if (this.selectedPlatform === 'amazon') {
      return this.data.amazon?.stats || defaultStats;
    }
    return this.data.paypal?.stats || defaultStats;
  }

  getUnlinkedContextCount(): number {
    if (!this.data) return 0;
    if (this.selectedPlatform === 'amazon') {
      return this.data.amazon?.ordersUnlinked?.length || 0;
    }
    return this.data.paypal?.importsUnlinked?.length || 0;
  }

  getCurrentSuggestions(): MatchingSuggestion[] {
    if (!this.data) return [];
    if (this.selectedPlatform === 'amazon') {
      return this.data.amazon?.suggestions || [];
    }
    return this.data.paypal?.suggestions || [];
  }

  getCurrentBankUnlinked(): TransactionData[] {
    if (!this.data) return [];
    if (this.selectedPlatform === 'amazon') {
      return this.data.amazon?.bankUnlinked || [];
    }
    return this.data.paypal?.bankUnlinked || [];
  }

  getCurrentContextUnlinked(): TransactionData[] {
    if (!this.data) return [];
    if (this.selectedPlatform === 'amazon') {
      return this.data.amazon?.ordersUnlinked || [];
    }
    return this.data.paypal?.importsUnlinked || [];
  }

  hasSuggestionFor(bankTxId: string): boolean {
    return this.getCurrentSuggestions().some(s => s.bankTransactionId === bankTxId);
  }

  getSuggestionFor(bankTxId: string): MatchingSuggestion | undefined {
    return this.getCurrentSuggestions().find(s => s.bankTransactionId === bankTxId);
  }

  isSuggestedFor(contextTxId: string): boolean {
    if (!this.selectedBankTx) return false;
    const suggestion = this.getSuggestionFor(this.selectedBankTx.id);
    return suggestion?.contextIds.includes(contextTxId) || false;
  }

  selectBankTx(tx: TransactionData) {
    this.selectedBankTx = tx;
    this.selectedContextTxIds.clear();
    this.dateRangeDays = 7; // Reset date range on new selection

    // Auto-select suggested matches
    const suggestion = this.getSuggestionFor(tx.id);
    if (suggestion) {
      this.currentSuggestion = suggestion;
      suggestion.contextIds.forEach(id => this.selectedContextTxIds.add(id));

      // Auto-scroll to first suggested match after a brief delay for DOM update
      setTimeout(() => this.scrollToSuggestedMatch(suggestion.contextIds[0]), 50);
    } else {
      this.currentSuggestion = null;
    }
  }

  scrollToSuggestedMatch(contextTxId: string) {
    const element = document.getElementById(`context-tx-${contextTxId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  toggleContextTx(tx: TransactionData) {
    if (this.selectedContextTxIds.has(tx.id)) {
      this.selectedContextTxIds.delete(tx.id);
    } else {
      this.selectedContextTxIds.add(tx.id);
    }
  }

  getFilteredContextTx(): TransactionData[] {
    const contextTxs = this.getCurrentContextUnlinked();
    if (!this.selectedBankTx) return contextTxs;

    const bankDate = new Date(this.selectedBankTx.date).getTime();
    const maxDaysMs = this.dateRangeDays * 24 * 60 * 60 * 1000;

    // Filter by date range if no suggestion exists for this bank transaction
    let filtered = contextTxs;
    if (!this.hasSuggestionFor(this.selectedBankTx.id)) {
      filtered = contextTxs.filter(tx => {
        const diff = Math.abs(new Date(tx.date).getTime() - bankDate);
        return diff <= maxDaysMs;
      });
    }

    // Sort by date proximity to selected bank transaction
    return [...filtered].sort((a, b) => {
      const aDiff = Math.abs(new Date(a.date).getTime() - bankDate);
      const bDiff = Math.abs(new Date(b.date).getTime() - bankDate);
      return aDiff - bDiff;
    });
  }

  // Batch selection methods
  getBatchSelectableBankTxs(): TransactionData[] {
    return this.getCurrentBankUnlinked().filter(tx => this.hasSuggestionFor(tx.id));
  }

  toggleBatchSelect(bankTxId: string, selected: boolean) {
    if (selected) {
      this.batchSelectedBankIds.add(bankTxId);
    } else {
      this.batchSelectedBankIds.delete(bankTxId);
    }
  }

  allSuggestionsSelected(): boolean {
    const selectable = this.getBatchSelectableBankTxs();
    return selectable.length > 0 && selectable.every(tx => this.batchSelectedBankIds.has(tx.id));
  }

  someSuggestionsSelected(): boolean {
    const selectable = this.getBatchSelectableBankTxs();
    const selectedCount = selectable.filter(tx => this.batchSelectedBankIds.has(tx.id)).length;
    return selectedCount > 0 && selectedCount < selectable.length;
  }

  toggleAllSuggestions(selected: boolean) {
    const selectable = this.getBatchSelectableBankTxs();
    if (selected) {
      selectable.forEach(tx => this.batchSelectedBankIds.add(tx.id));
    } else {
      selectable.forEach(tx => this.batchSelectedBankIds.delete(tx.id));
    }
  }

  async linkBatchSelected() {
    if (this.batchSelectedBankIds.size === 0) return;

    const endpoint = this.selectedPlatform === 'amazon'
      ? '/order-matching/link'
      : '/paypal-matching/link';

    let successCount = 0;
    let errorCount = 0;

    for (const bankTxId of this.batchSelectedBankIds) {
      const suggestion = this.getSuggestionFor(bankTxId);
      if (!suggestion) continue;

      const body = this.selectedPlatform === 'amazon'
        ? { bankTransactionId: bankTxId, orderIds: suggestion.contextIds }
        : { bankTransactionId: bankTxId, paypalIds: suggestion.contextIds };

      try {
        const response = await fetch(`${environment.apiUrl}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        errorCount++;
      }
    }

    if (errorCount > 0) {
      this.snackBar.open(`Linked ${successCount}, ${errorCount} failed`, '', { duration: 3000 });
    } else {
      this.snackBar.open(`Successfully linked ${successCount} transactions`, '', { duration: 2000 });
    }

    // Clear batch selection and reload data
    this.batchSelectedBankIds.clear();
    await this.loadData();
    this.clearSelection();
  }

  getSelectedTotal(): number {
    const contextTxs = this.getCurrentContextUnlinked();
    let total = 0;
    this.selectedContextTxIds.forEach(id => {
      const tx = contextTxs.find(t => t.id === id);
      if (tx) total += Math.abs(tx.amount);
    });
    return -total; // Return as negative since these are expenses
  }

  isAmountMatch(): boolean {
    if (!this.selectedBankTx || this.selectedContextTxIds.size === 0) return false;
    const bankAmount = Math.abs(this.selectedBankTx.amount);
    const selectedAmount = Math.abs(this.getSelectedTotal());
    return Math.abs(bankAmount - selectedAmount) < 0.05;
  }

  isCloseMatch(): boolean {
    if (!this.selectedBankTx || this.selectedContextTxIds.size === 0) return false;
    const bankAmount = Math.abs(this.selectedBankTx.amount);
    const selectedAmount = Math.abs(this.getSelectedTotal());
    const diff = Math.abs(bankAmount - selectedAmount);
    return diff >= 0.05 && diff < 5.0;
  }

  getDifference(): number {
    if (!this.selectedBankTx) return 0;
    const bankAmount = Math.abs(this.selectedBankTx.amount);
    const selectedAmount = Math.abs(this.getSelectedTotal());
    return Math.abs(bankAmount - selectedAmount);
  }

  canLink(): boolean {
    return !!(this.selectedBankTx && this.selectedContextTxIds.size > 0);
  }

  hasHighConfidenceSuggestions(): boolean {
    return this.getCurrentSuggestions().some(s => s.confidence === 'high');
  }

  getHighConfidenceSuggestionCount(): number {
    return this.getCurrentSuggestions().filter(s => s.confidence === 'high').length;
  }

  async linkSelected() {
    if (!this.selectedBankTx || this.selectedContextTxIds.size === 0) return;

    const endpoint = this.selectedPlatform === 'amazon'
      ? '/order-matching/link'
      : '/paypal-matching/link';

    const body = this.selectedPlatform === 'amazon'
      ? { bankTransactionId: this.selectedBankTx.id, orderIds: Array.from(this.selectedContextTxIds) }
      : { bankTransactionId: this.selectedBankTx.id, paypalIds: Array.from(this.selectedContextTxIds) };

    try {
      const response = await fetch(`${environment.apiUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error('Failed to link');
      }

      this.snackBar.open('Linked successfully!', '', { duration: 2000 });

      // Reload data
      await this.loadData();
      this.clearSelection();

    } catch (error) {
      console.error('Error linking:', error);
      this.snackBar.open('Failed to link transactions', '', { duration: 3000 });
    }
  }

  async autoMatchAll() {
    const highConfidenceSuggestions = this.getCurrentSuggestions().filter(s => s.confidence === 'high');

    if (highConfidenceSuggestions.length === 0) {
      this.snackBar.open('No high-confidence matches found', '', { duration: 2000 });
      return;
    }

    const endpoint = this.selectedPlatform === 'amazon'
      ? '/order-matching/link'
      : '/paypal-matching/link';

    let successCount = 0;
    let errorCount = 0;

    for (const suggestion of highConfidenceSuggestions) {
      const body = this.selectedPlatform === 'amazon'
        ? { bankTransactionId: suggestion.bankTransactionId, orderIds: suggestion.contextIds }
        : { bankTransactionId: suggestion.bankTransactionId, paypalIds: suggestion.contextIds };

      try {
        const response = await fetch(`${environment.apiUrl}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        errorCount++;
      }
    }

    if (errorCount > 0) {
      this.snackBar.open(`Linked ${successCount}, ${errorCount} failed`, '', { duration: 3000 });
    } else {
      this.snackBar.open(`Successfully linked ${successCount} transactions`, '', { duration: 2000 });
    }

    // Reload data
    await this.loadData();
    this.clearSelection();
  }

  close() {
    this.dialogRef.close();
  }
}
