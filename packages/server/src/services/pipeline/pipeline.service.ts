// ============================================================================
// PIPELINE SERVICE
// Custom pipeline stage management for organizations.
// ============================================================================

import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError, ConflictError } from "../../utils/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PipelineStage {
  id: string;
  organization_id: number;
  name: string;
  slug: string;
  color: string;
  sort_order: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CreateStageData {
  name: string;
  slug?: string;
  color?: string;
  sort_order?: number;
}

interface UpdateStageData {
  name?: string;
  color?: string;
  sort_order?: number;
  is_active?: boolean;
}

interface ReorderItem {
  id: string;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Default Stages
// ---------------------------------------------------------------------------

const DEFAULT_STAGES: Array<{ name: string; slug: string; color: string; sort_order: number }> = [
  { name: "Applied", slug: "applied", color: "#3B82F6", sort_order: 0 },
  { name: "Screened", slug: "screened", color: "#6366F1", sort_order: 1 },
  { name: "Interview", slug: "interview", color: "#8B5CF6", sort_order: 2 },
  { name: "Offer", slug: "offer", color: "#F59E0B", sort_order: 3 },
  { name: "Hired", slug: "hired", color: "#10B981", sort_order: 4 },
  { name: "Rejected", slug: "rejected", color: "#EF4444", sort_order: 5 },
  { name: "Withdrawn", slug: "withdrawn", color: "#6B7280", sort_order: 6 },
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export function getDefaultStages() {
  return DEFAULT_STAGES.map((s) => ({
    ...s,
    id: `default-${s.slug}`,
    is_default: true,
    is_active: true,
  }));
}

export async function getOrgStages(orgId: number): Promise<PipelineStage[]> {
  const db = getDB();

  const result = await db.findMany<PipelineStage>("pipeline_stages", {
    filters: { organization_id: orgId, is_active: true },
    sort: { field: "sort_order", order: "asc" },
    limit: 100,
  });

  // If org has no custom stages, return defaults
  if (result.data.length === 0) {
    return getDefaultStages() as any[];
  }

  return result.data;
}

export async function createStage(
  orgId: number,
  data: CreateStageData,
): Promise<PipelineStage> {
  const db = getDB();

  if (!data.name) {
    throw new ValidationError("Stage name is required");
  }

  const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  // Seed the org's default stages (if this is its first) and create the new
  // stage in ONE transaction, with the dedup check AFTER seeding — so a custom
  // slug that collides with a default returns a clean 409 instead of a mid-seed
  // unique-constraint 500, and a failure never leaves half-seeded defaults
  // (audit M22).
  const count = await db.count("pipeline_stages", { organization_id: orgId });

  return db.transaction(async (tx) => {
    if (count === 0) {
      for (const def of DEFAULT_STAGES) {
        await tx.create<PipelineStage>("pipeline_stages", {
          organization_id: orgId,
          name: def.name,
          slug: def.slug,
          color: def.color,
          sort_order: def.sort_order,
          is_default: true,
          is_active: true,
        } as Partial<PipelineStage>);
      }
    }

    const existing = await tx.findOne<PipelineStage>("pipeline_stages", {
      organization_id: orgId,
      slug,
    });
    if (existing) {
      throw new ConflictError(`A stage with slug '${slug}' already exists`);
    }

    let sortOrder = data.sort_order;
    if (sortOrder === undefined) {
      const maxResult = await tx.raw<any[][]>(
        `SELECT MAX(sort_order) as max_order FROM pipeline_stages WHERE organization_id = ?`,
        [orgId],
      );
      sortOrder = (maxResult[0]?.[0]?.max_order ?? -1) + 1;
    }

    return tx.create<PipelineStage>("pipeline_stages", {
      organization_id: orgId,
      name: data.name,
      slug,
      color: data.color || "#6B7280",
      sort_order: sortOrder,
      is_default: false,
      is_active: true,
    } as Partial<PipelineStage>);
  });
}

export async function updateStage(
  orgId: number,
  id: string,
  data: UpdateStageData,
): Promise<PipelineStage> {
  const db = getDB();

  const stage = await db.findOne<PipelineStage>("pipeline_stages", {
    id,
    organization_id: orgId,
  });
  if (!stage) {
    throw new NotFoundError("Pipeline stage", id);
  }

  return db.update<PipelineStage>("pipeline_stages", id, data as Partial<PipelineStage>);
}

export async function deleteStage(orgId: number, id: string): Promise<boolean> {
  const db = getDB();

  const stage = await db.findOne<PipelineStage>("pipeline_stages", {
    id,
    organization_id: orgId,
  });
  if (!stage) {
    throw new NotFoundError("Pipeline stage", id);
  }
  if (stage.is_default) {
    throw new ValidationError("Default stages cannot be deleted");
  }

  // Check if any applications are using this stage
  const appCount = await db.count("applications", {
    organization_id: orgId,
    stage: stage.slug,
  });
  if (appCount > 0) {
    throw new ValidationError(
      `Cannot delete stage '${stage.name}' — ${appCount} application(s) are currently in this stage`,
    );
  }

  return db.delete("pipeline_stages", id);
}

export async function reorderStages(
  orgId: number,
  items: ReorderItem[],
): Promise<PipelineStage[]> {
  const db = getDB();

  if (!items || items.length === 0) {
    throw new ValidationError("Reorder items are required");
  }

  for (const item of items) {
    const stage = await db.findOne<PipelineStage>("pipeline_stages", {
      id: item.id,
      organization_id: orgId,
    });
    if (!stage) {
      throw new NotFoundError("Pipeline stage", item.id);
    }
    await db.update("pipeline_stages", item.id, { sort_order: item.sort_order });
  }

  return getOrgStages(orgId);
}
