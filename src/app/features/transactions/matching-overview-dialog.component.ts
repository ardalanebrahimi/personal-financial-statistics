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
  templateUrl: './matching-overview-dialog.component.html',
  styleUrl: './matching-overview-dialog.component.scss'
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
