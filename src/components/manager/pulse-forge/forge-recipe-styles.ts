import { cn } from "@/lib/utils";
import {
  FORGE_CLIENT_TILE_ACCENT_WIDTH_CLASS,
  forgeClientColorUnique,
} from "@/lib/pulse-forge/forge-client-colors";
import { automationRecipeCategoryLabel } from "@/lib/automation-recipes-filters";
import type { AutomationRecipeCatalogItem } from "@/lib/automation-recipes-types";

export const FORGE_RECIPE_PAGE_CLASS = "bg-black font-sans";

export const FORGE_RECIPE_STAT_TILE_CLASS =
  "rounded-none border-0 bg-black shadow-tile transition-shadow hover:shadow-tile-pop";

export const FORGE_RECIPE_CARD_TILE_CLASS =
  "rounded-none border-0 bg-black text-white shadow-tile transition-shadow hover:shadow-tile-pop";

export const FORGE_TASK_BUILDER_TILE_ACCENT_CLASS =
  "border-l-[length:var(--tile-accent-width)] border-l-primary";

export const FORGE_TASK_BUILDER_INFIELD_CLASS =
  "flex min-h-10 min-w-0 items-center gap-2 rounded-none bg-black px-3 shadow-tile";

const RECIPE_CATEGORY_ORDER = [
  "browser",
  "research",
  "maintenance",
  "reporting",
  "editorial",
  "local-seo",
  "onboarding",
] as const;

const RECIPE_CATEGORY_FRAME_CLASS: Record<string, string> = {
  browser: "border-l-[length:var(--tile-accent-width)] border-l-[hsl(160_55%_45%)]",
  research: "border-l-[length:var(--tile-accent-width)] border-l-[hsl(200_70%_52%)]",
  maintenance: "border-l-[length:var(--tile-accent-width)] border-l-[hsl(var(--semantic-data))]",
  reactive: "border-l-[length:var(--tile-accent-width)] border-l-[hsl(var(--semantic-data))]",
  reporting: "border-l-[length:var(--tile-accent-width)] border-l-[hsl(var(--semantic-warning))]",
  editorial: "border-l-[length:var(--tile-accent-width)] border-l-[hsl(var(--primary))]",
  "local-seo": "border-l-[length:var(--tile-accent-width)] border-l-[hsl(var(--semantic-publish))]",
  onboarding: "border-l-[length:var(--tile-accent-width)] border-l-[hsl(280_65%_58%)]",
};

const RECIPE_CATEGORY_LABEL_CLASS: Record<string, string> = {
  browser: "text-[hsl(160_55%_65%)]",
  research: "text-[hsl(200_70%_72%)]",
  maintenance: "text-[hsl(var(--semantic-data-foreground))]",
  reactive: "text-[hsl(var(--semantic-data-foreground))]",
  reporting: "text-[hsl(var(--semantic-warning-foreground))]",
  editorial: "text-primary",
  "local-seo": "text-[hsl(var(--semantic-publish-foreground))]",
  onboarding: "text-[hsl(280_65%_72%)]",
};

export function normalizeRecipeCategory(category: string): string {
  return category === "reactive" ? "maintenance" : category;
}

export function recipeCategoryFrameClass(category: string): string {
  const key = normalizeRecipeCategory(category);
  return RECIPE_CATEGORY_FRAME_CLASS[key] ?? RECIPE_CATEGORY_FRAME_CLASS.maintenance;
}

export function recipeCategoryLabelClass(category: string): string {
  const key = normalizeRecipeCategory(category);
  return RECIPE_CATEGORY_LABEL_CLASS[key] ?? "text-muted-foreground";
}

export type RecipeCategorySection = {
  category: string;
  label: string;
  recipes: AutomationRecipeCatalogItem[];
};

export function groupRecipesByCategory(
  recipes: AutomationRecipeCatalogItem[],
): RecipeCategorySection[] {
  const buckets = new Map<string, AutomationRecipeCatalogItem[]>();
  for (const recipe of recipes) {
    const key = normalizeRecipeCategory(recipe.category);
    const list = buckets.get(key) ?? [];
    list.push(recipe);
    buckets.set(key, list);
  }

  const orderedKeys = [
    ...RECIPE_CATEGORY_ORDER.filter((key) => buckets.has(key)),
    ...[...buckets.keys()].filter(
      (key) => !RECIPE_CATEGORY_ORDER.includes(key as (typeof RECIPE_CATEGORY_ORDER)[number]),
    ),
  ];

  return orderedKeys.map((category) => ({
    category,
    label: automationRecipeCategoryLabel(category),
    recipes: buckets.get(category) ?? [],
  }));
}

export function recipeCardClassName(category: string, selected: boolean): string {
  return cn(
    FORGE_RECIPE_CARD_TILE_CLASS,
    recipeCategoryFrameClass(category),
    selected && "ring-1 ring-primary shadow-tile-pop",
  );
}

export function automationCardClassName(
  siteId?: string,
  active = false,
  siteName?: string,
): string {
  return cn(
    FORGE_RECIPE_CARD_TILE_CLASS,
    FORGE_CLIENT_TILE_ACCENT_WIDTH_CLASS,
    forgeClientColorUnique(siteId, siteName).borderClass,
    active && "shadow-tile-pop",
  );
}
