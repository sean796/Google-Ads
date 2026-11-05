import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";

export type StudioEditorModeId =
  | "prompt"
  | "vertical-benchmarks"
  | "csv"
  | "press-release";

export type StudioEditorModeOption = {
  id: StudioEditorModeId;
  label: string;
};

export const STUDIO_EDITOR_MODE_OPTIONS: readonly StudioEditorModeOption[] = [
  { id: "prompt", label: "Blog Ideas Studio" },
  { id: "vertical-benchmarks", label: "Industry Verticals Studio" },
  { id: "csv", label: "Bulk CSV Studio" },
  { id: "press-release", label: "Press Release Studio" },
] as const;

export const STUDIO_EDITOR_MODE_STORAGE_KEY = "neo-pulse:studio-editor-mode:v1";

export function isStudioEditorModeId(value: string): value is StudioEditorModeId {
  return STUDIO_EDITOR_MODE_OPTIONS.some((opt) => opt.id === value);
}

export function readStoredStudioEditorMode(
  activeSection?: BlogGeneratorSectionId,
): StudioEditorModeId {
  if (activeSection === "bulk-press-release") return "press-release";
  if (activeSection === "bulk-csv" || activeSection === "bulk-blog-import") return "csv";
  try {
    if (typeof window !== "undefined" && window.location?.hash) {
      const hash = window.location.hash.replace(/^#/, "").trim();
      if (hash === "vertical-benchmarks" || hash === "generator/vertical-benchmarks") {
        sessionStorage.setItem(STUDIO_EDITOR_MODE_STORAGE_KEY, "vertical-benchmarks");
        return "vertical-benchmarks";
      }
    }
    const raw = sessionStorage.getItem(STUDIO_EDITOR_MODE_STORAGE_KEY);
    if (raw === "blog-import") return "csv";
    if (raw && isStudioEditorModeId(raw)) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return "prompt";
}

export function writeStoredStudioEditorMode(mode: StudioEditorModeId): void {
  try {
    sessionStorage.setItem(STUDIO_EDITOR_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function blogGeneratorSectionForStudioMode(
  mode: StudioEditorModeId,
): BlogGeneratorSectionId {
  if (mode === "press-release") return "bulk-press-release";
  return "bulk-prompt";
}
