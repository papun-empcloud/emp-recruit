import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileText,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  User,
  Briefcase,
  Calendar,
  DollarSign,
  AlertCircle,
  FileDown,
  Eye,
  Mail,
  X,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import toast from "react-hot-toast";
import type { Offer, OfferApprover } from "@emp-recruit/shared";

type OfferDetail = Offer & {
  approvers: OfferApprover[];
  candidate_name?: string;
  candidate_email?: string | null;
  job_title_display?: string;
};

interface OfferLetterTemplate {
  id: string;
  name: string;
  is_default: boolean;
}

interface GeneratedLetter {
  id: string;
  content: string;
  file_path: string | null;
  sent_at: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-700", icon: FileText },
  pending_approval: { label: "Pending Approval", className: "bg-yellow-100 text-yellow-700", icon: Clock },
  approved: { label: "Approved", className: "bg-blue-100 text-blue-700", icon: CheckCircle2 },
  sent: { label: "Sent", className: "bg-purple-100 text-purple-700", icon: Send },
  accepted: { label: "Accepted", className: "bg-green-100 text-green-700", icon: CheckCircle2 },
  declined: { label: "Declined", className: "bg-red-100 text-red-700", icon: XCircle },
  expired: { label: "Expired", className: "bg-gray-100 text-gray-500", icon: AlertCircle },
  revoked: { label: "Revoked", className: "bg-red-100 text-red-600", icon: Ban },
};

const APPROVER_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-700" },
  approved: { label: "Approved", className: "bg-green-100 text-green-700" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700" },
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    minimumFractionDigits: 0,
  }).format(amount / 100);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "---";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function OfferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["offer", id],
    queryFn: () => apiGet<OfferDetail>(`/offers/${id}`),
    enabled: !!id,
  });

  const offer = data?.data;

  // #21 — Submit for Approval state. The backend rejects an empty
  // approver_ids array, so we now gather selected approvers from a modal
  // picker and surface errors via toast.
  const [showApproverModal, setShowApproverModal] = useState(false);
  const [selectedApproverIds, setSelectedApproverIds] = useState<number[]>([]);

  const { data: usersData } = useQuery({
    queryKey: ["org-users", "approver"],
    queryFn: () =>
      apiGet<{ id: number; first_name: string; last_name: string; email: string; role: string; designation: string | null }[]>(
        "/organizations/users",
        { role: "approver" },
      ),
    enabled: showApproverModal,
  });
  const orgUsers = usersData?.data ?? [];

  const submitApproval = useMutation({
    mutationFn: (approver_ids: number[]) =>
      apiPost(`/offers/${id}/submit-approval`, { approver_ids }),
    onSuccess: () => {
      toast.success("Offer submitted for approval");
      setShowApproverModal(false);
      setSelectedApproverIds([]);
      queryClient.invalidateQueries({ queryKey: ["offer", id] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || "Failed to submit for approval";
      toast.error(msg);
    },
  });

  const sendOffer = useMutation({
    mutationFn: () => apiPost(`/offers/${id}/send`),
    onSuccess: () => {
      toast.success("Offer sent to candidate");
      queryClient.invalidateQueries({ queryKey: ["offer", id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || "Failed to send offer");
    },
  });

  const revokeOffer = useMutation({
    mutationFn: () => apiPost(`/offers/${id}/revoke`),
    onSuccess: () => {
      toast.success("Offer revoked");
      queryClient.invalidateQueries({ queryKey: ["offer", id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || "Failed to revoke offer");
    },
  });

  // #34 — approve/reject mutations previously had no onError handler, so
  // a 403 ("You are not an approver for this offer") or 400 ("You have
  // already acted on this offer") silently failed and the user thought
  // the buttons were broken. Surface the server message via toast.
  const approveOffer = useMutation({
    mutationFn: (comment?: string) => apiPost(`/offers/${id}/approve`, { comment }),
    onSuccess: () => {
      toast.success("Offer approved");
      queryClient.invalidateQueries({ queryKey: ["offer", id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || "Failed to approve offer");
    },
  });

  const rejectOffer = useMutation({
    mutationFn: (comment?: string) => apiPost(`/offers/${id}/reject`, { comment }),
    onSuccess: () => {
      toast.success("Offer rejected");
      queryClient.invalidateQueries({ queryKey: ["offer", id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || "Failed to reject offer");
    },
  });

  const acceptOffer = useMutation({
    mutationFn: () => apiPost<Offer>(`/offers/${id}/accept`),
    onSuccess: (res) => {
      toast.success("Offer accepted");
      // Seed the cache with the server's new status immediately (merge so we
      // keep the enriched fields the transition endpoint doesn't return) — this
      // flips the status-gated buttons right away, then the invalidate refetches
      // the fully-enriched record.
      if (res?.data) {
        queryClient.setQueryData<OfferDetail>(["offer", id], (prev) =>
          prev ? { ...prev, ...res.data } : prev,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["offer", id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || "Failed to accept offer");
    },
  });

  const declineOffer = useMutation({
    mutationFn: () => apiPost<Offer>(`/offers/${id}/decline`),
    onSuccess: (res) => {
      toast.success("Offer declined");
      if (res?.data) {
        queryClient.setQueryData<OfferDetail>(["offer", id], (prev) =>
          prev ? { ...prev, ...res.data } : prev,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["offer", id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || "Failed to decline offer");
    },
  });

  // --- Offer Letter ---
  const [showLetterPreview, setShowLetterPreview] = useState(false);
  const [showTemplateSelect, setShowTemplateSelect] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const { data: templatesData } = useQuery({
    queryKey: ["offer-letter-templates"],
    queryFn: () => apiGet<OfferLetterTemplate[]>("/offer-letters/templates"),
    enabled: showTemplateSelect,
  });

  const { data: letterData, refetch: refetchLetter } = useQuery({
    queryKey: ["offer-letter", id],
    queryFn: () => apiGet<GeneratedLetter>(`/offer-letters/${id}`),
    enabled: !!id,
    retry: false,
  });

  const generateLetter = useMutation({
    mutationFn: (templateId: string) =>
      apiPost(`/offer-letters/generate/${id}`, { templateId }),
    onSuccess: () => {
      toast.success("Offer letter generated");
      refetchLetter();
      setShowTemplateSelect(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed to generate letter"),
  });

  const sendLetter = useMutation({
    mutationFn: () => apiPost(`/offer-letters/${id}/send`),
    onSuccess: () => {
      toast.success("Offer letter sent to candidate");
      refetchLetter();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed to send letter"),
  });

  const generatedLetter = letterData?.data;
  const letterTemplates = templatesData?.data || [];

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="flex h-64 flex-col items-center justify-center">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <h3 className="mt-4 text-sm font-medium text-gray-900">Offer not found</h3>
        <Link to="/offers" className="mt-2 text-sm text-brand-600 hover:underline">
          Back to offers
        </Link>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[offer.status] || STATUS_CONFIG.draft;
  const StatusIcon = statusConfig.icon;

  // Terminal states — the offer is closed and no further action (generating /
  // emailing a letter, approving) applies.
  const isTerminal = ["revoked", "declined", "expired"].includes(offer.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate("/offers")} className="rounded-lg p-2 hover:bg-gray-100 transition-colors">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Offer Details</h1>
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${statusConfig.className}`}>
              <StatusIcon className="h-4 w-4" />
              {statusConfig.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">Offer #{offer.id.slice(0, 8)}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {offer.status === "draft" && (
            <>
              {/* #21 — was linking to `/offers/:id` (the same detail page);
                  now routes to a real edit page. */}
              <Link
                to={`/offers/${id}/edit`}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Edit
              </Link>
              {/* #21 — was POSTing { approver_ids: [] }, which the server
                  rejected with "At least one approver is required". Open a
                  modal to pick approvers first. */}
              <button
                onClick={() => setShowApproverModal(true)}
                disabled={submitApproval.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50 transition-colors"
              >
                <Clock className="h-4 w-4" />
                Submit for Approval
              </button>
            </>
          )}
          {offer.status === "pending_approval" && (
            <>
              <button
                onClick={() => approveOffer.mutate(undefined)}
                disabled={approveOffer.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </button>
              <button
                onClick={() => rejectOffer.mutate(undefined)}
                disabled={rejectOffer.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
            </>
          )}
          {offer.status === "approved" && (
            <button
              onClick={() => sendOffer.mutate()}
              disabled={sendOffer.isPending}
              title="Move the offer to 'Sent'. Email the letter from the Offer Letter section below."
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              <Send className="h-4 w-4" />
              {sendOffer.isPending ? "Marking..." : "Mark as Sent"}
            </button>
          )}
          {offer.status === "sent" && (
            <>
              <button
                onClick={() => acceptOffer.mutate()}
                disabled={acceptOffer.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <CheckCircle2 className="h-4 w-4" />
                Mark Accepted
              </button>
              <button
                onClick={() => declineOffer.mutate()}
                disabled={declineOffer.isPending}
                className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                <XCircle className="h-4 w-4" />
                Mark Declined
              </button>
            </>
          )}
          {["sent", "approved", "pending_approval"].includes(offer.status) && (
            <button
              onClick={() => revokeOffer.mutate()}
              disabled={revokeOffer.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <Ban className="h-4 w-4" />
              Revoke
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Details Card */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Offer Information</h2>
            <div className="mt-4 grid grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <User className="mt-0.5 h-5 w-5 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase text-gray-500">Candidate</p>
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {offer.candidate_name || offer.candidate_id}
                  </p>
                  {offer.candidate_email && (
                    <p className="text-xs text-gray-500 truncate">{offer.candidate_email}</p>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Briefcase className="mt-0.5 h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">Job Title</p>
                  <p className="text-sm font-medium text-gray-900">{offer.job_title}</p>
                  {offer.department && <p className="text-xs text-gray-500">{offer.department}</p>}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <DollarSign className="mt-0.5 h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">Salary</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatCurrency(offer.salary_amount, offer.salary_currency)}
                    <span className="ml-1 text-xs text-gray-500">/ year</span>
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="mt-0.5 h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">Joining Date</p>
                  <p className="text-sm font-medium text-gray-900">{formatDate(offer.joining_date)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="mt-0.5 h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">Expiry Date</p>
                  <p className="text-sm font-medium text-gray-900">{formatDate(offer.expiry_date)}</p>
                </div>
              </div>
              {offer.sent_at && (
                <div className="flex items-start gap-3">
                  <Send className="mt-0.5 h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-xs font-medium uppercase text-gray-500">Sent At</p>
                    <p className="text-sm font-medium text-gray-900">{formatDate(offer.sent_at)}</p>
                  </div>
                </div>
              )}
              {offer.responded_at && (
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-xs font-medium uppercase text-gray-500">Responded At</p>
                    <p className="text-sm font-medium text-gray-900">{formatDate(offer.responded_at)}</p>
                  </div>
                </div>
              )}
            </div>

            {offer.benefits && (
              <div className="mt-6 border-t border-gray-200 pt-4">
                <p className="text-xs font-medium uppercase text-gray-500">Benefits</p>
                <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{offer.benefits}</p>
              </div>
            )}

            {offer.notes && (
              <div className="mt-4 border-t border-gray-200 pt-4">
                <p className="text-xs font-medium uppercase text-gray-500">Notes</p>
                <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{offer.notes}</p>
              </div>
            )}
          </div>

          {/* Offer Letter Section */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileDown className="h-5 w-5 text-gray-400" />
                Offer Letter
              </h2>
              <div className="flex items-center gap-2">
                {/* Preview stays available for record-keeping; Generate/Email are
                    hidden once the offer is in a terminal state (revoked etc.). */}
                {!isTerminal && (
                  <button
                    onClick={() => setShowTemplateSelect(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    <FileText className="h-4 w-4" />
                    {generatedLetter ? "Regenerate" : "Generate Offer Letter"}
                  </button>
                )}
                {generatedLetter && (
                  <>
                    <button
                      onClick={() => setShowLetterPreview(true)}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Eye className="h-4 w-4" />
                      Preview
                    </button>
                    {!isTerminal && (
                      <button
                        onClick={() => sendLetter.mutate()}
                        disabled={sendLetter.isPending}
                        title="Email the generated offer letter to the candidate"
                        className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        <Mail className="h-4 w-4" />
                        {sendLetter.isPending ? "Sending..." : "Email Offer Letter"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {generatedLetter ? (
              <div
                className={`mt-4 rounded-lg border p-4 ${
                  isTerminal ? "border-gray-200 bg-gray-50" : "border-green-200 bg-green-50"
                }`}
              >
                <p className={`text-sm ${isTerminal ? "text-gray-600" : "text-green-800"}`}>
                  {isTerminal
                    ? `This offer was ${statusConfig.label.toLowerCase()}. The letter below is kept for reference.`
                    : "Offer letter has been generated."}
                  {generatedLetter.sent_at && (
                    <span className="ml-2 font-medium">
                      Sent on {formatDate(generatedLetter.sent_at)}
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <div className="mt-4 flex flex-col items-center justify-center py-8 text-center">
                <FileText className="h-10 w-10 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">
                  {isTerminal
                    ? "No offer letter was generated for this offer."
                    : 'No offer letter generated yet. Click "Generate Offer Letter" to create one from a template.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Template Selection Modal */}
        {showTemplateSelect && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <button
                onClick={() => setShowTemplateSelect(false)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
              <h3 className="text-lg font-semibold text-gray-900">Select Template</h3>
              <p className="mt-1 text-sm text-gray-500">Choose a template to generate the offer letter.</p>
              <div className="mt-4 space-y-2">
                {letterTemplates.length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-500">
                    No templates found.{" "}
                    <Link to="/offers/letter-templates" className="text-brand-600 hover:underline">
                      Create one first.
                    </Link>
                  </p>
                ) : (
                  letterTemplates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplateId(t.id)}
                      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                        selectedTemplateId === t.id
                          ? "border-brand-500 bg-brand-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <FileText className="h-5 w-5 text-gray-400" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{t.name}</p>
                        {t.is_default && (
                          <span className="text-xs text-blue-600">Default</span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
              {letterTemplates.length > 0 && (
                <button
                  onClick={() => selectedTemplateId && generateLetter.mutate(selectedTemplateId)}
                  disabled={!selectedTemplateId || generateLetter.isPending}
                  className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {generateLetter.isPending ? "Generating..." : "Generate Letter"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Letter Preview Modal */}
        {showLetterPreview && generatedLetter && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="relative w-full max-w-3xl max-h-[85vh] overflow-auto rounded-xl bg-white p-6 shadow-xl">
              <button
                onClick={() => setShowLetterPreview(false)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Offer Letter Preview</h3>
              <div
                className="prose prose-sm max-w-none border border-gray-200 rounded-lg p-6"
                dangerouslySetInnerHTML={{ __html: generatedLetter.content }}
              />
            </div>
          </div>
        )}

        {/* Approval Workflow Sidebar */}
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Approval Workflow</h2>
            {isTerminal && Array.isArray(offer.approvers) && offer.approvers.length > 0 && (
              <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
                This offer was {statusConfig.label.toLowerCase()} — the approval workflow no longer applies.
              </p>
            )}
            {/* #22 — defensive: if the API ever returns offer without
                `approvers` (e.g. older row shape), don't crash the render. */}
            {(!Array.isArray(offer.approvers) || offer.approvers.length === 0) ? (
              <div className="mt-4 flex flex-col items-center justify-center py-8">
                <Clock className="h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500 text-center">
                  No approvers assigned yet. Submit this offer for approval to begin the workflow.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {(offer.approvers ?? []).map((approver, idx) => {
                  const aStatus = APPROVER_STATUS[approver.status] || APPROVER_STATUS.pending;
                  return (
                    <div
                      key={approver.id}
                      className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-600">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          User #{approver.user_id}
                        </p>
                        {approver.notes && (
                          <p className="text-xs text-gray-500 truncate">{approver.notes}</p>
                        )}
                        {approver.acted_at && (
                          <p className="text-xs text-gray-400">{formatDate(approver.acted_at)}</p>
                        )}
                      </div>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${aStatus.className}`}>
                        {aStatus.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Timeline</h2>
            <div className="mt-4 space-y-4">
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="h-2 w-2 rounded-full bg-gray-400" />
                  <div className="w-px flex-1 bg-gray-200" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Created</p>
                  <p className="text-xs text-gray-500">{formatDate(offer.created_at)}</p>
                </div>
              </div>
              {offer.approved_at && (
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-blue-400" />
                    <div className="w-px flex-1 bg-gray-200" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Approved</p>
                    <p className="text-xs text-gray-500">{formatDate(offer.approved_at)}</p>
                  </div>
                </div>
              )}
              {offer.sent_at && (
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-purple-400" />
                    <div className="w-px flex-1 bg-gray-200" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Sent to Candidate</p>
                    <p className="text-xs text-gray-500">{formatDate(offer.sent_at)}</p>
                  </div>
                </div>
              )}
              {offer.responded_at && (
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`h-2 w-2 rounded-full ${offer.status === "accepted" ? "bg-green-400" : "bg-red-400"}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {offer.status === "accepted" ? "Accepted" : "Declined"}
                    </p>
                    <p className="text-xs text-gray-500">{formatDate(offer.responded_at)}</p>
                  </div>
                </div>
              )}
              {offer.status === "revoked" && (
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Revoked</p>
                    <p className="text-xs text-gray-500">{formatDate(offer.updated_at)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* #21 — Approver picker modal */}
      {showApproverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-base font-semibold text-gray-900">Submit for Approval</h3>
              <button
                onClick={() => {
                  setShowApproverModal(false);
                  setSelectedApproverIds([]);
                }}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="mb-3 text-sm text-gray-500">
                Pick one or more approvers. They'll review this offer before it can be sent.
              </p>
              {orgUsers.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-400">Loading users...</p>
              ) : (
                <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
                  {orgUsers.map((u) => (
                    <label
                      key={u.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2 last:border-b-0 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedApproverIds.includes(u.id)}
                        onChange={(e) =>
                          setSelectedApproverIds((prev) =>
                            e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id),
                          )
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {u.first_name} {u.last_name}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {u.designation || u.role} · {u.email}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 rounded-b-xl">
              <button
                type="button"
                onClick={() => {
                  setShowApproverModal(false);
                  setSelectedApproverIds([]);
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedApproverIds.length === 0) {
                    toast.error("Please pick at least one approver");
                    return;
                  }
                  submitApproval.mutate(selectedApproverIds);
                }}
                disabled={submitApproval.isPending}
                className="rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
              >
                {submitApproval.isPending ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
