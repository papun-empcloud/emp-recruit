// ============================================================================
// MIGRATION 018 — Add summary (HR notes) to interviews
// ============================================================================
// HR notes were stored on the transcript row, so they couldn't be added until a
// transcript existed — and would be wiped when a recording was (re)transcribed.
// Move them onto the interview so they're independent of the transcript. Backfill
// any existing transcript summaries so nothing is lost.
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("interviews", "summary");
  if (!hasColumn) {
    await knex.schema.alterTable("interviews", (t) => {
      t.text("summary").nullable();
    });
  }

  // Carry over any HR notes previously stored on the transcript.
  const hasTranscripts = await knex.schema.hasTable("interview_transcripts");
  if (hasTranscripts) {
    await knex.raw(`
      UPDATE interviews i
      JOIN interview_transcripts t ON t.interview_id = i.id
      SET i.summary = t.summary
      WHERE t.summary IS NOT NULL AND t.summary <> ''
        AND (i.summary IS NULL OR i.summary = '')
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("interviews", "summary");
  if (hasColumn) {
    await knex.schema.alterTable("interviews", (t) => {
      t.dropColumn("summary");
    });
  }
}
