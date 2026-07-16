// ============================================================================
// Reusable CSV + PDF export for any list/table or report.
//   - CSV: a real file download (UTF-8 with BOM so Excel is happy).
//   - PDF: a print-optimized report rendered in a hidden iframe; the browser's
//     print dialog lets the user "Save as PDF". No external dependency.
// ============================================================================

import { apiGet } from "@/api/client";
import type { PaginatedResponse } from "@emp-recruit/shared";

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function cell(v: string | number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}

function csvEscape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Download `rows` as a CSV file named `<baseName>_<timestamp>.csv`. */
export function downloadCsv<T>(baseName: string, columns: ExportColumn<T>[], rows: T[]): void {
  const header = columns.map((c) => csvEscape(c.header)).join(",");
  const body = rows
    .map((r) => columns.map((c) => csvEscape(cell(c.value(r)))).join(","))
    .join("\r\n");
  const blob = new Blob(["﻿" + header + "\r\n" + body], {
    type: "text/csv;charset=utf-8;",
  });
  triggerDownload(blob, `${baseName}_${stamp()}.csv`);
}

// ----------------------------------------------------------------------------
// PDF (print) report
// ----------------------------------------------------------------------------

/** One titled table in a printed report. */
export interface ReportSection {
  heading?: string;
  columns: { header: string }[];
  rows: (string | number | null | undefined)[][];
}

/** Download a multi-section report as one CSV (sections separated by a blank row). */
export function downloadCsvSections(baseName: string, sections: ReportSection[]): void {
  const blocks = sections.map((sec) => {
    const lines: string[] = [];
    if (sec.heading) lines.push(csvEscape(sec.heading));
    lines.push(sec.columns.map((c) => csvEscape(c.header)).join(","));
    for (const row of sec.rows) lines.push(row.map((v) => csvEscape(cell(v))).join(","));
    return lines.join("\r\n");
  });
  const blob = new Blob(["﻿" + blocks.join("\r\n\r\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${baseName}_${stamp()}.csv`);
}

function esc(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function sectionHtml(sec: ReportSection): string {
  const head = `<tr>${sec.columns.map((c) => `<th>${esc(c.header)}</th>`).join("")}</tr>`;
  const body = sec.rows.length
    ? sec.rows
        .map((r) => `<tr>${r.map((v) => `<td>${esc(v == null ? "" : String(v))}</td>`).join("")}</tr>`)
        .join("")
    : `<tr><td class="empty" colspan="${sec.columns.length}">No data</td></tr>`;
  return `${sec.heading ? `<h2>${esc(sec.heading)}</h2>` : ""}<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

/** Open a formatted, printable report (one or more tables) and trigger print. */
export function printReport(opts: { title: string; subtitle?: string; sections: ReportSection[] }): void {
  const generated = new Date().toLocaleString();
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;margin:28px}
    header{border-bottom:2px solid #6d28d9;padding-bottom:12px;margin-bottom:18px}
    h1{font-size:20px;margin:0 0 4px}
    .subtitle{color:#6b7280;font-size:13px}
    .meta{color:#9ca3af;font-size:11px;margin-top:4px}
    h2{font-size:14px;margin:22px 0 8px;color:#374151}
    table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px}
    th{background:#f3f4f6;text-align:left;padding:6px 8px;border:1px solid #e5e7eb;font-weight:600}
    td{padding:6px 8px;border:1px solid #e5e7eb}
    tr:nth-child(even) td{background:#fafafa}
    .empty{text-align:center;color:#9ca3af;font-style:italic}
    @media print{body{margin:12mm}}
  </style></head>
  <body>
    <header>
      <h1>${esc(opts.title)}</h1>
      ${opts.subtitle ? `<div class="subtitle">${esc(opts.subtitle)}</div>` : ""}
      <div class="meta">Generated ${esc(generated)}</div>
    </header>
    ${opts.sections.map(sectionHtml).join("")}
  </body></html>`;

  // Render in a hidden iframe (avoids popup blockers) and print it.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow!;
  const cleanup = () => setTimeout(() => iframe.remove(), 1000);
  win.addEventListener?.("afterprint", cleanup);
  setTimeout(() => {
    win.focus();
    win.print();
  }, 300);
  setTimeout(cleanup, 60000); // fallback in case afterprint never fires
}

/** Convenience: a single-table PDF report from ExportColumn definitions. */
export function printTableReport<T>(opts: {
  title: string;
  subtitle?: string;
  columns: ExportColumn<T>[];
  rows: T[];
}): void {
  printReport({
    title: opts.title,
    subtitle: opts.subtitle,
    sections: [
      {
        columns: opts.columns.map((c) => ({ header: c.header })),
        rows: opts.rows.map((r) => opts.columns.map((c) => c.value(r))),
      },
    ],
  });
}

// ----------------------------------------------------------------------------
// Data helper — fetch the FULL result set of a paginated endpoint for export
// (so we export everything that matches the current filters, not just the page
// currently on screen).
// ----------------------------------------------------------------------------
export async function fetchAllRows<T>(
  endpoint: string,
  filters: Record<string, unknown> = {},
  opts: { pageSize?: number; maxRows?: number } = {},
): Promise<T[]> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v !== "" && v !== null && v !== undefined) clean[k] = v;
  }
  // List endpoints cap perPage at 100, so page through until we've collected the
  // full result set (with a hard safety cap on rows/iterations).
  const pageSize = opts.pageSize ?? 100;
  const maxRows = opts.maxRows ?? 10000;
  const all: T[] = [];
  let page = 1;
  for (let i = 0; i < 500; i++) {
    const res = await apiGet<PaginatedResponse<T>>(endpoint, {
      ...clean,
      page,
      limit: pageSize,
      perPage: pageSize,
    });
    const payload = res.data;
    const rows = (payload?.data ?? []) as T[];
    all.push(...rows);
    const total = payload?.total ?? all.length;
    if (rows.length < pageSize || all.length >= total || all.length >= maxRows) break;
    page += 1;
  }
  return all.slice(0, maxRows);
}
