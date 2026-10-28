import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";
import type { ResearchSectionId } from "@/components/research/research-workspace-sections";

export type StudioEditorModeId =
  | "prompt"
  | "blog-import"
  | "csv"
  | "press-release"
  | "research-proposal";

export type StudioEditorModeOption = {
  id: StudioEditorModeId;
  label: string;
};

export const STUDIO_EDITOR_MODE_OPTIONS: readonly StudioEditorModeOption[] = [
  { id: "prompt", label: "Blog Ideas Studio" },
  { id: "blog-import", label: "Import Drafts Studio" },
  { id: "csv", label: "Bulk CSV Studio" },
  { id: "press-release", label: "Press Release Studio" },
  { id: "research-proposal", label: "Proposal Research Studio" },
] as const;

export const STUDIO_EDITOR_MODE_STORAGE_KEY = "neo-pulse:studio-editor-mode:v1";

export function isStudioEditorModeId(value: string): value is StudioEditorModeId {
  return STUDIO_EDITOR_MODE_OPTIONS.some((opt) => opt.id === value);
}

export function isResearchStudioMode(mode: StudioEditorModeId): mode is ResearchSectionId {
  return mode === "research-proposal";
}

export function readStoredStudioEditorMode(
  activeSection?: BlogGeneratorSectionId,
): StudioEditorModeId {
  if (activeSection === "bulk-press-release") return "press-release";
  if (activeSection === "research") return "research-proposal";
  if (activeSection === "bulk-csv") return "csv";
  if (activeSection === "bulk-blog-import") return "blog-import";
  try {
    const raw = sessionStorage.getItem(STUDIO_EDITOR_MODE_STORAGE_KEY);
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
  if (isResearchStudioMode(mode)) return "research";
  return "bulk-prompt";
}
