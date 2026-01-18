/**
 * Transaction Keyboard Service
 *
 * Handles keyboard navigation and shortcuts for transactions.
 */

import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type KeyboardAction =
  | 'navigateDown'
  | 'navigateUp'
  | 'toggleSelection'
  | 'toggleExpand'
  | 'toggleHelp'
  | 'undo'
  | 'assignCategory';

export interface KeyboardEvent$ {
  action: KeyboardAction;
  categoryIndex?: number;
}

@Injectable({
  providedIn: 'root'
})
export class TransactionKeyboardService {
  private _action$ = new Subject<KeyboardEvent$>();
  action$ = this._action$.asObservable();

  /**
   * Process keyboard event and emit appropriate action.
   * Returns true if event was handled.
   */
  processKeyEvent(event: KeyboardEvent): boolean {
    // Ignore when in input fields
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return false;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this._action$.next({ action: 'navigateDown' });
        return true;

      case 'ArrowUp':
        event.preventDefault();
        this._action$.next({ action: 'navigateUp' });
        return true;

      case ' ':
        event.preventDefault();
        this._action$.next({ action: 'toggleSelection' });
        return true;

      case 'Enter':
        this._action$.next({ action: 'toggleExpand' });
        return true;

      case '?':
        this._action$.next({ action: 'toggleHelp' });
        return true;

      case 'z':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this._action$.next({ action: 'undo' });
          return true;
        }
        return false;

      default:
        // Number keys 1-9 for quick category assignment
        if (/^[1-9]$/.test(event.key)) {
          const categoryIndex = parseInt(event.key) - 1;
          this._action$.next({ action: 'assignCategory', categoryIndex });
          return true;
        }
        return false;
    }
  }
}
