/**
 * Format a Date (default: now) as a MySQL DATETIME/TIMESTAMP literal:
 * "YYYY-MM-DD HH:MM:SS" in UTC.
 *
 * MySQL rejects ISO 8601 strings that carry a "T" separator and a "Z" timezone
 * suffix (e.g. "2026-06-23T03:01:26.880Z") with "Incorrect datetime value", so
 * `new Date().toISOString()` cannot be written directly to a datetime column.
 */
export function toMysqlDateTime(date: Date = new Date()): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
