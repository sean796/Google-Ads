import type { LucideIcon } from "lucide-react";
import {
  Crosshair,
  FlaskConical,
  Image,
  MessageSquare,
  Newspaper,
  Workflow,
} from "lucide-react";
import { parseGeneratorSectionFromHash } from "@/lib/agent-runs/agent-run-optimizer-url";

export type BlogGeneratorSectionId =
  | "opt"
  | "bulk-csv"
  | "bulk-prompt"
  | "bulk-blog-import"
  | "bulk-press-release"
  | "entity"
  | "flow"
  | "image"
  | "research";

const BLOG_GENERATOR_SECTION_IDS: BlogGeneratorSectionId[] = [
  "opt",
  "bulk-prompt",
  "bulk-press-release",
  "flow",
  "research",
];

export function isBlogGeneratorSectionId(value: string): value is BlogGeneratorSectionId {
  return (BLOG_GENERATOR_SECTION_IDS as string[]).includes(value);
}

/** Legacy generator/report/entity/csv/import tab and deep links map to Opt or Studio (bulk-prompt). */
export function coerceBlogGeneratorSectionId(value: string): BlogGeneratorSectionId {
  if (value === "report") return "opt";
  if (
    value === "entity" ||
    value === "competitor" ||
    value === "bulk-csv" ||
    value === "bulk-blog-import"
  ) {
    return "bulk-prompt";
  }
  if (isBlogGeneratorSectionId(value)) return value;
  return "bulk-prompt";
}

export type BlogGeneratorSectionDef = {
  id: BlogGeneratorSectionId;
  label: string;
  icon: LucideIcon;
};

export const BLOG_GENERATOR_SECTION_DEFS: BlogGeneratorSectionDef[] = [
  { id: "opt", label: "Opt", icon: Crosshair },
  { id: "bulk-prompt", label: "Studio", icon: MessageSquare },
  { id: "bulk-press-release", label: "PR", icon: Newspaper },
  { id: "flow", label: "Flow", icon: Workflow },
  { id: "research", label: "Research", icon: FlaskConical },
];

const SECTION_BY_ID = new Map(BLOG_GENERATOR_SECTION_DEFS.map((def) => [def.id, def]));

export function getBlogGeneratorSectionMeta(id: BlogGeneratorSectionId): BlogGeneratorSectionDef {
  return SECTION_BY_ID.get(id) ?? BLOG_GENERATOR_SECTION_DEFS[1];
}

function blogGeneratorLongestSectionLabel(): string {
  const labels = BLOG_GENERATOR_SECTION_DEFS.map((def) => def.label);
  return labels.reduce(
    (max, label) => (label.length > max.length ? label : max),
    labels[0] ?? " ",
  );
}

/** Sizes icon + title to longest section label (typography-accurate; keeps sitemap/schedule from shifting). */
export function blogGeneratorTitleLeadingSlotProps(): { reserveLabel: string } {
  return { reserveLabel: blogGeneratorLongestSectionLabel() };
}

export const BLOG_GENERATOR_SECTION_STORAGE_KEY = "neo-pulse-blog-generator-section";

export function readStoredBlogGeneratorSection(): BlogGeneratorSectionId {
  try {
    if (typeof window !== "undefined" && window.location?.hash) {
      const fromHash = parseGeneratorSectionFromHash(window.location.hash);
      if (fromHash) {
        const coerced = coerceBlogGeneratorSectionId(fromHash);
        sessionStorage.setItem(BLOG_GENERATOR_SECTION_STORAGE_KEY, coerced);
        return coerced;
      }
    }
    const v = sessionStorage.getItem(BLOG_GENERATOR_SECTION_STORAGE_KEY);
    if (
      v === "competitor" ||
      v === "entity" ||
      v === "bulk-csv" ||
      v === "bulk-blog-import"
    ) {
      sessionStorage.setItem(BLOG_GENERATOR_SECTION_STORAGE_KEY, "bulk-prompt");
      return "bulk-prompt";
    }
    if (v === "report") {
      sessionStorage.setItem(BLOG_GENERATOR_SECTION_STORAGE_KEY, "opt");
      return "opt";
    }
    if (v && isBlogGeneratorSectionId(v)) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return "bulk-prompt";
}

type BlogGeneratorSectionListener = (section: BlogGeneratorSectionId) => void;

const sectionListeners = new Set<BlogGeneratorSectionListener>();

export function registerBlogGeneratorSectionListener(
  listener: BlogGeneratorSectionListener | null,
): void {
  if (listener) sectionListeners.add(listener);
}

export function unregisterBlogGeneratorSectionListener(
  listener: BlogGeneratorSectionListener,
): void {
  sectionListeners.delete(listener);
}

export function notifyBlogGeneratorSectionChange(section: BlogGeneratorSectionId): void {
  for (const listener of sectionListeners) {
    listener(section);
  }
}

export function writeStoredBlogGeneratorSection(section: BlogGeneratorSectionId): void {
  try {
    sessionStorage.setItem(BLOG_GENERATOR_SECTION_STORAGE_KEY, section);
  } catch {
    /* ignore */
  }
  notifyBlogGeneratorSectionChange(section);
}

