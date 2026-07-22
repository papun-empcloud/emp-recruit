// Excel (.xlsx) helpers for the bulk import/update flows: read the first sheet
// into rows of strings, and write a template workbook with per-column dropdown
// (data-validation) selectors.
import ExcelJS from "exceljs";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface SheetColumn {
  header: string;
  /** When present, every cell in this column gets an Excel dropdown of these values. */
  options?: string[];
  width?: number;
}

/** Normalize a header cell to a snake_case key ("First Name" -> "first_name"). */
export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function cellToString(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const anyV = v as Record<string, any>;
    if (Array.isArray(anyV.richText)) return anyV.richText.map((r: any) => r.text).join("").trim();
    if (anyV.text != null) return String(anyV.text).trim();
    if (anyV.result != null) return String(anyV.result).trim();
    if (anyV.hyperlink != null) return String(anyV.hyperlink).trim();
  }
  return String(v).trim();
}

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Read the first worksheet of an .xlsx file into rows of trimmed string cells. */
export async function readSheetRows(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const colCount = ws.columnCount;
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= colCount; c++) cells.push(cellToString(row.getCell(c).value));
    rows.push(cells);
  });
  return rows;
}

/**
 * Build and download an .xlsx workbook: a bold, frozen header row, the given
 * data rows, and a dropdown data-validation on every column that declares
 * `options` (applied to existing rows plus a buffer of blank rows so new
 * entries also get the selector).
 */
export async function downloadSheet(
  fileName: string,
  columns: SheetColumn[],
  dataRows: Array<Array<string | number | null | undefined>>,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Jobs");
  ws.columns = columns.map((c) => ({ header: c.header, key: c.header, width: c.width ?? 18 }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const r of dataRows) ws.addRow(r);

  const lastRow = dataRows.length + 200; // extra blank rows keep the dropdown on new entries
  columns.forEach((c, idx) => {
    if (!c.options || c.options.length === 0) return;
    const letter = colLetter(idx + 1);
    const formulae = [`"${c.options.join(",")}"`];
    for (let row = 2; row <= lastRow; row++) {
      ws.getCell(`${letter}${row}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae,
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Choose from the list",
        error: `Please pick one of: ${c.options.join(", ")}`,
      };
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer as unknown as ArrayBuffer], { type: XLSX_MIME });
  triggerDownload(blob, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}
