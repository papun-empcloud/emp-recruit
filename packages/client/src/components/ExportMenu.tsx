import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ExportMenuProps {
  onCsv: () => void;
  onPdf: () => void;
  busy?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Shared "Export" dropdown UI (CSV + PDF). Presentational — callers wire the handlers. */
export function ExportMenu({ onCsv, onPdf, busy, disabled, className }: ExportMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const pick = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || busy}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {t("common.export")}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            <button
              type="button"
              onClick={() => pick(onCsv)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileSpreadsheet className="h-4 w-4 text-green-600" /> {t("common.exportCsv")}
            </button>
            <button
              type="button"
              onClick={() => pick(onPdf)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileText className="h-4 w-4 text-red-600" /> {t("common.exportPdf")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
