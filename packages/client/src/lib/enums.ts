import type { TFunction } from "i18next";

/** Turn a raw enum value like "full_time" into "Full Time" as a last resort. */
export function humanizeEnum(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Translate a server enum value (job status, stage, employment type, source,
 * etc.) via the shared `enums.<group>.<value>` catalog. Unknown values fall
 * back to a humanized English label so nothing ever renders a raw key or an
 * ugly snake_case token.
 */
export function enumLabel(
  t: TFunction,
  group: string,
  value: string | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "";
  return t(`enums.${group}.${value}`, { defaultValue: humanizeEnum(String(value)) });
}
