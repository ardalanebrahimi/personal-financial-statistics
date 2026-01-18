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
  templateUrl: './transaction-card.component.html',
  styleUrl: './transaction-card.component.scss'
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

  // Platform detection patterns
  private readonly AMAZON_PATTERNS = [
    /amazon/i, /amzn/i, /amazon\.de/i, /amazon\s+payments/i,
    /amazon\s+eu/i, /amz\*|amzn\*/i, /amazon\s+prime/i, /prime\s+video/i
  ];
  private readonly PAYPAL_PATTERNS = [
    /paypal/i, /pp\s*\*/i, /paypal\s*\(europe\)/i, /paypal\s*pte/i, /paypal\s*europe/i
  ];

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
