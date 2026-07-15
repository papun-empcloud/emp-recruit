import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Languages, Check } from "lucide-react";
import { LANGUAGES } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Language picker for the app chrome. Lists each language by its own name
 * (endonym) and switches the active language via i18next (persisted to
 * localStorage; Arabic flips the layout to RTL).
 */
export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = (i18n.language || "en").split("-")[0];

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(code: string) {
    i18n.changeLanguage(code);
    setOpen(false);
  }

  const activeLabel = LANGUAGES.find((l) => l.code === active)?.label ?? "English";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Change language"
        aria-label="Change language"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      >
        <Languages className="h-5 w-5" />
        <span className="hidden sm:inline">{activeLabel}</span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute end-0 z-50 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {LANGUAGES.map((lng) => (
            <li key={lng.code}>
              <button
                type="button"
                role="option"
                aria-selected={active === lng.code}
                dir={lng.dir}
                onClick={() => choose(lng.code)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50",
                  active === lng.code && "font-semibold text-brand-700",
                )}
              >
                <span>{lng.label}</span>
                {active === lng.code && <Check className="h-4 w-4 text-brand-600" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
