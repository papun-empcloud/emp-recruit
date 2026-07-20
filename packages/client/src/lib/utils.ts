import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import i18n from "@/i18n";
import { getToken } from "./auth-store";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** The active i18n language, used so dates/times/numbers localize with the UI. */
export function activeLocale(): string {
  return i18n.language || "en";
}

/**
 * Format a currency amount in the active language. Locale-aware grouping keeps
 * it consistent app-wide (e.g. no "en-IN" lakh grouping on one page and standard
 * grouping on another). `amount` must already be in major units.
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency?: string | null,
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "";
  try {
    return new Intl.NumberFormat(activeLocale(), {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency ?? ""} ${amount.toLocaleString(activeLocale())}`.trim();
  }
}

/**
 * Format a date in the active language. Intl produces a locale-native string
 * (native digits/format for e.g. Arabic) that also flows correctly in RTL,
 * instead of a fixed "en-IN" string that the bidi algorithm would scramble.
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat(activeLocale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

/** Format a time-of-day in the active language. */
export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat(activeLocale(), {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

/** Format date + time together in the active language. */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat(activeLocale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

// Resolve a stored upload path (resume, offer letter, etc.) to a fully
// qualified URL. Server stores values like "/uploads/resumes/<file>" or
// "uploads/resumes/<file>"; in dev the Vite proxy handles same-origin
// requests, in production the frontend and API live on different hosts so
// the URL must be anchored to the API origin (derived from VITE_API_URL).
export function resolveUploadUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;

  const apiBase = (import.meta.env.VITE_API_URL as string | undefined) || "/api/v1";
  let origin = "";
  if (/^https?:\/\//i.test(apiBase)) {
    try {
      origin = new URL(apiBase).origin;
    } catch {
      origin = "";
    }
  }
  if (!origin && typeof window !== "undefined") {
    origin = window.location.origin;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = `${origin}${normalized}`;
  // Uploads are authenticated + org-scoped server-side. When we still hold the
  // in-memory access token, pass it as a query param (browsers can't add an
  // Authorization header to <a>/<img> requests). After a reload the token is
  // gone, but same-origin requests carry the httpOnly auth cookie, which the
  // /uploads handler also accepts (audit H3).
  const token = getToken();
  if (!token) return url;
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}
