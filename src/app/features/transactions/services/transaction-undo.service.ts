/**
 * Transaction Undo Service
 *
 * Manages undo/redo functionality for transaction operations.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Transaction } from '../../../core/models/transaction.model';

export interface UndoAction {
  type: 'category' | 'merge' | 'split' | 'delete' | 'edit' | 'bulk-category';
  data: any;
  description: string;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class TransactionUndoService {
  private readonly MAX_UNDO_STACK = 50;

  private _undoStack = new BehaviorSubject<UndoAction[]>([]);
  undoStack$ = this._undoStack.asObservable();

  private _redoStack = new BehaviorSubject<UndoAction[]>([]);
  redoStack$ = this._redoStack.asObservable();

  canUndo(): boolean {
    return this._undoStack.value.length > 0;
  }

  canRedo(): boolean {
    return this._redoStack.value.length > 0;
  }

  getLastAction(): UndoAction | null {
    const stack = this._undoStack.value;
    return stack.length > 0 ? stack[stack.length - 1] : null;
  }

  /**
   * Push a new action onto the undo stack.
   */
  pushAction(action: Omit<UndoAction, 'timestamp'>): void {
    const fullAction: UndoAction = {
      ...action,
      timestamp: new Date()
    };

    const stack = [...this._undoStack.value, fullAction];

    // Limit stack size
    if (stack.length > this.MAX_UNDO_STACK) {
      stack.shift();
    }

    this._undoStack.next(stack);
    // Clear redo stack when new action is pushed
    this._redoStack.next([]);
  }

  /**
   * Record a category change for undo.
   */
  recordCategoryChange(
    transaction: Transaction,
    oldCategory: string | undefined,
    newCategory: string
  ): void {
    this.pushAction({
      type: 'category',
      data: {
        transactionId: transaction.id,
        oldCategory,
        newCategory
      },
      description: `Changed category from "${oldCategory || 'none'}" to "${newCategory}"`
    });
  }

  /**
   * Record a bulk category change for undo.
   */
  recordBulkCategoryChange(
    transactions: Transaction[],
    newCategory: string
  ): void {
    this.pushAction({
      type: 'bulk-category',
      data: {
        changes: transactions.map(t => ({
          transactionId: t.id,
          oldCategory: t.category
        })),
        newCategory
      },
      description: `Changed category to "${newCategory}" for ${transactions.length} transactions`
    });
  }

  /**
   * Record a delete action for undo.
   */
  recordDelete(transaction: Transaction): void {
    this.pushAction({
      type: 'delete',
      data: { transaction: { ...transaction } },
      description: `Deleted transaction "${transaction.description?.substring(0, 30)}..."`
    });
  }

  /**
   * Record an edit action for undo.
   */
  recordEdit(oldTransaction: Transaction, newTransaction: Transaction): void {
    this.pushAction({
      type: 'edit',
      data: {
        oldTransaction: { ...oldTransaction },
        newTransaction: { ...newTransaction }
      },
      description: `Edited transaction "${oldTransaction.description?.substring(0, 30)}..."`
    });
  }

  /**
   * Pop the last action for undo.
   */
  popUndo(): UndoAction | null {
    const stack = [...this._undoStack.value];
    const action = stack.pop();

    if (action) {
      this._undoStack.next(stack);
      // Add to redo stack
      this._redoStack.next([...this._redoStack.value, action]);
    }

    return action || null;
  }

  /**
   * Pop the last action for redo.
   */
  popRedo(): UndoAction | null {
    const stack = [...this._redoStack.value];
    const action = stack.pop();

    if (action) {
      this._redoStack.next(stack);
      // Add back to undo stack
      this._undoStack.next([...this._undoStack.value, action]);
    }

    return action || null;
  }

  /**
   * Clear all undo/redo history.
   */
  clear(): void {
    this._undoStack.next([]);
    this._redoStack.next([]);
  }
}
