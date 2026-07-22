// Job select fields shared by the bulk import/update Excel flows. Excel
// dropdowns show the friendly `label`; on read we map a cell (label OR raw
// value, case-insensitive) back to the stored `value`.

export interface Option {
  value: string;
  label: string;
}

export const EMPLOYMENT_TYPES: Option[] = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "freelance", label: "Freelance" },
];

export const REMOTE_POLICIES: Option[] = [
  { value: "onsite", label: "On-site" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
];

export const JOB_STATUSES: Option[] = [
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "paused", label: "Paused" },
  { value: "closed", label: "Closed" },
  { value: "filled", label: "Filled" },
];

export const SALARY_CURRENCIES = ["INR", "USD", "EUR", "GBP"];

export const EMPLOYMENT_TYPE_LABELS = EMPLOYMENT_TYPES.map((o) => o.label);
export const REMOTE_POLICY_LABELS = REMOTE_POLICIES.map((o) => o.label);
export const JOB_STATUS_LABELS = JOB_STATUSES.map((o) => o.label);

function toValue(opts: Option[], cell: string): string | undefined {
  const s = cell.trim().toLowerCase();
  if (!s) return undefined;
  return opts.find((o) => o.value.toLowerCase() === s || o.label.toLowerCase() === s)?.value;
}

function toLabel(opts: Option[], value?: string | null): string {
  if (value == null || value === "") return "";
  return opts.find((o) => o.value === value)?.label ?? String(value);
}

export const employmentTypeToValue = (cell: string) => toValue(EMPLOYMENT_TYPES, cell);
export const remotePolicyToValue = (cell: string) => toValue(REMOTE_POLICIES, cell);
export const statusToValue = (cell: string) => toValue(JOB_STATUSES, cell);

export const employmentTypeLabel = (value?: string | null) => toLabel(EMPLOYMENT_TYPES, value);
export const remotePolicyLabel = (value?: string | null) => toLabel(REMOTE_POLICIES, value);
export const statusLabel = (value?: string | null) => toLabel(JOB_STATUSES, value);
