import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Transaction, Category } from '../../core/models/transaction.model';

@Component({
  selector: 'app-transaction-card',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatTooltipModule,
    MatMenuModule,
    MatCheckboxModule
  ],
  template: `
    <div class="transaction-card"
         [class.selected]="selected"
         [class.expanded]="expanded"
         [class.expense]="transaction.amount < 0"
         [class.income]="transaction.amount > 0"
         [class.matched]="transaction.matchInfo"
         [class.editing]="isEditing"
         [class.compact]="compact"
         [class.context-only]="transaction.isContextOnly"
         [class.has-linked-orders]="transaction.linkedOrderIds?.length"
         (click)="onCardClick($event)"
         (dblclick)="onDoubleClick($event)"
         [attr.tabindex]="0"
         (keydown)="onKeyDown($event)">

      <!-- Compact View -->
      <div class="card-main">
        <!-- Checkbox for selection -->
        <mat-checkbox
          class="selection-checkbox"
          [checked]="selected"
          (change)="onCheckboxChange($event)"
          (click)="$event.stopPropagation()">
        </mat-checkbox>

        <div class="card-left">
          <!-- Platform indicator (Amazon/PayPal) -->
          <div class="platform-indicator" *ngIf="getPlatform() as platform">
            <mat-icon *ngIf="platform === 'amazon'" class="amazon-icon" matTooltip="Amazon transaction">shopping_cart</mat-icon>
            <mat-icon *ngIf="platform === 'paypal'" class="paypal-icon" matTooltip="PayPal transaction">account_balance_wallet</mat-icon>
          </div>
          <!-- Link status for platform transactions -->
          <div class="link-status" *ngIf="getPlatform() && !transaction.isContextOnly">
            <mat-icon *ngIf="hasLinks()" class="linked-icon" [matTooltip]="'Linked to ' + (transaction.linkedOrderIds?.length || 0) + ' orders'">link</mat-icon>
            <mat-icon *ngIf="!hasLinks()" class="unlinked-icon" matTooltip="No linked orders">link_off</mat-icon>
          </div>
          <div class="source-indicator" *ngIf="transaction.source && !getPlatform()">
            <mat-icon [matTooltip]="transaction.source.connectorType">account_balance</mat-icon>
          </div>
          <div class="date-column">
            <span class="date">{{ transaction.date | date:'dd.MM.yy' }}</span>
            <span class="weekday">{{ transaction.date | date:'EEE' }}</span>
          </div>
        </div>

        <div class="card-center">
          <div class="description-row">
            <span class="description"
                  *ngIf="!isEditingDescription"
                  (dblclick)="startEditDescription($event)">
              {{ transaction.description }}
            </span>
            <input #descriptionInput
                   *ngIf="isEditingDescription"
                   class="edit-input"
                   [(ngModel)]="editDescription"
                   (blur)="saveDescription()"
                   (keydown.enter)="saveDescription()"
                   (keydown.escape)="cancelEditDescription()">
          </div>
          <div class="beneficiary-row" *ngIf="transaction.beneficiary">
            <mat-icon class="small-icon">person</mat-icon>
            <span class="beneficiary">{{ transaction.beneficiary }}</span>
          </div>
        </div>

        <div class="card-right">
          <div class="amount"
               [class.negative]="transaction.amount < 0"
               [class.positive]="transaction.amount > 0"
               *ngIf="!isEditingAmount"
               (dblclick)="startEditAmount($event)">
            {{ transaction.amount | currency:'EUR':'symbol':'1.2-2' }}
          </div>
          <input #amountInput
                 *ngIf="isEditingAmount"
                 type="number"
                 step="0.01"
                 class="edit-input amount-input"
                 [(ngModel)]="editAmount"
                 (blur)="saveAmount()"
                 (keydown.enter)="saveAmount()"
                 (keydown.escape)="cancelEditAmount()">

          <mat-chip *ngIf="transaction.category"
                    class="category-chip"
                    [style.background-color]="getCategoryColor()"
                    [style.color]="getContrastColor()">
            {{ transaction.category }}
          </mat-chip>
          <mat-chip *ngIf="!transaction.category" class="category-chip uncategorized">
            Uncategorized
          </mat-chip>
        </div>

        <div class="card-actions">
          <button mat-icon-button
                  matTooltip="Ask AI"
                  (click)="onAskAI($event)"
                  class="ask-ai-button">
            <mat-icon>smart_toy</mat-icon>
          </button>
          <button mat-icon-button
                  [matMenuTriggerFor]="actionMenu"
                  (click)="$event.stopPropagation()">
            <mat-icon>more_vert</mat-icon>
          </button>
          <mat-menu #actionMenu="matMenu">
            <button mat-menu-item (click)="toggleExpand()">
              <mat-icon>{{ expanded ? 'expand_less' : 'expand_more' }}</mat-icon>
              <span>{{ expanded ? 'Collapse' : 'Expand' }}</span>
            </button>
            <button mat-menu-item (click)="onEdit()">
              <mat-icon>edit</mat-icon>
              <span>Edit</span>
            </button>
            <button mat-menu-item (click)="onAskAI($event)">
              <mat-icon>smart_toy</mat-icon>
              <span>Ask AI</span>
            </button>
            <button mat-menu-item (click)="onMerge()">
              <mat-icon>merge</mat-icon>
              <span>Merge with...</span>
            </button>
            <button mat-menu-item (click)="onSplit()">
              <mat-icon>call_split</mat-icon>
              <span>Split</span>
            </button>
            <button mat-menu-item (click)="onDelete()" class="delete-action">
              <mat-icon>delete</mat-icon>
              <span>Delete</span>
            </button>
          </mat-menu>
        </div>
      </div>

      <!-- Context-Only Indicator (Amazon Orders) -->
      <div class="context-indicator" *ngIf="transaction.isContextOnly">
        <mat-icon class="small-icon">shopping_cart</mat-icon>
        <span>Order context (not a bank transaction)</span>
      </div>

      <!-- Match Indicator -->
      <div class="match-indicator" *ngIf="transaction.matchInfo">
        <mat-icon class="small-icon">link</mat-icon>
        <span>{{ transaction.matchInfo.linkedTransactionIds.length }} linked</span>
        <mat-chip class="confidence-chip" [class]="transaction.matchInfo.confidence">
          {{ transaction.matchInfo.confidence }}
        </mat-chip>
      </div>

      <!-- Linked Orders Indicator -->
      <div class="linked-orders-indicator" *ngIf="transaction.linkedOrderIds?.length">
        <mat-icon class="small-icon">shopping_cart</mat-icon>
        <span>{{ transaction.linkedOrderIds?.length }} order(s) linked</span>
        <mat-chip class="orders-chip">
          details available
        </mat-chip>
      </div>

      <!-- Expanded View -->
      <div class="expanded-content" *ngIf="expanded">
        <div class="detail-section">
          <h4>Details</h4>
          <div class="detail-row">
            <span class="label">ID:</span>
            <span class="value">{{ transaction.id }}</span>
          </div>
          <div class="detail-row" *ngIf="transaction.source">
            <span class="label">Source:</span>
            <span class="value">{{ transaction.source.connectorType }}</span>
          </div>
          <div class="detail-row" *ngIf="transaction.source && transaction.source.externalId">
            <span class="label">External ID:</span>
            <span class="value">{{ transaction.source.externalId }}</span>
          </div>
          <div class="detail-row" *ngIf="transaction.transactionType">
            <span class="label">Type:</span>
            <span class="value">{{ transaction.transactionType }}</span>
          </div>
        </div>

        <div class="detail-section" *ngIf="transaction.matchInfo">
          <h4>Match Information</h4>
          <div class="detail-row">
            <span class="label">Pattern:</span>
            <span class="value">{{ transaction.matchInfo.patternType }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Source:</span>
            <span class="value">{{ transaction.matchInfo.source }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Primary:</span>
            <span class="value">{{ transaction.matchInfo.isPrimary ? 'Yes' : 'No' }}</span>
          </div>
        </div>

        <div class="detail-section flags" *ngIf="transaction.excludeFromStats || transaction.isReconciled">
          <h4>Flags</h4>
          <mat-chip *ngIf="transaction.excludeFromStats">Excluded from stats</mat-chip>
          <mat-chip *ngIf="transaction.isReconciled">Reconciled</mat-chip>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .transaction-card {
      background: white;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12);
      cursor: pointer;
      transition: all 0.2s ease;
      border-left: 4px solid transparent;
      outline: none;
    }

    .transaction-card:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }

    .transaction-card:focus {
      box-shadow: 0 0 0 2px #1976d2;
    }

    .transaction-card.selected {
      background: #e3f2fd;
      border-left-color: #1976d2;
    }

    .transaction-card.expense {
      border-left-color: #f44336;
    }

    .transaction-card.income {
      border-left-color: #4caf50;
    }

    .transaction-card.matched {
      background: linear-gradient(to right, #fff9c4 0%, white 20%);
    }

    .transaction-card.context-only {
      background: linear-gradient(to right, #fff3e0 0%, white 30%);
      border-left-color: #ff9800;
      opacity: 0.9;
    }

    .transaction-card.has-linked-orders {
      background: linear-gradient(to right, #e8f5e9 0%, white 20%);
    }

    .transaction-card.editing {
      box-shadow: 0 0 0 2px #ff9800;
    }

    .card-main {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .selection-checkbox {
      flex-shrink: 0;
    }

    .card-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 100px;
    }

    .source-indicator {
      color: #666;
    }

    .source-indicator mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .platform-indicator {
      display: flex;
      align-items: center;
    }

    .platform-indicator .amazon-icon {
      color: #ff9800;
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .platform-indicator .paypal-icon {
      color: #0070ba;
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .link-status {
      display: flex;
      align-items: center;
    }

    .link-status .linked-icon {
      color: #4caf50;
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .link-status .unlinked-icon {
      color: #ff9800;
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .date-column {
      display: flex;
      flex-direction: column;
    }

    .date {
      font-weight: 500;
      font-size: 14px;
    }

    .weekday {
      font-size: 11px;
      color: #666;
      text-transform: uppercase;
    }

    .card-center {
      flex: 1;
      min-width: 0;
    }

    .description-row {
      display: flex;
      align-items: center;
    }

    .description {
      font-size: 14px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .beneficiary-row {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
    }

    .beneficiary {
      font-size: 12px;
      color: #666;
    }

    .small-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: #999;
    }

    .card-right {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 200px;
      justify-content: flex-end;
    }

    .amount {
      font-size: 16px;
      font-weight: 600;
      font-family: 'Roboto Mono', monospace;
    }

    .amount.negative {
      color: #d32f2f;
    }

    .amount.positive {
      color: #388e3c;
    }

    .category-chip {
      font-size: 12px;
      min-height: 24px;
      padding: 0 8px;
    }

    .category-chip.uncategorized {
      background: #e0e0e0;
      color: #666;
    }

    .card-actions {
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .transaction-card:hover .card-actions,
    .transaction-card:focus .card-actions {
      opacity: 1;
    }

    .ask-ai-button {
      color: #1976d2;
    }

    .ask-ai-button:hover {
      background-color: rgba(25, 118, 210, 0.1);
    }

    .context-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed #ff9800;
      font-size: 12px;
      color: #e65100;
      font-style: italic;
    }

    .match-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed #e0e0e0;
      font-size: 12px;
      color: #666;
    }

    .linked-orders-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed #4caf50;
      font-size: 12px;
      color: #2e7d32;
    }

    .orders-chip {
      font-size: 10px;
      min-height: 20px;
      padding: 0 6px;
      background: #c8e6c9 !important;
      color: #2e7d32 !important;
    }

    .confidence-chip {
      font-size: 10px;
      min-height: 20px;
      padding: 0 6px;
    }

    .confidence-chip.high {
      background: #c8e6c9;
      color: #2e7d32;
    }

    .confidence-chip.medium {
      background: #fff9c4;
      color: #f9a825;
    }

    .confidence-chip.low {
      background: #ffcdd2;
      color: #c62828;
    }

    .expanded-content {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #e0e0e0;
    }

    .detail-section {
      margin-bottom: 16px;
    }

    .detail-section h4 {
      margin: 0 0 8px 0;
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
      letter-spacing: 0.5px;
    }

    .detail-row {
      display: flex;
      gap: 8px;
      margin-bottom: 4px;
      font-size: 13px;
    }

    .detail-row .label {
      color: #666;
      min-width: 100px;
    }

    .detail-row .value {
      color: #333;
      word-break: break-all;
    }

    .flags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .flags mat-chip {
      font-size: 11px;
    }

    .edit-input {
      border: 1px solid #1976d2;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: inherit;
      font-family: inherit;
      outline: none;
    }

    .edit-input:focus {
      box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.2);
    }

    .amount-input {
      width: 100px;
      text-align: right;
    }

    .delete-action {
      color: #d32f2f;
    }

    /* Compact mode styles */
    .transaction-card.compact {
      padding: 6px 12px;
      margin-bottom: 2px;
      border-radius: 4px;
    }

    .transaction-card.compact .card-main {
      gap: 12px;
    }

    .transaction-card.compact .card-left {
      min-width: 80px;
    }

    .transaction-card.compact .date-column {
      flex-direction: row;
      gap: 8px;
      align-items: center;
    }

    .transaction-card.compact .date {
      font-size: 12px;
    }

    .transaction-card.compact .weekday {
      display: none;
    }

    .transaction-card.compact .description {
      font-size: 13px;
    }

    .transaction-card.compact .beneficiary-row {
      display: none;
    }

    .transaction-card.compact .amount {
      font-size: 13px;
    }

    .transaction-card.compact .category-chip {
      font-size: 10px;
      min-height: 20px;
      padding: 0 6px;
    }

    .transaction-card.compact .card-right {
      min-width: 160px;
      gap: 8px;
    }

    .transaction-card.compact .card-actions {
      opacity: 1;
    }

    .transaction-card.compact .card-actions button {
      width: 28px;
      height: 28px;
      line-height: 28px;
    }

    .transaction-card.compact .card-actions mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .transaction-card.compact .source-indicator mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
  `]
})
export class TransactionCardComponent {
  @Input() transaction!: Transaction;
  @Input() categories: Category[] = [];
  @Input() selected = false;
  @Input() expanded = false;
  @Input() compact = false;

  @Output() selectTransaction = new EventEmitter<Transaction>();
  @Output() toggleSelect = new EventEmitter<{ transaction: Transaction; selected: boolean }>();
  @Output() editTransaction = new EventEmitter<Transaction>();
  @Output() deleteTransaction = new EventEmitter<Transaction>();
  @Output() mergeTransaction = new EventEmitter<Transaction>();
  @Output() splitTransaction = new EventEmitter<Transaction>();
  @Output() expandChange = new EventEmitter<boolean>();
  @Output() updateTransaction = new EventEmitter<Transaction>();
  @Output() askAI = new EventEmitter<Transaction>();
  @Output() openDetail = new EventEmitter<Transaction>();

  @ViewChild('descriptionInput') descriptionInput?: ElementRef<HTMLInputElement>;
  @ViewChild('amountInput') amountInput?: ElementRef<HTMLInputElement>;

  isEditing = false;
  isEditingDescription = false;
  isEditingAmount = false;
  editDescription = '';
  editAmount = 0;

  onCardClick(event: Event) {
    if (!this.isEditing) {
      this.selectTransaction.emit(this.transaction);
    }
  }

  onDoubleClick(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.openDetail.emit(this.transaction);
  }

  onCheckboxChange(event: any) {
    this.toggleSelect.emit({ transaction: this.transaction, selected: event.checked });
  }

  onAskAI(event: Event) {
    event.stopPropagation();
    this.askAI.emit(this.transaction);
  }

  toggleExpand() {
    this.expanded = !this.expanded;
    this.expandChange.emit(this.expanded);
  }

  startEditDescription(event: Event) {
    event.stopPropagation();
    this.isEditing = true;
    this.isEditingDescription = true;
    this.editDescription = this.transaction.description;
    setTimeout(() => this.descriptionInput?.nativeElement.focus(), 0);
  }

  saveDescription() {
    if (this.editDescription !== this.transaction.description) {
      this.transaction.description = this.editDescription;
      this.updateTransaction.emit(this.transaction);
    }
    this.cancelEditDescription();
  }

  cancelEditDescription() {
    this.isEditingDescription = false;
    this.isEditing = false;
  }

  startEditAmount(event: Event) {
    event.stopPropagation();
    this.isEditing = true;
    this.isEditingAmount = true;
    this.editAmount = this.transaction.amount;
    setTimeout(() => this.amountInput?.nativeElement.focus(), 0);
  }

  saveAmount() {
    if (this.editAmount !== this.transaction.amount) {
      this.transaction.amount = this.editAmount;
      this.updateTransaction.emit(this.transaction);
    }
    this.cancelEditAmount();
  }

  cancelEditAmount() {
    this.isEditingAmount = false;
    this.isEditing = false;
  }

  onEdit() {
    this.editTransaction.emit(this.transaction);
  }

  onDelete() {
    this.deleteTransaction.emit(this.transaction);
  }

  onMerge() {
    this.mergeTransaction.emit(this.transaction);
  }

  onSplit() {
    this.splitTransaction.emit(this.transaction);
  }

  // Platform detection patterns
  private readonly AMAZON_PATTERNS = [
    /amazon/i, /amzn/i, /amazon\.de/i, /amazon\s+payments/i,
    /amazon\s+eu/i, /amz\*|amzn\*/i, /amazon\s+prime/i, /prime\s+video/i
  ];
  private readonly PAYPAL_PATTERNS = [
    /paypal/i, /pp\s*\*/i, /paypal\s*\(europe\)/i, /paypal\s*pte/i, /paypal\s*europe/i
  ];

  getPlatform(): 'amazon' | 'paypal' | null {
    // For context-only transactions, check the source
    if (this.transaction.isContextOnly) {
      const connectorType = this.transaction.source?.connectorType;
      if (connectorType === 'amazon') return 'amazon';
      if (connectorType === 'paypal') return 'paypal';
      return null;
    }

    // For bank transactions, check detectedPlatform or detect from description
    if (this.transaction.detectedPlatform) {
      return this.transaction.detectedPlatform;
    }

    // Fallback: detect from description/beneficiary
    const searchText = `${this.transaction.description} ${this.transaction.beneficiary || ''}`.toLowerCase();
    if (this.AMAZON_PATTERNS.some(p => p.test(searchText))) return 'amazon';
    if (this.PAYPAL_PATTERNS.some(p => p.test(searchText))) return 'paypal';
    return null;
  }

  hasLinks(): boolean {
    return !!(this.transaction.linkedOrderIds && this.transaction.linkedOrderIds.length > 0);
  }

  getCategoryColor(): string {
    const category = this.categories.find(c => c.name === this.transaction.category);
    return category?.color || '#e0e0e0';
  }

  getContrastColor(): string {
    const color = this.getCategoryColor();
    // Simple contrast calculation
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !this.isEditing) {
      this.toggleExpand();
    } else if (event.key === 'Delete' && !this.isEditing) {
      this.onDelete();
    } else if (event.key === 'e' && !this.isEditing) {
      this.onEdit();
    }
  }
}
