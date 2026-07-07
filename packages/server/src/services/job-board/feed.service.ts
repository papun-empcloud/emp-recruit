// ============================================================================
// JOB FEED
// ============================================================================
// Public feed of an org's open jobs for a career-page slug. Boards (Indeed,
// Google Jobs, …) crawl this to auto-index new jobs — the works-today path that
// needs no partner API. XML is Indeed's job-feed format; JSON mirrors it.
// ============================================================================

import { getDB } from "../../db/adapters";
import { config } from "../../config";
import { NotFoundError } from "../../utils/errors";

interface FeedJob {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  location: string | null;
  employment_type: string | null;
  remote_policy: string | null;
  department: string | null;
  published_at: string | Date | null;
  applyUrl: string;
}

interface FeedData {
  company: string;
  slug: string;
  jobs: FeedJob[];
}

async function getFeedData(slug: string): Promise<FeedData> {
  const db = getDB();
  const page = await db.findOne<{ organization_id: number; title: string; is_active: boolean | number }>(
    "career_pages",
    { slug },
  );
  if (!page || !page.is_active) throw new NotFoundError("Career page", slug);

  // Open, non-internal jobs only.
  const rows = await db.raw<any[][]>(
    `SELECT id, title, description, requirements, location, employment_type, remote_policy, department, published_at
     FROM job_postings
     WHERE organization_id = ? AND status = 'open' AND (is_internal = 0 OR is_internal IS NULL)
     ORDER BY published_at DESC`,
    [page.organization_id],
  );

  const jobs: FeedJob[] = (rows[0] as any[]).map((j) => ({
    ...j,
    applyUrl: `${config.clientUrl}/careers/${slug}/jobs/${j.id}`,
  }));

  return { company: page.title || "Company", slug, jobs };
}

function cdata(v: unknown): string {
  const s = v == null ? "" : String(v);
  // Escape any nested CDATA terminators.
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

export async function getFeedJson(slug: string): Promise<FeedData> {
  return getFeedData(slug);
}

export async function getFeedXml(slug: string): Promise<string> {
  const data = await getFeedData(slug);

  const items = data.jobs
    .map((j) => {
      const date = j.published_at ? new Date(j.published_at).toUTCString() : new Date().toUTCString();
      const desc = [j.description, j.requirements ? `\n\nRequirements:\n${j.requirements}` : ""].join("");
      return `  <job>
    <title>${cdata(j.title)}</title>
    <date>${cdata(date)}</date>
    <referencenumber>${cdata(j.id)}</referencenumber>
    <url>${cdata(j.applyUrl)}</url>
    <company>${cdata(data.company)}</company>
    <city>${cdata(j.location ?? "")}</city>
    <country>${cdata("")}</country>
    <jobtype>${cdata(j.employment_type ?? "")}</jobtype>
    <category>${cdata(j.department ?? "")}</category>
    <remotetype>${cdata(j.remote_policy ?? "")}</remotetype>
    <description>${cdata(desc)}</description>
  </job>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<source>
  <publisher>EmpCloud Recruit</publisher>
  <publisherurl>${config.clientUrl}</publisherurl>
${items}
</source>`;
}
