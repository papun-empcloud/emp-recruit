// ============================================================================
// MIGRATION 023 — reconcile hired stage with accepted offers
// ============================================================================
// Accepting an offer marks the candidate as hired (offer.service.acceptOffer
// sets the application stage to 'hired'). Offers accepted before that sync
// existed left the application at an earlier stage, so the "hired" count
// (Dashboard / Analytics / pipeline funnel) under-reported versus the number of
// accepted offers. Backfill the invariant: any application with an accepted
// offer is 'hired'.
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const appIds: string[] = await knex("offers").where({ status: "accepted" }).pluck("application_id");
  const targets = appIds.filter(Boolean);
  if (targets.length === 0) return;
  await knex("applications").whereIn("id", targets).andWhereNot("stage", "hired").update({ stage: "hired" });
}

export async function down(): Promise<void> {
  // Data backfill — not reversible.
}
