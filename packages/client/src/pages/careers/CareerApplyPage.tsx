import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2,
  ArrowLeft,
  Upload,
  FileText,
  X,
} from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import type { JobPosting } from "@emp-recruit/shared";

const PUBLIC_API = "/api/v1/public";

export function CareerApplyPage() {
  const { slug, jobId } = useParams<{ slug: string; jobId: string }>();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    cover_letter: "",
    current_company: "",
    experience_years: "",
    expected_salary: "",
  });
  const [resume, setResume] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const jobQuery = useQuery({
    queryKey: ["public-job", slug, jobId],
    queryFn: async () => {
      const { data } = await axios.get(`${PUBLIC_API}/careers/${slug}/jobs/${jobId}`);
      return data.data as JobPosting;
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("first_name", form.first_name);
      formData.append("last_name", form.last_name);
      formData.append("email", form.email);
      formData.append("job_id", jobId!);
      if (form.phone) formData.append("phone", form.phone);
      if (form.cover_letter) formData.append("cover_letter", form.cover_letter);
      if (form.current_company) formData.append("current_company", form.current_company);
      if (form.experience_years) formData.append("experience_years", form.experience_years);
      if (form.expected_salary) formData.append("expected_salary", form.expected_salary);
      if (resume) formData.append("resume", resume);

      const { data } = await axios.post(`${PUBLIC_API}/careers/${slug}/apply`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return data;
    },
    onSuccess: () => {
      setSubmitError(null);
      navigate(`/careers/${slug}/jobs/${jobId}/success`);
    },
    onError: (err: any) => {
      const isDuplicate = err.response?.status === 409;
      const msg =
        err.response?.data?.error?.message ||
        (isDuplicate
          ? "You've already applied for this job with this email address."
          : "Failed to submit application");
      // Show it both as a toast and as a persistent inline banner so the
      // applicant always sees why nothing happened. (BUG-03)
      setSubmitError(msg);
      toast.error(msg);
    },
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    // Phone: reject non-numeric input as it's typed — only digits and the usual
    // phone punctuation (+ - ( ) space) are kept. (BUG-02)
    if (name === "phone") {
      setForm((prev) => ({ ...prev, phone: value.replace(/[^\d+\-()\s]/g, "") }));
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  // Validate the resume the moment it's picked, so the applicant gets immediate
  // feedback instead of only finding out after clicking Submit. (BUG-01)
  const ALLOWED_RESUME_EXT = [".pdf", ".doc", ".docx"];
  const MAX_RESUME_BYTES = 10 * 1024 * 1024; // 10MB, matches the server limit
  function handleResumeSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so re-selecting the same (or a corrected) file re-fires.
    e.target.value = "";
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_RESUME_EXT.includes(ext)) {
      toast.error("Only PDF, DOC, and DOCX resume files are allowed.");
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      toast.error("Resume file is too large (max 10MB).");
      return;
    }
    setResume(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Explicit validation so the applicant always gets a visible error, rather
    // than the browser silently blocking submit on an out-of-range number.
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      toast.error("Please fill in your name and email.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      toast.error("Please enter a valid email address.");
      return;
    }
    // Phone is optional, but if given it must look like a real number (BUG-02).
    if (form.phone.trim()) {
      const digits = form.phone.replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 15) {
        toast.error("Please enter a valid phone number.");
        return;
      }
    }
    if (form.experience_years !== "" && Number(form.experience_years) < 0) {
      toast.error("Years of experience cannot be negative.");
      return;
    }
    if (form.expected_salary !== "" && Number(form.expected_salary) < 0) {
      toast.error("Expected salary cannot be negative.");
      return;
    }
    applyMutation.mutate();
  }

  if (jobQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  const job = jobQuery.data;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link
          to={`/careers/${slug}/jobs/${jobId}`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to job details
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Apply for {job?.title || "Position"}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Fill in your details below. Fields marked with * are required.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="first_name" className="block text-sm font-medium text-gray-700">
                First Name *
              </label>
              <input
                id="first_name"
                name="first_name"
                type="text"
                required
                value={form.first_name}
                onChange={handleChange}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="last_name" className="block text-sm font-medium text-gray-700">
                Last Name *
              </label>
              <input
                id="last_name"
                name="last_name"
                type="text"
                required
                value={form.last_name}
                onChange={handleChange}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email Address *
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={form.email}
              onChange={handleChange}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
              Phone Number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={handleChange}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Resume upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Resume</label>
            {resume ? (
              <div className="mt-1 flex items-center gap-3 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2">
                <FileText className="h-5 w-5 text-brand-600" />
                <span className="flex-1 text-sm text-gray-700 truncate">{resume.name}</span>
                <button
                  type="button"
                  onClick={() => setResume(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-6 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600">
                <Upload className="h-5 w-5" />
                <span>Upload resume (PDF, DOC, DOCX — max 10MB)</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={handleResumeSelect}
                />
              </label>
            )}
          </div>

          {/* Cover letter */}
          <div>
            <label htmlFor="cover_letter" className="block text-sm font-medium text-gray-700">
              Cover Letter
            </label>
            <textarea
              id="cover_letter"
              name="cover_letter"
              rows={4}
              value={form.cover_letter}
              onChange={handleChange}
              placeholder="Tell us why you're a great fit for this role..."
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Current company */}
          <div>
            <label htmlFor="current_company" className="block text-sm font-medium text-gray-700">
              Current Company
            </label>
            <input
              id="current_company"
              name="current_company"
              type="text"
              value={form.current_company}
              onChange={handleChange}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Experience & salary row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="experience_years" className="block text-sm font-medium text-gray-700">
                Years of Experience
              </label>
              <input
                id="experience_years"
                name="experience_years"
                type="number"
                min="0"
                max="50"
                value={form.experience_years}
                onChange={handleChange}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="expected_salary" className="block text-sm font-medium text-gray-700">
                Expected Salary (annual)
              </label>
              <input
                id="expected_salary"
                name="expected_salary"
                type="number"
                min="0"
                value={form.expected_salary}
                onChange={handleChange}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {submitError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={applyMutation.isPending}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {applyMutation.isPending ? "Submitting..." : "Submit Application"}
          </button>
        </form>
      </div>
    </div>
  );
}
