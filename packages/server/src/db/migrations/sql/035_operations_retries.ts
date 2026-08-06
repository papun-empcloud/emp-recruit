import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("recruitment_automation_runs"))) return;
  if (!(await knex.schema.hasColumn("recruitment_automation_runs", "attempts"))) {
    await knex.schema.alterTable("recruitment_automation_runs", (table) => table.integer("attempts").notNullable().defaultTo(0));
  }
  if (!(await knex.schema.hasColumn("recruitment_automation_runs", "max_attempts"))) {
    await knex.schema.alterTable("recruitment_automation_runs", (table) => table.integer("max_attempts").notNullable().defaultTo(3));
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("recruitment_automation_runs"))) return;
  if (await knex.schema.hasColumn("recruitment_automation_runs", "max_attempts")) await knex.schema.alterTable("recruitment_automation_runs", (table) => table.dropColumn("max_attempts"));
  if (await knex.schema.hasColumn("recruitment_automation_runs", "attempts")) await knex.schema.alterTable("recruitment_automation_runs", (table) => table.dropColumn("attempts"));
}
