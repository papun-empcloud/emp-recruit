// ============================================================================
// Safe ORDER BY helper
// ============================================================================
// Several list endpoints build `ORDER BY ${sort} ${order}` from request params.
// `order` is enum-validated upstream, but `sort` is a free-form string, so
// interpolating it raw is a SQL-injection sink. This helper reduces any caller
// input to an allowlisted column name + a normalized direction, so the value
// interpolated into SQL is never attacker-controlled.
// ============================================================================

export interface SafeOrderBy {
  /** An allowlisted column name — safe to backtick-quote into SQL. */
  column: string;
  /** Normalized direction. */
  direction: "ASC" | "DESC";
}

export function safeOrderBy(
  sort: string | undefined | null,
  order: string | undefined | null,
  allowed: readonly string[],
  defaultColumn: string,
): SafeOrderBy {
  const column = sort && allowed.includes(sort) ? sort : defaultColumn;
  const direction = (order ?? "desc").toString().toLowerCase() === "asc" ? "ASC" : "DESC";
  return { column, direction };
}
