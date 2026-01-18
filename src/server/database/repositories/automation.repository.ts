/**
 * Automation Repository
 *
 * Database operations for automation configuration.
 */

import { db } from '../connection';

export interface AutomationConfig {
  autoCategorize: boolean;
  autoMatch: boolean;
  scheduledSync: {
    enabled: boolean;
    intervalMinutes: number;
  };
  notifyOnNewTransactions: boolean;
}

const DEFAULT_AUTOMATION_CONFIG: AutomationConfig = {
  autoCategorize: true,
  autoMatch: true,
  scheduledSync: { enabled: false, intervalMinutes: 60 },
  notifyOnNewTransactions: true
};

export function getAutomationConfig(): AutomationConfig {
  const row = db.prepare(`SELECT value FROM automation_config WHERE key = 'config'`).get() as any;
  if (row) {
    return JSON.parse(row.value);
  }
  return DEFAULT_AUTOMATION_CONFIG;
}

export function saveAutomationConfig(config: AutomationConfig): void {
  db.prepare(`
    INSERT OR REPLACE INTO automation_config (key, value)
    VALUES ('config', ?)
  `).run(JSON.stringify(config));
}
