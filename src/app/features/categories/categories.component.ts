import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { Category } from '../../core/models/transaction.model';
import { CategoryService } from 'src/app/services/category.service';

@Component({
  selector: 'app-categories',
  template: `
    <mat-card>
      <mat-card-content>
        <div class="categories-container">
          <div class="add-category">
            <input [(ngModel)]="newCategory.name" placeholder="Category name">
            <input [(ngModel)]="newCategory.description" placeholder="Description">
            <input [(ngModel)]="newCategory.color" type="color">
            <button mat-raised-button color="primary" (click)="addCategory()">Add Category</button>
          </div>
          <div class="categories-list">
            <div *ngFor="let category of categories" class="category-item">
              <span [style.color]="category.color">{{category.name}}</span>
              <p>{{category.description}}</p>
              <button mat-icon-button color="warn" (click)="deleteCategory(category.id)">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          </div>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .categories-container {
      padding: 1rem;
    }
    .add-category {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .category-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem;
      border-bottom: 1px solid #ddd;
    }
  `],
  imports: [CommonModule, FormsModule, MatCard, MatCardContent, MatButton, MatIcon],
  standalone: true
})
export class CategoriesComponent implements OnInit {
  categories: Category[] = [];
  newCategory: Partial<Category> = {};

  constructor(private categoryService: CategoryService) {}

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
        color: this.newCategory.color
      });
      this.loadCategories();
      this.newCategory = {};
    }
  }

  deleteCategory(id: string) {
    this.categoryService.deleteCategory(id);
    this.loadCategories();
  }
}
