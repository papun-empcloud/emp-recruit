import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams, Link } from "react-router-dom";
import {
  Briefcase,
  Calendar,
  Clock,
  ChevronRight,
  Loader2,
  AlertCircle,
  FileText,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";

// Stage colors and labels
const STAGE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  applied: { color: "text-blue-700", bg: "bg-blue-100", label: "Applied" },
  screened: { color: "text-indigo-700", bg: "bg-indigo-100", label: "Screened" },
  interview: { color: "text-amber-700", bg: "bg-amber-100", label: "Interview" },
  offer: { color: "text-emerald-700", bg: "bg-emerald-100", label: "Offer" },
  hired: { color: "text-green-700", bg: "bg-green-100", label: "Hired" },
  rejected: { color: "text-red-700", bg: "bg-red-100", label: "Rejected" },
  withdrawn: { color: "text-gray-700", bg: "bg-gray-100", label: "Withdrawn" },
};

const PIPELINE_STAGES = ["applied", "screened", "interview", "offer", "hired"];

interface Application {
  id: string;
  job_title: string;
  job_department: string | null;
  stage: string;
  applied_at: string;
  updated_at: string;
}

interface DashboardData {
  candidate: { first_name: string; last_name: string; email: string };
  applications: Application[];
}

function getPortalToken(): string | null {
  // First check URL params, then localStorage
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get("token");
  if (urlToken) {
    localStorage.setItem("portal_token", urlToken);
    // Clean up URL
    window.history.replaceState({}, "", window.location.pathname);
    return urlToken;
  }
  return localStorage.getItem("portal_token");
}

function StagePipeline({ currentStage }: { currentStage: string }) {
  const { t } = useTranslation();
  const currentIdx = PIPELINE_STAGES.indexOf(currentStage);
  const isTerminal = currentStage === "rejected" || currentStage === "withdrawn";

  return (
    <div className="flex items-center gap-1 mt-3">
      {PIPELINE_STAGES.map((stage, idx) => {
        const isActive = idx <= currentIdx && !isTerminal;
        const isCurrent = stage === currentStage;

        return (
          <div key={stage} className="flex items-center gap-1 flex-1">
            <div
              className={`h-2 flex-1 rounded-full transition-colors ${
                isActive
                  ? isCurrent
                    ? "bg-brand-600"
                    : "bg-brand-400"
                  : "bg-gray-200"
              }`}
              title={STAGE_CONFIG[stage] ? t(`portal.stages.${stage}`) : stage}
            />
          </div>
        );
      })}
    </div>
  );
}

export function PortalDashboardPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getPortalToken();
    if (!token) {
      setError(t("portal.errors.noToken"));
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/portal/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          if (res.status === 401) {
            localStorage.removeItem("portal_token");
            throw new Error(t("portal.errors.expired"));
          }
          throw new Error(body?.error?.message || t("portal.errors.loadDashboard"));
        }

        const json = await res.json();
        setData(json.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-red-500" />
          <p className="mb-4 text-gray-700">{error}</p>
          <Link
            to="/portal"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            {t("portal.actions.requestNewLink")}
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { candidate, applications } = data;

  return (
    <div>
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("portal.dashboard.welcome", { name: candidate.first_name })}
        </h1>
        <p className="mt-1 text-gray-600">
          {t("portal.dashboard.subtitle")}
        </p>
      </div>

      {/* Quick stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
              <FileText className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{applications.length}</p>
              <p className="text-sm text-gray-500">{t("portal.dashboard.totalApplications")}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {applications.filter((a) => a.stage === "interview").length}
              </p>
              <p className="text-sm text-gray-500">{t("portal.dashboard.inInterview")}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
              <Briefcase className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {applications.filter((a) => a.stage === "offer" || a.stage === "hired").length}
              </p>
              <p className="text-sm text-gray-500">{t("portal.dashboard.offersHired")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Applications */}
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("portal.dashboard.yourApplications")}</h2>

      {applications.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <Briefcase className="mx-auto mb-4 h-10 w-10 text-gray-400" />
          <p className="text-gray-600">{t("portal.dashboard.noApplications")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => {
            const stageInfo = STAGE_CONFIG[app.stage] || {
              color: "text-gray-700",
              bg: "bg-gray-100",
              label: app.stage,
            };
            const stageLabel = STAGE_CONFIG[app.stage] ? t(`portal.stages.${app.stage}`) : app.stage;

            return (
              <Link
                key={app.id}
                to={`/portal/applications/${app.id}`}
                className="group block rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-brand-300 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-semibold text-gray-900 group-hover:text-brand-600 transition-colors">
                        {app.job_title}
                      </h3>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${stageInfo.bg} ${stageInfo.color}`}
                      >
                        {stageLabel}
                      </span>
                    </div>
                    {app.job_department && (
                      <p className="mt-1 text-sm text-gray-500">{app.job_department}</p>
                    )}
                    <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {t("portal.common.appliedOn", { date: new Date(app.applied_at).toLocaleDateString() })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {t("portal.common.updatedOn", { date: new Date(app.updated_at).toLocaleDateString() })}
                      </span>
                    </div>
                    <StagePipeline currentStage={app.stage} />
                  </div>
                  <ChevronRight className="mt-1 h-5 w-5 text-gray-400 group-hover:text-brand-600 transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
