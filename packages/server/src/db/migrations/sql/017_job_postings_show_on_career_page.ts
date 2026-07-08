// ============================================================================
// MIGRATION 017 — Add show_on_career_page to job_postings
// ============================================================================
// Lets HR curate which open jobs appear on the public career page. Default true
// preserves the existing behavior (every open, non-internal job is listed).
// Internal jobs are still hidden regardless of this flag.
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("job_postings", "show_on_career_page");
  if (!hasColumn) {
    await knex.schema.alterTable("job_postings", (t) => {
      t.boolean("show_on_career_page").notNullable().defaultTo(true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("job_postings", "show_on_career_page");
  if (hasColumn) {
    await knex.schema.alterTable("job_postings", (t) => {
      t.dropColumn("show_on_career_page");
    });
  }
}
