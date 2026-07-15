import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  Loader2,
  AlertCircle,
  MapPin,
  Video,
  Phone,
  Users,
  FileEdit,
  DollarSign,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";

const STAGE_CONFIG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  applied: { color: "text-blue-700", bg: "bg-blue-100", label: "Applied", icon: "bg-blue-500" },
  screened: { color: "text-indigo-700", bg: "bg-indigo-100", label: "Screened", icon: "bg-indigo-500" },
  interview: { color: "text-amber-700", bg: "bg-amber-100", label: "Interview", icon: "bg-amber-500" },
  offer: { color: "text-emerald-700", bg: "bg-emerald-100", label: "Offer", icon: "bg-emerald-500" },
  hired: { color: "text-green-700", bg: "bg-green-100", label: "Hired", icon: "bg-green-500" },
  rejected: { color: "text-red-700", bg: "bg-red-100", label: "Rejected", icon: "bg-red-500" },
  withdrawn: { color: "text-gray-700", bg: "bg-gray-100", label: "Withdrawn", icon: "bg-gray-500" },
};

const INTERVIEW_TYPE_ICONS: Record<string, React.ReactNode> = {
  video: <Video className="h-4 w-4" />,
  phone: <Phone className="h-4 w-4" />,
  onsite: <MapPin className="h-4 w-4" />,
  panel: <Users className="h-4 w-4" />,
  assignment: <FileEdit className="h-4 w-4" />,
};

interface TimelineEntry {
  id: string;
  from_stage: string | null;
  to_stage: string;
  notes: string | null;
  created_at: string;
}

interface InterviewEntry {
  id: string;
  type: string;
  round: number;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  meeting_link: string | null;
  status: string;
}

interface OfferEntry {
  id: string;
  status: string;
  job_title: string;
  salary_amount: number;
  salary_currency: string;
  joining_date: string;
  expiry_date: string;
}

interface DetailData {
  application: {
    id: string;
    stage: string;
    job_title: string;
    job_department: string | null;
    job_location: string | null;
    applied_at: string;
    updated_at: string;
  };
  timeline: TimelineEntry[];
  interviews: InterviewEntry[];
  offers: OfferEntry[];
}

export function PortalApplicationDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("portal_token");
    if (!token) {
      setError(t("portal.errors.noToken"));
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/portal/applications/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          if (res.status === 401) {
            localStorage.removeItem("portal_token");
            throw new Error(t("portal.errors.expired"));
          }
          throw new Error(body?.error?.message || t("portal.errors.loadApplication"));
        }

        const json = await res.json();
        setData(json.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

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
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {t("portal.actions.requestNewLink")}
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { application, timeline, interviews, offers } = data;
  const stageInfo = STAGE_CONFIG[application.stage] || {
    color: "text-gray-700",
    bg: "bg-gray-100",
    label: application.stage,
    icon: "bg-gray-500",
  };
  const stageLabel = STAGE_CONFIG[application.stage]
    ? t(`portal.stages.${application.stage}`)
    : application.stage;

  const upcomingInterviews = interviews.filter(
    (i) => i.status === "scheduled" && new Date(i.scheduled_at) >= new Date(),
  );

  const activeOffers = offers.filter((o) => o.status === "sent" || o.status === "approved");

  return (
    <div>
      {/* Back link */}
      <Link
        to="/portal/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-600 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("portal.actions.backToDashboard")}
      </Link>

      {/* Header */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{application.job_title}</h1>
            <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
              {application.job_department && <span>{application.job_department}</span>}
              {application.job_location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {application.job_location}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {t("portal.common.appliedOn", { date: new Date(application.applied_at).toLocaleDateString() })}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {t("portal.common.updatedOn", { date: new Date(application.updated_at).toLocaleDateString() })}
              </span>
            </div>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${stageInfo.bg} ${stageInfo.color}`}
          >
            {stageLabel}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Timeline — left/main column */}
        <div className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("portal.application.timelineTitle")}</h2>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            {timeline.length === 0 ? (
              <p className="text-gray-500">{t("portal.application.noTimeline")}</p>
            ) : (
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-gray-200" />

                <div className="space-y-6">
                  {timeline.map((entry, idx) => {
                    const isLast = idx === timeline.length - 1;
                    const entryStage = STAGE_CONFIG[entry.to_stage];

                    return (
                      <div key={entry.id} className="relative flex gap-4 pl-1">
                        <div
                          className={`relative z-10 mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${
                            isLast ? "ring-2 ring-brand-200" : ""
                          } ${entryStage?.icon || "bg-gray-400"}`}
                        >
                          {isLast ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                          ) : (
                            <Circle className="h-3 w-3 text-white" />
                          )}
                        </div>
                        <div className="flex-1 pb-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">
                              {entryStage ? t(`portal.stages.${entry.to_stage}`) : entry.to_stage}
                            </p>
                            <span className="text-xs text-gray-400">
                              {new Date(entry.created_at).toLocaleDateString()}{" "}
                              {new Date(entry.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          {entry.notes && (
                            <p className="mt-1 text-sm text-gray-600">{entry.notes}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Upcoming Interviews */}
          {upcomingInterviews.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("portal.application.upcomingInterviews")}</h2>
              <div className="space-y-3">
                {upcomingInterviews.map((interview) => (
                  <div
                    key={interview.id}
                    className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-100 text-brand-600">
                        {INTERVIEW_TYPE_ICONS[interview.type] || <Calendar className="h-4 w-4" />}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{interview.title}</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {t("portal.application.dateAtTime", {
                        date: new Date(interview.scheduled_at).toLocaleDateString(),
                        time: new Date(interview.scheduled_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                      })}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {t("portal.application.durationMinutes", { minutes: interview.duration_minutes })}
                      {interview.type && ` \u00b7 ${interview.type}`}
                    </p>
                    {interview.meeting_link && (
                      <a
                        href={interview.meeting_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
                      >
                        {t("portal.actions.joinMeeting")}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {interview.location && (
                      <p className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                        <MapPin className="h-3 w-3" />
                        {interview.location}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Offers */}
          {activeOffers.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("portal.application.offers")}</h2>
              <div className="space-y-3">
                {activeOffers.map((offer) => (
                  <div
                    key={offer.id}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm font-medium text-emerald-900">{offer.job_title}</span>
                    </div>
                    <p className="text-xs text-emerald-700">
                      {t("portal.application.joiningDate", { date: new Date(offer.joining_date).toLocaleDateString() })}
                    </p>
                    <p className="text-xs text-emerald-700">
                      {t("portal.application.expires", { date: new Date(offer.expiry_date).toLocaleDateString() })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
