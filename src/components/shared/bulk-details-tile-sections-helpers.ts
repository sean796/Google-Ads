import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import { buildWaitingContentOptimizeHarnessSections } from "@/lib/overview/overview-content-optimize-pipeline";
import {
  isArtifactOnlyPipelineTitle,
  isSerpPipelineSection,
  sanitizeHarnessFilenamePart,
  type BulkDetailsDownloadable,
} from "./bulk-details-tile-sections-classify";
import {
  harnessSectionToDownloadable,
  linkPipelineSectionToGeneratedFile,
} from "./bulk-details-tile-sections-download-link";
export * from "./bulk-details-tile-sections-classify";
export * from "./bulk-details-tile-sections-download-link";
function sanitizeHarnessSectionForDrawer(section: BulkHarnessSectionUi): BulkHarnessSectionUi {
  if (section.status === "done") {
    return section;
  }
  return { ...section, markdown: undefined };
}

function pipelineSectionDoneFromArtifactFile(
  title: string,
  files: BulkDetailsDownloadable[] | undefined,
): boolean {
  if (!files?.length) return false;
  return Boolean(
    linkPipelineSectionToGeneratedFile({ sectionIndex: 0, title, status: "waiting" }, files),
  );
}

export function resolveDetailsPipelineSections(
  persisted: BulkHarnessSectionUi[] | undefined,
  live: BulkHarnessSectionUi[] | undefined,
  pipelineSectionTitles?: readonly string[],
  files?: BulkDetailsDownloadable[],
): BulkHarnessSectionUi[] {
  if (pipelineSectionTitles?.length) {
    const statusByTitle = new Map<string, BulkHarnessSectionUi>();
    for (const section of [...(persisted ?? []), ...(live ?? [])]) {
      const title = section.title?.trim();
      if (title) statusByTitle.set(title, section);
    }
    return pipelineSectionTitles.map((title, sectionIndex) => {
      const patch = statusByTitle.get(title);
      if (pipelineSectionDoneFromArtifactFile(title, files)) {
        return { sectionIndex, title, status: "done" as const };
      }
      if (patch && patch.status !== "waiting") {
        return sanitizeHarnessSectionForDrawer({ ...patch, sectionIndex, title });
      }
      const placeholder: BulkHarnessSectionUi = patch ?? {
        sectionIndex,
        title,
        status: "waiting" as const,
      };
      return placeholder;
    });
  }

  const harnessOnly = [...(persisted ?? []), ...(live ?? [])].filter(
    (section) => section.title?.trim(),
  );
  if (harnessOnly.length > 0) {
    const byTitle = new Map<string, BulkHarnessSectionUi>();
    for (const section of harnessOnly) {
      const title = section.title!.trim();
      byTitle.set(title, section);
    }
    return [...byTitle.values()].map((section, sectionIndex) =>
      sanitizeHarnessSectionForDrawer({ ...section, sectionIndex }),
    );
  }

  const waiting = buildWaitingContentOptimizeHarnessSections();
  const statusByTitle = new Map<string, BulkHarnessSectionUi>();
  for (const section of [...(persisted ?? []), ...(live ?? [])]) {
    const title = section.title?.trim();
    if (title) statusByTitle.set(title, section);
  }
  return waiting.map((section) => {
    const patch = statusByTitle.get(section.title);
    if (!patch) return section;
    return {
      ...section,
      status: patch.status,
      markdown: patch.markdown ?? section.markdown,
      truncated: patch.truncated ?? section.truncated,
    };
  });
}
export function sectionFallbackDownloadable(
  section: BulkHarnessSectionUi,
  orderIndex: number,
): BulkDetailsDownloadable {
  const title = section.title.trim() || `Section ${orderIndex + 1}`;
  const content = section.markdown?.trim() || title;
  return {
    name: `${orderIndex + 1}-${sanitizeHarnessFilenamePart(title)}.txt`,
    content,
    mimeType: "text/plain;charset=utf-8",
  };
}

export function resolvePipelineSectionDownloadable(
  section: BulkHarnessSectionUi,
  orderIndex: number,
  files: BulkDetailsDownloadable[],
  claimedNames: Set<string>,
  serpBriefDownload?: BulkDetailsDownloadable | null,
  options?: { noFallback?: boolean; researchArtifactsOnly?: boolean; requireDoneStatus?: boolean },
): BulkDetailsDownloadable | null {
  const available = files.filter((file) => !claimedNames.has(file.name));

  if (section.title.trim().toLowerCase() === "google image") {
    const linkedGoogle = linkPipelineSectionToGeneratedFile(section, available);
    if (linkedGoogle) {
      claimedNames.add(linkedGoogle.name);
      return linkedGoogle;
    }
  }

  if (options?.requireDoneStatus && section.status !== "done") {
    const linkedEarly = linkPipelineSectionToGeneratedFile(section, available);
    if (linkedEarly) {
      claimedNames.add(linkedEarly.name);
      return linkedEarly;
    }
    return null;
  }

  if (isSerpPipelineSection(section) && serpBriefDownload && !claimedNames.has(serpBriefDownload.name)) {
    claimedNames.add(serpBriefDownload.name);
    return serpBriefDownload;
  }

  const linked = linkPipelineSectionToGeneratedFile(section, available);
  if (linked) {
    claimedNames.add(linked.name);
    return linked;
  }

  if (
    !options?.researchArtifactsOnly &&
    !(options?.noFallback && isArtifactOnlyPipelineTitle(section.title))
  ) {
    const fromMarkdown = harnessSectionToDownloadable(section, orderIndex);
    if (fromMarkdown) {
      claimedNames.add(fromMarkdown.name);
      return fromMarkdown;
    }
  }

  if (options?.noFallback) return null;

  const fallback = sectionFallbackDownloadable(section, orderIndex);
  claimedNames.add(fallback.name);
  return fallback;
}

export function buildPipelineSectionDownloadables(
  pipelineSections: BulkHarnessSectionUi[],
  files: BulkDetailsDownloadable[],
  serpBriefDownload?: BulkDetailsDownloadable | null,
  options?: { noFallback?: boolean; researchArtifactsOnly?: boolean; requireDoneStatus?: boolean },
): Array<BulkDetailsDownloadable | null> {
  const claimedNames = new Set<string>();
  return pipelineSections.map((section, index) =>
    resolvePipelineSectionDownloadable(
      section,
      index,
      files,
      claimedNames,
      serpBriefDownload,
      options,
    ),
  );
}

export function buildAllDownloadables(
  pipelineSections: BulkHarnessSectionUi[],
  files: BulkDetailsDownloadable[],
  serpBriefDownload?: BulkDetailsDownloadable | null,
  options?: { noFallback?: boolean; researchArtifactsOnly?: boolean; requireDoneStatus?: boolean },
): BulkDetailsDownloadable[] {
  const seen = new Set<string>();
  const all: BulkDetailsDownloadable[] = [];
  const push = (file: BulkDetailsDownloadable | null) => {
    if (!file || seen.has(file.name)) return;
    seen.add(file.name);
    all.push(file);
  };
  buildPipelineSectionDownloadables(pipelineSections, files, serpBriefDownload, options).forEach((file) =>
    push(file),
  );
  files.forEach((file) => push(file));
  return all;
}
