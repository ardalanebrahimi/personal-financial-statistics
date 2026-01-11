import { Injectable } from '@angular/core';
import { Category } from '../core/models/transaction.model';
import { BehaviorSubject } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private readonly API_URL = `${environment.apiUrl}/categories`;
  private categories = new BehaviorSubject<Category[]>([]);

  constructor(private http: HttpClient) {
    this.initializeCategories();
  }

  private async initializeCategories() {
    try {
      const data = await firstValueFrom(
        this.http.get<{categories: Category[]}>(`${this.API_URL}`)
      );
      if (data?.categories) {
        this.categories.next(data.categories);
      } else {
        this.categories.next([]); // Initialize with empty array if file is empty
      }
    } catch (error) {
      console.warn('Could not load categories from API, starting with empty list');
      this.categories.next([]); // Initialize with empty array if file doesn't exist
    }
  }

  private async saveToFile(categories: Category[]) {
    try {
      await firstValueFrom(
        this.http.put(`${this.API_URL}`, categories)
      );
    } catch (error) {
      console.error('Failed to save categories:', error);
      throw new Error('Failed to save categories');
    }
  }

  getCategories(): Category[] {
    if (!this.categories.value.length) {
      this.initializeCategories();
    }
    return this.categories.value;
  }

  async addCategory(category: Category) {
    const categories = [...this.categories.value, category];
    this.categories.next(categories);
    await this.saveToFile(categories);
  }

  async deleteCategory(id: string) {
    const categories = this.categories.value.filter(c => c.id !== id);
    this.categories.next(categories);
    await this.saveToFile(categories);
  }
}
