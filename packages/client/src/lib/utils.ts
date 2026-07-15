import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import i18n from "@/i18n";

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

/** The active i18n language, used so dates/times localize with the UI. */
function activeLocale(): string {
  return i18n.language || "en";
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
  return `${origin}${normalized}`;
}
