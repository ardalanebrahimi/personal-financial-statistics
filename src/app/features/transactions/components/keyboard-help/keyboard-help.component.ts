/**
 * Keyboard Help Component
 *
 * Displays keyboard shortcuts overlay.
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-keyboard-help',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="keyboard-help" *ngIf="visible">
      <h4>Keyboard Shortcuts</h4>
      <div class="shortcut"><kbd>↑</kbd><kbd>↓</kbd> Navigate</div>
      <div class="shortcut"><kbd>Enter</kbd> Expand/Collapse</div>
      <div class="shortcut"><kbd>Space</kbd> Select</div>
      <div class="shortcut"><kbd>1</kbd>-<kbd>9</kbd> Assign category</div>
      <div class="shortcut"><kbd>Delete</kbd> Delete</div>
      <div class="shortcut"><kbd>Ctrl+Z</kbd> Undo</div>
      <div class="shortcut"><kbd>?</kbd> Toggle help</div>
    </div>
  `,
  styles: [`
    .keyboard-help {
      position: fixed;
      bottom: 16px;
      right: 16px;
      background: rgba(0,0,0,0.85);
      color: white;
      padding: 16px;
      border-radius: 8px;
      font-size: 13px;
      z-index: 1000;
    }

    .keyboard-help h4 {
      margin: 0 0 12px;
      font-size: 14px;
    }

    .shortcut {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }

    kbd {
      background: #555;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
    }
  `]
})
export class KeyboardHelpComponent {
  @Input() visible = false;
}
