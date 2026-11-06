import type {
  MetaAdCreativeBrief,
  MetaAdVisualToolKey,
  MetaAdVisualToolPalette,
  MetaAdVisualToolWeight,
} from "@/lib/ppc/meta-ads-types";

export const META_VISUAL_TOOL_KEYS: MetaAdVisualToolKey[] = [
  "typography",
  "icon_cluster",
  "accent_shapes",
  "city_skyline",
  "device_screen",
  "people",
  "map_overlay",
  "gradient_panel",
  "photo_focal",
];

export const META_VISUAL_TOOL_LABELS: Record<MetaAdVisualToolKey, string> = {
  typography: "Typography",
  icon_cluster: "Icons",
  accent_shapes: "Accent Shapes",
  city_skyline: "City Skyline",
  device_screen: "Device Screen",
  people: "People",
  map_overlay: "Map Overlay",
  gradient_panel: "Gradient Panel",
  photo_focal: "Photo Focal",
};

function readUnit(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

export function visualToolIsActive(weight: MetaAdVisualToolWeight): boolean {
  return weight.degree > 0;
}

export function syncVisualToolWeight(weight: MetaAdVisualToolWeight): MetaAdVisualToolWeight {
  const degree = readUnit(weight.degree);
  return { chance: degree > 0 ? 1 : 0, degree };
}

function readToolWeight(raw: unknown): MetaAdVisualToolWeight {
  if (!raw || typeof raw !== "object") {
    return { chance: 0, degree: 0 };
  }
  const row = raw as { chance?: unknown; degree?: unknown };
  return syncVisualToolWeight({
    chance: readUnit(row.chance),
    degree: readUnit(row.degree),
  });
}

function normalizeToolWeight(weight: MetaAdVisualToolWeight): MetaAdVisualToolWeight {
  return syncVisualToolWeight(weight);
}

function normalizeVisualToolPalette(palette: MetaAdVisualToolPalette): MetaAdVisualToolPalette {
  const next = emptyVisualToolPalette();
  for (const key of META_VISUAL_TOOL_KEYS) {
    next[key] = normalizeToolWeight(palette[key] ?? { chance: 0, degree: 0 });
  }
  return next;
}

export function emptyVisualToolPalette(): MetaAdVisualToolPalette {
  return {
    typography: { chance: 0, degree: 0 },
    icon_cluster: { chance: 0, degree: 0 },
    accent_shapes: { chance: 0, degree: 0 },
    city_skyline: { chance: 0, degree: 0 },
    device_screen: { chance: 0, degree: 0 },
    people: { chance: 0, degree: 0 },
    map_overlay: { chance: 0, degree: 0 },
    gradient_panel: { chance: 0, degree: 0 },
    photo_focal: { chance: 0, degree: 0 },
  };
}

export function parseVisualToolPalette(raw: unknown): MetaAdVisualToolPalette {
  const palette = emptyVisualToolPalette();
  if (!raw || typeof raw !== "object") return palette;
  const root = raw as Partial<Record<MetaAdVisualToolKey, unknown>>;
  for (const key of META_VISUAL_TOOL_KEYS) {
    palette[key] = readToolWeight(root[key]);
  }
  return normalizeVisualToolPalette(palette);
}

export function cloneVisualToolPalette(palette: MetaAdVisualToolPalette): MetaAdVisualToolPalette {
  return normalizeVisualToolPalette(palette);
}

export function clonePaletteForEdit(palette: MetaAdVisualToolPalette): MetaAdVisualToolPalette {
  return cloneVisualToolPalette(palette);
}

export function hasActiveVisualToolPalette(palette: MetaAdVisualToolPalette): boolean {
  return META_VISUAL_TOOL_KEYS.some((key) => visualToolIsActive(palette[key]));
}

export function patchVisualToolWeight(
  palette: MetaAdVisualToolPalette,
  key: MetaAdVisualToolKey,
  field: keyof MetaAdVisualToolWeight,
  value: number,
): MetaAdVisualToolPalette {
  const next = cloneVisualToolPalette(palette);
  if (field === "degree") {
    next[key] = syncVisualToolWeight({ ...next[key], degree: readUnit(value) });
  } else {
    next[key] = syncVisualToolWeight({ ...next[key], chance: readUnit(value) });
  }
  return next;
}

export function resolveAllowPeopleInImage(
  palette: MetaAdVisualToolPalette | undefined,
  legacyAllowPeopleInImage?: boolean,
): boolean {
  if (palette && visualToolIsActive(palette.people)) return true;
  return legacyAllowPeopleInImage === true;
}

export function migrateLegacyPeopleToolPalette(
  palette: MetaAdVisualToolPalette,
  legacyAllowPeopleInImage?: boolean,
): MetaAdVisualToolPalette {
  if (!legacyAllowPeopleInImage || visualToolIsActive(palette.people)) {
    return palette;
  }
  return patchVisualToolWeight(palette, "people", "degree", 1);
}

export function formatVisualToolPaletteLine(palette: MetaAdVisualToolPalette): string {
  return META_VISUAL_TOOL_KEYS.map((key) => `${key} ${palette[key].degree.toFixed(2)}`).join(", ");
}

export function formatVisualToolPaletteBlock(palette: MetaAdVisualToolPalette): string {
  return `Visual tool palette (degree): ${formatVisualToolPaletteLine(palette)}`;
}

export function visualToolPaletteMarkdown(brief: MetaAdCreativeBrief): string {
  return META_VISUAL_TOOL_KEYS.map(
    (key) => `- ${key}: degree ${brief.visualToolPalette[key].degree}`,
  ).join("\n");
}

export const META_ICON_CLUSTER_RULES = `icon_cluster rules:
- When icon_cluster degree is above zero, use at most 2 to 3 distinct icons in one small cluster.
- Never repeat the same icon motif (for example, not four bar-chart icons).
- Degree controls cluster size and prominence, not icon count.
- Pick icons from the post topic and page context, not generic SEO clip art.`;

export const META_ICON_CLUSTER_NO_CHARTS_WITH_DEVICE = `When device_screen is active, do not add chart, graph, or growth-arrow icons. The device screen carries the results message.`;

export const META_VISUAL_TOOL_PALETTE_PROMPT = `Visual tool palette (each tool has degree 0.0 to 1.0):
- degree 0 = tool off for this run
- degree above 0 = tool is active; higher values are more prominent (0.2 = subtle, 0.8 = dominant)
Tools: typography, icon_cluster, accent_shapes, city_skyline, device_screen, people, map_overlay, gradient_panel, photo_focal
Vary degree values each generate. No tool is mandatory.
${META_ICON_CLUSTER_RULES}`;

export const META_VISUAL_TOOL_OUTPUT_SCHEMA = {
  typography: { degree: "0.0-1.0" },
  icon_cluster: { degree: "0.0-1.0" },
  accent_shapes: { degree: "0.0-1.0" },
  city_skyline: { degree: "0.0-1.0" },
  device_screen: { degree: "0.0-1.0" },
  people: { degree: "0.0-1.0" },
  map_overlay: { degree: "0.0-1.0" },
  gradient_panel: { degree: "0.0-1.0" },
  photo_focal: { degree: "0.0-1.0" },
};

/** @deprecated Use META_DEVICE_SCREEN_NO_READABLE_TEXT_RULE from meta-ad-device-screen-layout.ts */
export const META_DEVICE_SCREEN_ABSTRACT_RULE =
  "Device screens: realistic WordPress or page-builder layout mockup. Gray placeholder bars only. No readable text, logos, or abstract chart dashboards.";
