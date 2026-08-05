// ============================================================================
// MIGRATION 031 — hiring team & recruitment tasks
// ============================================================================
//   - job_hiring_team    : people assigned to a job with a role
//     (recruiter / hiring_manager / interviewer / coordinator)
//   - recruitment_tasks  : lightweight to-dos attached to a job (optionally an
//     application), with an assignee, due date and status
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasTeam = await knex.schema.hasTable("job_hiring_team");
  if (!hasTeam) {
    await knex.schema.createTable("job_hiring_team", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.uuid("job_id").notNullable().references("id").inTable("job_postings").onDelete("CASCADE");
      // EmpCloud user id (no FK — users live in the master DB).
      t.bigInteger("user_id").unsigned().notNullable();
      // recruiter | hiring_manager | interviewer | coordinator
      t.string("role", 30).notNullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());

      // One membership row per user per job.
      t.unique(["job_id", "user_id"], { indexName: "job_hiring_team_job_user_uniq" });
      t.index(["organization_id", "job_id"], "job_hiring_team_org_job_idx");
    });
  }

  const hasTasks = await knex.schema.hasTable("recruitment_tasks");
  if (!hasTasks) {
    await knex.schema.createTable("recruitment_tasks", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.uuid("job_id").nullable().references("id").inTable("job_postings").onDelete("CASCADE");
      t.uuid("application_id").nullable().references("id").inTable("applications").onDelete("CASCADE");
      t.string("title", 300).notNullable();
      t.string("description", 2000).nullable();
      // Assignee / creator (EmpCloud user ids).
      t.bigInteger("assigned_to").unsigned().nullable();
      t.date("due_date").nullable();
      // todo | in_progress | done
      t.string("status", 20).notNullable().defaultTo("todo");
      t.bigInteger("created_by").unsigned().nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["organization_id", "job_id"], "recruitment_tasks_org_job_idx");
      t.index(["organization_id", "assigned_to"], "recruitment_tasks_org_asgn_idx");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("recruitment_tasks");
  await knex.schema.dropTableIfExists("job_hiring_team");
}
