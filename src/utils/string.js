/**
 * String utilities for search and normalization.
 */

/**
 * Normalize for search: lowercase, strip accents (NFD decomposition).
 */
export function normalizeForSearch(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
