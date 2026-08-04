// ============================================================================
// MIGRATION 030 — application workflow (assignment, SLA, activity feed)
// ============================================================================
//   - applications.assigned_to  : the responsible recruiter (EmpCloud user id)
//   - applications.sla_due_date : target date to action the application
//   - application_activity       : a unified per-application activity feed
//     (created / stage_change / note / assigned / sla_set / …)
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasAssigned = await knex.schema.hasColumn("applications", "assigned_to");
  if (!hasAssigned) {
    await knex.schema.alterTable("applications", (t) => {
      t.bigInteger("assigned_to").unsigned().nullable();
      t.date("sla_due_date").nullable();
      t.index(["organization_id", "assigned_to"], "applications_org_assigned_idx");
    });
  }

  const hasActivity = await knex.schema.hasTable("application_activity");
  if (!hasActivity) {
    await knex.schema.createTable("application_activity", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.uuid("application_id").notNullable().references("id").inTable("applications").onDelete("CASCADE");
      // Who did it (EmpCloud user id); null for system/public events.
      t.bigInteger("actor_id").unsigned().nullable();
      // created | stage_change | note | assigned | sla_set | screening
      t.string("type", 30).notNullable();
      t.string("message", 500).notNullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());

      t.index(["organization_id", "application_id"], "application_activity_org_app_idx");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("application_activity");
  const hasAssigned = await knex.schema.hasColumn("applications", "assigned_to");
  if (hasAssigned) {
    await knex.schema.alterTable("applications", (t) => {
      t.dropIndex(["organization_id", "assigned_to"], "applications_org_assigned_idx");
      t.dropColumn("assigned_to");
      t.dropColumn("sla_due_date");
    });
  }
}
