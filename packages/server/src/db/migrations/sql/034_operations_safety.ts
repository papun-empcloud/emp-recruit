import type { Knex } from "knex";
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("recruitment_automation_rules")) {
    if (!(await knex.schema.hasColumn("recruitment_automation_rules", "archived_at"))) await knex.schema.alterTable("recruitment_automation_rules", (t) => t.timestamp("archived_at").nullable());
  }
  if (await knex.schema.hasTable("recruitment_automation_runs")) {
    if (!(await knex.schema.hasColumn("recruitment_automation_runs", "processing_at"))) await knex.schema.alterTable("recruitment_automation_runs", (t) => t.timestamp("processing_at").nullable());
  }
}
export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("recruitment_automation_runs") && await knex.schema.hasColumn("recruitment_automation_runs", "processing_at")) await knex.schema.alterTable("recruitment_automation_runs", (t) => t.dropColumn("processing_at"));
  if (await knex.schema.hasTable("recruitment_automation_rules") && await knex.schema.hasColumn("recruitment_automation_rules", "archived_at")) await knex.schema.alterTable("recruitment_automation_rules", (t) => t.dropColumn("archived_at"));
}
