import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/api/client";

export interface PipelineStage {
  id: string;
  name: string;
  slug: string;
  color: string;
  sort_order?: number;
  is_default?: boolean;
  is_active?: boolean;
}

// Fallback stage colors, mirroring the server's DEFAULT_STAGES
// (packages/server/src/services/pipeline/pipeline.service.ts). Used only until
// the pipeline-stages query resolves, so a bar/badge never flashes a color that
// contradicts what the user set in Settings.
export const DEFAULT_STAGE_COLORS: Record<string, string> = {
  applied: "#3B82F6",
  screened: "#6366F1",
  interview: "#8B5CF6",
  offer: "#F59E0B",
  hired: "#10B981",
  rejected: "#EF4444",
  withdrawn: "#6B7280",
};

const FALLBACK_COLOR = "#6B7280";

// The Settings page and the Job pipeline board query ["pipeline-stages"] with
// slightly different queryFn shapes (one returns the array, the other the full
// ApiResponse). Normalise both so we read the same stage list regardless of
// which page populated the shared React Query cache first.
function normalizeStages(data: unknown): PipelineStage[] {
  if (Array.isArray(data)) return data as PipelineStage[];
  if (data && typeof data === "object" && Array.isArray((data as any).data)) {
    return (data as any).data as PipelineStage[];
  }
  return [];
}

/**
 * Shared query for the org's pipeline stages — the single source of truth for
 * stage colors (BUG-018). Keyed identically to the Settings and Job pipeline
 * board so all three share one cache entry; returns the normalised stage list.
 */
export function usePipelineStages(): PipelineStage[] {
  const query = useQuery({
    queryKey: ["pipeline-stages"],
    queryFn: async () => {
      const res = await apiGet<PipelineStage[]>("/pipeline/stages");
      return res.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
  return normalizeStages(query.data);
}

/**
 * Resolve a stage slug to its configured hex color, falling back to the server
 * defaults and finally a neutral gray. Pass the list from usePipelineStages so
 * a user-customised color in Settings is reflected everywhere.
 */
export function stageColor(slug: string, stages?: PipelineStage[] | null): string {
  const configured = stages?.find((s) => s.slug === slug)?.color;
  return configured || DEFAULT_STAGE_COLORS[slug] || FALLBACK_COLOR;
}
