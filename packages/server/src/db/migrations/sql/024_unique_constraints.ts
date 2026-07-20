// ============================================================================
// Unique constraints to close the check-then-insert races (audit H10).
//
// The app enforced "one candidate per email", "one application per candidate+job",
// "unique job slug" and "one feedback per panelist" only in application code, so
// concurrent requests could still create duplicates. These DB-level unique
// indexes make the invariants authoritative.
//
// Safety: an existing database may already contain duplicates (created before
// this constraint). Adding a unique index to such a table fails — and because
// migrations run on startup, that would take the server down. So each index is
// added ONLY when its key is currently duplicate-free; otherwise it is skipped
// with a warning so an operator can dedup and re-run. No data is ever deleted.
// ============================================================================

import type { Knex } from "knex";

const CONSTRAINTS: Array<{ table: string; columns: string[]; name: string }> = [
  { table: "candidates", columns: ["organization_id", "email"], name: "uq_candidates_org_email" },
  { table: "applications", columns: ["organization_id", "job_id", "candidate_id"], name: "uq_applications_org_job_cand" },
  { table: "job_postings", columns: ["organization_id", "slug"], name: "uq_job_postings_org_slug" },
  { table: "interview_feedback", columns: ["interview_id", "panelist_id"], name: "uq_interview_feedback_iv_pan" },
];

async function indexExists(knex: Knex, table: string, name: string): Promise<boolean> {
  const res: any = await knex.raw("SHOW INDEX FROM ?? WHERE Key_name = ?", [table, name]);
  return (res[0] as any[]).length > 0;
}

async function hasDuplicates(knex: Knex, table: string, columns: string[]): Promise<boolean> {
  const rows = await knex(table).select(columns).groupBy(columns).havingRaw("COUNT(*) > 1").limit(1);
  return rows.length > 0;
}

export async function up(knex: Knex): Promise<void> {
  for (const c of CONSTRAINTS) {
    if (await indexExists(knex, c.table, c.name)) continue;
    if (await hasDuplicates(knex, c.table, c.columns)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[migration 024] Skipping unique index ${c.name}: ${c.table}(${c.columns.join(",")}) has duplicates. Dedup those rows and re-run to enforce the constraint.`,
      );
      continue;
    }
    await knex.schema.alterTable(c.table, (t) => t.unique(c.columns, { indexName: c.name }));
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const c of CONSTRAINTS) {
    if (await indexExists(knex, c.table, c.name)) {
      await knex.raw("ALTER TABLE ?? DROP INDEX ??", [c.table, c.name]);
    }
  }
}
