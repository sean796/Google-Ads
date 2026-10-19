import type { LucideIcon } from "lucide-react";
import {
  ArrowUpToLine,
  Crosshair,
  FileSpreadsheet,
  FlaskConical,
  Image,
  MapPinHouse,
  MessageSquare,
  Newspaper,
  Workflow,
} from "lucide-react";
import {
  writeStoredEntitySubmode,
} from "@/components/sap-generator/entity-generator-submode";

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
  "bulk-csv",
  "bulk-prompt",
  "bulk-blog-import",
  "bulk-press-release",
  "entity",
  "flow",
  "image",
  "research",
];

export function isBlogGeneratorSectionId(value: string): value is BlogGeneratorSectionId {
  return (BLOG_GENERATOR_SECTION_IDS as string[]).includes(value);
}

/** Legacy generator/report tab and deep links map to Opt. */
export function coerceBlogGeneratorSectionId(value: string): BlogGeneratorSectionId {
  if (value === "report") return "opt";
  if (isBlogGeneratorSectionId(value)) return value;
  return "bulk-csv";
}

export type BlogGeneratorSectionDef = {
  id: BlogGeneratorSectionId;
  label: string;
  icon: LucideIcon;
};

export const BLOG_GENERATOR_SECTION_DEFS: BlogGeneratorSectionDef[] = [
  { id: "opt", label: "Opt", icon: Crosshair },
  { id: "bulk-csv", label: "CSV", icon: FileSpreadsheet },
  { id: "bulk-prompt", label: "Prompt", icon: MessageSquare },
  { id: "bulk-blog-import", label: "Import", icon: ArrowUpToLine },
  { id: "bulk-press-release", label: "PR", icon: Newspaper },
  { id: "entity", label: "Entities", icon: MapPinHouse },
  { id: "flow", label: "Flow", icon: Workflow },
  { id: "image", label: "Image", icon: Image },
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
    const v = sessionStorage.getItem(BLOG_GENERATOR_SECTION_STORAGE_KEY);
    if (v === "competitor") {
      writeStoredEntitySubmode("competitors");
      sessionStorage.setItem(BLOG_GENERATOR_SECTION_STORAGE_KEY, "entity");
      return "entity";
    }
    if (v === "report") {
      sessionStorage.setItem(BLOG_GENERATOR_SECTION_STORAGE_KEY, "opt");
      return "opt";
    }
    if (isBlogGeneratorSectionId(v)) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return "bulk-csv";
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

