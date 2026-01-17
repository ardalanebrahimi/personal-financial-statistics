import { Injectable } from '@angular/core';
import { Category } from '../core/models/transaction.model';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private readonly API_URL = `${environment.apiUrl}/categories`;
  private categoriesSubject = new BehaviorSubject<Category[]>([]);
  private initialized = false;

  // Expose as Observable for components to subscribe
  categories$ = this.categoriesSubject.asObservable();

  constructor(private http: HttpClient) {
    this.initializeCategories();
  }

  private async initializeCategories() {
    if (this.initialized) return;

    try {
      const data = await firstValueFrom(
        this.http.get<{categories: Category[]}>(`${this.API_URL}`)
      );
      if (data?.categories) {
        this.categoriesSubject.next(data.categories);
      } else {
        this.categoriesSubject.next([]);
      }
      this.initialized = true;
    } catch (error) {
      console.warn('Could not load categories from API, starting with empty list');
      this.categoriesSubject.next([]);
      this.initialized = true;
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

  // Synchronous getter for current value (for backwards compatibility)
  getCategories(): Category[] {
    return this.categoriesSubject.value;
  }

  // Async method to ensure categories are loaded
  async loadCategories(): Promise<Category[]> {
    if (!this.initialized) {
      await this.initializeCategories();
    }
    return this.categoriesSubject.value;
  }

  async addCategory(category: Category) {
    const categories = [...this.categoriesSubject.value, category];
    this.categoriesSubject.next(categories);
    await this.saveToFile(categories);
  }

  async deleteCategory(id: string) {
    const categories = this.categoriesSubject.value.filter(c => c.id !== id);
    this.categoriesSubject.next(categories);
    await this.saveToFile(categories);
  }
}
