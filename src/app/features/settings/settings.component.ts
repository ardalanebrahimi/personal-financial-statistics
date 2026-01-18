import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';

import { ConnectorsTabComponent } from './tabs/connectors-tab.component';
import { CategoriesTabComponent } from './tabs/categories-tab.component';
import { HelpTabComponent } from './tabs/help-tab.component';
import { environment } from '../../../environments/environment';

interface AutomationConfig {
  autoCategorize: boolean;
  autoMatch: boolean;
  scheduledSync: {
    enabled: boolean;
    intervalMinutes: number;
  };
  notifyOnNewTransactions: boolean;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTabsModule,
    MatIconModule,
    MatCardModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule,
    MatExpansionModule,
    ConnectorsTabComponent,
    CategoriesTabComponent,
    HelpTabComponent
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit {
  selectedTabIndex = 0;
  config: AutomationConfig | null = null;
  ruleStats: any = null;
  loading = true;
  isProcessing: string | null = null;
  lastResult: string | null = null;

  private tabRoutes = ['connectors', 'categories', 'automation', 'help'];

  constructor(
    private http: HttpClient,
    private snackBar: MatSnackBar,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Handle tab from query params
    this.route.queryParams.subscribe(params => {
      const tab = params['tab'];
      if (tab) {
        const index = this.tabRoutes.indexOf(tab);
        if (index >= 0) {
          this.selectedTabIndex = index;
        }
      }
    });

    this.loadConfig();
    this.loadRuleStats();
  }

  onTabChange(event: any): void {
    const tabName = this.tabRoutes[event.index];
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tabName },
      queryParamsHandling: 'merge'
    });
  }

  async loadConfig(): Promise<void> {
    try {
      this.config = await this.http
        .get<AutomationConfig>(`${environment.apiUrl}/automation/config`)
        .toPromise() as AutomationConfig;
    } catch (error) {
      console.error('Failed to load automation config:', error);
      this.config = {
        autoCategorize: true,
        autoMatch: true,
        scheduledSync: { enabled: false, intervalMinutes: 60 },
        notifyOnNewTransactions: true
      };
    } finally {
      this.loading = false;
    }
  }

  async loadRuleStats(): Promise<void> {
    try {
      const response = await this.http
        .get<{ rules: any[]; stats: any }>(`${environment.apiUrl}/rules`)
        .toPromise();
      this.ruleStats = response?.stats;
    } catch (error) {
      console.error('Failed to load rule stats:', error);
    }
  }

  async saveConfig(): Promise<void> {
    if (!this.config) return;

    try {
      await this.http
        .put(`${environment.apiUrl}/automation/config`, this.config)
        .toPromise();
      this.snackBar.open('Settings saved', 'Dismiss', { duration: 2000 });
    } catch (error) {
      console.error('Failed to save config:', error);
      this.snackBar.open('Failed to save settings', 'Dismiss', { duration: 3000 });
    }
  }

  async runAutoCategorize(): Promise<void> {
    this.isProcessing = 'categorize';
    this.lastResult = null;

    try {
      const result = await this.http
        .post<{ categorized: number }>(`${environment.apiUrl}/automation/categorize`, {})
        .toPromise();
      this.lastResult = `Auto-categorized ${result?.categorized || 0} transactions`;
    } catch (error) {
      console.error('Auto-categorize failed:', error);
      this.snackBar.open('Auto-categorization failed', 'Dismiss', { duration: 3000 });
    } finally {
      this.isProcessing = null;
    }
  }

  async runAutoMatch(): Promise<void> {
    this.isProcessing = 'match';
    this.lastResult = null;

    try {
      const result = await this.http
        .post<{ newMatches: number }>(`${environment.apiUrl}/matching/run`, {})
        .toPromise();
      this.lastResult = `Created ${result?.newMatches || 0} new matches`;
    } catch (error) {
      console.error('Matching failed:', error);
      this.snackBar.open('Matching failed', 'Dismiss', { duration: 3000 });
    } finally {
      this.isProcessing = null;
    }
  }

  async processAll(): Promise<void> {
    this.isProcessing = 'process';
    this.lastResult = null;

    try {
      const result = await this.http
        .post<{ categorized: number; matched: number }>(`${environment.apiUrl}/automation/process-new`, {})
        .toPromise();
      this.lastResult = `Categorized ${result?.categorized || 0}, matched ${result?.matched || 0}`;
    } catch (error) {
      console.error('Processing failed:', error);
      this.snackBar.open('Processing failed', 'Dismiss', { duration: 3000 });
    } finally {
      this.isProcessing = null;
    }
  }

  async consolidateRules(): Promise<void> {
    this.isProcessing = 'consolidate';

    try {
      await this.http.post(`${environment.apiUrl}/rules/consolidate`, {}).toPromise();
      await this.loadRuleStats();
      this.snackBar.open('Rules consolidated', 'Dismiss', { duration: 2000 });
    } catch (error) {
      console.error('Consolidation failed:', error);
      this.snackBar.open('Rule consolidation failed', 'Dismiss', { duration: 3000 });
    } finally {
      this.isProcessing = null;
    }
  }
}
