import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/api/client";
import { DEFAULT_PAGE_SIZE } from "@/components/Pagination";
import type { PaginatedResponse } from "@emp-recruit/shared";

/**
 * Shared server-side pagination pattern for list views. Fetches one page of
 * `endpoint` and normalizes the result to `{ rows, total, totalPages }` so every
 * table paginates the same way. `filters` is merged into the query string; empty
 * values are dropped. Callers keep their own `page` state and reset it to 1 when
 * a filter/search term changes.
 *
 * Both `page`/`limit` and `perPage` are sent so it works regardless of which
 * param name a given endpoint reads.
 */
export function usePaginatedList<T>(
  baseKey: unknown[],
  endpoint: string,
  filters: Record<string, unknown>,
  page: number,
  perPage: number = DEFAULT_PAGE_SIZE,
  options?: { enabled?: boolean },
) {
  const activeFilters: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== "" && value !== null && value !== undefined) activeFilters[key] = value;
  }

  const query = useQuery({
    queryKey: [...baseKey, page, perPage, activeFilters],
    queryFn: async () => {
      const res = await apiGet<PaginatedResponse<T>>(endpoint, {
        page,
        limit: perPage,
        perPage,
        ...activeFilters,
      });
      return res.data!;
    },
    placeholderData: (prev) => prev,
    enabled: options?.enabled ?? true,
  });

  const payload = query.data;
  const total = payload?.total ?? 0;

  return {
    query,
    rows: (payload?.data ?? []) as T[],
    total,
    page,
    perPage,
    totalPages: payload?.totalPages ?? Math.max(1, Math.ceil(total / perPage)),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
  };
}
