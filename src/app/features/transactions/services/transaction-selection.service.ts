/**
 * Transaction Selection Service
 *
 * Manages selection state for transactions, extracted from TransactionsComponent.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Transaction } from '../../../core/models/transaction.model';

@Injectable({
  providedIn: 'root'
})
export class TransactionSelectionService {
  private _selectedTransactions = new BehaviorSubject<Transaction[]>([]);
  selectedTransactions$ = this._selectedTransactions.asObservable();

  private _focusedIndex = new BehaviorSubject<number>(-1);
  focusedIndex$ = this._focusedIndex.asObservable();

  private _expandedIds = new BehaviorSubject<Set<string>>(new Set());
  expandedIds$ = this._expandedIds.asObservable();

  getSelectedTransactions(): Transaction[] {
    return this._selectedTransactions.value;
  }

  getSelectedCount(): number {
    return this._selectedTransactions.value.length;
  }

  isSelected(transaction: Transaction): boolean {
    return this._selectedTransactions.value.some(t => t.id === transaction.id);
  }

  /**
   * Toggle selection of a single transaction.
   */
  toggleSelection(transaction: Transaction): void {
    const current = this._selectedTransactions.value;
    const index = current.findIndex(t => t.id === transaction.id);

    if (index >= 0) {
      // Remove from selection
      const updated = [...current];
      updated.splice(index, 1);
      this._selectedTransactions.next(updated);
    } else {
      // Add to selection
      this._selectedTransactions.next([...current, transaction]);
    }
  }

  /**
   * Select a single transaction (replacing current selection).
   */
  selectSingle(transaction: Transaction): void {
    this._selectedTransactions.next([transaction]);
  }

  /**
   * Add a transaction to selection.
   */
  addToSelection(transaction: Transaction): void {
    if (!this.isSelected(transaction)) {
      this._selectedTransactions.next([...this._selectedTransactions.value, transaction]);
    }
  }

  /**
   * Remove a transaction from selection.
   */
  removeFromSelection(transaction: Transaction): void {
    this._selectedTransactions.next(
      this._selectedTransactions.value.filter(t => t.id !== transaction.id)
    );
  }

  /**
   * Select all transactions in a list.
   */
  selectAll(transactions: Transaction[]): void {
    const currentIds = new Set(this._selectedTransactions.value.map(t => t.id));
    const toAdd = transactions.filter(t => !currentIds.has(t.id));
    this._selectedTransactions.next([...this._selectedTransactions.value, ...toAdd]);
  }

  /**
   * Deselect all transactions in a list.
   */
  deselectAll(transactions: Transaction[]): void {
    const idsToRemove = new Set(transactions.map(t => t.id));
    this._selectedTransactions.next(
      this._selectedTransactions.value.filter(t => !idsToRemove.has(t.id))
    );
  }

  /**
   * Toggle selection for all transactions in a list.
   */
  toggleSelectAll(transactions: Transaction[]): void {
    const selectedIds = new Set(this._selectedTransactions.value.map(t => t.id));
    const allSelected = transactions.every(t => selectedIds.has(t.id));

    if (allSelected) {
      this.deselectAll(transactions);
    } else {
      this.selectAll(transactions);
    }
  }

  /**
   * Clear all selections.
   */
  clearSelection(): void {
    this._selectedTransactions.next([]);
  }

  /**
   * Check if all transactions in a list are selected.
   */
  areAllSelected(transactions: Transaction[]): boolean {
    if (transactions.length === 0) return false;
    const selectedIds = new Set(this._selectedTransactions.value.map(t => t.id));
    return transactions.every(t => selectedIds.has(t.id));
  }

  /**
   * Check if some (but not all) transactions are selected.
   */
  areSomeSelected(transactions: Transaction[]): boolean {
    if (transactions.length === 0) return false;
    const selectedIds = new Set(this._selectedTransactions.value.map(t => t.id));
    const selectedCount = transactions.filter(t => selectedIds.has(t.id)).length;
    return selectedCount > 0 && selectedCount < transactions.length;
  }

  // Focus management
  getFocusedIndex(): number {
    return this._focusedIndex.value;
  }

  setFocusedIndex(index: number): void {
    this._focusedIndex.next(index);
  }

  moveFocus(delta: number, maxIndex: number): void {
    const current = this._focusedIndex.value;
    let newIndex = current + delta;

    if (newIndex < 0) newIndex = 0;
    if (newIndex > maxIndex) newIndex = maxIndex;

    this._focusedIndex.next(newIndex);
  }

  // Expanded state management
  isExpanded(id: string): boolean {
    return this._expandedIds.value.has(id);
  }

  toggleExpanded(id: string): void {
    const current = new Set(this._expandedIds.value);
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    this._expandedIds.next(current);
  }

  expandAll(ids: string[]): void {
    const current = new Set(this._expandedIds.value);
    ids.forEach(id => current.add(id));
    this._expandedIds.next(current);
  }

  collapseAll(): void {
    this._expandedIds.next(new Set());
  }
}
