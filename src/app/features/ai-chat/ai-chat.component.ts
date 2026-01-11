import { Component, ElementRef, ViewChild, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { environment } from '../../../environments/environment';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  data?: {
    type: 'table' | 'chart' | 'transactions' | 'summary';
    content: any;
  };
  suggestedActions?: string[];
}

interface AssistantResponse {
  message: string;
  data?: {
    type: 'table' | 'chart' | 'transactions' | 'summary';
    content: any;
  };
  suggestedActions?: string[];
}

@Component({
  selector: 'app-ai-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDividerModule,
    MatTooltipModule
  ],
  template: `
    <div class="chat-container">
      <div class="chat-header">
        <mat-icon>smart_toy</mat-icon>
        <div class="header-text">
          <h2>Financial Assistant</h2>
          <span class="subtitle">Ask questions about your finances</span>
        </div>
        <button mat-icon-button (click)="clearHistory()" matTooltip="Clear conversation">
          <mat-icon>refresh</mat-icon>
        </button>
      </div>

      <div class="chat-messages" #messagesContainer>
        <!-- Welcome message -->
        <div class="message assistant" *ngIf="messages.length === 0">
          <div class="message-avatar">
            <mat-icon>smart_toy</mat-icon>
          </div>
          <div class="message-content">
            <p>Hello! I'm your financial assistant. I can help you with:</p>
            <ul>
              <li>Spending summaries ("How much did I spend this month?")</li>
              <li>Category analysis ("What are my top spending categories?")</li>
              <li>Transaction lookups ("Show me recent groceries transactions")</li>
              <li>Comparisons ("Compare this month to last month")</li>
              <li>Income tracking ("What was my income this year?")</li>
            </ul>
            <p>Try one of the suggestions below or type your own question!</p>
          </div>
        </div>

        <!-- Chat messages -->
        <div *ngFor="let message of messages"
             class="message"
             [class.user]="message.role === 'user'"
             [class.assistant]="message.role === 'assistant'">
          <div class="message-avatar">
            <mat-icon>{{ message.role === 'user' ? 'person' : 'smart_toy' }}</mat-icon>
          </div>
          <div class="message-content">
            <div class="message-text" [innerHTML]="formatMessage(message.content)"></div>

            <!-- Transaction table -->
            <div class="data-table" *ngIf="message.data?.type === 'transactions'">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Category</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let tx of message.data!.content">
                    <td>{{ tx.date }}</td>
                    <td>{{ tx.description }}</td>
                    <td [class.negative]="tx.amount.startsWith('-') || tx.amount.startsWith('€-')">
                      {{ tx.amount }}
                    </td>
                    <td>{{ tx.category }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Summary data -->
            <div class="summary-data" *ngIf="message.data?.type === 'summary'">
              <div class="summary-item">
                <span class="label">Total</span>
                <span class="value">€{{ message.data!.content.total?.toFixed(2) }}</span>
              </div>
              <div class="summary-item" *ngIf="message.data!.content.count">
                <span class="label">Transactions</span>
                <span class="value">{{ message.data!.content.count }}</span>
              </div>
              <div class="summary-item" *ngIf="message.data!.content.period">
                <span class="label">Period</span>
                <span class="value">{{ message.data!.content.period }}</span>
              </div>
            </div>

            <!-- Suggested actions -->
            <div class="suggested-actions" *ngIf="message.suggestedActions?.length">
              <mat-chip-set>
                <mat-chip *ngFor="let action of message.suggestedActions"
                          (click)="sendMessage(action)">
                  {{ action }}
                </mat-chip>
              </mat-chip-set>
            </div>

            <div class="message-time">{{ message.timestamp | date:'HH:mm' }}</div>
          </div>
        </div>

        <!-- Loading indicator -->
        <div class="message assistant loading" *ngIf="isLoading">
          <div class="message-avatar">
            <mat-icon>smart_toy</mat-icon>
          </div>
          <div class="message-content">
            <mat-spinner diameter="24"></mat-spinner>
          </div>
        </div>
      </div>

      <!-- Suggested questions -->
      <div class="suggestions" *ngIf="messages.length === 0">
        <mat-chip-set>
          <mat-chip *ngFor="let suggestion of suggestedQuestions"
                    (click)="sendMessage(suggestion)">
            {{ suggestion }}
          </mat-chip>
        </mat-chip-set>
      </div>

      <mat-divider></mat-divider>

      <!-- Input area -->
      <div class="chat-input">
        <mat-form-field appearance="outline" class="input-field">
          <input matInput
                 placeholder="Ask about your finances..."
                 [(ngModel)]="userInput"
                 (keyup.enter)="sendMessage()"
                 [disabled]="isLoading">
        </mat-form-field>
        <button mat-fab color="primary"
                (click)="sendMessage()"
                [disabled]="!userInput.trim() || isLoading">
          <mat-icon>send</mat-icon>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .chat-container {
      display: flex;
      flex-direction: column;
      height: calc(100vh - 100px);
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }

    .chat-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      background: linear-gradient(135deg, #1976d2, #42a5f5);
      color: white;
    }

    .chat-header mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
    }

    .header-text {
      flex: 1;
    }

    .header-text h2 {
      margin: 0;
      font-size: 18px;
    }

    .header-text .subtitle {
      font-size: 13px;
      opacity: 0.9;
    }

    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .message {
      display: flex;
      gap: 12px;
      max-width: 85%;
    }

    .message.user {
      align-self: flex-end;
      flex-direction: row-reverse;
    }

    .message-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .message.assistant .message-avatar {
      background: #e3f2fd;
      color: #1976d2;
    }

    .message.user .message-avatar {
      background: #1976d2;
      color: white;
    }

    .message-content {
      background: #f5f5f5;
      padding: 12px 16px;
      border-radius: 16px;
      position: relative;
    }

    .message.user .message-content {
      background: #1976d2;
      color: white;
      border-bottom-right-radius: 4px;
    }

    .message.assistant .message-content {
      border-bottom-left-radius: 4px;
    }

    .message-text {
      line-height: 1.5;
    }

    .message-text p {
      margin: 0 0 8px;
    }

    .message-text p:last-child {
      margin-bottom: 0;
    }

    .message-text ul {
      margin: 8px 0;
      padding-left: 20px;
    }

    .message-time {
      font-size: 11px;
      color: #999;
      margin-top: 6px;
    }

    .message.user .message-time {
      color: rgba(255,255,255,0.7);
    }

    .loading .message-content {
      padding: 16px;
    }

    .data-table {
      margin-top: 12px;
      overflow-x: auto;
    }

    .data-table table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .data-table th,
    .data-table td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid #e0e0e0;
    }

    .data-table th {
      background: #fafafa;
      font-weight: 500;
    }

    .data-table .negative {
      color: #f44336;
    }

    .summary-data {
      display: flex;
      gap: 24px;
      margin-top: 12px;
      padding: 12px;
      background: #fafafa;
      border-radius: 8px;
    }

    .summary-item {
      display: flex;
      flex-direction: column;
    }

    .summary-item .label {
      font-size: 12px;
      color: #666;
    }

    .summary-item .value {
      font-size: 16px;
      font-weight: 500;
      color: #333;
    }

    .suggested-actions {
      margin-top: 12px;
    }

    .suggested-actions mat-chip {
      cursor: pointer;
      font-size: 12px;
    }

    .suggestions {
      padding: 0 20px 12px;
    }

    .suggestions mat-chip {
      cursor: pointer;
    }

    .chat-input {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
    }

    .input-field {
      flex: 1;
    }

    .input-field ::ng-deep .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }

    button[mat-fab] {
      flex-shrink: 0;
    }
  `]
})
export class AiChatComponent implements OnInit {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  messages: ChatMessage[] = [];
  userInput = '';
  isLoading = false;

  suggestedQuestions = [
    'How much did I spend this month?',
    'What are my top 5 categories?',
    'Show my recent transactions',
    'Compare this month vs last month',
    'What was my income this year?'
  ];

  constructor(private http: HttpClient) {}

  ngOnInit() {
    // Could load previous conversation from localStorage
  }

  async sendMessage(message?: string) {
    const text = message || this.userInput.trim();
    if (!text) return;

    // Add user message
    this.messages.push({
      role: 'user',
      content: text,
      timestamp: new Date()
    });

    this.userInput = '';
    this.isLoading = true;
    this.scrollToBottom();

    try {
      const response = await this.http.post<AssistantResponse>(
        `${environment.apiUrl}/ai/chat`,
        { message: text }
      ).toPromise();

      if (response) {
        this.messages.push({
          role: 'assistant',
          content: response.message,
          timestamp: new Date(),
          data: response.data,
          suggestedActions: response.suggestedActions
        });
      }
    } catch (error) {
      this.messages.push({
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date()
      });
    }

    this.isLoading = false;
    this.scrollToBottom();
  }

  async clearHistory() {
    try {
      await this.http.post(
        `${environment.apiUrl}/ai/chat/clear`,
        {}
      ).toPromise();
    } catch (error) {
      // Ignore errors
    }
    this.messages = [];
  }

  formatMessage(content: string): string {
    // Convert markdown-like formatting to HTML
    return content
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
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
