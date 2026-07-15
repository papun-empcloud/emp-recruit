import { useState } from "react";
import toast from "react-hot-toast";
import { ExportMenu } from "./ExportMenu";
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

  async function run(kind: "csv" | "pdf") {
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
    <ExportMenu
      className={className}
      disabled={disabled}
      busy={busy !== null}
      onCsv={() => run("csv")}
      onPdf={() => run("pdf")}
    />
  );
}
