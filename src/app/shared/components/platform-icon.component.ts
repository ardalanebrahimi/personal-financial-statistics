/**
 * Platform Icon Component
 *
 * Displays platform-specific icons (Amazon, PayPal, etc.)
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

export type Platform = 'amazon' | 'paypal' | 'sparkasse' | 'n26' | 'gebuhrenfrei' | 'manual' | 'csv';

@Component({
  selector: 'app-platform-icon',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  template: `
    <span class="platform-icon" [class]="platform" [matTooltip]="tooltip">
      <mat-icon *ngIf="useMatIcon">{{ iconName }}</mat-icon>
      <span *ngIf="!useMatIcon" class="text-icon">{{ textIcon }}</span>
    </span>
  `,
  styles: [`
    .platform-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 4px;
    }

    .platform-icon mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .text-icon {
      font-size: 10px;
      font-weight: bold;
    }

    .amazon {
      background: #ff9900;
      color: white;
    }

    .paypal {
      background: #0070ba;
      color: white;
    }

    .sparkasse {
      background: #ff0000;
      color: white;
    }

    .n26 {
      background: #36a18b;
      color: white;
    }

    .gebuhrenfrei {
      background: #1a237e;
      color: white;
    }

    .manual {
      background: #9e9e9e;
      color: white;
    }

    .csv {
      background: #4caf50;
      color: white;
    }
  `]
})
export class PlatformIconComponent {
  @Input() platform: Platform = 'manual';
  @Input() showTooltip = true;

  get iconName(): string {
    const icons: Record<Platform, string> = {
      amazon: 'shopping_cart',
      paypal: 'account_balance_wallet',
      sparkasse: 'account_balance',
      n26: 'smartphone',
      gebuhrenfrei: 'credit_card',
      manual: 'edit',
      csv: 'description'
    };
    return icons[this.platform] || 'help';
  }

  get textIcon(): string {
    const texts: Record<Platform, string> = {
      amazon: 'AMZ',
      paypal: 'PP',
      sparkasse: 'SPK',
      n26: 'N26',
      gebuhrenfrei: 'GF',
      manual: 'M',
      csv: 'CSV'
    };
    return texts[this.platform] || '?';
  }

  get useMatIcon(): boolean {
    return ['amazon', 'paypal', 'manual', 'csv'].includes(this.platform);
  }

  get tooltip(): string {
    if (!this.showTooltip) return '';
    const tooltips: Record<Platform, string> = {
      amazon: 'Amazon',
      paypal: 'PayPal',
      sparkasse: 'Sparkasse',
      n26: 'N26',
      gebuhrenfrei: 'Gebührenfrei',
      manual: 'Manual Entry',
      csv: 'CSV Import'
    };
    return tooltips[this.platform] || 'Unknown';
  }
}
