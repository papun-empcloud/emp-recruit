// ============================================================================
// Pagination param parsing
// ============================================================================
// Several list routes read page/limit straight from the query with
// `Number(...)` and no upper bound, so `?limit=1000000` forces huge result sets
// (DoS) and `Number("abc")` yields NaN. These helpers clamp to safe ranges.
// ============================================================================

/** Parse a 1-based page number (defaults to 1 for absent/invalid input). */
export function parsePage(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Parse a page size, clamped to [1, max] (defaults to `def` for absent/invalid). */
export function parseLimit(v: unknown, def = 20, max = 100): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(Math.floor(n), max);
}
