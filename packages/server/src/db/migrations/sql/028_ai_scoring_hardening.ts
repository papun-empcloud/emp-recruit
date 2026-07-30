// ============================================================================
// MIGRATION 028 — AI scoring hardening
// ============================================================================
// Records HOW a candidate score was produced (genuine AI evaluation vs the
// deterministic rule-based fallback) and which model was used, so the UI can be
// honest about the source. Also enforces one score row per application so a
// retry / concurrent re-score can't create duplicate rows.
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasMethod = await knex.schema.hasColumn("candidate_scores", "scoring_method");
  if (!hasMethod) {
    await knex.schema.alterTable("candidate_scores", (t) => {
      // "ai" = a configured LLM produced the score; "heuristic" = rule-based.
      t.string("scoring_method", 20).notNullable().defaultTo("heuristic");
      // The model used for an AI score (e.g. "claude-opus-4-8"); null for heuristic.
      t.string("scoring_model", 100).nullable();
    });
  }

  // Collapse any pre-existing duplicate score rows for the same application
  // (keep the most recent) before enforcing uniqueness.
  await knex.raw(`
    DELETE cs1 FROM candidate_scores cs1
    JOIN candidate_scores cs2
      ON cs1.application_id = cs2.application_id
     AND (cs1.scored_at < cs2.scored_at
          OR (cs1.scored_at = cs2.scored_at AND cs1.id > cs2.id))
  `);

  await knex.schema.alterTable("candidate_scores", (t) => {
    t.unique(["application_id"], { indexName: "candidate_scores_application_unique" });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("candidate_scores", (t) => {
    t.dropUnique(["application_id"], "candidate_scores_application_unique");
    t.dropColumn("scoring_method");
    t.dropColumn("scoring_model");
  });
}
