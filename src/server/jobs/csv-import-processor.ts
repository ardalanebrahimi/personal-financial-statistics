/**
 * CSV Import Job Processor
 *
 * Processes CSV file imports in the background, allowing the user to
 * navigate away while import continues.
 */

import * as db from '../database/database';
import { StoredTransaction } from '../database/database';
import * as fs from 'fs';
import * as path from 'path';

interface ParsedRow {
  date: Date;
  description: string;
  amount: number;
  beneficiary: string;
  category: string;
}

// Track active processing jobs to allow cancellation
const activeJobs = new Map<string, { cancelled: boolean }>();

export function cancelImportJob(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  if (job) {
    job.cancelled = true;
    return true;
  }
  return false;
}

export async function processCsvImport(jobId: string, filePath: string): Promise<void> {
  const jobState = { cancelled: false };
  activeJobs.set(jobId, jobState);

  try {
    console.log(`[CSV Import] Starting job ${jobId} for file ${filePath}`);

    // Read file content
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const rows = fileContent.split('\n').map(row =>
      row.split(';').map(cell => cell.trim().replace(/"/g, ''))
    );

    if (rows.length < 2) {
      db.failJob(jobId, 'File has no data rows');
      return;
    }

    // Detect format based on header
    const header = rows[0];
    const isNewFormat = header.length <= 12;
    const dataRows = rows.slice(1).filter(row => {
      const minColumns = isNewFormat ? 9 : 15;
      return row.length >= minColumns;
    });

    const total = dataRows.length;
    db.updateJobProgress(jobId, 0, total);
    console.log(`[CSV Import] Processing ${total} rows (format: ${isNewFormat ? 'new 12-col' : 'old 17-col'})`);

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < dataRows.length; i++) {
      // Check for cancellation
      if (jobState.cancelled) {
        console.log(`[CSV Import] Job ${jobId} cancelled at row ${i}`);
        db.cancelJob(jobId);
        activeJobs.delete(jobId);
        return;
      }

      const row = dataRows[i];

      try {
        const parsed = parseRow(row, isNewFormat);
        if (!parsed) {
          skipped++;
          continue;
        }

        // Check for duplicate
        const isDuplicate = checkDuplicate(parsed);
        if (isDuplicate) {
          skipped++;
          continue;
        }

        // Save transaction
        const transaction: StoredTransaction = {
          id: crypto.randomUUID(),
          date: parsed.date.toISOString(),
          description: parsed.description,
          amount: parsed.amount,
          beneficiary: parsed.beneficiary,
          category: parsed.category,
          timestamp: new Date().toISOString(),
          source: {
            connectorType: 'csv',
            importedAt: new Date().toISOString()
          }
        };

        db.insertTransaction(transaction);
        imported++;

      } catch (error: any) {
        errors++;
        db.addJobError(jobId, `Row ${i + 2}: ${error.message}`);
      }

      // Update progress every 10 rows or on last row
      if (i % 10 === 0 || i === dataRows.length - 1) {
        db.updateJobProgress(jobId, i + 1, total);
      }

      // Small delay to prevent blocking (allows other operations)
      if (i % 100 === 0) {
        await sleep(1);
      }
    }

    // Clean up temp file
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.warn(`[CSV Import] Could not delete temp file: ${filePath}`);
    }

    // Complete the job
    db.completeJob(jobId, {
      imported,
      skipped,
      errors,
      total
    });

    console.log(`[CSV Import] Job ${jobId} completed: ${imported} imported, ${skipped} skipped, ${errors} errors`);

  } catch (error: any) {
    console.error(`[CSV Import] Job ${jobId} failed:`, error);
    db.failJob(jobId, error.message);
  } finally {
    activeJobs.delete(jobId);
  }
}

function parseRow(row: string[], isNewFormat: boolean): ParsedRow | null {
  const beneficiaryIdx = isNewFormat ? 5 : 11;
  const amountIdx = isNewFormat ? 8 : 14;
  const categoryIdx = isNewFormat ? 11 : -1;

  const dateStr = row[1];
  const postingText = row[3];
  const purpose = row[4];
  const beneficiary = row[beneficiaryIdx] || '';
  const amountStr = row[amountIdx];
  const bankCategory = categoryIdx >= 0 && row[categoryIdx] ? row[categoryIdx] : '';

  // Parse date (German format DD.MM.YY)
  const date = parseGermanDate(dateStr);
  if (!date) return null;

  // Parse amount (German format with comma)
  const amount = parseAmount(amountStr);
  if (amount === null) return null;

  // Build description
  const description = extractDescription(postingText, purpose, beneficiary);
  if (!description) return null;

  return {
    date,
    description,
    amount,
    beneficiary,
    category: bankCategory
  };
}

function parseGermanDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    const parts = dateStr.split('.');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts.map(num => parseInt(num));
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    return new Date(2000 + year, month - 1, day);
  } catch {
    return null;
  }
}

function parseAmount(amountStr: string): number | null {
  if (!amountStr) return null;
  try {
    const cleaned = amountStr.replace(/\./g, '').replace(',', '.');
    const amount = parseFloat(cleaned);
    return isNaN(amount) ? null : amount;
  } catch {
    return null;
  }
}

function extractDescription(postingText: string, purpose: string, beneficiary: string): string {
  const cleanPurpose = purpose.replace(/\d+\/?\.?\s?/, '').trim();
  const parts = [cleanPurpose, beneficiary, postingText]
    .filter(part => part && part.trim().length > 0)
    .map(part => part.trim());
  return parts.join(' - ');
}

function checkDuplicate(parsed: ParsedRow): boolean {
  // Check if a transaction with same date, amount, and description exists
  const transactions = db.getAllTransactions();
  const dateStr = parsed.date.toISOString().split('T')[0];

  return transactions.some(tx => {
    const txDateStr = new Date(tx.date).toISOString().split('T')[0];
    return txDateStr === dateStr &&
           Math.abs(tx.amount - parsed.amount) < 0.01 &&
           tx.description.includes(parsed.description.substring(0, 30));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
