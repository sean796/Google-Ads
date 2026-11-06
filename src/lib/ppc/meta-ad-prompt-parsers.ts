import type { MetaAdBlueprint, MetaAdCreativeMode, MetaAdInstagramGoal } from "@/lib/ppc/meta-ads-types";
function normalizeMetaChecklistEntry(
  item: unknown,
  index: number,
): { id: string; label: string; detail?: string } | null {
  if (!item || typeof item !== "object") return null;
  const row = item as { id?: string; label?: string; detail?: string; text?: string; title?: string };
  const label = row.label?.trim() || row.text?.trim() || row.title?.trim();
  if (!label) return null;
  return {
    id: row.id?.trim() || `item-${index + 1}`,
    label,
    detail: row.detail?.trim() || undefined,
  };
}

function normalizeMetaChecklistArray(list: unknown): { id: string; label: string; detail?: string }[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((item, index) => normalizeMetaChecklistEntry(item, index))
    .filter((item): item is { id: string; label: string; detail?: string } => Boolean(item));
}

export function parseMetaChecklistItems(raw: unknown): { id: string; label: string; detail?: string }[] {
  if (Array.isArray(raw)) {
    const direct = normalizeMetaChecklistArray(raw);
    if (direct.length) return direct;
  }
  if (!raw || typeof raw !== "object") return [];

  const root = raw as Record<string, unknown>;
  const listKeys = ["items", "checklist", "checklistItems", "copyChecklist", "imageChecklist"];
  for (const key of listKeys) {
    const items = normalizeMetaChecklistArray(root[key]);
    if (items.length) return items;
  }
  return [];
}

export function parseMetaInstagramGoal(raw: unknown): MetaAdInstagramGoal {
  const root = raw as Partial<MetaAdInstagramGoal>;
  const goalStatement = root.goalStatement?.trim();
  const primaryTopic = root.primaryTopic?.trim();
  const audience = root.audience?.trim();
  const adAngle = root.adAngle?.trim();
  const hook = root.hook?.trim();
  const visualDirection = root.visualDirection?.trim();
  const creativeMode = root.creativeMode?.trim() as MetaAdCreativeMode | undefined;
  const referenceQueries = Array.isArray(root.referenceQueries)
    ? root.referenceQueries.map((item) => String(item).trim()).filter(Boolean)
    : [];

  if (
    !goalStatement ||
    !primaryTopic ||
    !audience ||
    !adAngle ||
    !hook ||
    !visualDirection ||
    !creativeMode ||
    !["agency_service", "product_saas", "local_lead"].includes(creativeMode)
  ) {
    throw new Error("Instagram ad goal returned incomplete JSON.");
  }

  return {
    goalStatement,
    primaryTopic,
    audience,
    adAngle,
    hook,
    visualDirection,
    creativeMode,
    onImageTextHint: root.onImageTextHint?.trim() || undefined,
    referenceQueries,
  };
}

export function parseMetaBlueprint(raw: unknown): MetaAdBlueprint {
  const root = raw as Partial<MetaAdBlueprint>;
  const angle = root.angle?.trim();
  const audience = root.audience?.trim();
  const hook = root.hook?.trim();
  const visualDirection = root.visualDirection?.trim();
  if (!angle || !audience || !hook || !visualDirection) {
    throw new Error("Ad blueprint returned incomplete JSON.");
  }
  return { angle, audience, hook, visualDirection };
}
