import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AiFabComponent } from './shared/ai-fab/ai-fab.component';

@Component({
  selector: 'app-root',
  template: `
    <mat-sidenav-container>
      <mat-sidenav #sidenav mode="side" opened [class.collapsed]="!sidenavExpanded">
        <div class="nav-content">
          <div class="nav-header">
            <h2 *ngIf="sidenavExpanded">Financial Analytics</h2>
            <button mat-icon-button (click)="toggleSidenav()" [matTooltip]="sidenavExpanded ? 'Collapse' : 'Expand'" matTooltipPosition="right">
              <mat-icon>{{ sidenavExpanded ? 'chevron_left' : 'menu' }}</mat-icon>
            </button>
          </div>
          <nav>
            <a mat-button routerLink="/dashboard" routerLinkActive="active" [matTooltip]="sidenavExpanded ? '' : 'Dashboard'" matTooltipPosition="right">
              <mat-icon>dashboard</mat-icon>
              <span *ngIf="sidenavExpanded">Dashboard</span>
            </a>
            <a mat-button routerLink="/transactions" routerLinkActive="active" [matTooltip]="sidenavExpanded ? '' : 'Transactions'" matTooltipPosition="right">
              <mat-icon>receipt_long</mat-icon>
              <span *ngIf="sidenavExpanded">Transactions</span>
            </a>
            <a mat-button routerLink="/settings" routerLinkActive="active" [matTooltip]="sidenavExpanded ? '' : 'Settings'" matTooltipPosition="right">
              <mat-icon>settings</mat-icon>
              <span *ngIf="sidenavExpanded">Settings</span>
            </a>
          </nav>
        </div>
      </mat-sidenav>
      <mat-sidenav-content [style.margin-left]="sidenavExpanded ? '250px' : '64px'">
        <mat-toolbar color="primary">
          <span>Personal Financial Statistics</span>
        </mat-toolbar>
        <main>
          <router-outlet></router-outlet>
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>

    <!-- Global AI FAB -->
    <app-ai-fab></app-ai-fab>
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
      transition: width 0.3s ease;
      overflow-x: hidden;
    }
    mat-sidenav.collapsed {
      width: 64px;
    }
    mat-sidenav-content {
      transition: margin-left 0.3s ease;
    }
    .nav-content {
      padding: 0.75rem;
      width: 250px;
    }
    .nav-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
      min-height: 40px;
    }
    .collapsed .nav-header {
      justify-content: center;
    }
    .nav-header h2 {
      margin: 0;
      font-size: 1.1rem;
      white-space: nowrap;
      overflow: hidden;
    }
    nav {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    nav a {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      justify-content: flex-start;
      min-width: 40px;
      padding: 8px 12px;
    }
    .collapsed nav a {
      justify-content: center;
      padding: 8px;
    }
    nav a.active {
      background-color: rgba(0, 0, 0, 0.08);
      font-weight: 500;
    }
    nav a mat-icon {
      flex-shrink: 0;
    }
    nav a span {
      white-space: nowrap;
      overflow: hidden;
    }
    mat-toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
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
    MatIconModule,
    MatTooltipModule,
    AiFabComponent
  ],
  standalone: true
})
export class AppComponent {
  @ViewChild('sidenav') sidenav!: MatSidenav;
  sidenavExpanded = true;
  title = 'personal-financial-statistics';

  toggleSidenav() {
    this.sidenavExpanded = !this.sidenavExpanded;
  }
}