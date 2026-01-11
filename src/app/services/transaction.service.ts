import { Injectable } from '@angular/core';
import { Transaction } from '../core/models/transaction.model';
import { BehaviorSubject } from 'rxjs';
import { AIService } from './ai.service';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

interface TransactionMatch {
  exists: boolean;
  category?: string;
}

@Injectable({
  providedIn: 'root'
})
export class TransactionService {
  private readonly API_URL = `${environment.apiUrl}/transactions`;
  private transactions = new BehaviorSubject<Transaction[]>([]);
  transactions$ = this.transactions.asObservable();

  constructor(
    private aiService: AIService,
    private http: HttpClient
  ) {
    this.loadTransactions();
  }

  async loadTransactions() {
    try {
      const response = await firstValueFrom(
        this.http.get<{transactions: Transaction[]}>(this.API_URL)
      );
      this.transactions.next(response.transactions);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      this.transactions.next([]);
    }
  }

  private async checkExistingTransaction(date: Date, amount: number, description: string): Promise<TransactionMatch> {
    try {
      // Normalize the description
      const cleanDescription = description.trim().replace(/\s+/g, ' ');

      // Construct query parameters
      const params = new URLSearchParams({
        date: date.toISOString(),
        amount: amount.toString(),
        description: cleanDescription
      });

      // Debug log for outgoing request
      console.log('Checking transaction with params:', params.toString());

      const response = await firstValueFrom(
        this.http.get<TransactionMatch>(
          `${this.API_URL}/match?${params.toString()}`
        )
      );

      // Debug log for response
      console.log('Match response:', response);

      return response;
    } catch (error) {
      console.error('Failed to check existing transaction:', error);
      return { exists: false };
    }
  }

  async parseFile(file: File): Promise<Transaction[]> {
    const text = await file.text();
    const rows = text.split('\n').map(row => row.split(';').map(cell => cell.trim().replace(/"/g, '')));
    
    for (const row of rows.slice(1)) {
        if (row.length < 15) continue;
        
        const description = this.extractDescription(row[3], row[4], row[11]);
        const amount = this.parseAmount(row[14]);
        const date = this.parseGermanDate(row[1]);
        const beneficiary = row[11]; // Extract Beneficiary/payer from the row
        
        if (!description || !amount || !date) continue;

        // Check if transaction already exists
        const match = await this.checkExistingTransaction(date, amount, description);
        
        if (match.exists) {
            console.log('Transaction already exists, skipping...', { date, amount, description });
            this.updateTransaction
            continue;
        }

        // Only call AI service if no match found
        const category = await this.aiService.suggestCategory(description);
        
        await firstValueFrom(
            this.http.post(this.API_URL, {
                id: crypto.randomUUID(),
                date,
                description,
                amount,
                beneficiary, // Include Beneficiary/payer in the transaction object
                category: category
            }, { responseType: 'text' }) // Explicitly set responseType to 'text'
        );
    }
    
    await this.loadTransactions();
    return this.transactions.value;
  }

  async updateTransaction(transaction: Transaction) {
    try {
      await firstValueFrom(
        this.http.put(`${this.API_URL}/${transaction.id}`, transaction)
      );
      await this.loadTransactions();
    } catch (error) {
      console.error('Failed to update transaction:', error);
    }
  }

  async deleteTransaction(id: string) {
    try {
      await firstValueFrom(
        this.http.delete(`${this.API_URL}/${id}`)
      );
      await this.loadTransactions();
    } catch (error) {
      console.error('Failed to delete transaction:', error);
    }
  }

  async filterTransactions(filters: {
    startDate?: Date,
    endDate?: Date,
    category?: string,
    beneficiary?: string,
    description?: string
  }) {
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate.toISOString());
      if (filters.endDate) params.append('endDate', filters.endDate.toISOString());
      if (filters.category) params.append('category', filters.category);
      if (filters.beneficiary) params.append('beneficiary', filters.beneficiary);
      if (filters.description) params.append('description', filters.description);

      const response = await firstValueFrom(
        this.http.get<{transactions: Transaction[]}>(`${this.API_URL}/filter?${params.toString()}`)
      );
      this.transactions.next(response.transactions);
      return response.transactions;
    } catch (error) {
      console.error('Failed to filter transactions:', error);
      return [];
    }
  }

  private parseGermanDate(dateStr: string): Date | null {
    try {
      const [day, month, year] = dateStr.split('.').map(num => parseInt(num));
      return new Date(2000 + year, month - 1, day);
    } catch {
      return null;
    }
  }

  private parseAmount(amountStr: string): number | null {
    try {
      return parseFloat(amountStr.replace(',', '.'));
    } catch {
      return null;
    }
  }

  private extractDescription(postingText: string, purpose: string, beneficiary: string): string {
    const cleanPurpose = purpose.replace(/\d+\/?\.?\s?/, '').trim(); // Remove leading numbers and slashes
    const parts = [cleanPurpose, beneficiary, postingText]
      .filter(part => part && part.trim().length > 0) // Remove empty or whitespace-only strings
      .map(part => part.trim());
    return parts.join(' - ');
  }

  exportToCSV(transactions?: Transaction[]): string {
    if(!transactions || transactions.length === 0) return '';
    const headers = ['Date', 'Description', 'Amount', 'Category'];
    const rows = transactions?.map(t => [
      new Date(t.date).toISOString(),
      t.description,
      t.amount.toString(),
      t.category || t.category || ''
    ]);
    
    return [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
  }

  getStatistics() {
    const transactions = this.transactions.value;
    return {
      total: transactions.reduce((sum, t) => sum + t.amount, 0),
      count: transactions.length,
      average: transactions.length ? 
        transactions.reduce((sum, t) => sum + t.amount, 0) / transactions.length : 0,
      categories: this.getCategoryBreakdown(transactions)
    };
  }

  private getCategoryBreakdown(transactions: Transaction[]) {
    const breakdown = new Map<string, { count: number; total: number }>();
    
    transactions.forEach(t => {
      const category = t.category || t.category || 'Uncategorized';
      const current = breakdown.get(category) || { count: 0, total: 0 };
      breakdown.set(category, {
        count: current.count + 1,
        total: current.total + t.amount
      });
    });
    
    return Object.fromEntries(breakdown);
  }
}
