// ============================================================================
// MIGRATION 020 — AI interview voice (Retell) fields
// ============================================================================
// For the FoloUp-style real-time voice interview: link an AI-interview session
// to the Retell web call that conducted it and store the resulting transcript.
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("ai_interviews", "retell_call_id");
  if (!has) {
    await knex.schema.alterTable("ai_interviews", (t) => {
      t.string("retell_call_id", 128).nullable();
      t.text("voice_transcript").nullable();
      t.index(["retell_call_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("ai_interviews", "retell_call_id");
  if (has) {
    await knex.schema.alterTable("ai_interviews", (t) => {
      t.dropColumn("retell_call_id");
      t.dropColumn("voice_transcript");
    });
  }
}
