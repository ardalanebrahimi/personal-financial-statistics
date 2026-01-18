/**
 * Matching Stats Bar Component
 *
 * Displays statistics for matching overview.
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlatformStats, PlatformType } from '../../services/matching.service';

@Component({
  selector: 'app-matching-stats-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-value">{{ stats.unlinkedBankCharges }}</span>
        <span class="stat-label">Unlinked Bank Charges</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ unlinkedContextCount }}</span>
        <span class="stat-label">Unlinked {{ platform === 'amazon' ? 'Orders' : 'Transactions' }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ suggestionCount }}</span>
        <span class="stat-label">Suggestions</span>
      </div>
      <div class="stat-item linked">
        <span class="stat-value">{{ stats.linkedBankCharges }}</span>
        <span class="stat-label">Already Linked</span>
      </div>
    </div>
  `,
  styles: [`
    .stats-bar {
      display: flex;
      gap: 24px;
      padding: 16px 24px;
      background: #fafafa;
      border-bottom: 1px solid #e0e0e0;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
    }

    .stat-item .stat-value {
      font-size: 24px;
      font-weight: 600;
      color: #333;
    }

    .stat-item .stat-label {
      font-size: 12px;
      color: #666;
    }

    .stat-item.linked .stat-value {
      color: #4caf50;
    }
  `]
})
export class MatchingStatsBarComponent {
  @Input() stats: PlatformStats = {
    totalBankCharges: 0,
    linkedBankCharges: 0,
    unlinkedBankCharges: 0,
    suggestionCount: 0
  };
  @Input() platform: PlatformType = 'amazon';
  @Input() unlinkedContextCount = 0;
  @Input() suggestionCount = 0;
}
