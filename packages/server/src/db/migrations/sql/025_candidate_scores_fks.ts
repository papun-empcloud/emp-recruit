// ============================================================================
// Foreign keys for candidate_scores.candidate_id / job_id (audit L4).
//
// Migration 003 created candidate_scores with a FK only on application_id;
// candidate_id and job_id were left unconstrained, so a score row could point
// at a candidate/job that no longer exists. These FKs (ON DELETE CASCADE, to
// match application_id) make the references authoritative.
//
// Safety: an existing database may already hold orphan rows (a score whose
// candidate/job was deleted before this constraint). Adding a FK then fails —
// and migrations run on startup, which would take the server down. So each FK
// is added ONLY when there are no orphans for that column; otherwise it is
// skipped with a warning so an operator can clean up and re-run. No data is
// ever deleted. The referenced columns are already indexed (migration 003).
// ============================================================================

import type { Knex } from "knex";

const FKS: Array<{ column: string; refTable: string; name: string }> = [
  { column: "candidate_id", refTable: "candidates", name: "fk_candidate_scores_candidate" },
  { column: "job_id", refTable: "job_postings", name: "fk_candidate_scores_job" },
];

async function fkExists(knex: Knex, name: string): Promise<boolean> {
  const res: any = await knex.raw(
    `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND TABLE_NAME = 'candidate_scores'
       AND CONSTRAINT_NAME = ?
       AND CONSTRAINT_TYPE = 'FOREIGN KEY' LIMIT 1`,
    [name],
  );
  return (res[0] as any[]).length > 0;
}

async function hasOrphans(knex: Knex, column: string, refTable: string): Promise<boolean> {
  const res: any = await knex.raw(
    `SELECT 1 FROM candidate_scores cs
       LEFT JOIN ?? r ON r.id = cs.??
      WHERE cs.?? IS NOT NULL AND r.id IS NULL LIMIT 1`,
    [refTable, column, column],
  );
  return (res[0] as any[]).length > 0;
}

export async function up(knex: Knex): Promise<void> {
  for (const fk of FKS) {
    if (await fkExists(knex, fk.name)) continue;
    if (await hasOrphans(knex, fk.column, fk.refTable)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[migration 025] Skipping FK ${fk.name}: candidate_scores.${fk.column} has rows with no matching ${fk.refTable}. Clean up those orphans and re-run to enforce the constraint.`,
      );
      continue;
    }
    await knex.schema.alterTable("candidate_scores", (t) => {
      t.foreign(fk.column, fk.name).references("id").inTable(fk.refTable).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const fk of FKS) {
    if (await fkExists(knex, fk.name)) {
      await knex.schema.alterTable("candidate_scores", (t) => {
        t.dropForeign(fk.column, fk.name);
      });
    }
  }
}
