/**
 * Shared Category Constants
 *
 * Constants related to categories used by both frontend and backend.
 */

/**
 * Categories that should not be created or used
 * These are too generic or represent uncategorized state
 */
export const FORBIDDEN_CATEGORIES = [
  'online shopping',
  'new category',
  'uncategorized',
  'other',
  'misc',
  'miscellaneous',
  'general',
  'shopping',
  'unknown',
  'none',
  'n/a',
  'not applicable'
];

/**
 * Check if a category name is forbidden
 */
export function isForbiddenCategory(name: string): boolean {
  const normalized = name.toLowerCase().trim();
  return FORBIDDEN_CATEGORIES.includes(normalized);
}

/**
 * Default category for uncategorized transactions
 */
export const DEFAULT_UNCATEGORIZED = 'Uncategorized';

/**
 * Default colors for new categories (when none specified)
 */
export const DEFAULT_CATEGORY_COLORS = [
  '#4CAF50', // Green
  '#2196F3', // Blue
  '#FF9800', // Orange
  '#9C27B0', // Purple
  '#F44336', // Red
  '#00BCD4', // Cyan
  '#795548', // Brown
  '#607D8B', // Blue Grey
  '#E91E63', // Pink
  '#3F51B5', // Indigo
];

/**
 * Get a random default color for a new category
 */
export function getRandomCategoryColor(): string {
  const index = Math.floor(Math.random() * DEFAULT_CATEGORY_COLORS.length);
  return DEFAULT_CATEGORY_COLORS[index];
}
