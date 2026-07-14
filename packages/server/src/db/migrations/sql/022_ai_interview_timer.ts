// ============================================================================
// MIGRATION 022 — AI interview: per-question time limit
// ============================================================================
// Recruiters can optionally set a countdown per question. NULL = no limit;
// otherwise the candidate's answer auto-submits when the timer reaches zero.
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("ai_interviews", "seconds_per_question");
  if (!has) {
    await knex.schema.alterTable("ai_interviews", (t) => {
      t.integer("seconds_per_question").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("ai_interviews", "seconds_per_question");
  if (has) {
    await knex.schema.alterTable("ai_interviews", (t) => {
      t.dropColumn("seconds_per_question");
    });
  }
}
