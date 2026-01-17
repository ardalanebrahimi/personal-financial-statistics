import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Transaction } from '../core/models/transaction.model';

export interface AIContext {
  isOpen: boolean;
  attachedTransactions: Transaction[];
  suggestedPrompts: string[];
  pendingAction?: {
    type: 'categorize' | 'explain' | 'findSimilar' | 'applyToSimilar';
    transaction?: Transaction;
    category?: string;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  transactions?: Transaction[];
  actions?: ChatAction[];
}

export interface ChatAction {
  label: string;
  icon: string;
  action: () => void;
}

const DEFAULT_CONTEXT: AIContext = {
  isOpen: false,
  attachedTransactions: [],
  suggestedPrompts: [
    'How much did I spend this month?',
    'What are my top spending categories?',
    'Show me uncategorized transactions',
    'Find duplicate transactions'
  ]
};

@Injectable({
  providedIn: 'root'
})
export class AIContextService {
  private context$ = new BehaviorSubject<AIContext>(DEFAULT_CONTEXT);
  private messages$ = new BehaviorSubject<ChatMessage[]>([]);

  getContext(): Observable<AIContext> {
    return this.context$.asObservable();
  }

  getContextValue(): AIContext {
    return this.context$.value;
  }

  getMessages(): Observable<ChatMessage[]> {
    return this.messages$.asObservable();
  }

  // Panel state management
  openPanel() {
    this.updateContext({ isOpen: true });
  }

  closePanel() {
    this.updateContext({ isOpen: false });
  }

  togglePanel() {
    this.updateContext({ isOpen: !this.context$.value.isOpen });
  }

  // Transaction context management
  attachTransaction(transaction: Transaction) {
    const current = this.context$.value;
    const alreadyAttached = current.attachedTransactions.some(t => t.id === transaction.id);

    if (!alreadyAttached) {
      this.updateContext({
        attachedTransactions: [...current.attachedTransactions, transaction],
        suggestedPrompts: this.getSuggestedPromptsForTransaction(transaction)
      });
    }

    // Open panel when transaction is attached
    if (!current.isOpen) {
      this.openPanel();
    }
  }

  attachMultipleTransactions(transactions: Transaction[]) {
    const current = this.context$.value;
    const existingIds = new Set(current.attachedTransactions.map(t => t.id));
    const newTransactions = transactions.filter(t => !existingIds.has(t.id));

    if (newTransactions.length > 0) {
      this.updateContext({
        attachedTransactions: [...current.attachedTransactions, ...newTransactions],
        suggestedPrompts: this.getSuggestedPromptsForMultiple(transactions)
      });
    }

    if (!current.isOpen) {
      this.openPanel();
    }
  }

  detachTransaction(transactionId: string) {
    const current = this.context$.value;
    this.updateContext({
      attachedTransactions: current.attachedTransactions.filter(t => t.id !== transactionId)
    });
  }

  clearAttachedTransactions() {
    this.updateContext({
      attachedTransactions: [],
      suggestedPrompts: DEFAULT_CONTEXT.suggestedPrompts
    });
  }

  // Action triggers
  askAboutTransaction(transaction: Transaction) {
    this.attachTransaction(transaction);
    this.updateContext({
      pendingAction: {
        type: 'explain',
        transaction
      }
    });
  }

  categorizeWithAI(transaction: Transaction) {
    this.attachTransaction(transaction);
    this.updateContext({
      pendingAction: {
        type: 'categorize',
        transaction
      }
    });
  }

  findSimilarTransactions(transaction: Transaction) {
    this.attachTransaction(transaction);
    this.updateContext({
      pendingAction: {
        type: 'findSimilar',
        transaction
      }
    });
  }

  requestApplyToSimilar(transaction: Transaction, category: string) {
    this.updateContext({
      pendingAction: {
        type: 'applyToSimilar',
        transaction,
        category
      }
    });
  }

  clearPendingAction() {
    this.updateContext({ pendingAction: undefined });
  }

  // Chat management
  addMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>) {
    const newMessage: ChatMessage = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: new Date()
    };
    this.messages$.next([...this.messages$.value, newMessage]);
    return newMessage;
  }

  clearMessages() {
    this.messages$.next([]);
  }

  // Helper methods
  private updateContext(partial: Partial<AIContext>) {
    this.context$.next({
      ...this.context$.value,
      ...partial
    });
  }

  private getSuggestedPromptsForTransaction(transaction: Transaction): string[] {
    const prompts = [
      'What is this transaction?',
      'Suggest a category for this transaction',
      'Find similar transactions',
      'Is this a recurring expense?'
    ];

    if (!transaction.category) {
      prompts.unshift('Categorize this transaction');
    }

    return prompts;
  }

  private getSuggestedPromptsForMultiple(transactions: Transaction[]): string[] {
    const uncategorizedCount = transactions.filter(t => !t.category).length;
    const prompts = [
      `Analyze these ${transactions.length} transactions`,
      'What patterns do you see?',
      'Calculate total spending'
    ];

    if (uncategorizedCount > 0) {
      prompts.unshift(`Categorize ${uncategorizedCount} uncategorized transactions`);
    }

    return prompts;
  }
}
