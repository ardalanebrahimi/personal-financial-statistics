import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatBadgeModule } from '@angular/material/badge';
import { Subject, takeUntil } from 'rxjs';
import { AIContextService, AIContext, ChatMessage } from '../../services/ai-context.service';
import { Transaction } from '../../core/models/transaction.model';
import { environment } from '../../../environments/environment';
import { trigger, state, style, animate, transition } from '@angular/animations';

interface AssistantResponse {
  message: string;
  data?: {
    type: 'table' | 'chart' | 'transactions' | 'summary';
    content: any;
  };
  suggestedActions?: string[];
}

@Component({
  selector: 'app-ai-fab',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDividerModule,
    MatBadgeModule
  ],
  animations: [
    trigger('panelState', [
      state('closed', style({
        transform: 'translateX(100%)',
        opacity: 0
      })),
      state('open', style({
        transform: 'translateX(0)',
        opacity: 1
      })),
      transition('closed => open', animate('200ms ease-out')),
      transition('open => closed', animate('150ms ease-in'))
    ]),
    trigger('fabState', [
      state('normal', style({
        transform: 'scale(1)'
      })),
      state('active', style({
        transform: 'scale(1.1)'
      })),
      transition('normal <=> active', animate('150ms ease-in-out'))
    ])
  ],
  template: `
    <!-- Backdrop -->
    <div class="fab-backdrop"
         *ngIf="context.isOpen"
         (click)="closePanel()">
    </div>

    <!-- Sliding Panel -->
    <div class="ai-panel" [@panelState]="context.isOpen ? 'open' : 'closed'">
      <!-- Panel Header -->
      <div class="panel-header">
        <div class="header-title">
          <mat-icon>smart_toy</mat-icon>
          <span>AI Assistant</span>
        </div>
        <div class="header-actions">
          <button mat-icon-button (click)="clearChat()" matTooltip="Clear conversation">
            <mat-icon>refresh</mat-icon>
          </button>
          <button mat-icon-button (click)="closePanel()" matTooltip="Close">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      </div>

      <!-- Attached Transactions -->
      <div class="attached-transactions" *ngIf="context.attachedTransactions.length > 0">
        <div class="attached-header">
          <span>Attached Transactions ({{ context.attachedTransactions.length }})</span>
          <button mat-icon-button (click)="clearTransactions()" matTooltip="Clear all">
            <mat-icon>clear_all</mat-icon>
          </button>
        </div>
        <div class="attached-list">
          <div class="attached-item" *ngFor="let tx of context.attachedTransactions">
            <div class="tx-info">
              <span class="tx-desc">{{ tx.description | slice:0:30 }}{{ tx.description.length > 30 ? '...' : '' }}</span>
              <span class="tx-amount" [class.positive]="tx.amount > 0" [class.negative]="tx.amount < 0">
                {{ tx.amount | currency:'EUR':'symbol':'1.2-2' }}
              </span>
            </div>
            <button mat-icon-button (click)="detachTransaction(tx.id)" class="remove-btn">
              <mat-icon>close</mat-icon>
            </button>
          </div>
        </div>
      </div>

      <mat-divider *ngIf="context.attachedTransactions.length > 0"></mat-divider>

      <!-- Chat Messages -->
      <div class="chat-messages" #messagesContainer>
        <!-- Welcome message -->
        <div class="message assistant" *ngIf="messages.length === 0">
          <div class="message-content">
            <p>How can I help you?</p>
            <p class="hint" *ngIf="context.attachedTransactions.length > 0">
              I see you have {{ context.attachedTransactions.length }} transaction(s) attached.
            </p>
          </div>
        </div>

        <!-- Messages -->
        <div *ngFor="let message of messages"
             class="message"
             [class.user]="message.role === 'user'"
             [class.assistant]="message.role === 'assistant'">
          <div class="message-content">
            <div class="message-text" [innerHTML]="formatMessage(message.content)"></div>

            <!-- Transaction data -->
            <div class="data-table" *ngIf="message.transactions?.length">
              <div class="tx-row" *ngFor="let tx of message.transactions">
                <span>{{ tx.date | date:'shortDate' }}</span>
                <span class="tx-desc">{{ tx.description | slice:0:25 }}</span>
                <span [class.positive]="tx.amount > 0" [class.negative]="tx.amount < 0">
                  {{ tx.amount | currency:'EUR':'symbol':'1.2-2' }}
                </span>
              </div>
            </div>

            <!-- Actions -->
            <div class="message-actions" *ngIf="message.actions?.length">
              <button mat-stroked-button *ngFor="let action of message.actions" (click)="action.action()">
                <mat-icon>{{ action.icon }}</mat-icon>
                {{ action.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- Loading -->
        <div class="message assistant" *ngIf="isLoading">
          <div class="message-content loading">
            <mat-spinner diameter="20"></mat-spinner>
            <span>Thinking...</span>
          </div>
        </div>
      </div>

      <!-- Suggested Prompts -->
      <div class="suggested-prompts" *ngIf="messages.length === 0 && context.suggestedPrompts.length > 0">
        <mat-chip-set>
          <mat-chip *ngFor="let prompt of context.suggestedPrompts" (click)="sendMessage(prompt)">
            {{ prompt }}
          </mat-chip>
        </mat-chip-set>
      </div>

      <!-- Input Area -->
      <div class="input-area">
        <mat-form-field appearance="outline" class="input-field">
          <input matInput
                 placeholder="Ask anything..."
                 [(ngModel)]="userInput"
                 (keyup.enter)="sendMessage()"
                 [disabled]="isLoading">
        </mat-form-field>
        <button mat-mini-fab color="primary"
                (click)="sendMessage()"
                [disabled]="!userInput.trim() || isLoading">
          <mat-icon>send</mat-icon>
        </button>
      </div>
    </div>

    <!-- FAB Button -->
    <button mat-fab
            color="primary"
            class="ai-fab"
            [class.has-transactions]="context.attachedTransactions.length > 0"
            [@fabState]="context.attachedTransactions.length > 0 ? 'active' : 'normal'"
            (click)="togglePanel()"
            [matBadge]="context.attachedTransactions.length || null"
            [matBadgeHidden]="context.attachedTransactions.length === 0"
            matBadgeColor="accent"
            matTooltip="AI Assistant">
      <mat-icon>{{ context.isOpen ? 'close' : 'smart_toy' }}</mat-icon>
    </button>
  `,
  styles: [`
    :host {
      position: fixed;
      bottom: 0;
      right: 0;
      z-index: 1000;
    }

    .fab-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.3);
      z-index: 999;
    }

    .ai-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 1001;
    }

    .ai-fab.has-transactions {
      background: linear-gradient(135deg, #1976d2, #42a5f5);
    }

    .ai-panel {
      position: fixed;
      top: 0;
      right: 0;
      width: 420px;
      max-width: 100vw;
      height: 100vh;
      background: white;
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      z-index: 1000;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: linear-gradient(135deg, #1976d2, #42a5f5);
      color: white;
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 18px;
      font-weight: 500;
    }

    .header-actions {
      display: flex;
      gap: 4px;
    }

    .header-actions button {
      color: white;
    }

    .attached-transactions {
      padding: 12px 16px;
      background: #f5f5f5;
    }

    .attached-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      font-weight: 500;
      color: #666;
      margin-bottom: 8px;
    }

    .attached-header button {
      width: 24px;
      height: 24px;
      line-height: 24px;
    }

    .attached-header button mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .attached-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 120px;
      overflow-y: auto;
    }

    .attached-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      background: white;
      border-radius: 6px;
      font-size: 13px;
    }

    .tx-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .tx-desc {
      color: #333;
    }

    .tx-amount {
      font-weight: 500;
      font-size: 12px;
    }

    .tx-amount.positive {
      color: #4caf50;
    }

    .tx-amount.negative {
      color: #f44336;
    }

    .remove-btn {
      width: 24px;
      height: 24px;
      line-height: 24px;
    }

    .remove-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .message {
      display: flex;
      max-width: 90%;
    }

    .message.user {
      align-self: flex-end;
    }

    .message.assistant {
      align-self: flex-start;
    }

    .message-content {
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.5;
    }

    .message.user .message-content {
      background: #1976d2;
      color: white;
      border-bottom-right-radius: 4px;
    }

    .message.assistant .message-content {
      background: #f0f0f0;
      border-bottom-left-radius: 4px;
    }

    .message-content.loading {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #666;
    }

    .message-content p {
      margin: 0 0 8px;
    }

    .message-content p:last-child {
      margin-bottom: 0;
    }

    .message-content .hint {
      font-size: 12px;
      color: #666;
      font-style: italic;
    }

    .data-table {
      margin-top: 10px;
      font-size: 12px;
    }

    .tx-row {
      display: flex;
      gap: 8px;
      padding: 4px 0;
      border-bottom: 1px solid #e0e0e0;
    }

    .tx-row:last-child {
      border-bottom: none;
    }

    .tx-row .tx-desc {
      flex: 1;
    }

    .message-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }

    .message-actions button {
      font-size: 12px;
    }

    .message-actions mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-right: 4px;
    }

    .suggested-prompts {
      padding: 12px 16px;
      border-top: 1px solid #e0e0e0;
    }

    .suggested-prompts mat-chip {
      cursor: pointer;
      font-size: 12px;
    }

    .input-area {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-top: 1px solid #e0e0e0;
      background: white;
    }

    .input-field {
      flex: 1;
    }

    .input-field ::ng-deep .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }

    .input-field ::ng-deep .mat-mdc-text-field-wrapper {
      padding: 0 12px;
    }

    .positive {
      color: #4caf50;
    }

    .negative {
      color: #f44336;
    }
  `]
})
export class AiFabComponent implements OnInit, OnDestroy {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  context: AIContext = {
    isOpen: false,
    attachedTransactions: [],
    suggestedPrompts: []
  };

  messages: ChatMessage[] = [];
  userInput = '';
  isLoading = false;

  private destroy$ = new Subject<void>();

  constructor(
    private aiContextService: AIContextService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    // Subscribe to context changes
    this.aiContextService.getContext()
      .pipe(takeUntil(this.destroy$))
      .subscribe(ctx => {
        this.context = ctx;
        this.handlePendingAction();
      });

    // Subscribe to messages
    this.aiContextService.getMessages()
      .pipe(takeUntil(this.destroy$))
      .subscribe(messages => {
        this.messages = messages;
        this.scrollToBottom();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  togglePanel() {
    this.aiContextService.togglePanel();
  }

  closePanel() {
    this.aiContextService.closePanel();
  }

  clearTransactions() {
    this.aiContextService.clearAttachedTransactions();
  }

  detachTransaction(id: string) {
    this.aiContextService.detachTransaction(id);
  }

  clearChat() {
    this.aiContextService.clearMessages();
    this.http.post(`${environment.apiUrl}/ai/chat/clear`, {}).subscribe();
  }

  async sendMessage(prompt?: string) {
    const text = prompt || this.userInput.trim();
    if (!text) return;

    // Build context message with attached transactions
    let contextMessage = text;
    if (this.context.attachedTransactions.length > 0) {
      const txContext = this.context.attachedTransactions.map(tx =>
        `- ${tx.date}: ${tx.description} (${tx.amount}€, category: ${tx.category || 'none'})`
      ).join('\n');
      contextMessage = `Context - Attached transactions:\n${txContext}\n\nUser question: ${text}`;
    }

    // Add user message
    this.aiContextService.addMessage({
      role: 'user',
      content: text,
      transactions: this.context.attachedTransactions.length > 0
        ? [...this.context.attachedTransactions]
        : undefined
    });

    this.userInput = '';
    this.isLoading = true;

    try {
      const response = await this.http.post<AssistantResponse>(
        `${environment.apiUrl}/ai/chat`,
        { message: contextMessage }
      ).toPromise();

      if (response) {
        const assistantMessage: Omit<ChatMessage, 'id' | 'timestamp'> = {
          role: 'assistant',
          content: response.message
        };

        // Add suggested actions as clickable prompts
        if (response.suggestedActions?.length) {
          assistantMessage.actions = response.suggestedActions.map(action => ({
            label: action,
            icon: 'arrow_forward',
            action: () => this.sendMessage(action)
          }));
        }

        this.aiContextService.addMessage(assistantMessage);
      }
    } catch (error) {
      this.aiContextService.addMessage({
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      });
    }

    this.isLoading = false;
  }

  formatMessage(content: string): string {
    return content
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  private async handlePendingAction() {
    const action = this.context.pendingAction;
    if (!action) return;

    this.aiContextService.clearPendingAction();

    switch (action.type) {
      case 'categorize':
        setTimeout(() => this.sendMessage('Please suggest the best category for this transaction'), 100);
        break;
      case 'explain':
        setTimeout(() => this.sendMessage('Can you explain what this transaction might be?'), 100);
        break;
      case 'findSimilar':
        if (action.transaction) {
          await this.findSimilarTransactions(action.transaction);
        }
        break;
      case 'applyToSimilar':
        if (action.transaction && action.category) {
          await this.applyCategoryToSimilar(action.transaction, action.category);
        }
        break;
    }
  }

  private async findSimilarTransactions(transaction: Transaction) {
    this.aiContextService.addMessage({
      role: 'user',
      content: `Find similar transactions to: "${transaction.description}"`
    });

    this.isLoading = true;

    try {
      const response = await this.http.post<{
        sourceTransaction: any;
        similarTransactions: Transaction[];
        totalFound: number;
      }>(`${environment.apiUrl}/ai/similar-transactions`, {
        transactionId: transaction.id,
        description: transaction.description,
        beneficiary: transaction.beneficiary,
        amount: transaction.amount
      }).toPromise();

      if (response && response.similarTransactions.length > 0) {
        const uncategorized = response.similarTransactions.filter(t => !t.category);
        let message = `Found **${response.totalFound}** similar transactions.`;
        if (uncategorized.length > 0) {
          message += ` ${uncategorized.length} are uncategorized.`;
        }

        this.aiContextService.addMessage({
          role: 'assistant',
          content: message,
          transactions: response.similarTransactions.slice(0, 10),
          actions: transaction.category ? [{
            label: `Apply "${transaction.category}" to all similar`,
            icon: 'label',
            action: () => this.applyCategoryToSimilar(transaction, transaction.category!)
          }] : undefined
        });
      } else {
        this.aiContextService.addMessage({
          role: 'assistant',
          content: 'No similar transactions found.'
        });
      }
    } catch (error) {
      this.aiContextService.addMessage({
        role: 'assistant',
        content: 'Failed to find similar transactions. Please try again.'
      });
    }

    this.isLoading = false;
  }

  private async applyCategoryToSimilar(transaction: Transaction, category: string) {
    this.aiContextService.addMessage({
      role: 'user',
      content: `Apply category "${category}" to all transactions similar to: "${transaction.description}"`
    });

    this.isLoading = true;

    try {
      // First find similar transactions
      const findResponse = await this.http.post<{
        similarTransactions: Transaction[];
        totalFound: number;
      }>(`${environment.apiUrl}/ai/similar-transactions`, {
        transactionId: transaction.id
      }).toPromise();

      if (!findResponse || findResponse.similarTransactions.length === 0) {
        this.aiContextService.addMessage({
          role: 'assistant',
          content: 'No similar transactions found to categorize.'
        });
        this.isLoading = false;
        return;
      }

      // Filter to only uncategorized ones
      const uncategorized = findResponse.similarTransactions.filter(t => !t.category);

      if (uncategorized.length === 0) {
        this.aiContextService.addMessage({
          role: 'assistant',
          content: `Found ${findResponse.similarTransactions.length} similar transactions, but they all already have categories.`
        });
        this.isLoading = false;
        return;
      }

      // Apply category to uncategorized similar transactions
      const applyResponse = await this.http.post<{
        success: boolean;
        updatedCount: number;
        message: string;
      }>(`${environment.apiUrl}/ai/apply-category-to-similar`, {
        transactionId: transaction.id,
        category: category,
        transactionIds: uncategorized.map(t => t.id)
      }).toPromise();

      if (applyResponse?.success) {
        this.aiContextService.addMessage({
          role: 'assistant',
          content: `Applied category "**${category}**" to **${applyResponse.updatedCount}** similar transaction(s).`
        });
      }
    } catch (error) {
      this.aiContextService.addMessage({
        role: 'assistant',
        content: 'Failed to apply category. Please try again.'
      });
    }

    this.isLoading = false;
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.messagesContainer) {
        const el = this.messagesContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    }, 100);
  }
}
