import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("application_form_fields"))) {
    await knex.schema.createTable("application_form_fields", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.uuid("job_id").nullable().references("id").inTable("job_postings").onDelete("CASCADE");
      t.string("label", 200).notNullable();
      t.string("field_key", 100).notNullable();
      t.string("field_type", 30).notNullable();
      t.json("options").nullable();
      t.boolean("required").notNullable().defaultTo(false);
      t.string("condition_field_key", 100).nullable();
      t.string("condition_value", 500).nullable();
      t.boolean("is_knockout").notNullable().defaultTo(false);
      t.string("knockout_value", 500).nullable();
      t.integer("sort_order").notNullable().defaultTo(0);
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamps(true, true);
      t.unique(["organization_id", "job_id", "field_key"], { indexName: "form_fields_org_job_key_uniq" });
      t.index(["organization_id", "job_id", "sort_order"], "form_fields_org_job_sort_idx");
    });
  }

  if (!(await knex.schema.hasTable("application_form_values"))) {
    await knex.schema.createTable("application_form_values", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.uuid("application_id").notNullable().references("id").inTable("applications").onDelete("CASCADE");
      t.uuid("field_id").notNullable().references("id").inTable("application_form_fields").onDelete("CASCADE");
      t.text("value").nullable();
      t.boolean("knockout_failed").notNullable().defaultTo(false);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.unique(["application_id", "field_id"], { indexName: "form_values_app_field_uniq" });
      t.index(["organization_id", "application_id"], "form_values_org_app_idx");
    });
  }

  if (!(await knex.schema.hasTable("recruitment_automation_rules"))) {
    await knex.schema.createTable("recruitment_automation_rules", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.string("name", 200).notNullable();
      t.string("trigger", 50).notNullable();
      t.string("trigger_value", 100).nullable();
      t.string("action_type", 50).notNullable();
      t.json("action_config").notNullable();
      t.integer("delay_minutes").notNullable().defaultTo(0);
      t.boolean("is_active").notNullable().defaultTo(true);
      t.bigInteger("created_by").unsigned().nullable();
      t.timestamps(true, true);
      t.index(["organization_id", "trigger", "trigger_value", "is_active"], "automation_rule_lookup_idx");
    });
  }

  if (!(await knex.schema.hasTable("recruitment_automation_runs"))) {
    await knex.schema.createTable("recruitment_automation_runs", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.uuid("rule_id").notNullable().references("id").inTable("recruitment_automation_rules").onDelete("CASCADE");
      t.uuid("application_id").nullable().references("id").inTable("applications").onDelete("CASCADE");
      t.string("event_key", 255).notNullable();
      t.string("status", 30).notNullable().defaultTo("pending");
      t.timestamp("scheduled_for").notNullable();
      t.timestamp("completed_at").nullable();
      t.text("error").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.unique(["rule_id", "event_key"], { indexName: "automation_run_rule_event_uniq" });
      t.index(["organization_id", "status", "scheduled_for"], "automation_run_queue_idx");
    });
  }

  if (!(await knex.schema.hasTable("recruiter_profiles"))) {
    await knex.schema.createTable("recruiter_profiles", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.bigInteger("user_id").unsigned().notNullable();
      t.string("function", 10).notNullable();
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamps(true, true);
      t.unique(["organization_id", "user_id"], { indexName: "recruiter_profile_org_user_uniq" });
    });
  }

  if (!(await knex.schema.hasTable("email_campaigns"))) {
    await knex.schema.createTable("email_campaigns", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.string("name", 200).notNullable();
      t.uuid("template_id").nullable().references("id").inTable("email_templates").onDelete("SET NULL");
      t.string("subject", 500).notNullable();
      t.text("body").notNullable();
      t.string("status", 30).notNullable().defaultTo("draft");
      t.timestamp("scheduled_for").nullable();
      t.bigInteger("created_by").unsigned().nullable();
      t.timestamps(true, true);
      t.index(["organization_id", "status", "scheduled_for"], "email_campaign_queue_idx");
    });
  }

  if (!(await knex.schema.hasTable("email_campaign_recipients"))) {
    await knex.schema.createTable("email_campaign_recipients", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.uuid("campaign_id").notNullable().references("id").inTable("email_campaigns").onDelete("CASCADE");
      t.uuid("candidate_id").notNullable().references("id").inTable("candidates").onDelete("CASCADE");
      t.string("email", 320).notNullable();
      t.string("status", 30).notNullable().defaultTo("pending");
      t.integer("attempts").notNullable().defaultTo(0);
      t.text("last_error").nullable();
      t.timestamp("sent_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.unique(["campaign_id", "candidate_id"], { indexName: "campaign_recipient_uniq" });
      t.index(["organization_id", "status"], "campaign_recipient_status_idx");
    });
  }

  if (!(await knex.schema.hasTable("candidate_merge_audit"))) {
    await knex.schema.createTable("candidate_merge_audit", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.uuid("survivor_candidate_id").notNullable();
      t.uuid("merged_candidate_id").notNullable();
      t.json("match_signals").notNullable();
      t.bigInteger("merged_by").unsigned().notNullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "survivor_candidate_id"], "candidate_merge_audit_idx");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of [
    "candidate_merge_audit", "email_campaign_recipients", "email_campaigns", "recruiter_profiles",
    "recruitment_automation_runs", "recruitment_automation_rules", "application_form_values", "application_form_fields",
  ]) await knex.schema.dropTableIfExists(table);
}
