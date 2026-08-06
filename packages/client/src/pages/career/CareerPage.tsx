import { useState, useRef, useEffect } from "react";
import { useBlocker } from "react-router-dom";
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
  Palette,
  Globe2,
  CheckCircle2,
} from "lucide-react";
import { apiGet, apiPut } from "@/api/client";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { CareerPage as CareerPageType, JobPosting } from "@emp-recruit/shared";

// ===========================================================================
// Career Page — public career page config + which jobs to list
// ===========================================================================
export function CareerPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-28">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#111a35] via-[#18244a] to-brand-900 px-5 py-7 text-white shadow-xl sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-400/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex max-w-3xl items-start gap-4">
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 sm:flex"><Globe2 className="h-6 w-6 text-brand-100" aria-hidden="true" /></span>
          <div><p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-brand-200">Employer Brand</p>
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{t("careerAdmin.title")}</h1>
        <p className="mt-3 max-w-2xl text-pretty text-sm leading-6 text-slate-300 sm:text-base">
          {t("careerAdmin.subtitle")}
        </p>
          </div>
        </div>
      </section>

      <CareerPageSettings />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Career page configuration (title, description, slug, brand color)
// ---------------------------------------------------------------------------
function CareerPageSettings() {
  const { t } = useTranslation();
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

  const EMPTY_FORM = { title: "", description: "", primary_color: "#4F46E5", slug: "" };
  const [form, setForm] = useState(EMPTY_FORM);
  // Snapshot of the last-saved values, to detect unsaved edits.
  const [savedForm, setSavedForm] = useState(EMPTY_FORM);
  const [initialized, setInitialized] = useState(false);

  if (configQuery.data && !initialized) {
    const c = configQuery.data;
    // Strip stray HTML tags from description if a previous tool wrote them.
    const cleanDescription = (c.description || "").replace(/<[^>]+>/g, "").trim();
    const initial = {
      title: c.title || "",
      description: cleanDescription,
      primary_color: c.primary_color || "#4F46E5",
      slug: c.slug || "",
    };
    setForm(initial);
    setSavedForm(initial);
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
      toast.success(t("careerAdmin.saved"));
      setSavedForm(form); // current form is now the saved baseline
      queryClient.invalidateQueries({ queryKey: ["career-page-config"] });
      queryClient.invalidateQueries({ queryKey: ["career-page-jobs"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || t("careerAdmin.saveFailed"));
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    saveMutation.mutate();
  }

  // Unsaved-changes detection: config form or job selection differs from saved.
  const savedJobSet = new Set(
    (jobsQuery.data || []).filter((j) => Boolean(j.show_on_career_page)).map((j) => j.id),
  );
  const jobsDirty =
    jobSelection.size !== savedJobSet.size ||
    Array.from(jobSelection).some((id) => !savedJobSet.has(id));
  const isDirty =
    (initialized && JSON.stringify(form) !== JSON.stringify(savedForm)) ||
    (jobsInitialized && jobsDirty);

  // Warn before leaving with unsaved changes. useBlocker reliably intercepts
  // in-app navigation and works because the app is mounted under a data router
  // (see main.tsx); beforeunload covers browser close / refresh.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(t("careerAdmin.unsavedConfirm"))) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

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
    <form onSubmit={handleSubmit} className="grid grid-cols-1 items-start gap-6 xl:grid-cols-7">
      {/* ---- Left: the form ---- */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm xl:col-span-4 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Palette className="h-5 w-5" aria-hidden="true" /></span>
          <div><h2 className="text-lg font-bold text-gray-900">{t("careerAdmin.configTitle")}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {t("careerAdmin.configSubtitle")}
        </p>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <div>
            <label htmlFor="career-page-title" className="block text-sm font-semibold text-gray-700">{t("careerAdmin.pageTitleLabel")}</label>
            <input
              id="career-page-title"
              name="career-page-title"
              autoComplete="off"
              type="text"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder={t("careerAdmin.pageTitlePlaceholder")}
              className="mt-2 block min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors hover:border-gray-400 focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
            />
          </div>

          <div>
            <label htmlFor="career-page-description" className="block text-sm font-semibold text-gray-700">{t("careerAdmin.descriptionLabel")}</label>
            <textarea
              id="career-page-description"
              name="career-page-description"
              autoComplete="off"
              rows={3}
              maxLength={300}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder={t("careerAdmin.descriptionPlaceholder")}
              className="mt-2 block w-full resize-y rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm leading-6 shadow-sm transition-colors hover:border-gray-400 focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
            />
            <p className="mt-1 text-right text-xs text-gray-400">{form.description.length}/300</p>
          </div>

          <div>
            <label htmlFor="career-page-slug" className="block text-sm font-semibold text-gray-700">{t("careerAdmin.slugLabel")}</label>
            <div className="mt-1 flex items-center rounded-lg border border-gray-300 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
              <span className="flex items-center gap-1 border-r border-gray-200 px-3 py-2 text-sm text-gray-400">
                <Link2 className="h-3.5 w-3.5" />
                /careers/
              </span>
              <input
                id="career-page-slug"
                name="career-page-slug"
                autoComplete="off"
                spellCheck={false}
                type="text"
                value={form.slug}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                  }))
                }
                placeholder={t("careerAdmin.slugPlaceholder")}
                className="block flex-1 rounded-r-lg px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {t("careerAdmin.slugHint")}
            </p>
          </div>

          <div>
            <label htmlFor="career-brand-color" className="block text-sm font-semibold text-gray-700">{t("careerAdmin.brandColorLabel")}</label>
            <div className="mt-1 flex items-center gap-3">
              <input
                id="career-brand-color"
                name="career-brand-color"
                aria-label={t("careerAdmin.brandColorLabel")}
                type="color"
                value={previewColor}
                onChange={(e) => setForm((p) => ({ ...p, primary_color: e.target.value }))}
                className="h-10 w-14 cursor-pointer rounded border border-gray-300"
              />
              <input
                type="text"
                name="career-brand-hex"
                aria-label={t("careerAdmin.brandColorLabel")}
                autoComplete="off"
                spellCheck={false}
                value={form.primary_color}
                onChange={(e) => setForm((p) => ({ ...p, primary_color: e.target.value }))}
                className={`block w-32 rounded-lg border px-3 py-2 text-sm uppercase focus:outline-none focus:ring-1 ${
                  validColor
                    ? "border-gray-300 focus:border-brand-500 focus:ring-brand-500"
                    : "border-red-300 focus:border-red-500 focus:ring-red-500"
                }`}
              />
              {!validColor && <span className="text-xs text-red-500">{t("careerAdmin.invalidHex")}</span>}
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
            className="flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saveMutation.isPending ? t("careerAdmin.saving") : t("careerAdmin.saveChanges")}
          </button>
          {configQuery.data?.slug && (
            <a
              href={`/careers/${configQuery.data.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <ExternalLink className="h-4 w-4" />
              {t("careerAdmin.viewLivePage")}
            </a>
          )}
        </div>
      </section>

      {/* ---- Right: live preview ---- */}
      <aside className="min-w-0 xl:col-span-3">
        <div className="sticky top-6">
          <div className="mb-3 flex items-center justify-between gap-3"><p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
            <Eye className="h-3.5 w-3.5" />
            {t("careerAdmin.livePreview")}
          </p><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Live Preview</span></div>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg shadow-gray-200/60">
            <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-300" />
              <span className="ml-2 truncate text-xs text-gray-400">
                /careers/{form.slug || t("careerAdmin.slugPlaceholder")}
              </span>
            </div>
            <div className="bg-gray-50 p-3 sm:p-5">
              <div className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm sm:p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-200">Join Our Team</p>
              <h3 className="mt-2 text-balance text-xl font-bold sm:text-2xl">{form.title || t("careerAdmin.previewTitleDefault")}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {form.description || t("careerAdmin.descriptionPlaceholder")}
              </p>
              </div>
              {previewJobs.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                  {t("careerAdmin.noJobsPreview")}
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {previewJobs.slice(0, 4).map((job) => (
                    <div key={job.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
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
                        {t("careerAdmin.applyNow")}
                      </button>
                    </div>
                  ))}
                  {previewJobs.length > 4 && (
                    <p className="text-center text-xs text-gray-400">
                      {t("careerAdmin.moreOpenPositions", { count: previewJobs.length - 4 })}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-400">{t("careerAdmin.previewFooter")}</p>
        </div>
      </aside>
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
  const { t } = useTranslation();
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
          <h3 className="text-base font-semibold text-gray-900">{t("careerAdmin.jobsHeading")}</h3>
          <p className="mt-1 text-sm text-gray-500">
            {t("careerAdmin.jobsSubtitle")}
          </p>
        </div>
        {jobs.length > 0 && (
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            {t("careerAdmin.selectedOfTotal", { selected: selected.size, total: jobs.length })}
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
              {t("careerAdmin.noOpenJobs")}
            </p>
          </div>
        ) : (
          <>
            {/* Multi-select dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-haspopup="listbox"
                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors hover:border-gray-400 focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
              >
                <span className={selected.size ? "text-gray-900" : "text-gray-400"}>
                  {selected.size
                    ? t("careerAdmin.jobsSelected", { count: selected.size })
                    : t("careerAdmin.selectJobsPlaceholder")}
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
                      aria-label={t("careerAdmin.allDepartments")}
                      value={deptFilter}
                      onChange={(e) => setDeptFilter(e.target.value)}
                      className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                    >
                      <option value="">{t("careerAdmin.allDepartments")}</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={t("careerAdmin.allLocations")}
                      value={locFilter}
                      onChange={(e) => setLocFilter(e.target.value)}
                      className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                    >
                      <option value="">{t("careerAdmin.allLocations")}</option>
                      {locations.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Bulk actions (operate on the filtered set) */}
                  <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 text-xs">
                    <span className="text-gray-400">{t("careerAdmin.shownCount", { count: filtered.length })}</span>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={selectAllFiltered}
                        className="font-medium text-brand-600 hover:text-brand-800"
                      >
                        {t("careerAdmin.selectAll")}
                      </button>
                      <button
                        type="button"
                        onClick={clearFiltered}
                        className="font-medium text-gray-500 hover:text-gray-700"
                      >
                        {t("careerAdmin.clear")}
                      </button>
                    </div>
                  </div>

                  {/* Checklist — capped height; scrolls when there are more jobs */}
                  <div className="max-h-[20rem] overflow-y-auto py-2">
                    {filtered.length === 0 ? (
                      <p className="px-3 py-6 text-center text-xs text-gray-400">
                        {t("careerAdmin.noJobsMatch")}
                      </p>
                    ) : (
                      filtered.map((job) => {
                        const checked = selected.has(job.id);
                        return (
                          <button
                            key={job.id}
                            type="button"
                            onClick={() => toggle(job.id)}
                            role="option"
                            aria-selected={checked}
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                          >
                            <span
                              className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                                checked ? "border-brand-600 bg-brand-600" : "border-gray-300 bg-white"
                              }`}
                            >
                              {checked && <Check className="h-3 w-3 text-white" aria-hidden="true" />}
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
                      aria-label={t("careerAdmin.removeJob", { title: job.title })}
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
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
