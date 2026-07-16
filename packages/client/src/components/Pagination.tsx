import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** Shared page size for every list/table view in the app. */
export const DEFAULT_PAGE_SIZE = 10;

interface PaginationProps {
  page: number;
  perPage: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
  /**
   * When true and there is only a single page, the Prev/Next buttons are hidden
   * but the "Showing X–Y of Z" count is still rendered. Defaults to false so the
   * controls are always visible (disabled as appropriate) for full consistency.
   */
  hideControlsOnSinglePage?: boolean;
}

/**
 * A single, shared pagination footer used by every list view: a "Showing X–Y of
 * Z" range/count plus Previous/Next controls with correct disabled states.
 * Page numbers are 1-based.
 */
export function Pagination({
  page,
  perPage,
  total,
  onPageChange,
  className,
  hideControlsOnSinglePage = false,
}: PaginationProps) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = total === 0 ? 0 : (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);
  const showControls = !(hideControlsOnSinglePage && totalPages <= 1);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="text-sm text-gray-500">
        {t("components.pagination.showing", { start, end, total })}
      </p>
      {showControls && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> {t("components.pagination.previous")}
          </button>
          <span className="whitespace-nowrap text-sm text-gray-500">
            {t("components.pagination.pageOf", { page, total: totalPages })}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("components.pagination.next")} <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
