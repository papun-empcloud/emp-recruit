// ============================================================================
// MIGRATION 027 — sanitize existing job titles (BUG-08)
// ============================================================================
// The job-title validator (noMarkupTitle) rejects HTML/script markup on
// create/update, and the form now strips it at input time. But titles stored
// before that — e.g. a "<script>alert(1)</script>" job created during early
// testing — remain unsanitized in the database. Strip HTML tags and any stray
// angle brackets from existing titles so no markup is persisted anywhere.
// ============================================================================

import type { Knex } from "knex";

function sanitizeTitle(raw: string): string {
  const cleaned = String(raw)
    .replace(/<[^>]*>/g, "") // remove full HTML/script tags
    .replace(/[<>]/g, "") // remove any stray angle brackets
    .replace(/\s+/g, " ")
    .trim();
  // The title has a min length of 2; if sanitizing collapses it, keep it usable.
  return cleaned.length >= 2 ? cleaned : "Untitled role";
}

export async function up(knex: Knex): Promise<void> {
  const rows: Array<{ id: string; title: string }> = await knex("job_postings")
    .select("id", "title")
    .where("title", "like", "%<%")
    .orWhere("title", "like", "%>%");
  for (const row of rows) {
    const safe = sanitizeTitle(row.title);
    if (safe !== row.title) {
      await knex("job_postings").where({ id: row.id }).update({ title: safe });
    }
  }
}

export async function down(): Promise<void> {
  // Data sanitization — not reversible.
}
