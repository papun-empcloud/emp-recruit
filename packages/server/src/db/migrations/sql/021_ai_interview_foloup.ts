// ============================================================================
// MIGRATION 021 — AI interview: objective, question count, recording, comms score
// ============================================================================
// FoloUp-style flow: HR sets an objective + question count, the AI generates the
// questions, HR approves them, then the candidate takes a recorded voice
// interview that's scored on hiring fit and communication.
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("ai_interviews", "objective");
  if (!has) {
    await knex.schema.alterTable("ai_interviews", (t) => {
      t.text("objective").nullable();
      t.integer("question_count").notNullable().defaultTo(5);
      t.string("recording_url", 512).nullable();
      t.integer("communication_score").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("ai_interviews", "objective");
  if (has) {
    await knex.schema.alterTable("ai_interviews", (t) => {
      t.dropColumn("objective");
      t.dropColumn("question_count");
      t.dropColumn("recording_url");
      t.dropColumn("communication_score");
    });
  }
}
