import { useState } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Save,
  Plus,
  Pencil,
  Trash2,
  Eye,
  Mail,
  X,
  GitBranch,
  Share2,
} from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/api/client";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { EmailTemplate } from "@emp-recruit/shared";
import { PipelineSettingsPage } from "./PipelineSettingsPage";
import { JobBoardSettings } from "./JobBoardSettings";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function SettingsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"email" | "pipeline" | "boards">("email");

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{t("settings.title")}</h1>
      <p className="mt-1 text-sm text-gray-500">{t("settings.subtitle")}</p>

      {/* Tab buttons */}
      <div className="mt-6 flex gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1 w-fit">
        <button
          onClick={() => setTab("email")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "email" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Mail className="h-4 w-4" />
          {t("settings.tabs.email")}
        </button>
        <button
          onClick={() => setTab("pipeline")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "pipeline" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <GitBranch className="h-4 w-4" />
          {t("settings.tabs.pipeline")}
        </button>
        <button
          onClick={() => setTab("boards")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "boards" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Share2 className="h-4 w-4" />
          {t("settings.tabs.boards")}
        </button>
      </div>

      <div className="mt-6">
        {tab === "email" ? (
          <EmailTemplateSettings />
        ) : tab === "pipeline" ? (
          <PipelineSettingsPage />
        ) : (
          <JobBoardSettings />
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Email Template Settings
// ===========================================================================
function EmailTemplateSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    trigger: "",
    subject: "",
    body: "",
    is_active: true,
  });

  const templatesQuery = useQuery({
    queryKey: ["email-templates"],
    queryFn: async () => {
      const res = await apiGet<EmailTemplate[]>("/email-templates");
      return res.data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => apiPost("/email-templates", data),
    onSuccess: () => {
      toast.success(t("settings.email.templateCreated"));
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setShowCreate(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || t("settings.email.createFailed"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof form }) =>
      apiPut(`/email-templates/${id}`, data),
    onSuccess: () => {
      toast.success(t("settings.email.templateUpdated"));
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setEditingId(null);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || t("settings.email.updateFailed"));
    },
  });

  const previewMutation = useMutation({
    mutationFn: (id: string) => apiPost<{ subject: string; body: string }>(`/email-templates/${id}/preview`, {}),
    onSuccess: (res) => {
      setPreviewSubject(res.data?.subject || "");
      setPreviewHtml(res.data?.body || "");
    },
    onError: () => {
      toast.error(t("settings.email.previewFailed"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/email-templates/${id}`),
    onSuccess: () => {
      toast.success(t("settings.email.templateDeleted"));
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setDeleteId(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || t("settings.email.deleteFailed"));
    },
  });

  function resetForm() {
    setForm({ name: "", trigger: "", subject: "", body: "", is_active: true });
  }

  function startEdit(tpl: EmailTemplate) {
    setEditingId(tpl.id);
    setShowCreate(false);
    setForm({
      name: tpl.name,
      trigger: tpl.trigger,
      subject: tpl.subject,
      body: tpl.body,
      is_active: Boolean(tpl.is_active),
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const templates = templatesQuery.data || [];

  return (
    <div className="space-y-6">
      {/* Preview modal */}
      {previewHtml !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-2xl max-h-[80vh] overflow-auto rounded-xl bg-white p-6 shadow-xl">
            <button
              onClick={() => setPreviewHtml(null)}
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{t("settings.email.emailPreview")}</h3>
            {previewSubject && <p className="mb-4 border-b border-gray-200 pb-3 text-sm font-semibold text-gray-900">{previewSubject}</p>}
            <div
              className="prose prose-sm max-w-none border border-gray-200 rounded-lg p-4"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewHtml) }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{t("settings.email.heading")}</h2>
        <button
          onClick={() => {
            setShowCreate(!showCreate);
            setEditingId(null);
            resetForm();
          }}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreate ? t("settings.email.cancel") : t("settings.email.newTemplate")}
        </button>
      </div>

      {/* Create/Edit form */}
      {(showCreate || editingId) && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900">
            {editingId ? t("settings.email.editTemplate") : t("settings.email.createTemplate")}
          </h3>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t("settings.email.nameLabel")}</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t("settings.email.triggerLabel")}</label>
                <select
                  required
                  value={form.trigger}
                  onChange={(e) => setForm((p) => ({ ...p, trigger: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">{t("settings.email.selectTrigger")}</option>
                  <option value="application_received">{t("settings.email.triggers.applicationReceived")}</option>
                  <option value="interview_scheduled">{t("settings.email.triggers.interviewScheduled")}</option>
                  <option value="offer_sent">{t("settings.email.triggers.offerSent")}</option>
                  <option value="application_rejected">{t("settings.email.triggers.applicationRejected")}</option>
                  <option value="referral_submitted">{t("settings.email.triggers.referralSubmitted")}</option>
                  <option value="custom">{t("settings.email.triggers.custom")}</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t("settings.email.subjectLabel")}</label>
              <input
                type="text"
                required
                value={form.subject}
                onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                placeholder={t("settings.email.subjectPlaceholder", { jobTitle: "{{jobTitle}}" })}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t("settings.email.bodyLabel")}</label>
              <textarea
                required
                rows={8}
                value={form.body}
                onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                placeholder={t("settings.email.bodyPlaceholder", { candidateName: "{{candidateName}}" })}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              {/* #31 — live rendered preview under the raw HTML textarea so
                  users can see the formatted output instead of thinking the
                  raw `<p>...</p>` markup is what gets displayed. */}
              {form.body && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {t("settings.email.preview")}
                  </p>
                  <div
                    className="prose prose-sm max-w-none rounded-md bg-white p-3"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.body) }}
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                id="is_active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-brand-600"
              />
              <label htmlFor="is_active" className="text-sm text-gray-700">{t("settings.email.activeLabel")}</label>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {(createMutation.isPending || updateMutation.isPending) ? t("settings.email.saving") : editingId ? t("settings.email.update") : t("settings.email.create")}
              </button>
              <button
                type="button"
                onClick={() => { setEditingId(null); setShowCreate(false); resetForm(); }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t("settings.email.cancel")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Template list */}
      {templatesQuery.isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Mail className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">{t("settings.email.emptyState")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {(tpl.name || "").replace(/<[^>]+>/g, "")}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      tpl.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {tpl.is_active ? t("settings.email.statusActive") : t("settings.email.statusInactive")}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  {t("settings.email.triggerColon")} <span className="font-mono">{tpl.trigger}</span>
                </p>
                <p className="mt-0.5 text-xs text-gray-400 truncate">
                  {(tpl.subject || "").replace(/<[^>]+>/g, "")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => previewMutation.mutate(tpl.id)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title={t("settings.email.preview")}
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={() => startEdit(tpl)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title={t("settings.email.edit")}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteId(tpl.id)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  title={t("settings.email.delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={deleteId !== null}
        title={t("settings.email.deleteTitle")}
        message={t("settings.email.deleteMessage")}
        confirmLabel={t("settings.email.delete")}
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
