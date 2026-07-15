import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { downloadCsv, printTableReport, type ExportColumn } from "@/lib/export";

interface ExportButtonsProps<T> {
  /** File base name, e.g. "candidates" -> candidates_2026-07-15_1420.csv */
  baseName: string;
  /** Report title shown at the top of the PDF. */
  title: string;
  subtitle?: string;
  columns: ExportColumn<T>[];
  /**
   * Returns the full set of rows to export. Usually `fetchAllRows(endpoint,
   * filters)` so the export reflects the current filters, not just the page on
   * screen. May also return an in-memory array.
   */
  fetchRows: () => Promise<T[]> | T[];
  disabled?: boolean;
  className?: string;
}

/**
 * A shared "Export" dropdown (CSV + PDF) for any table or report. Fetches the
 * full data set on demand, then downloads a CSV or opens a printable PDF report.
 */
export function ExportButtons<T>({
  baseName,
  title,
  subtitle,
  columns,
  fetchRows,
  disabled,
  className,
}: ExportButtonsProps<T>) {
  const [busy, setBusy] = useState<null | "csv" | "pdf">(null);
  const [open, setOpen] = useState(false);

  async function run(kind: "csv" | "pdf") {
    setOpen(false);
    setBusy(kind);
    try {
      const rows = await fetchRows();
      if (!rows || rows.length === 0) {
        toast.error("Nothing to export.");
        return;
      }
      if (kind === "csv") downloadCsv(baseName, columns, rows);
      else printTableReport({ title, subtitle, columns, rows });
    } catch {
      toast.error("Export failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || busy !== null}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Export
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            <button
              type="button"
              onClick={() => run("csv")}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileSpreadsheet className="h-4 w-4 text-green-600" /> Export as CSV
            </button>
            <button
              type="button"
              onClick={() => run("pdf")}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileText className="h-4 w-4 text-red-600" /> Export as PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}
