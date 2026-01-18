/**
 * Matching Overview Dialog Component
 *
 * Dialog for reviewing and linking bank transactions with Amazon/PayPal data.
 */

import { Component, Inject, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSliderModule } from '@angular/material/slider';

import {
  MatchingService,
  MatchingOverviewData,
  TransactionData,
  MatchingSuggestion,
  PlatformType
} from './services/matching.service';
import { MatchingStatsBarComponent } from './components/matching/matching-stats-bar.component';
import { MatchingLinkSummaryComponent } from './components/matching/matching-link-summary.component';
import { MatchingTxItemComponent } from './components/matching/matching-tx-item.component';

@Component({
  selector: 'app-matching-overview-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatButtonToggleModule,
    MatSliderModule,
    MatchingStatsBarComponent,
    MatchingLinkSummaryComponent,
    MatchingTxItemComponent
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
          <app-matching-stats-bar
            [stats]="matchingService.getStats(data, selectedPlatform)"
            [platform]="selectedPlatform"
            [unlinkedContextCount]="getUnlinkedContextCount()"
            [suggestionCount]="matchingService.getSuggestions(data, selectedPlatform).length">
          </app-matching-stats-bar>

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

              <div class="transaction-list" *ngIf="getBankUnlinked().length > 0">
                <app-matching-tx-item
                  *ngFor="let tx of getBankUnlinked()"
                  [transaction]="tx"
                  [isSelected]="selectedBankTx?.id === tx.id"
                  [isChecked]="batchSelectedBankIds.has(tx.id)"
                  [hasSuggestion]="matchingService.hasSuggestionFor(data, selectedPlatform, tx.id)"
                  [isBatchSelected]="batchSelectedBankIds.has(tx.id)"
                  [showCheckbox]="matchingService.hasSuggestionFor(data, selectedPlatform, tx.id)"
                  (itemClick)="selectBankTx(tx)"
                  (checkboxChange)="toggleBatchSelect(tx.id, $event)">
                </app-matching-tx-item>
              </div>

              <div class="empty-state" *ngIf="getBankUnlinked().length === 0">
                <mat-icon>check_circle</mat-icon>
                <span>All matched!</span>
              </div>
            </div>

            <!-- Center: Link indicator -->
            <app-matching-link-summary
              [selectedBankTx]="selectedBankTx"
              [selectedTotal]="getSelectedTotal()"
              [selectedCount]="selectedContextTxIds.size"
              [isMatch]="isAmountMatch()"
              [isCloseMatch]="isCloseMatch()"
              [difference]="getDifference()">
            </app-matching-link-summary>

            <!-- Right Panel: Context Transactions -->
            <div class="panel context-panel">
              <h3>
                <mat-icon *ngIf="selectedPlatform === 'amazon'">shopping_cart</mat-icon>
                <mat-icon *ngIf="selectedPlatform === 'paypal'">account_balance_wallet</mat-icon>
                {{ selectedPlatform === 'amazon' ? 'Amazon Orders' : 'PayPal Transactions' }}
              </h3>
              <p class="panel-hint">Select items to link</p>

              <!-- Date Range Slider -->
              <div class="date-range-control" *ngIf="selectedBankTx && !matchingService.hasSuggestionFor(data, selectedPlatform, selectedBankTx.id)">
                <div class="date-range-label">
                  <mat-icon>date_range</mat-icon>
                  <span>Search range: {{ dateRangeDays }} days</span>
                </div>
                <mat-slider min="7" max="60" step="1" discrete [displayWith]="formatDays">
                  <input matSliderThumb [(ngModel)]="dateRangeDays">
                </mat-slider>
                <span class="date-range-hint">Increase to find matches further away</span>
              </div>

              <div class="transaction-list" *ngIf="getContextUnlinked().length > 0">
                <app-matching-tx-item
                  *ngFor="let tx of getFilteredContextTx()"
                  [id]="'context-tx-' + tx.id"
                  [transaction]="tx"
                  [isSelected]="selectedContextTxIds.has(tx.id)"
                  [isChecked]="selectedContextTxIds.has(tx.id)"
                  [isSuggested]="isSuggestedFor(tx.id)"
                  [showCheckbox]="true"
                  [showCheckboxOnly]="true"
                  (itemClick)="toggleContextTx(tx)"
                  (checkboxChange)="toggleContextTx(tx)">
                </app-matching-tx-item>
              </div>

              <div class="empty-state" *ngIf="getContextUnlinked().length === 0">
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

    .header-left mat-icon { color: #1976d2; }

    mat-button-toggle-group { margin-left: auto; }

    .badge {
      background: #f44336;
      color: white;
      border-radius: 12px;
      padding: 2px 8px;
      font-size: 11px;
      margin-left: 8px;
    }

    .amazon-icon { color: #ff9800 !important; }
    .paypal-icon { color: #0070ba !important; }

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

    .panel-header mat-checkbox { font-size: 12px; }

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

    .date-range-control mat-slider { width: 100%; }

    .date-range-hint {
      display: block;
      font-size: 11px;
      color: #888;
      margin-top: 4px;
    }

    .bank-panel { border-right: 1px solid #e0e0e0; }
    .context-panel { border-left: 1px solid #e0e0e0; }

    .transaction-list {
      flex: 1;
      overflow-y: auto;
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

    .spacer { flex: 1; }
  `]
})
export class MatchingOverviewDialogComponent implements OnInit {
  @ViewChild('contextList') contextListRef!: ElementRef;

  selectedPlatform: PlatformType = 'amazon';
  isLoading = true;
  data: MatchingOverviewData | null = null;

  selectedBankTx: TransactionData | null = null;
  selectedContextTxIds = new Set<string>();
  batchSelectedBankIds = new Set<string>();
  dateRangeDays = 7;
  currentSuggestion: MatchingSuggestion | null = null;

  constructor(
    private dialogRef: MatDialogRef<MatchingOverviewDialogComponent>,
    private snackBar: MatSnackBar,
    public matchingService: MatchingService,
    @Inject(MAT_DIALOG_DATA) public dialogData: any
  ) {}

  formatDays = (value: number): string => `${value}d`;

  ngOnInit(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    this.data = await this.matchingService.loadOverviewData();
    if (this.data) {
      this.selectedPlatform = this.matchingService.getDefaultPlatform(this.data);
    }
    this.isLoading = false;
  }

  onPlatformChange(): void {
    this.clearSelection();
    this.batchSelectedBankIds.clear();
  }

  clearSelection(): void {
    this.selectedBankTx = null;
    this.selectedContextTxIds.clear();
    this.currentSuggestion = null;
    this.dateRangeDays = 7;
  }

  // Data accessors
  getBankUnlinked(): TransactionData[] {
    return this.matchingService.getBankUnlinked(this.data, this.selectedPlatform);
  }

  getContextUnlinked(): TransactionData[] {
    return this.matchingService.getContextUnlinked(this.data, this.selectedPlatform);
  }

  getUnlinkedContextCount(): number {
    return this.getContextUnlinked().length;
  }

  // Selection methods
  selectBankTx(tx: TransactionData): void {
    this.selectedBankTx = tx;
    this.selectedContextTxIds.clear();
    this.dateRangeDays = 7;

    const suggestion = this.matchingService.getSuggestionFor(this.data, this.selectedPlatform, tx.id);
    if (suggestion) {
      this.currentSuggestion = suggestion;
      suggestion.contextIds.forEach(id => this.selectedContextTxIds.add(id));
      setTimeout(() => this.scrollToSuggestedMatch(suggestion.contextIds[0]), 50);
    } else {
      this.currentSuggestion = null;
    }
  }

  scrollToSuggestedMatch(contextTxId: string): void {
    const element = document.getElementById(`context-tx-${contextTxId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  toggleContextTx(tx: TransactionData): void {
    if (this.selectedContextTxIds.has(tx.id)) {
      this.selectedContextTxIds.delete(tx.id);
    } else {
      this.selectedContextTxIds.add(tx.id);
    }
  }

  isSuggestedFor(contextTxId: string): boolean {
    if (!this.selectedBankTx) return false;
    const suggestion = this.matchingService.getSuggestionFor(this.data, this.selectedPlatform, this.selectedBankTx.id);
    return suggestion?.contextIds.includes(contextTxId) || false;
  }

  getFilteredContextTx(): TransactionData[] {
    const contextTxs = this.getContextUnlinked();
    if (!this.selectedBankTx) return contextTxs;

    const bankDate = new Date(this.selectedBankTx.date).getTime();
    const maxDaysMs = this.dateRangeDays * 24 * 60 * 60 * 1000;

    let filtered = contextTxs;
    if (!this.matchingService.hasSuggestionFor(this.data, this.selectedPlatform, this.selectedBankTx.id)) {
      filtered = contextTxs.filter(tx => {
        const diff = Math.abs(new Date(tx.date).getTime() - bankDate);
        return diff <= maxDaysMs;
      });
    }

    return [...filtered].sort((a, b) => {
      const aDiff = Math.abs(new Date(a.date).getTime() - bankDate);
      const bDiff = Math.abs(new Date(b.date).getTime() - bankDate);
      return aDiff - bDiff;
    });
  }

  // Batch selection
  getBatchSelectableBankTxs(): TransactionData[] {
    return this.getBankUnlinked().filter(tx =>
      this.matchingService.hasSuggestionFor(this.data, this.selectedPlatform, tx.id)
    );
  }

  toggleBatchSelect(bankTxId: string, selected: boolean): void {
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

  toggleAllSuggestions(selected: boolean): void {
    const selectable = this.getBatchSelectableBankTxs();
    if (selected) {
      selectable.forEach(tx => this.batchSelectedBankIds.add(tx.id));
    } else {
      selectable.forEach(tx => this.batchSelectedBankIds.delete(tx.id));
    }
  }

  // Amount calculations
  getSelectedTotal(): number {
    const contextTxs = this.getContextUnlinked();
    let total = 0;
    this.selectedContextTxIds.forEach(id => {
      const tx = contextTxs.find(t => t.id === id);
      if (tx) total += Math.abs(tx.amount);
    });
    return -total;
  }

  isAmountMatch(): boolean {
    if (!this.selectedBankTx || this.selectedContextTxIds.size === 0) return false;
    return this.matchingService.isAmountMatch(this.selectedBankTx.amount, this.getSelectedTotal());
  }

  isCloseMatch(): boolean {
    if (!this.selectedBankTx || this.selectedContextTxIds.size === 0) return false;
    return this.matchingService.isCloseMatch(this.selectedBankTx.amount, this.getSelectedTotal());
  }

  getDifference(): number {
    if (!this.selectedBankTx) return 0;
    return Math.abs(Math.abs(this.selectedBankTx.amount) - Math.abs(this.getSelectedTotal()));
  }

  canLink(): boolean {
    return !!(this.selectedBankTx && this.selectedContextTxIds.size > 0);
  }

  hasHighConfidenceSuggestions(): boolean {
    return this.matchingService.getSuggestions(this.data, this.selectedPlatform).some(s => s.confidence === 'high');
  }

  getHighConfidenceSuggestionCount(): number {
    return this.matchingService.getHighConfidenceSuggestionCount(this.data, this.selectedPlatform);
  }

  // Linking actions
  async linkSelected(): Promise<void> {
    if (!this.selectedBankTx || this.selectedContextTxIds.size === 0) return;

    const result = await this.matchingService.linkTransactions(
      this.selectedPlatform,
      this.selectedBankTx.id,
      Array.from(this.selectedContextTxIds)
    );

    if (result.success) {
      this.snackBar.open('Linked successfully!', '', { duration: 2000 });
      await this.loadData();
      this.clearSelection();
    } else {
      this.snackBar.open('Failed to link transactions', '', { duration: 3000 });
    }
  }

  async linkBatchSelected(): Promise<void> {
    if (this.batchSelectedBankIds.size === 0) return;

    let successCount = 0;
    let errorCount = 0;

    for (const bankTxId of this.batchSelectedBankIds) {
      const suggestion = this.matchingService.getSuggestionFor(this.data, this.selectedPlatform, bankTxId);
      if (!suggestion) continue;

      const result = await this.matchingService.linkTransactions(
        this.selectedPlatform,
        bankTxId,
        suggestion.contextIds
      );

      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    if (errorCount > 0) {
      this.snackBar.open(`Linked ${successCount}, ${errorCount} failed`, '', { duration: 3000 });
    } else {
      this.snackBar.open(`Successfully linked ${successCount} transactions`, '', { duration: 2000 });
    }

    this.batchSelectedBankIds.clear();
    await this.loadData();
    this.clearSelection();
  }

  async autoMatchAll(): Promise<void> {
    const { successCount, errorCount } = await this.matchingService.autoMatchAll(this.data, this.selectedPlatform);

    if (successCount === 0 && errorCount === 0) {
      this.snackBar.open('No high-confidence matches found', '', { duration: 2000 });
      return;
    }

    if (errorCount > 0) {
      this.snackBar.open(`Linked ${successCount}, ${errorCount} failed`, '', { duration: 3000 });
    } else {
      this.snackBar.open(`Successfully linked ${successCount} transactions`, '', { duration: 2000 });
    }

    await this.loadData();
    this.clearSelection();
  }

  close(): void {
    this.dialogRef.close();
  }
}
