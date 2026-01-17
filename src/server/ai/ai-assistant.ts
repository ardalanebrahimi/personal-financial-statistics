/**
 * AI Financial Assistant
 *
 * Provides natural language interaction for financial queries.
 * Uses GPT-4o-mini to understand questions and generate insights.
 */

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category?: string;
  beneficiary?: string;
  source?: {
    connectorType: string;
  };
  matchInfo?: {
    patternType: string;
    linkedTransactionIds: string[];
  };
  // Order linking fields
  isContextOnly?: boolean;     // True for Amazon orders (not real bank transactions)
  linkedOrderIds?: string[];   // IDs of linked Amazon orders
}

export interface Category {
  id: string;
  name: string;
  color?: string;
}

export interface AssistantContext {
  transactions: Transaction[];
  categories: Category[];
  dateRange?: { start: Date; end: Date };
}

export interface AssistantMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  data?: any; // Structured data for charts/tables
}

export interface AssistantResponse {
  message: string;
  data?: {
    type: 'table' | 'chart' | 'transactions' | 'summary';
    content: any;
  };
  suggestedActions?: string[];
}

export class AIAssistant {
  private apiKey: string;
  private transactions: Transaction[] = [];
  private categories: Category[] = [];
  private conversationHistory: AssistantMessage[] = [];

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Set context data
   */
  setContext(context: AssistantContext) {
    this.transactions = context.transactions;
    this.categories = context.categories;
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Process a user query
   */
  async query(userMessage: string): Promise<AssistantResponse> {
    // First, try to handle with local processing (faster, no API cost)
    const localResponse = this.tryLocalProcessing(userMessage);
    if (localResponse) {
      return localResponse;
    }

    // Fall back to AI for complex queries
    return this.processWithAI(userMessage);
  }

  /**
   * Try to process query locally without AI
   */
  private tryLocalProcessing(query: string): AssistantResponse | null {
    const queryLower = query.toLowerCase();

    // Total spending queries
    if (queryLower.includes('total') && (queryLower.includes('spent') || queryLower.includes('spending'))) {
      return this.getTotalSpending(queryLower);
    }

    // Category spending queries
    if (queryLower.includes('how much') && queryLower.includes('on')) {
      return this.getCategorySpending(queryLower);
    }

    // List transactions queries
    if (queryLower.includes('show') && queryLower.includes('transaction')) {
      return this.listTransactions(queryLower);
    }

    // Top categories
    if (queryLower.includes('top') && queryLower.includes('categor')) {
      return this.getTopCategories(queryLower);
    }

    // Recent transactions
    if (queryLower.includes('recent') || queryLower.includes('latest')) {
      return this.getRecentTransactions();
    }

    // Monthly comparison
    if (queryLower.includes('compare') || queryLower.includes('vs') || queryLower.includes('versus')) {
      return this.getMonthlyComparison();
    }

    // Income queries
    if (queryLower.includes('income') || queryLower.includes('earn')) {
      return this.getIncome(queryLower);
    }

    return null;
  }

  /**
   * Get bank transactions (excluding context-only items like Amazon orders)
   */
  private getBankTransactions(): Transaction[] {
    return this.transactions.filter(t => !t.isContextOnly);
  }

  /**
   * Get total spending
   */
  private getTotalSpending(query: string): AssistantResponse {
    const period = this.extractPeriod(query);
    const filtered = this.filterByPeriod(this.getBankTransactions(), period);
    const expenses = filtered.filter(t => t.amount < 0);
    const total = Math.abs(expenses.reduce((sum, t) => sum + t.amount, 0));

    const periodLabel = period.label || 'all time';

    return {
      message: `Your total spending for ${periodLabel} is **€${total.toFixed(2)}** across ${expenses.length} transactions.`,
      data: {
        type: 'summary',
        content: {
          total,
          count: expenses.length,
          period: periodLabel
        }
      }
    };
  }

  /**
   * Get category spending
   */
  private getCategorySpending(query: string): AssistantResponse {
    const period = this.extractPeriod(query);
    const category = this.extractCategory(query);

    const filtered = this.filterByPeriod(this.getBankTransactions(), period);
    const categoryTx = category
      ? filtered.filter(t => t.category?.toLowerCase() === category.toLowerCase() && t.amount < 0)
      : filtered.filter(t => t.amount < 0);

    const total = Math.abs(categoryTx.reduce((sum, t) => sum + t.amount, 0));

    const periodLabel = period.label || 'all time';
    const categoryLabel = category || 'all categories';

    return {
      message: `You spent **€${total.toFixed(2)}** on ${categoryLabel} (${periodLabel}).`,
      data: {
        type: 'summary',
        content: {
          category: categoryLabel,
          total,
          count: categoryTx.length,
          period: periodLabel
        }
      },
      suggestedActions: [
        `Show ${categoryLabel} transactions`,
        `Compare ${categoryLabel} to last month`
      ]
    };
  }

  /**
   * List transactions
   */
  private listTransactions(query: string): AssistantResponse {
    const period = this.extractPeriod(query);
    const category = this.extractCategory(query);

    let filtered = this.filterByPeriod(this.getBankTransactions(), period);

    if (category) {
      filtered = filtered.filter(t => t.category?.toLowerCase() === category.toLowerCase());
    }

    // Sort by date descending and limit
    const sorted = filtered
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);

    const tableData = sorted.map(t => ({
      date: new Date(t.date).toLocaleDateString('de-DE'),
      description: t.description.substring(0, 40),
      amount: `€${t.amount.toFixed(2)}`,
      category: t.category || '-'
    }));

    return {
      message: `Here are ${sorted.length} ${category ? category + ' ' : ''}transactions:`,
      data: {
        type: 'transactions',
        content: tableData
      }
    };
  }

  /**
   * Get top spending categories
   */
  private getTopCategories(query: string): AssistantResponse {
    const period = this.extractPeriod(query);
    const filtered = this.filterByPeriod(this.getBankTransactions(), period);

    const categoryTotals = new Map<string, number>();
    filtered.filter(t => t.amount < 0).forEach(t => {
      const cat = t.category || 'Uncategorized';
      categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + Math.abs(t.amount));
    });

    const sorted = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const chartData = sorted.map(([name, total]) => ({ name, total }));
    const periodLabel = period.label || 'all time';

    const lines = sorted.map(([name, total], i) =>
      `${i + 1}. **${name}**: €${total.toFixed(2)}`
    ).join('\n');

    return {
      message: `Top spending categories (${periodLabel}):\n\n${lines}`,
      data: {
        type: 'chart',
        content: {
          type: 'bar',
          data: chartData
        }
      }
    };
  }

  /**
   * Get recent transactions
   */
  private getRecentTransactions(): AssistantResponse {
    const recent = this.getBankTransactions()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);

    const tableData = recent.map(t => ({
      date: new Date(t.date).toLocaleDateString('de-DE'),
      description: t.description.substring(0, 40),
      amount: `€${t.amount.toFixed(2)}`,
      category: t.category || '-'
    }));

    return {
      message: 'Here are your 10 most recent transactions:',
      data: {
        type: 'transactions',
        content: tableData
      }
    };
  }

  /**
   * Get monthly comparison
   */
  private getMonthlyComparison(): AssistantResponse {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const bankTx = this.getBankTransactions();

    const currentMonthTx = bankTx.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });

    const lastMonthTx = bankTx.filter(t => {
      const d = new Date(t.date);
      const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
      const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;
      return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    });

    const currentSpending = Math.abs(
      currentMonthTx.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
    );
    const lastSpending = Math.abs(
      lastMonthTx.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
    );

    const change = lastSpending > 0
      ? ((currentSpending - lastSpending) / lastSpending * 100).toFixed(1)
      : 'N/A';

    const direction = currentSpending > lastSpending ? 'more' : 'less';
    const changeAbs = Math.abs(currentSpending - lastSpending).toFixed(2);

    return {
      message: `**This month**: €${currentSpending.toFixed(2)}\n**Last month**: €${lastSpending.toFixed(2)}\n\nYou're spending **€${changeAbs} ${direction}** (${change}%)`,
      data: {
        type: 'chart',
        content: {
          type: 'comparison',
          data: [
            { name: 'Last Month', value: lastSpending },
            { name: 'This Month', value: currentSpending }
          ]
        }
      }
    };
  }

  /**
   * Get income
   */
  private getIncome(query: string): AssistantResponse {
    const period = this.extractPeriod(query);
    const filtered = this.filterByPeriod(this.getBankTransactions(), period);
    const income = filtered.filter(t => t.amount > 0);
    const total = income.reduce((sum, t) => sum + t.amount, 0);

    const periodLabel = period.label || 'all time';

    return {
      message: `Your total income for ${periodLabel} is **€${total.toFixed(2)}** from ${income.length} transactions.`,
      data: {
        type: 'summary',
        content: {
          total,
          count: income.length,
          period: periodLabel
        }
      }
    };
  }

  /**
   * Extract time period from query
   */
  private extractPeriod(query: string): { start?: Date; end?: Date; label?: string } {
    const now = new Date();
    const queryLower = query.toLowerCase();

    if (queryLower.includes('this month')) {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end: now, label: 'this month' };
    }

    if (queryLower.includes('last month')) {
      const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const start = new Date(year, lastMonth, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start, end, label: 'last month' };
    }

    if (queryLower.includes('this year')) {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start, end: now, label: 'this year' };
    }

    if (queryLower.includes('last year')) {
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear() - 1, 11, 31);
      return { start, end, label: 'last year' };
    }

    if (queryLower.includes('today')) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { start, end: now, label: 'today' };
    }

    if (queryLower.includes('this week')) {
      const dayOfWeek = now.getDay();
      const start = new Date(now);
      start.setDate(now.getDate() - dayOfWeek);
      start.setHours(0, 0, 0, 0);
      return { start, end: now, label: 'this week' };
    }

    // Default: all time
    return { label: 'all time' };
  }

  /**
   * Extract category from query
   */
  private extractCategory(query: string): string | null {
    const queryLower = query.toLowerCase();

    for (const category of this.categories) {
      if (queryLower.includes(category.name.toLowerCase())) {
        return category.name;
      }
    }

    // Common category keywords
    const keywords: Record<string, string[]> = {
      'groceries': ['groceries', 'grocery', 'food', 'supermarket'],
      'dining': ['dining', 'restaurant', 'eating out', 'food'],
      'transportation': ['transport', 'uber', 'taxi', 'gas', 'fuel'],
      'entertainment': ['entertainment', 'movies', 'games', 'streaming'],
      'shopping': ['shopping', 'amazon', 'online'],
      'utilities': ['utilities', 'bills', 'electricity', 'water', 'internet'],
    };

    for (const [category, terms] of Object.entries(keywords)) {
      if (terms.some(term => queryLower.includes(term))) {
        return category;
      }
    }

    return null;
  }

  /**
   * Filter transactions by period
   */
  private filterByPeriod(
    transactions: Transaction[],
    period: { start?: Date; end?: Date }
  ): Transaction[] {
    return transactions.filter(t => {
      const date = new Date(t.date);
      if (period.start && date < period.start) return false;
      if (period.end && date > period.end) return false;
      return true;
    });
  }

  /**
   * Process complex query with AI
   */
  private async processWithAI(userMessage: string): Promise<AssistantResponse> {
    // Check if API key is configured
    if (!this.apiKey || this.apiKey.trim() === '') {
      return {
        message: 'The AI assistant is not configured. Please set the OPENAI_API_KEY environment variable to enable AI-powered responses.\n\nIn the meantime, try these commands:\n- "Show recent transactions"\n- "How much did I spend this month?"\n- "Top categories"\n- "Compare to last month"',
        suggestedActions: [
          'Show recent transactions',
          'Total spending this month',
          'Top categories this month'
        ]
      };
    }

    // Prepare context summary for AI
    const contextSummary = this.prepareContextSummary();

    const systemPrompt = `You are a helpful financial assistant analyzing the user's personal finances.
You have access to their transaction data. Be concise and specific in your responses.

Context:
${contextSummary}

Guidelines:
- Use markdown for formatting (bold, lists, etc.)
- Provide specific numbers when possible
- Suggest follow-up actions when relevant
- Keep responses concise (2-4 sentences max for simple queries)
- For complex analysis, use bullet points
- Always refer to amounts in EUR with € symbol`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            ...this.conversationHistory.map(m => ({
              role: m.role,
              content: m.content
            })),
            { role: 'user', content: userMessage }
          ],
          max_tokens: 500,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('OpenAI API error:', response.status, errorData);
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const aiMessage = data.choices[0]?.message?.content || 'I could not process that query.';

      // Save to history
      this.conversationHistory.push({
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString()
      });
      this.conversationHistory.push({
        role: 'assistant',
        content: aiMessage,
        timestamp: new Date().toISOString()
      });

      // Limit history
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      return { message: aiMessage };
    } catch (error) {
      console.error('AI processing error:', error);
      return {
        message: 'Sorry, I encountered an error connecting to the AI service. Try one of these commands that work offline:',
        suggestedActions: [
          'Show recent transactions',
          'Total spending this month',
          'Top categories this month'
        ]
      };
    }
  }

  /**
   * Prepare context summary for AI
   */
  private prepareContextSummary(): string {
    // Separate real bank transactions from context-only (Amazon orders)
    const bankTransactions = this.transactions.filter(t => !t.isContextOnly);
    const contextOnlyTransactions = this.transactions.filter(t => t.isContextOnly);

    const totalTransactions = bankTransactions.length;
    const totalSpending = Math.abs(
      bankTransactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
    );
    const totalIncome = bankTransactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    const categories = this.categories.map(c => c.name).join(', ');

    // Get date range from bank transactions only
    const dates = bankTransactions.map(t => new Date(t.date).getTime());
    const minDate = dates.length > 0 ? new Date(Math.min(...dates)).toLocaleDateString() : 'N/A';
    const maxDate = dates.length > 0 ? new Date(Math.max(...dates)).toLocaleDateString() : 'N/A';

    // Top 5 categories by spending
    const categoryTotals = new Map<string, number>();
    bankTransactions.filter(t => t.amount < 0).forEach(t => {
      const cat = t.category || 'Uncategorized';
      categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + Math.abs(t.amount));
    });
    const topCategories = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, total]) => `${name}: €${total.toFixed(2)}`)
      .join(', ');

    // Count transactions with linked orders
    const transactionsWithLinkedOrders = bankTransactions.filter(
      t => t.linkedOrderIds && t.linkedOrderIds.length > 0
    ).length;

    let summary = `
- Total bank transactions: ${totalTransactions}
- Date range: ${minDate} to ${maxDate}
- Total spending: €${totalSpending.toFixed(2)}
- Total income: €${totalIncome.toFixed(2)}
- Available categories: ${categories}
- Top spending categories: ${topCategories}`;

    // Add order linking information if relevant
    if (contextOnlyTransactions.length > 0 || transactionsWithLinkedOrders > 0) {
      summary += `
- Amazon orders (for context): ${contextOnlyTransactions.length}
- Bank transactions with linked order details: ${transactionsWithLinkedOrders}`;
    }

    return summary;
  }

  /**
   * Get linked order details for a specific transaction
   */
  getLinkedOrderDetails(transactionId: string): Transaction[] {
    const transaction = this.transactions.find(t => t.id === transactionId);
    if (!transaction || !transaction.linkedOrderIds?.length) {
      return [];
    }

    return this.transactions.filter(t =>
      transaction.linkedOrderIds!.includes(t.id)
    );
  }

  /**
   * Build enhanced description with linked order details
   */
  buildEnhancedDescription(transaction: Transaction): string {
    const linkedOrders = this.getLinkedOrderDetails(transaction.id);

    if (linkedOrders.length === 0) {
      return transaction.description;
    }

    const orderDetails = linkedOrders.map(o => o.description).join('; ');
    return `${transaction.description} [Linked orders: ${orderDetails}]`;
  }
}

export default AIAssistant;
