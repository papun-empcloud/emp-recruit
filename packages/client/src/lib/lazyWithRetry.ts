import { lazy, type ComponentType } from "react";

/**
 * Like React.lazy, but retries the dynamic import a few times before giving up.
 *
 * A lazy chunk import can fail transiently — a network blip, or (most commonly)
 * a stale chunk hash after a new deploy while the user still has the old app
 * loaded. Without a retry these failures surface as a blank page. We retry with
 * a short backoff; if it still fails the error propagates to the ErrorBoundary,
 * which offers a hard reload (fetching the fresh chunk manifest).
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 2,
  delayMs = 400,
) {
  return lazy(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await factory();
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
        }
      }
    }
    throw lastErr;
  });
}
