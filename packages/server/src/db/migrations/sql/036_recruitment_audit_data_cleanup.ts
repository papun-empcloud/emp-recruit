import type { Knex } from "knex";

/** Normalize legacy rows that predate the current validation rules. */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("candidates")) {
    await knex("candidates").where("experience_years", ">", 50).update({ experience_years: null });
    await knex.raw(
      `UPDATE candidates
          SET current_company = TRIM(REGEXP_REPLACE(current_company, '<[^>]*>', ''))
        WHERE current_company REGEXP '<[^>]*>'`,
    );
  }

  if (await knex.schema.hasTable("referrals")) {
    await knex("referrals")
      .where({ status: "bonus_paid" })
      .where((q) => q.whereNull("bonus_amount").orWhere("bonus_amount", "<=", 0))
      .update({ status: "bonus_eligible", bonus_paid_at: null });
  }
}

// Cleanup is intentionally irreversible: restoring invalid legacy values would
// violate the application invariants introduced alongside this migration.
export async function down(): Promise<void> {}
