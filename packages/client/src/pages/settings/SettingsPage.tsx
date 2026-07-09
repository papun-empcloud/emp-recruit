import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Save,
  Plus,
  Pencil,
  Eye,
  Mail,
  X,
  GitBranch,
  Share2,
} from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/api/client";
import toast from "react-hot-toast";
import type { EmailTemplate } from "@emp-recruit/shared";
import { PipelineSettingsPage } from "./PipelineSettingsPage";
import { JobBoardSettings } from "./JobBoardSettings";

export function SettingsPage() {
  const [tab, setTab] = useState<"email" | "pipeline" | "boards">("email");

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      <p className="mt-1 text-sm text-gray-500">Configure your email templates, pipeline, and job boards.</p>

      {/* Tab buttons */}
      <div className="mt-6 flex gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1 w-fit">
        <button
          onClick={() => setTab("email")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "email" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Mail className="h-4 w-4" />
          Email Templates
        </button>
        <button
          onClick={() => setTab("pipeline")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "pipeline" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <GitBranch className="h-4 w-4" />
          Pipeline
        </button>
        <button
          onClick={() => setTab("boards")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "boards" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Share2 className="h-4 w-4" />
          Job Boards
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
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

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
      toast.success("Template created");
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setShowCreate(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || "Failed to create template");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof form }) =>
      apiPut(`/email-templates/${id}`, data),
    onSuccess: () => {
      toast.success("Template updated");
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setEditingId(null);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || "Failed to update template");
    },
  });

  const previewMutation = useMutation({
    mutationFn: (id: string) => apiPost<{ subject: string; body: string }>(`/email-templates/${id}/preview`, {}),
    onSuccess: (res) => {
      setPreviewHtml(res.data?.body || "");
    },
    onError: () => {
      toast.error("Failed to generate preview");
    },
  });

  function resetForm() {
    setForm({ name: "", trigger: "", subject: "", body: "", is_active: true });
  }

  function startEdit(t: EmailTemplate) {
    setEditingId(t.id);
    setShowCreate(false);
    setForm({
      name: t.name,
      trigger: t.trigger,
      subject: t.subject,
      body: t.body,
      is_active: Boolean(t.is_active),
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
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Email Preview</h3>
            <div
              className="prose prose-sm max-w-none border border-gray-200 rounded-lg p-4"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Email Templates</h2>
        <button
          onClick={() => {
            setShowCreate(!showCreate);
            setEditingId(null);
            resetForm();
          }}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreate ? "Cancel" : "New Template"}
        </button>
      </div>

      {/* Create/Edit form */}
      {(showCreate || editingId) && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900">
            {editingId ? "Edit Template" : "Create Template"}
          </h3>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Trigger *</label>
                <select
                  required
                  value={form.trigger}
                  onChange={(e) => setForm((p) => ({ ...p, trigger: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Select trigger...</option>
                  <option value="application_received">Application Received</option>
                  <option value="interview_scheduled">Interview Scheduled</option>
                  <option value="offer_sent">Offer Sent</option>
                  <option value="application_rejected">Application Rejected</option>
                  <option value="referral_submitted">Referral Submitted</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Subject *</label>
              <input
                type="text"
                required
                value={form.subject}
                onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                placeholder="e.g. Thank you for applying to {{jobTitle}}"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Body (HTML + Handlebars) *</label>
              <textarea
                required
                rows={8}
                value={form.body}
                onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                placeholder="<p>Dear {{candidateName}},</p>..."
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              {/* #31 — live rendered preview under the raw HTML textarea so
                  users can see the formatted output instead of thinking the
                  raw `<p>...</p>` markup is what gets displayed. */}
              {form.body && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Preview
                  </p>
                  <div
                    className="prose prose-sm max-w-none rounded-md bg-white p-3"
                    dangerouslySetInnerHTML={{ __html: form.body }}
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
              <label htmlFor="is_active" className="text-sm text-gray-700">Active</label>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editingId ? "Update" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => { setEditingId(null); setShowCreate(false); resetForm(); }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
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
          <p className="mt-3 text-sm text-gray-500">No email templates. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {(t.name || "").replace(/<[^>]+>/g, "")}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {t.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  Trigger: <span className="font-mono">{t.trigger}</span>
                </p>
                <p className="mt-0.5 text-xs text-gray-400 truncate">
                  {(t.subject || "").replace(/<[^>]+>/g, "")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => previewMutation.mutate(t.id)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Preview"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={() => startEdit(t)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
