/**
 * Utils Index
 *
 * Re-exports all utility functions for convenient importing.
 */

export {
  extractAmazonOrderNumber,
  generateDuplicateKey,
  scoreTx,
  findDuplicateGroups,
  identifyDuplicatesToRemove,
  isDuplicate,
  buildDuplicateLookupSets
} from './duplicate-detector';

export type { DuplicateGroup } from './duplicate-detector';
