import { useTranslation } from "react-i18next";

const DEFAULT_RETURN_URL = "https://test-empcloud.empcloud.com/dashboard";

/** Only allow https return URLs on empcloud.com hosts — the value comes from
 *  localStorage and could otherwise be a javascript:/phishing URL (audit L9). */
function safeReturnUrl(raw: string | null): string {
  if (!raw) return DEFAULT_RETURN_URL;
  try {
    const u = new URL(raw);
    if (u.protocol === "https:" && (u.hostname === "empcloud.com" || u.hostname.endsWith(".empcloud.com"))) {
      return raw;
    }
  } catch {
    /* not a valid URL */
  }
  return DEFAULT_RETURN_URL;
}

export function BackToDashboard() {
  const { t } = useTranslation();
  const isSSO = localStorage.getItem('sso_source') === 'empcloud';
  if (!isSSO) return null;

  const returnUrl = safeReturnUrl(localStorage.getItem('empcloud_return_url'));

  return (
    <a
      href={returnUrl}
      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
    >
      <span>&larr; {t("components.backToDashboard.label")}</span>
    </a>
  );
}
