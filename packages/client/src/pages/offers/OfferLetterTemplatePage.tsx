import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Save,
  Plus,
  Pencil,
  Trash2,
  FileText,
  X,
  Info,
} from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/api/client";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import toast from "react-hot-toast";

interface OfferLetterTemplate {
  id: string;
  name: string;
  content_template: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

const VARIABLE_REFERENCE = [
  { group: "Candidate", vars: ["candidate.firstName", "candidate.lastName", "candidate.fullName", "candidate.email", "candidate.phone"] },
  { group: "Offer", vars: ["offer.designation", "offer.salary", "offer.salaryCurrency", "offer.joiningDate", "offer.expiryDate", "offer.department", "offer.benefits"] },
  { group: "Organization", vars: ["organization.name"] },
  { group: "Job", vars: ["job.title", "job.department", "job.location"] },
  { group: "Other", vars: ["date"] },
];

export function OfferLetterTemplatePage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", content_template: "", is_default: false });

  const templatesQuery = useQuery({
    queryKey: ["offer-letter-templates"],
    queryFn: async () => {
      const res = await apiGet<OfferLetterTemplate[]>("/offer-letters/templates");
      // Guard against any non-array response shape (null / object / paginated
      // envelope) so the page never crashes on `templates.map`.
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data: typeof form) =>
      editingId
        ? apiPut(`/offer-letters/templates/${editingId}`, data)
        : apiPost("/offer-letters/templates", data),
    onSuccess: () => {
      toast.success(editingId ? "Template updated" : "Template created");
      queryClient.invalidateQueries({ queryKey: ["offer-letter-templates"] });
      resetForm();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed to save template"),
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/offer-letters/templates/${id}`),
    onSuccess: () => {
      toast.success("Template deleted");
      queryClient.invalidateQueries({ queryKey: ["offer-letter-templates"] });
      setDeleteId(null);
    },
    onError: (err: any) => {
      setDeleteId(null);
      toast.error(err.response?.data?.error?.message || "Failed to delete template");
    },
  });

  function resetForm() {
    setForm({ name: "", content_template: "", is_default: false });
    setShowForm(false);
    setEditingId(null);
  }

  function startEdit(t: OfferLetterTemplate) {
    setEditingId(t.id);
    setShowForm(true);
    setForm({ name: t.name, content_template: t.content_template, is_default: t.is_default });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    saveMutation.mutate(form);
  }

  const templates = Array.isArray(templatesQuery.data) ? templatesQuery.data : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Offer Letter Templates</h1>
          <p className="mt-1 text-sm text-gray-500">Create and manage Handlebars templates for offer letters.</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          New Template
        </button>
      </div>

      {showForm && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Editor */}
          <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900">
              {editingId ? "Edit Template" : "Create Template"}
            </h3>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Template Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Standard Offer Letter"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Content (HTML + Handlebars) *
                </label>
                <textarea
                  required
                  rows={16}
                  value={form.content_template}
                  onChange={(e) => setForm((p) => ({ ...p, content_template: e.target.value }))}
                  placeholder={`<h1>Offer Letter</h1>\n<p>Dear {{candidate.firstName}},</p>\n<p>We are pleased to offer you the position of <strong>{{offer.designation}}</strong>...</p>`}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="is_default"
                  type="checkbox"
                  checked={form.is_default}
                  onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600"
                />
                <label htmlFor="is_default" className="text-sm text-gray-700">Set as default template</label>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saveMutation.isPending ? "Saving..." : editingId ? "Update" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>

          {/* Variable Reference Panel */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <Info className="h-4 w-4 text-blue-500" />
              Available Variables
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Use these in your template with double curly braces.
            </p>
            <div className="mt-4 space-y-4">
              {VARIABLE_REFERENCE.map((group) => (
                <div key={group.group}>
                  <h4 className="text-xs font-semibold uppercase text-gray-500">{group.group}</h4>
                  <div className="mt-1 space-y-1">
                    {group.vars.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setForm((p) => ({
                            ...p,
                            content_template: p.content_template + `{{${v}}}`,
                          }));
                        }}
                        className="block w-full text-left rounded px-2 py-1 text-xs font-mono text-brand-700 bg-brand-50 hover:bg-brand-100 transition-colors"
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Template List */}
      {templatesQuery.isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : templates.length === 0 && !showForm ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">No offer letter templates yet. Create one to get started.</p>
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
                  <FileText className="h-4 w-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">{t.name}</h3>
                  {Boolean(t.is_default) && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Default
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-gray-400 truncate font-mono">
                  {t.content_template.slice(0, 100)}...
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => startEdit(t)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteId(t.id)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  title="Delete"
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
        variant="danger"
        title="Delete this template?"
        message="This removes the template so it can no longer be used for new offer letters. Letters already generated from it are kept."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
