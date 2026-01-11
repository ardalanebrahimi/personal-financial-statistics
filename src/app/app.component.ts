import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-root',
  template: `
    <mat-sidenav-container>
      <mat-sidenav mode="side" opened>
        <div class="nav-content">
          <h2>Financial Analytics</h2>
          <nav>
            <a mat-button routerLink="/connectors" routerLinkActive="active">
              <mat-icon>account_balance</mat-icon>
              Connectors
            </a>
            <a mat-button routerLink="/transactions" routerLinkActive="active">
              <mat-icon>receipt_long</mat-icon>
              Transactions
            </a>
            <a mat-button routerLink="/upload" routerLinkActive="active">
              <mat-icon>upload</mat-icon>
              Upload Data
            </a>
            <a mat-button routerLink="/import/amazon" routerLinkActive="active">
              <mat-icon>shopping_cart</mat-icon>
              Amazon Import
            </a>
            <a mat-button routerLink="/categories" routerLinkActive="active">
              <mat-icon>category</mat-icon>
              Categories
            </a>
            <a mat-button routerLink="/analytics" routerLinkActive="active">
              <mat-icon>analytics</mat-icon>
              Analytics
            </a>
          </nav>
        </div>
      </mat-sidenav>
      <mat-sidenav-content>
        <mat-toolbar color="primary">
          <span>Personal Financial Statistics</span>
        </mat-toolbar>
        <main>
          <router-outlet></router-outlet>
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`
    :host {
      display: block;
      height: 100vh;
    }
    mat-sidenav-container {
      height: 100%;
    }
    mat-sidenav {
      width: 250px;
    }
    .nav-content {
      padding: 1rem;
    }
    nav {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    nav a.active {
      background-color: rgba(0, 0, 0, 0.04);
      font-weight: 500;
    }
    main {
      padding: 1rem;
    }
  `],
  imports: [
    CommonModule,
    RouterModule,
    MatSidenavModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule
  ],
  standalone: true
})
export class AppComponent {
  title = 'personal-financial-statistics';
}