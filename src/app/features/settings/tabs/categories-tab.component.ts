import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Category } from '../../../core/models/transaction.model';
import { CategoryService } from '../../../services/category.service';

@Component({
  selector: 'app-categories-tab',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule
  ],
  template: `
    <div class="categories-tab">
      <!-- Add Category Form -->
      <mat-card class="add-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>add_circle</mat-icon>
          <mat-card-title>Add New Category</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="add-form">
            <mat-form-field appearance="outline">
              <mat-label>Category Name</mat-label>
              <input matInput [(ngModel)]="newCategory.name" placeholder="e.g., Groceries">
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Description</mat-label>
              <input matInput [(ngModel)]="newCategory.description" placeholder="Optional description">
            </mat-form-field>
            <div class="color-picker">
              <label>Color</label>
              <input type="color" [(ngModel)]="newCategory.color" [value]="newCategory.color || '#1976d2'">
            </div>
            <button mat-raised-button color="primary" (click)="addCategory()" [disabled]="!newCategory.name">
              <mat-icon>add</mat-icon>
              Add Category
            </button>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Categories List -->
      <mat-card class="list-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>category</mat-icon>
          <mat-card-title>Your Categories ({{ categories.length }})</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="categories-list" *ngIf="categories.length > 0; else noCategories">
            <div *ngFor="let category of categories" class="category-item">
              <div class="category-info">
                <span class="color-dot" [style.background-color]="category.color || '#1976d2'"></span>
                <div class="category-text">
                  <span class="category-name">{{ category.name }}</span>
                  <span class="category-description" *ngIf="category.description">{{ category.description }}</span>
                </div>
              </div>
              <button mat-icon-button color="warn" (click)="deleteCategory(category.id)" matTooltip="Delete category">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          </div>

          <ng-template #noCategories>
            <div class="empty-state">
              <mat-icon>category</mat-icon>
              <p>No categories yet. Add your first category above.</p>
            </div>
          </ng-template>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .categories-tab {
      max-width: 700px;
    }

    .add-card, .list-card {
      margin-bottom: 1.5rem;
    }

    .add-card mat-card-header,
    .list-card mat-card-header {
      margin-bottom: 1rem;
    }

    .add-form {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: flex-end;
    }

    .add-form mat-form-field {
      flex: 1;
      min-width: 200px;
    }

    .color-picker {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .color-picker label {
      font-size: 12px;
      color: #666;
    }

    .color-picker input[type="color"] {
      width: 50px;
      height: 40px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    .categories-list {
      display: flex;
      flex-direction: column;
    }

    .category-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 0;
      border-bottom: 1px solid #e0e0e0;
    }

    .category-item:last-child {
      border-bottom: none;
    }

    .category-info {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .color-dot {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .category-text {
      display: flex;
      flex-direction: column;
    }

    .category-name {
      font-weight: 500;
    }

    .category-description {
      font-size: 12px;
      color: #666;
    }

    .empty-state {
      text-align: center;
      padding: 2rem;
      color: #666;
    }

    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #ccc;
    }

    .empty-state p {
      margin-top: 1rem;
    }
  `]
})
export class CategoriesTabComponent implements OnInit {
  categories: Category[] = [];
  newCategory: Partial<Category> = { color: '#1976d2' };

  constructor(
    private categoryService: CategoryService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.loadCategories();
  }

  private loadCategories() {
    this.categories = this.categoryService.getCategories();
  }

  addCategory() {
    if (this.newCategory.name) {
      this.categoryService.addCategory({
        id: crypto.randomUUID(),
        name: this.newCategory.name,
        description: this.newCategory.description,
        color: this.newCategory.color || '#1976d2'
      });
      this.loadCategories();
      this.snackBar.open(`Category "${this.newCategory.name}" added`, 'Close', { duration: 2000 });
      this.newCategory = { color: '#1976d2' };
    }
  }

  deleteCategory(id: string) {
    const category = this.categories.find(c => c.id === id);
    if (confirm(`Delete category "${category?.name}"?`)) {
      this.categoryService.deleteCategory(id);
      this.loadCategories();
      this.snackBar.open('Category deleted', 'Close', { duration: 2000 });
    }
  }
}
