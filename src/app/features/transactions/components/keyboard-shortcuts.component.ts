/**
 * Keyboard Shortcuts Component
 *
 * Displays keyboard shortcuts help overlay.
 */

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

interface ShortcutGroup {
  title: string;
  shortcuts: { key: string; description: string }[];
}

@Component({
  selector: 'app-keyboard-shortcuts',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <div class="shortcuts-overlay" *ngIf="visible" (click)="close()">
      <mat-card class="shortcuts-card" (click)="$event.stopPropagation()">
        <mat-card-header>
          <mat-card-title>
            <mat-icon>keyboard</mat-icon>
            Keyboard Shortcuts
          </mat-card-title>
          <button mat-icon-button (click)="close()" class="close-btn">
            <mat-icon>close</mat-icon>
          </button>
        </mat-card-header>

        <mat-card-content>
          <div class="shortcuts-grid">
            <div class="shortcut-group" *ngFor="let group of shortcutGroups">
              <h4>{{ group.title }}</h4>
              <div class="shortcut" *ngFor="let shortcut of group.shortcuts">
                <kbd>{{ shortcut.key }}</kbd>
                <span>{{ shortcut.description }}</span>
              </div>
            </div>
          </div>
        </mat-card-content>

        <mat-card-actions>
          <button mat-button (click)="close()">Close</button>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .shortcuts-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .shortcuts-card {
      max-width: 600px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
    }

    mat-card-header {
      display: flex;
      align-items: center;
    }

    mat-card-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
    }

    .close-btn {
      margin-left: auto;
    }

    .shortcuts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 24px;
      padding: 16px 0;
    }

    .shortcut-group h4 {
      margin: 0 0 12px;
      color: #666;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .shortcut {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }

    kbd {
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 4px 8px;
      font-family: monospace;
      font-size: 12px;
      min-width: 24px;
      text-align: center;
    }

    .shortcut span {
      font-size: 14px;
      color: #333;
    }
  `]
})
export class KeyboardShortcutsComponent {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();

  shortcutGroups: ShortcutGroup[] = [
    {
      title: 'Navigation',
      shortcuts: [
        { key: '↑ / ↓', description: 'Move between transactions' },
        { key: 'j / k', description: 'Move down / up (Vim style)' },
        { key: 'Home', description: 'Go to first transaction' },
        { key: 'End', description: 'Go to last transaction' },
        { key: 'Enter', description: 'Open transaction details' }
      ]
    },
    {
      title: 'Selection',
      shortcuts: [
        { key: 'Space', description: 'Toggle selection' },
        { key: 'Ctrl + A', description: 'Select all visible' },
        { key: 'Escape', description: 'Clear selection' }
      ]
    },
    {
      title: 'Actions',
      shortcuts: [
        { key: 'e', description: 'Edit focused transaction' },
        { key: 'Delete', description: 'Delete selected' },
        { key: 'c', description: 'Categorize with AI' },
        { key: 'Ctrl + Z', description: 'Undo last action' }
      ]
    },
    {
      title: 'View',
      shortcuts: [
        { key: 'f', description: 'Toggle filters panel' },
        { key: 'v', description: 'Toggle view mode' },
        { key: '?', description: 'Show this help' }
      ]
    }
  ];

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }
}
