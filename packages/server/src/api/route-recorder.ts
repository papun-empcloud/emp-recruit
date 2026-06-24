// =============================================================================
// EMP RECRUIT — Route auto-discovery for the OpenAPI / Swagger docs
//
// Express 5 stores mount paths inside compiled path-to-regexp matchers, so a
// router-stack walk (and express-list-endpoints) can't recover full URLs.
// Instead we intercept `.use(prefix, router)` to capture each mount prefix,
// then walk the mounted router's stack for its route layers. Recruit mounts
// every API route on a single `v1` router (`v1.use('/auth', …)`) mounted at
// /api/v1, so call recordMounts on BOTH the app and that v1 router (basePrefix
// "/api/v1") to capture the full tree.
// =============================================================================
import type { Express, Router } from "express";

type Mount = { prefix: string; router: any };
const mounts: Mount[] = [];

/**
 * Wrap target.use so router mounts (a string prefix + an Express Router) are
 * recorded. Call before the target's `.use(prefix, router)` calls. basePrefix
 * is prepended (e.g. "/api/v1" for the v1 aggregator router).
 */
export function recordMounts(target: Express | Router, basePrefix = ""): void {
  const t = target as any;
  const origUse = t.use.bind(t);
  t.use = function (...args: any[]) {
    if (typeof args[0] === "string" && args.length >= 2) {
      const handler = args[args.length - 1];
      if (handler && Array.isArray(handler.stack)) {
        mounts.push({ prefix: basePrefix + args[0], router: handler });
      }
    }
    return origUse(...args);
  };
}

/** Discovered { path, methods } for every mounted route (`:param` → `{param}`). */
export function discoveredPaths(): { path: string; methods: string[] }[] {
  const out: { path: string; methods: string[] }[] = [];
  for (const { prefix, router } of mounts) {
    for (const layer of router.stack || []) {
      const route = (layer as any).route;
      if (!route) continue;
      const rel: string = route.path || "";
      let full = `${prefix}${rel}`;
      if (full.length > 1) full = full.replace(/\/+$/, "");
      const oapi = full.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
      const methods = Object.keys(route.methods || {})
        .filter((m) => m !== "_all")
        .map((m) => m.toLowerCase());
      if (methods.length) out.push({ path: oapi, methods });
    }
  }
  return out;
}
