import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  X,
  Upload,
  Download,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  PencilLine,
} from "lucide-react";
import { apiPost } from "@/api/client";
import { parseCsv, normalizeHeader } from "@/lib/csv";
import { downloadCsv, type ExportColumn } from "@/lib/export";
import type { JobPosting } from "@emp-recruit/shared";

interface BulkUpdateJobsModalProps {
  open: boolean;
  onClose: () => void;
  /** Fetch all jobs — used to build an editable "current jobs" template. */
  fetchRows: () => Promise<JobPosting[]>;
  /** Called after an update run so the parent can refresh the job list. */
  onUpdated: () => void;
}

const REMOTE_POLICIES = ["onsite", "remote", "hybrid"];
const STATUSES = ["draft", "open", "paused", "closed", "filled"];

// Columns written to the downloadable template (a snapshot of current jobs the
// user edits and re-uploads). `id` identifies the row; the rest are editable.
const TEMPLATE_COLUMNS: ExportColumn<JobPosting>[] = [
  { header: "id", value: (j) => j.id },
  { header: "title", value: (j) => j.title },
  { header: "department", value: (j) => j.department },
  { header: "location", value: (j) => j.location },
  { header: "employment_type", value: (j) => j.employment_type },
  { header: "experience_min", value: (j) => j.experience_min },
  { header: "experience_max", value: (j) => j.experience_max },
  { header: "salary_min", value: (j) => j.salary_min },
  { header: "salary_max", value: (j) => j.salary_max },
  { header: "salary_currency", value: (j) => j.salary_currency },
  { header: "remote_policy", value: (j) => (j as { remote_policy?: string }).remote_policy ?? "onsite" },
  { header: "status", value: (j) => j.status },
];

interface ParsedRow {
  index: number; // 1-based data row number
  id: string;
  changes: Record<string, unknown>; // fields to send (only those present)
  displayTitle: string;
  displayStatus: string;
  error: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A whole non-negative integer, or empty. Returns undefined for empty, NaN for invalid.
function asInt(v: string): number | undefined | typeof NaN {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

function rowsFromCsv(text: string, t: TFunction): { rows: ParsedRow[]; headerError: string | null } {
  const table = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length === 0) return { rows: [], headerError: t("components.bulkUpdateJobs.errFileEmpty") };

  const headers = table[0].map(normalizeHeader);
  const col = (name: string) => headers.indexOf(name);
  const ci = {
    id: col("id"),
    title: col("title"),
    description: col("description"),
    department: col("department"),
    location: col("location"),
    employment_type: col("employment_type"),
    experience_min: col("experience_min"),
    experience_max: col("experience_max"),
    salary_min: col("salary_min"),
    salary_max: col("salary_max"),
    salary_currency: col("salary_currency"),
    remote_policy: col("remote_policy"),
    status: col("status"),
    skills: col("skills"),
  };

  if (ci.id === -1) {
    return { rows: [], headerError: t("components.bulkUpdateJobs.errMissingId") };
  }

  const get = (r: string[], idx: number) => (idx >= 0 ? (r[idx] ?? "").trim() : "");
  const rows: ParsedRow[] = table.slice(1).map((r, i) => {
    const id = get(r, ci.id);
    const title = get(r, ci.title);
    const description = get(r, ci.description);
    const expMin = asInt(get(r, ci.experience_min));
    const expMax = asInt(get(r, ci.experience_max));
    const salMin = asInt(get(r, ci.salary_min));
    const salMax = asInt(get(r, ci.salary_max));
    const remoteRaw = get(r, ci.remote_policy).toLowerCase();
    const statusRaw = get(r, ci.status).toLowerCase();
    const currencyRaw = get(r, ci.salary_currency).toUpperCase();
    const skills = get(r, ci.skills)
      .split(/[;|]/)
      .map((s) => s.trim())
      .filter(Boolean);

    // Build the change set from only the fields actually present in this row.
    const changes: Record<string, unknown> = {};
    if (ci.title >= 0 && title) changes.title = title;
    if (ci.description >= 0 && description) changes.description = description;
    if (ci.department >= 0 && get(r, ci.department)) changes.department = get(r, ci.department);
    if (ci.location >= 0 && get(r, ci.location)) changes.location = get(r, ci.location);
    if (ci.employment_type >= 0 && get(r, ci.employment_type))
      changes.employment_type = get(r, ci.employment_type);
    if (expMin != null && !Number.isNaN(expMin)) changes.experience_min = expMin;
    if (expMax != null && !Number.isNaN(expMax)) changes.experience_max = expMax;
    if (salMin != null && !Number.isNaN(salMin)) changes.salary_min = salMin;
    if (salMax != null && !Number.isNaN(salMax)) changes.salary_max = salMax;
    if (currencyRaw.length === 3) changes.salary_currency = currencyRaw;
    if (remoteRaw && REMOTE_POLICIES.includes(remoteRaw)) changes.remote_policy = remoteRaw;
    if (skills.length) changes.skills = skills;

    let status: string | undefined;
    if (statusRaw) status = statusRaw;

    let error: string | null = null;
    if (!id) error = t("components.bulkUpdateJobs.errMissingId");
    else if (!UUID_RE.test(id)) error = t("components.bulkUpdateJobs.errBadId");
    else if (title && /[<>]/.test(title)) error = t("components.bulkUpdateJobs.errTitleMarkup");
    else if (ci.description >= 0 && description && description.length < 10)
      error = t("components.bulkUpdateJobs.errDescriptionShort");
    else if ([expMin, expMax, salMin, salMax].some((n) => Number.isNaN(n)))
      error = t("components.bulkUpdateJobs.errBadNumber");
    else if (expMin != null && expMax != null && !Number.isNaN(expMin) && !Number.isNaN(expMax) && expMin > expMax)
      error = t("components.bulkUpdateJobs.errExpRange");
    else if (salMin != null && salMax != null && !Number.isNaN(salMin) && !Number.isNaN(salMax) && salMin > salMax)
      error = t("components.bulkUpdateJobs.errSalaryRange");
    else if (status && !STATUSES.includes(status)) error = t("components.bulkUpdateJobs.errBadStatus");
    else if (Object.keys(changes).length === 0 && !status)
      error = t("components.bulkUpdateJobs.errNoChanges");

    if (status) changes.status = status;

    return {
      index: i + 1,
      id,
      changes,
      displayTitle: title || "—",
      displayStatus: status || "—",
      error,
    };
  });

  return { rows, headerError: null };
}

interface UpdateResults {
  updated: number;
  failed: { row: number; id: string; reason: string }[];
}

export function BulkUpdateJobsModal({ open, onClose, fetchRows, onUpdated }: BulkUpdateJobsModalProps) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<UpdateResults | null>(null);

  if (!open) return null;

  const validRows = rows.filter((r) => !r.error);

  function reset() {
    setFileName(null);
    setRows([]);
    setHeaderError(null);
    setTemplateError(null);
    setResults(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function close() {
    if (importing) return;
    reset();
    onClose();
  }

  async function downloadTemplate() {
    setTemplateError(null);
    setTemplateLoading(true);
    try {
      const jobs = await fetchRows();
      downloadCsv("jobs-update", TEMPLATE_COLUMNS, jobs);
    } catch (err: any) {
      setTemplateError(errMsg(err, t));
    }
    setTemplateLoading(false);
  }

  function handleFile(file: File) {
    setResults(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = rowsFromCsv(String(reader.result || ""), t);
      setRows(parsed.rows);
      setHeaderError(parsed.headerError);
    };
    reader.readAsText(file);
  }

  async function runUpdate() {
    setImporting(true);
    try {
      const jobs = validRows.map((r) => ({ id: r.id, ...r.changes }));
      const res = await apiPost<UpdateResults>("/jobs/bulk-update", { jobs });
      const d = res.data;
      const summary: UpdateResults = { updated: d?.updated ?? 0, failed: d?.failed ?? [] };
      setResults(summary);
      if (summary.updated > 0) onUpdated();
    } catch (err: any) {
      setResults({
        updated: 0,
        failed: validRows.map((r) => ({ row: r.index, id: r.id, reason: errMsg(err, t) })),
      });
    }
    setImporting(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={t("components.bulkUpdateJobs.ariaLabel")}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <PencilLine className="h-5 w-5 text-brand-600" />
            <h3 className="text-base font-semibold text-gray-900">{t("components.bulkUpdateJobs.title")}</h3>
          </div>
          <button
            onClick={close}
            disabled={importing}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            aria-label={t("components.bulkUpdateJobs.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {results ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                <CheckCircle2 className="h-6 w-6 flex-shrink-0 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-800">
                    {t("components.bulkUpdateJobs.resultUpdated", { count: results.updated })}
                  </p>
                  {results.failed.length > 0 && (
                    <p className="text-xs text-green-700">
                      {t("components.bulkUpdateJobs.failedCount", { count: results.failed.length })}
                    </p>
                  )}
                </div>
              </div>

              {results.failed.length > 0 && (
                <div className="rounded-lg border border-gray-200">
                  <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t("components.bulkUpdateJobs.failedRows")}
                  </div>
                  <ul className="max-h-56 divide-y divide-gray-100 overflow-y-auto">
                    {results.failed.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
                        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                        <span>
                          <span className="font-medium text-gray-800">
                            {t("components.bulkUpdateJobs.rowLabel", { row: f.row })}
                          </span>
                          <span className="text-gray-500"> — {f.reason}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Instructions + template */}
              <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-sm text-gray-600">{t("components.bulkUpdateJobs.instructions")}</p>
                <button
                  onClick={downloadTemplate}
                  disabled={templateLoading}
                  className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {templateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {t("components.bulkUpdateJobs.currentJobs")}
                </button>
              </div>

              {templateError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{templateError}</span>
                </div>
              )}

              {/* File picker */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-8 text-center hover:border-brand-400 hover:bg-brand-50/40"
              >
                {fileName ? (
                  <>
                    <FileText className="h-8 w-8 text-brand-500" />
                    <span className="text-sm font-medium text-gray-700">{fileName}</span>
                    <span className="text-xs text-gray-400">{t("components.bulkUpdateJobs.changeFile")}</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">
                      {t("components.bulkUpdateJobs.selectFile")}
                    </span>
                    <span className="text-xs text-gray-400">{t("components.bulkUpdateJobs.fileHint")}</span>
                  </>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />

              {headerError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{headerError}</span>
                </div>
              )}

              {/* Preview */}
              {rows.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">
                      {t("components.bulkUpdateJobs.previewReady", {
                        valid: validRows.length,
                        count: rows.length,
                      })}
                    </span>
                    {rows.length - validRows.length > 0 && (
                      <span className="text-xs text-red-600">
                        {t("components.bulkUpdateJobs.rowsSkipped", { count: rows.length - validRows.length })}
                      </span>
                    )}
                  </div>
                  <div className="max-h-64 overflow-auto rounded-lg border border-gray-200">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">{t("components.bulkUpdateJobs.colId")}</th>
                          <th className="px-3 py-2 font-medium">{t("components.bulkUpdateJobs.colTitle")}</th>
                          <th className="px-3 py-2 font-medium">{t("components.bulkUpdateJobs.colStatus")}</th>
                          <th className="px-3 py-2 font-medium">{t("components.bulkUpdateJobs.colResult")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.map((r) => (
                          <tr key={r.index} className={r.error ? "bg-red-50/60" : ""}>
                            <td className="px-3 py-2 font-mono text-xs text-gray-500">
                              {r.id ? r.id.slice(0, 8) : "—"}
                            </td>
                            <td className="px-3 py-2 text-gray-800">{r.displayTitle}</td>
                            <td className="px-3 py-2 text-gray-500">{r.displayStatus}</td>
                            <td className="px-3 py-2">
                              {r.error ? (
                                <span className="inline-flex items-center gap-1 text-xs text-red-600">
                                  <AlertCircle className="h-3.5 w-3.5" />
                                  {r.error}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {t("components.bulkUpdateJobs.ready")}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-6 py-4">
          <div className="text-sm text-gray-500">
            {importing && (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("components.bulkUpdateJobs.updatingCount", { count: validRows.length })}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={close}
              disabled={importing}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {results ? t("components.bulkUpdateJobs.done") : t("components.bulkUpdateJobs.cancel")}
            </button>
            {!results && (
              <button
                onClick={runUpdate}
                disabled={importing || validRows.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
                {t("components.bulkUpdateJobs.updateBtn", { count: validRows.length })}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function errMsg(err: any, t: TFunction): string {
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    err?.message ||
    t("components.bulkUpdateJobs.unknownError")
  );
}
