/**
 * Dashboard Services Index
 *
 * Re-exports all dashboard-related services.
 */

export {
  DashboardStatsService,
  DashboardStats,
  CategoryStat,
  MonthlyData,
  Transaction as StatsTransaction
} from './dashboard-stats.service';

export {
  DashboardSyncService,
  SyncProgress,
  SyncResult,
  ConnectorState
} from './dashboard-sync.service';

export {
  DashboardChartService,
  CategoryBreakdown,
  DateRange,
  Transaction as ChartTransaction,
  Category as ChartCategory
} from './dashboard-chart.service';
