import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, XCircle, Loader2, ClipboardCheck, Inbox } from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

interface PendingApprovalOffer {
  id: string;
  candidate_name: string;
  job_title_display: string;
  salary_amount: string | number | null;
  salary_currency: string | null;
  created_at: string;
}

export function OfferApprovalsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["my-offer-approvals"],
    queryFn: () => apiGet<PendingApprovalOffer[]>("/offers/my-approvals"),
  });
  const offers = data?.data ?? [];

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      apiPost(`/offers/${id}/${action}`, {}),
    onSuccess: (_res, vars) => {
      toast.success(
        vars.action === "approve"
          ? t("offers.approvals.approved")
          : t("offers.approvals.rejected"),
      );
      queryClient.invalidateQueries({ queryKey: ["my-offer-approvals"] });
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message || t("offers.approvals.actionFailed")),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="h-7 w-7 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("offers.approvals.title")}</h1>
          <p className="text-sm text-gray-500">{t("offers.approvals.subtitle")}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : offers.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-12 text-center">
          <Inbox className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-gray-500">{t("offers.approvals.empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map((o) => {
            const busy = act.isPending && act.variables?.id === o.id;
            return (
              <div key={o.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{o.candidate_name}</p>
                    <p className="text-sm text-gray-500">{o.job_title_display}</p>
                    <p className="mt-1 text-sm text-gray-700">
                      {o.salary_amount != null
                        ? formatCurrency(Number(o.salary_amount) / 100, o.salary_currency || "INR")
                        : "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {t("offers.approvals.submitted", { date: formatDate(o.created_at) })}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <button
                      onClick={() => act.mutate({ id: o.id, action: "reject" })}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      {t("offers.approvals.reject")}
                    </button>
                    <button
                      onClick={() => act.mutate({ id: o.id, action: "approve" })}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {t("offers.approvals.approve")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
