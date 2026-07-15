import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function PortalLayout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white font-bold text-sm">
              E
            </div>
            <div>
              <span className="text-lg font-semibold text-gray-900">
                {t("components.portalLayout.title")}
              </span>
            </div>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            <a
              href="/portal"
              className="rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              {t("components.portalLayout.requestAccess")}
            </a>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-6">
        <div className="mx-auto max-w-5xl px-4 text-center text-sm text-gray-500">
          {t("components.portalLayout.poweredBy")}
        </div>
      </footer>
    </div>
  );
}
