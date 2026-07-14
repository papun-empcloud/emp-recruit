// ============================================================================
// MIGRATION 019 — AI voice interviews
// ============================================================================
// A self-contained AI interviewer: for a given application it generates a set
// of resume-tailored questions, the candidate answers them (voice or text via a
// public token link), and an LLM (with a deterministic fallback) produces a
// scored evaluation. Questions are stored on the session; each Q&A turn is a
// message row so the transcript can be replayed and evaluated.
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasSessions = await knex.schema.hasTable("ai_interviews");
  if (!hasSessions) {
    await knex.schema.createTable("ai_interviews", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.uuid("application_id").notNullable().references("id").inTable("applications").onDelete("CASCADE");
      t.uuid("candidate_id").notNullable();
      t.uuid("job_id").nullable();
      t.string("token", 64).notNullable().unique(); // candidate access link
      t.string("status", 20).notNullable().defaultTo("pending"); // pending | in_progress | completed
      t.json("questions").nullable(); // [{ id, text }]
      t.integer("current_index").notNullable().defaultTo(0);
      t.integer("overall_score").nullable(); // 0-100
      t.string("recommendation", 20).nullable();
      t.text("strengths").nullable();
      t.text("concerns").nullable();
      t.text("summary").nullable();
      t.string("provider", 20).nullable(); // llm key or "heuristic"
      t.string("model", 100).nullable();
      t.timestamp("started_at").nullable();
      t.timestamp("completed_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["organization_id", "status"]);
      t.index(["application_id"]);
    });
  }

  const hasMessages = await knex.schema.hasTable("ai_interview_messages");
  if (!hasMessages) {
    await knex.schema.createTable("ai_interview_messages", (t) => {
      t.uuid("id").primary();
      t.uuid("ai_interview_id").notNullable().references("id").inTable("ai_interviews").onDelete("CASCADE");
      t.string("role", 12).notNullable(); // ai | candidate
      t.integer("question_index").nullable();
      t.text("content").notNullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());

      t.index(["ai_interview_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ai_interview_messages");
  await knex.schema.dropTableIfExists("ai_interviews");
}
