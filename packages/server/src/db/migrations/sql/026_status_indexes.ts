// ============================================================================
// Composite indexes for status-filtered list queries (audit L5).
//
// `interviews` and `offers` are listed filtered by (organization_id, status)
// but only carried a single-column organization_id index, so those filters did
// a range scan per org. Adding the composite index keeps status-filtered lists
// (and their COUNTs) cheap and removes a DoS-amplification vector.
//
// Adding an index is non-destructive; each is created only when absent so the
// startup migration is idempotent and never errors on a re-run.
// ============================================================================

import type { Knex } from "knex";

const INDEXES: Array<{ table: string; columns: string[]; name: string }> = [
  { table: "interviews", columns: ["organization_id", "status"], name: "idx_interviews_org_status" },
  { table: "offers", columns: ["organization_id", "status"], name: "idx_offers_org_status" },
];

async function indexExists(knex: Knex, table: string, name: string): Promise<boolean> {
  const res: any = await knex.raw("SHOW INDEX FROM ?? WHERE Key_name = ?", [table, name]);
  return (res[0] as any[]).length > 0;
}

export async function up(knex: Knex): Promise<void> {
  for (const idx of INDEXES) {
    if (await indexExists(knex, idx.table, idx.name)) continue;
    await knex.schema.alterTable(idx.table, (t) => t.index(idx.columns, idx.name));
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const idx of INDEXES) {
    if (await indexExists(knex, idx.table, idx.name)) {
      await knex.schema.alterTable(idx.table, (t) => t.dropIndex(idx.columns, idx.name));
    }
  }
}
