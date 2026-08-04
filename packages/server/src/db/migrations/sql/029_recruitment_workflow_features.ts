// ============================================================================
// MIGRATION 029 — recruitment workflow features (screening / knockout questions)
// ============================================================================
// Lets recruiters attach job-specific screening questions to a job posting.
// Candidates answer them when applying; a "knockout" question can flag an
// application for auto-rejection when answered with the disqualifying value.
//   - job_screening_questions:      the questions configured on a job
//   - application_screening_answers: a candidate's answers for one application
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasQuestions = await knex.schema.hasTable("job_screening_questions");
  if (!hasQuestions) {
    await knex.schema.createTable("job_screening_questions", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.uuid("job_id").notNullable().references("id").inTable("job_postings").onDelete("CASCADE");
      t.string("question", 500).notNullable();
      // text | number | yes_no | single_choice
      t.string("type", 20).notNullable().defaultTo("text");
      t.json("options").nullable(); // choices for single_choice
      t.boolean("required").notNullable().defaultTo(true);
      // When true, answering with knockout_value flags the application for rejection.
      t.boolean("is_knockout").notNullable().defaultTo(false);
      t.string("knockout_value", 255).nullable();
      t.integer("sort_order").notNullable().defaultTo(0);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["organization_id", "job_id"]);
    });
  }

  const hasAnswers = await knex.schema.hasTable("application_screening_answers");
  if (!hasAnswers) {
    await knex.schema.createTable("application_screening_answers", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.uuid("application_id").notNullable().references("id").inTable("applications").onDelete("CASCADE");
      t.uuid("question_id").notNullable();
      // Snapshot the question text so an answer stays readable even if the
      // question is later edited or deleted.
      t.string("question_text", 500).notNullable();
      t.text("answer").nullable();
      t.boolean("knockout_failed").notNullable().defaultTo(false);
      t.timestamp("created_at").defaultTo(knex.fn.now());

      t.unique(["application_id", "question_id"], {
        indexName: "app_screening_answers_app_question_uniq",
      });
      t.index(["organization_id", "application_id"], "app_screening_answers_org_app_idx");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("application_screening_answers");
  await knex.schema.dropTableIfExists("job_screening_questions");
}
