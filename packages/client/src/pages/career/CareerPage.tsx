import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Save,
  Eye,
  Link2,
  Briefcase,
  ExternalLink,
  ChevronDown,
  Check,
  X,
} from "lucide-react";
import { apiGet, apiPut } from "@/api/client";
import toast from "react-hot-toast";
import type { CareerPage as CareerPageType, JobPosting } from "@emp-recruit/shared";

// ===========================================================================
// Career Page — public career page config + which jobs to list
// ===========================================================================
export function CareerPage() {
  return (
    <div className="space-y-8 pb-28">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Career Page</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure your public career page and choose which jobs it shows.
        </p>
      </div>

      <CareerPageSettings />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Career page configuration (title, description, slug, brand color)
// ---------------------------------------------------------------------------
function CareerPageSettings() {
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ["career-page-config"],
    queryFn: async () => {
      const res = await apiGet<CareerPageType | null>("/career-pages");
      return res.data;
    },
  });

  // Eligible jobs + which are currently on the career page.
  const jobsQuery = useQuery({
    queryKey: ["career-page-jobs"],
    queryFn: async () => {
      const res = await apiGet<JobPosting[]>("/career-pages/jobs");
      return res.data || [];
    },
  });

  const [form, setForm] = useState({
    title: "",
    description: "",
    primary_color: "#4F46E5",
    slug: "",
  });
  const [initialized, setInitialized] = useState(false);

  if (configQuery.data && !initialized) {
    const c = configQuery.data;
    // Strip stray HTML tags from description if a previous tool wrote them.
    const cleanDescription = (c.description || "").replace(/<[^>]+>/g, "").trim();
    setForm({
      title: c.title || "",
      description: cleanDescription,
      primary_color: c.primary_color || "#4F46E5",
      slug: c.slug || "",
    });
    setInitialized(true);
  }

  // Job selection, seeded once from the saved flags. Saved together with the
  // page config by the single "Save Changes" button below.
  const [jobSelection, setJobSelection] = useState<Set<string>>(new Set());
  const [jobsInitialized, setJobsInitialized] = useState(false);
  if (jobsQuery.data && !jobsInitialized) {
    setJobSelection(
      new Set(jobsQuery.data.filter((j) => Boolean(j.show_on_career_page)).map((j) => j.id)),
    );
    setJobsInitialized(true);
  }

  const saveMutation = useMutation({
    // One save writes both the page config and the job selection.
    mutationFn: async () => {
      await apiPut("/career-pages", form);
      await apiPut("/career-pages/jobs", { jobIds: Array.from(jobSelection) });
    },
    onSuccess: () => {
      toast.success("Career page saved");
      queryClient.invalidateQueries({ queryKey: ["career-page-config"] });
      queryClient.invalidateQueries({ queryKey: ["career-page-jobs"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || "Failed to save");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    saveMutation.mutate();
  }

  if (configQuery.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  }

  const validColor = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(form.primary_color);
  const previewColor = validColor ? form.primary_color : "#4F46E5";
  // Preview the jobs actually selected for the page (mirrors the public page),
  // not a hardcoded sample.
  const previewJobs = (jobsQuery.data || []).filter((j) => jobSelection.has(j.id));

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      {/* ---- Left: the form ---- */}
      <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Career Page Configuration</h2>
        <p className="mt-1 text-sm text-gray-500">
          Customize how your public career page appears to candidates.
        </p>

        <div className="mt-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700">Page Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Join Our Team"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              rows={3}
              maxLength={300}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="A short description shown on your career page..."
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <p className="mt-1 text-right text-xs text-gray-400">{form.description.length}/300</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">URL Slug</label>
            <div className="mt-1 flex items-center rounded-lg border border-gray-300 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
              <span className="flex items-center gap-1 border-r border-gray-200 px-3 py-2 text-sm text-gray-400">
                <Link2 className="h-3.5 w-3.5" />
                /careers/
              </span>
              <input
                type="text"
                value={form.slug}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                  }))
                }
                placeholder="your-company"
                className="block flex-1 rounded-r-lg px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Lowercase letters, numbers and hyphens only.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Brand Color</label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="color"
                value={previewColor}
                onChange={(e) => setForm((p) => ({ ...p, primary_color: e.target.value }))}
                className="h-10 w-14 cursor-pointer rounded border border-gray-300"
              />
              <input
                type="text"
                value={form.primary_color}
                onChange={(e) => setForm((p) => ({ ...p, primary_color: e.target.value }))}
                className={`block w-32 rounded-lg border px-3 py-2 text-sm uppercase focus:outline-none focus:ring-1 ${
                  validColor
                    ? "border-gray-300 focus:border-brand-500 focus:ring-brand-500"
                    : "border-red-300 focus:border-red-500 focus:ring-red-500"
                }`}
              />
              {!validColor && <span className="text-xs text-red-500">Enter a hex like #4F46E5</span>}
            </div>
          </div>
        </div>

        {/* Which jobs appear on the public career page */}
        <div className="mt-6 border-t border-gray-100 pt-6">
          <CareerJobsSection
            jobs={jobsQuery.data || []}
            isLoading={jobsQuery.isLoading}
            selected={jobSelection}
            setSelected={setJobSelection}
          />
        </div>

        <div className="mt-6 flex items-center gap-3 border-t border-gray-100 pt-5">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
          {configQuery.data?.slug && (
            <a
              href={`/careers/${configQuery.data.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ExternalLink className="h-4 w-4" />
              View live page
            </a>
          )}
        </div>
      </div>

      {/* ---- Right: live preview ---- */}
      <div className="lg:col-span-2">
        <div className="sticky top-6">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
            <Eye className="h-3.5 w-3.5" />
            Live preview
          </p>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-300" />
              <span className="ml-2 truncate text-xs text-gray-400">
                /careers/{form.slug || "your-company"}
              </span>
            </div>
            <div className="p-5">
              <h3 className="text-xl font-bold text-gray-900">{form.title || "Your Page Title"}</h3>
              <p className="mt-2 text-sm text-gray-500">
                {form.description || "A short description shown on your career page..."}
              </p>
              {previewJobs.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                  No jobs selected yet — pick jobs below and they'll appear here.
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {previewJobs.slice(0, 4).map((job) => (
                    <div key={job.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-gray-400" />
                        <p className="text-sm font-semibold text-gray-900">{job.title}</p>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {[job.department, job.location].filter(Boolean).join(" · ") || "—"}
                      </p>
                      <button
                        type="button"
                        style={{ backgroundColor: previewColor }}
                        className="mt-3 rounded-md px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Apply Now
                      </button>
                    </div>
                  ))}
                  {previewJobs.length > 4 && (
                    <p className="text-center text-xs text-gray-400">
                      +{previewJobs.length - 4} more open position{previewJobs.length - 4 !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-400">Updates as you type. Save to publish your changes.</p>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Job selection — pick which open jobs are listed on the public career page
// ---------------------------------------------------------------------------
function CareerJobsSection({
  jobs,
  isLoading,
  selected,
  setSelected,
}: {
  jobs: JobPosting[];
  isLoading: boolean;
  selected: Set<string>;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const [open, setOpen] = useState(false);
  const [deptFilter, setDeptFilter] = useState("");
  const [locFilter, setLocFilter] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close the panel on an outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const departments = Array.from(new Set(jobs.map((j) => j.department).filter(Boolean))) as string[];
  const locations = Array.from(new Set(jobs.map((j) => j.location).filter(Boolean))) as string[];
  const filtered = jobs.filter(
    (j) => (!deptFilter || j.department === deptFilter) && (!locFilter || j.location === locFilter),
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((j) => next.add(j.id));
      return next;
    });
  }
  function clearFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((j) => next.delete(j.id));
      return next;
    });
  }

  const selectedJobs = jobs.filter((j) => selected.has(j.id));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Jobs on your career page</h3>
          <p className="mt-1 text-sm text-gray-500">
            Pick which open positions appear publicly — by job, department, or location.
            Internal-only jobs are never listed.
          </p>
        </div>
        {jobs.length > 0 && (
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            {selected.size} of {jobs.length} selected
          </span>
        )}
      </div>

      <div className="mt-5">
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 py-10 text-center">
            <Briefcase className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">
              No open public jobs yet. Publish a job (and keep it public) to list it here.
            </p>
          </div>
        ) : (
          <>
            {/* Multi-select dropdown */}
            <div className="relative max-w-xl" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:border-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <span className={selected.size ? "text-gray-900" : "text-gray-400"}>
                  {selected.size
                    ? `${selected.size} job${selected.size === 1 ? "" : "s"} selected`
                    : "Select jobs to show…"}
                </span>
                <ChevronDown
                  className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
                />
              </button>

              {open && (
                <div className="mt-2 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  {/* Department / location filters */}
                  <div className="flex flex-wrap gap-2 border-b border-gray-100 p-3">
                    <select
                      value={deptFilter}
                      onChange={(e) => setDeptFilter(e.target.value)}
                      className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                    >
                      <option value="">All departments</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <select
                      value={locFilter}
                      onChange={(e) => setLocFilter(e.target.value)}
                      className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                    >
                      <option value="">All locations</option>
                      {locations.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Bulk actions (operate on the filtered set) */}
                  <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 text-xs">
                    <span className="text-gray-400">{filtered.length} shown</span>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={selectAllFiltered}
                        className="font-medium text-brand-600 hover:text-brand-800"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={clearFiltered}
                        className="font-medium text-gray-500 hover:text-gray-700"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Checklist — capped height; scrolls when there are more jobs */}
                  <div className="max-h-[20rem] overflow-y-auto py-2">
                    {filtered.length === 0 ? (
                      <p className="px-3 py-6 text-center text-xs text-gray-400">
                        No jobs match these filters.
                      </p>
                    ) : (
                      filtered.map((job) => {
                        const checked = selected.has(job.id);
                        return (
                          <button
                            key={job.id}
                            type="button"
                            onClick={() => toggle(job.id)}
                            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50"
                          >
                            <span
                              className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                                checked ? "border-brand-600 bg-brand-600" : "border-gray-300 bg-white"
                              }`}
                            >
                              {checked && <Check className="h-3 w-3 text-white" />}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm text-gray-900">{job.title}</span>
                              <span className="block truncate text-xs text-gray-400">
                                {[job.department, job.location].filter(Boolean).join(" · ") || "—"}
                              </span>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Selected chips */}
            {selectedJobs.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedJobs.map((job) => (
                  <span
                    key={job.id}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-3 pr-1.5 text-xs font-medium text-brand-700"
                  >
                    {job.title}
                    <button
                      type="button"
                      onClick={() => toggle(job.id)}
                      className="rounded-full p-0.5 hover:bg-brand-100"
                      aria-label={`Remove ${job.title}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
