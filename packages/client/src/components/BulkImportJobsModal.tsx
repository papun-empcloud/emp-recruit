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
  Briefcase,
} from "lucide-react";
import { apiPost } from "@/api/client";

interface BulkImportJobsModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after an import run so the parent can refresh the job list. */
  onImported: () => void;
}

const REMOTE_POLICIES = ["onsite", "remote", "hybrid"];

// CSV columns we understand. Only title and description are required.
const TEMPLATE_HEADERS = [
  "title",
  "description",
  "department",
  "location",
  "employment_type",
  "experience_min",
  "experience_max",
  "salary_min",
  "salary_max",
  "salary_currency",
  "remote_policy",
  "skills",
];

const TEMPLATE_SAMPLE =
  TEMPLATE_HEADERS.join(",") +
  "\n" +
  [
    'Senior Software Engineer,"Build and scale our core platform with a small, senior team.",Engineering,Bangalore,full_time,5,8,2000000,3500000,INR,hybrid,React;Node.js;TypeScript',
    'Product Designer,"Own end-to-end product design across web and mobile.",Design,Remote,full_time,3,6,1500000,2500000,INR,remote,Figma;UX Research',
  ].join("\n") +
  "\n";

interface ParsedRow {
  index: number; // 1-based data row number (for messages)
  title: string;
  description: string;
  department?: string;
  location?: string;
  employment_type?: string;
  experience_min?: string;
  experience_max?: string;
  salary_min?: string;
  salary_max?: string;
  salary_currency?: string;
  remote_policy: string;
  skills: string[];
  error: string | null; // validation error, null when the row is importable
}

interface ImportResults {
  created: number;
  failed: { row: number; title: string; reason: string }[];
}

/** Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes and
 *  commas/newlines inside quotes. Returns an array of rows of string cells. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/\r\n?/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  // Flush trailing cell/row (file may not end with a newline).
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

// A whole non-negative integer, or empty. Returns undefined for empty/invalid.
function asInt(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

function rowsFromCsv(
  text: string,
  t: TFunction,
): { rows: ParsedRow[]; headerError: string | null } {
  const table = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length === 0) return { rows: [], headerError: t("components.bulkImportJobs.errFileEmpty") };

  const headers = table[0].map(normalizeHeader);
  const col = (name: string) => headers.indexOf(name);
  const ci = {
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
    skills: col("skills"),
  };

  if (ci.title === -1 || ci.description === -1) {
    return { rows: [], headerError: t("components.bulkImportJobs.errMissingColumns") };
  }

  const get = (r: string[], idx: number) => (idx >= 0 ? (r[idx] ?? "").trim() : "");
  const rows: ParsedRow[] = table.slice(1).map((r, i) => {
    const title = get(r, ci.title);
    const description = get(r, ci.description);
    const expMin = get(r, ci.experience_min);
    const expMax = get(r, ci.experience_max);
    const salMin = get(r, ci.salary_min);
    const salMax = get(r, ci.salary_max);
    const remoteRaw = get(r, ci.remote_policy).toLowerCase();
    const currencyRaw = get(r, ci.salary_currency).toUpperCase();
    const skills = get(r, ci.skills)
      .split(/[;|]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const nums = { expMin: asInt(expMin), expMax: asInt(expMax), salMin: asInt(salMin), salMax: asInt(salMax) };

    let error: string | null = null;
    if (!title) error = t("components.bulkImportJobs.errMissingTitle");
    else if (/[<>]/.test(title)) error = t("components.bulkImportJobs.errTitleMarkup");
    else if (description.length < 10) error = t("components.bulkImportJobs.errDescriptionShort");
    else if (Object.values(nums).some((n) => Number.isNaN(n)))
      error = t("components.bulkImportJobs.errBadNumber");
    else if (nums.expMin != null && nums.expMax != null && nums.expMin > nums.expMax)
      error = t("components.bulkImportJobs.errExpRange");
    else if (nums.salMin != null && nums.salMax != null && nums.salMin > nums.salMax)
      error = t("components.bulkImportJobs.errSalaryRange");

    return {
      index: i + 1,
      title,
      description,
      department: get(r, ci.department) || undefined,
      location: get(r, ci.location) || undefined,
      employment_type: get(r, ci.employment_type) || undefined,
      experience_min: expMin || undefined,
      experience_max: expMax || undefined,
      salary_min: salMin || undefined,
      salary_max: salMax || undefined,
      // Only forward a 3-letter currency; anything else falls back to the server default.
      salary_currency: currencyRaw.length === 3 ? currencyRaw : undefined,
      remote_policy: REMOTE_POLICIES.includes(remoteRaw) ? remoteRaw : "onsite",
      skills,
      error,
    };
  });

  return { rows, headerError: null };
}

export function BulkImportJobsModal({ open, onClose, onImported }: BulkImportJobsModalProps) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResults | null>(null);

  if (!open) return null;

  const validRows = rows.filter((r) => !r.error);

  function reset() {
    setFileName(null);
    setRows([]);
    setHeaderError(null);
    setResults(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function close() {
    if (importing) return;
    reset();
    onClose();
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_SAMPLE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jobs-template.csv";
    a.click();
    URL.revokeObjectURL(url);
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

  async function runImport() {
    setImporting(true);
    try {
      // One request: the server creates every job and returns a per-row report,
      // instead of the client firing N calls.
      const jobs = validRows.map((r) => {
        const j: Record<string, any> = { title: r.title, description: r.description, remote_policy: r.remote_policy };
        if (r.department) j.department = r.department;
        if (r.location) j.location = r.location;
        if (r.employment_type) j.employment_type = r.employment_type;
        if (r.experience_min) j.experience_min = Number(r.experience_min);
        if (r.experience_max) j.experience_max = Number(r.experience_max);
        if (r.salary_min) j.salary_min = Number(r.salary_min);
        if (r.salary_max) j.salary_max = Number(r.salary_max);
        if (r.salary_currency) j.salary_currency = r.salary_currency;
        if (r.skills.length) j.skills = r.skills;
        return j;
      });

      const res = await apiPost<ImportResults>("/jobs/bulk", { jobs });
      const d = res.data;
      const summary: ImportResults = { created: d?.created ?? 0, failed: d?.failed ?? [] };
      setResults(summary);
      if (summary.created > 0) onImported();
    } catch (err: any) {
      // Whole request failed — surface it against every row we tried to import.
      setResults({
        created: 0,
        failed: validRows.map((r) => ({ row: r.index, title: r.title, reason: errMsg(err, t) })),
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
      aria-label={t("components.bulkImportJobs.ariaLabel")}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-brand-600" />
            <h3 className="text-base font-semibold text-gray-900">{t("components.bulkImportJobs.title")}</h3>
          </div>
          <button
            onClick={close}
            disabled={importing}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            aria-label={t("components.bulkImportJobs.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Results view */}
          {results ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                <CheckCircle2 className="h-6 w-6 flex-shrink-0 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-800">
                    {t("components.bulkImportJobs.resultCreated", { count: results.created })}
                  </p>
                  {results.failed.length > 0 && (
                    <p className="text-xs text-green-700">
                      {t("components.bulkImportJobs.failedCount", { count: results.failed.length })}
                    </p>
                  )}
                </div>
              </div>

              {results.failed.length > 0 && (
                <div className="rounded-lg border border-gray-200">
                  <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t("components.bulkImportJobs.failedRows")}
                  </div>
                  <ul className="max-h-56 divide-y divide-gray-100 overflow-y-auto">
                    {results.failed.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
                        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                        <span>
                          <span className="font-medium text-gray-800">
                            {t("components.bulkImportJobs.rowLabel", { row: f.row })}
                            {f.title ? ` · ${f.title}` : ""}
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
                <p className="text-sm text-gray-600">
                  {t("components.bulkImportJobs.columnsPrefix")}{" "}
                  <code className="rounded bg-gray-200 px-1 text-xs">title</code>,{" "}
                  <code className="rounded bg-gray-200 px-1 text-xs">description</code>{" "}
                  {t("components.bulkImportJobs.columnsSuffix")}
                </p>
                <button
                  onClick={downloadTemplate}
                  className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Download className="h-4 w-4" />
                  {t("components.bulkImportJobs.template")}
                </button>
              </div>

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
                    <span className="text-xs text-gray-400">{t("components.bulkImportJobs.changeFile")}</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">
                      {t("components.bulkImportJobs.selectFile")}
                    </span>
                    <span className="text-xs text-gray-400">{t("components.bulkImportJobs.fileHint")}</span>
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
                      {t("components.bulkImportJobs.previewReady", {
                        valid: validRows.length,
                        count: rows.length,
                      })}
                    </span>
                    {rows.length - validRows.length > 0 && (
                      <span className="text-xs text-red-600">
                        {t("components.bulkImportJobs.rowsSkipped", { count: rows.length - validRows.length })}
                      </span>
                    )}
                  </div>
                  <div className="max-h-64 overflow-auto rounded-lg border border-gray-200">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">{t("components.bulkImportJobs.colTitle")}</th>
                          <th className="px-3 py-2 font-medium">{t("components.bulkImportJobs.colDepartment")}</th>
                          <th className="px-3 py-2 font-medium">{t("components.bulkImportJobs.colType")}</th>
                          <th className="px-3 py-2 font-medium">{t("components.bulkImportJobs.colStatus")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.map((r) => (
                          <tr key={r.index} className={r.error ? "bg-red-50/60" : ""}>
                            <td className="px-3 py-2 text-gray-800">{r.title || "—"}</td>
                            <td className="px-3 py-2 text-gray-500">{r.department || "—"}</td>
                            <td className="px-3 py-2 text-gray-500">{r.employment_type || "full_time"}</td>
                            <td className="px-3 py-2">
                              {r.error ? (
                                <span className="inline-flex items-center gap-1 text-xs text-red-600">
                                  <AlertCircle className="h-3.5 w-3.5" />
                                  {r.error}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {t("components.bulkImportJobs.ready")}
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
                {t("components.bulkImportJobs.importingCount", { count: validRows.length })}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={close}
              disabled={importing}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {results ? t("components.bulkImportJobs.done") : t("components.bulkImportJobs.cancel")}
            </button>
            {!results && (
              <button
                onClick={runImport}
                disabled={importing || validRows.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {t("components.bulkImportJobs.importBtn", { count: validRows.length })}
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
    t("components.bulkImportJobs.unknownError")
  );
}
