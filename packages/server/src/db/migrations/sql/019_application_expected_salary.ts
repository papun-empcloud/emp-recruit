// ============================================================================
// MIGRATION 019 — applications.expected_salary
// ============================================================================
// The public apply form collected "Expected Salary" but it was never stored,
// so recruiters couldn't see it. Persist it on the application. (BUG-04)
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("applications", "expected_salary");
  if (!has) {
    await knex.schema.alterTable("applications", (t) => {
      t.integer("expected_salary").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("applications", "expected_salary");
  if (has) {
    await knex.schema.alterTable("applications", (t) => {
      t.dropColumn("expected_salary");
    });
  }
}
