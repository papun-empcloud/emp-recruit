// ============================================================================
// MIGRATION 014 — External job board publishing
// ============================================================================
// job_board_configs   — per-org, per-board settings + credentials (LinkedIn,
//                        Indeed, Naukri). Secrets stored in `config` JSON;
//                        encrypt at rest in production.
// job_board_postings  — status of each job on each board (the audit trail for
//                        auto-publish). One row per (job, board).
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasConfigs = await knex.schema.hasTable("job_board_configs");
  if (!hasConfigs) {
    await knex.schema.createTable("job_board_configs", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.string("board", 20).notNullable(); // linkedin | indeed | naukri
      t.boolean("enabled").notNullable().defaultTo(true);
      t.boolean("auto_publish").notNullable().defaultTo(true);
      t.json("config").nullable(); // endpoint / token / company id / etc.
      t.string("status", 20).notNullable().defaultTo("not_configured");
      t.string("last_error", 500).nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.unique(["organization_id", "board"]);
    });
  }

  const hasPostings = await knex.schema.hasTable("job_board_postings");
  if (!hasPostings) {
    await knex.schema.createTable("job_board_postings", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.uuid("job_id").notNullable().references("id").inTable("job_postings").onDelete("CASCADE");
      t.string("board", 20).notNullable();
      // pending | posted | feed | failed | removed | skipped
      t.string("status", 20).notNullable().defaultTo("pending");
      t.string("external_id", 255).nullable();
      t.string("external_url", 500).nullable();
      t.string("error", 500).nullable();
      t.timestamp("posted_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.unique(["job_id", "board"]);
      t.index(["organization_id", "job_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("job_board_postings");
  await knex.schema.dropTableIfExists("job_board_configs");
}
