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
import { TransactionService } from '../../services/transaction.service';
import { Transaction } from '../../core/models/transaction.model';
import { environment } from '../../../environments/environment';
import { trigger, state, style, animate, transition } from '@angular/animations';

interface AssistantResponse {
  message: string;
  data?: {
    type: 'table' | 'chart' | 'transactions' | 'summary' | 'category_suggestion';
    content: any;
  };
  suggestedActions?: string[];
  categoryAction?: {
    transactionId: string;
    suggestedCategory: string;
    confidence: 'high' | 'medium' | 'low';
  };
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
  templateUrl: './ai-fab.component.html',
  styleUrl: './ai-fab.component.scss'
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
    private transactionService: TransactionService,
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
    const attachedTransactionIds: string[] = [];
    if (this.context.attachedTransactions.length > 0) {
      const txContext = this.context.attachedTransactions.map(tx => {
        attachedTransactionIds.push(tx.id);
        const linkedInfo = tx.linkedOrderIds?.length
          ? ` [has ${tx.linkedOrderIds.length} linked order(s)]`
          : '';
        return `- ${tx.date}: ${tx.description} (${tx.amount}€, category: ${tx.category || 'none'})${linkedInfo}`;
      }).join('\n');
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
        {
          message: contextMessage,
          attachedTransactionIds: attachedTransactionIds.length > 0 ? attachedTransactionIds : undefined
        }
      ).toPromise();

      if (response) {
        let messageContent = response.message;

        // Auto-apply category if suggested
        if (response.categoryAction) {
          const { transactionId, suggestedCategory, confidence } = response.categoryAction;

          // Find the attached transaction and apply category
          const tx = this.context.attachedTransactions.find(t => t.id === transactionId);
          if (tx) {
            // Update the transaction with new category
            const updatedTx: Transaction = { ...tx, category: suggestedCategory };
            this.transactionService.updateTransaction(updatedTx)
              .then(() => {
                // Update locally in context
                tx.category = suggestedCategory;
              })
              .catch((err: Error) => console.error('Failed to apply category:', err));
          }

          // Add confirmation to the message
          const confidenceEmoji = confidence === 'high' ? '✓' : confidence === 'medium' ? '~' : '?';
          messageContent += `\n\n${confidenceEmoji} **Category "${suggestedCategory}" has been automatically applied.**`;
        }

        const assistantMessage: Omit<ChatMessage, 'id' | 'timestamp'> = {
          role: 'assistant',
          content: messageContent
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
