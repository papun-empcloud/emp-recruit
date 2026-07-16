import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Mail, CheckCircle, Loader2, ArrowRight } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PortalRequestPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    // Validate in JS (the form uses noValidate) so we can show a styled inline
    // message instead of the native tooltip, which overlaps the submit button.
    if (!EMAIL_RE.test(trimmed)) {
      setStatus("error");
      setErrorMsg(t("portal.request.invalidEmail"));
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      await fetch(`${API_BASE}/portal/request-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });

      // Always show the neutral confirmation regardless of the server's response.
      // This prevents account enumeration and never surfaces internal errors to
      // the candidate. Genuine failures are handled/logged server-side.
      setStatus("success");
    } catch {
      // Only a true network failure (server unreachable) reaches here — show a
      // friendly generic message, never a raw backend error.
      setStatus("error");
      setErrorMsg(t("portal.request.genericError"));
    }
  };

  if (status === "success") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900">{t("portal.request.checkEmailTitle")}</h1>
          <p className="mb-6 text-gray-600">
            <Trans
              i18nKey="portal.request.emailSent"
              values={{ email }}
              components={{ bold: <span className="font-medium text-gray-900" /> }}
            />
          </p>
          <p className="text-sm text-gray-500">
            {t("portal.request.expiryNote")}
          </p>
          <button
            onClick={() => {
              setStatus("idle");
              setEmail("");
            }}
            className="mt-6 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            {t("portal.request.tryDifferentEmail")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100">
            <Mail className="h-8 w-8 text-brand-600" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900">{t("portal.request.title")}</h1>
          <p className="mb-8 text-gray-600">
            {t("portal.request.subtitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              {t("portal.request.emailLabel")}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status === "error") setStatus("idle");
              }}
              placeholder={t("portal.request.emailPlaceholder")}
              aria-invalid={status === "error"}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {status === "error" && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMsg}</div>
          )}

          <button
            type="submit"
            disabled={status === "loading" || !email.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {status === "loading" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("portal.request.sending")}
              </>
            ) : (
              <>
                {t("portal.request.sendLink")}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-500">
          {t("portal.request.footnote")}
        </p>
      </div>
    </div>
  );
}
