import DOMPurify from "dompurify";

/**
 * Sanitize a stored/generated HTML string before rendering it with
 * `dangerouslySetInnerHTML`. Strips scripts, event handlers, `javascript:` URLs
 * and other XSS vectors while keeping the rich-text formatting the app produces
 * (job descriptions, offer letters, email templates). Always run user- or
 * template-authored HTML through this before injecting it into the DOM.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
