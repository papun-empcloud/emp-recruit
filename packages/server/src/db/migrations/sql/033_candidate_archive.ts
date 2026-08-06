import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn("candidates", "archived_at"))) {
    await knex.schema.alterTable("candidates", (table) => {
      table.timestamp("archived_at").nullable();
      table.bigInteger("archived_by").unsigned().nullable();
      table.index(["organization_id", "archived_at"], "candidates_org_archive_idx");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn("candidates", "archived_at")) {
    await knex.schema.alterTable("candidates", (table) => {
      table.dropIndex(["organization_id", "archived_at"], "candidates_org_archive_idx");
      table.dropColumns("archived_at", "archived_by");
    });
  }
}
