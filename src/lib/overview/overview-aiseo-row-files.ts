import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import { mergeGeneratedFilesByName } from "@/lib/overview/overview-peer-csv-details";
import {
  AISEO_POST_CONTENT_SLOT_TITLE,
  AISEO_WP_UPLOAD_SLOT_TITLE,
  getAiseoRowArtifactContract,
  type AiseoFileSlotRunKind,
  type AiseoGeneratedFile,
} from "@/lib/overview/overview-aiseo-row-artifact-registry";

export function generatedFileName(file: { name?: string; fileName?: string }): string {
  return file.name?.trim() || file.fileName?.trim() || "";
}

export function aiseoPostContentFileSlug(url: string): string {
  return (
    url
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "")
      .split("/")
      .pop()
      ?.replace(/[^a-z0-9._-]+/gi, "_")
      .slice(0, 60) || "page"
  );
}

export function isAiseoPostContentFileName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.startsWith("content-") && trimmed.endsWith(".html");
}

export function isWordPressUploadProofFileName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed === "wordpress.json" || (trimmed.startsWith("upload-payload-") && trimmed.endsWith(".json"));
}

/** Full WordPress post_content (exact bytes uploaded). */
export function buildAiseoPostContentHtmlFile(
  url: string,
  html: string,
): AiseoGeneratedFile | null {
  const body = html.trim();
  if (!body) return null;
  return {
    name: `content-${aiseoPostContentFileSlug(url)}.html`,
    content: body,
    mimeType: "text/html;charset=utf-8",
  };
}

export function findAiseoPostContentFile<T extends { name?: string; fileName?: string }>(
  files: T[],
): T | undefined {
  return files.find((file) => isAiseoPostContentFileName(generatedFileName(file)));
}

export function aiseoRowPipelineFileName(
  runKind: BulkOptimizationState["runKind"] | undefined,
  title: string,
): string | null {
  const contract = getAiseoRowArtifactContract(runKind);
  if (!contract) return null;
  if (title === contract.elementSlotTitle && contract.elementFileName) {
    return contract.elementFileName;
  }
  if (title === AISEO_POST_CONTENT_SLOT_TITLE) return null;
  if (title === AISEO_WP_UPLOAD_SLOT_TITLE) return "wordpress.json";
  return null;
}

type DisplayStatus = "waiting" | "generating" | "done";

export function buildAiseoRowDisplaySections(
  runKind: BulkOptimizationState["runKind"] | undefined,
  harness: Array<{ status?: string }> | undefined,
  files: Array<{ name?: string; fileName?: string }>,
): Array<{ sectionIndex: number; title: string; status: DisplayStatus }> {
  const contract = getAiseoRowArtifactContract(runKind);
  if (!contract?.pipelineTitles.length) return [];

  const sections = harness ?? [];
  const generating = sections.some((section) => section.status === "generating");
  const harnessDone = sections.length > 0 && sections.every((section) => section.status === "done");
  const hasElement =
    contract.elementFileName != null &&
    files.some((file) => generatedFileName(file) === contract.elementFileName);
  const hasPostContent = Boolean(findAiseoPostContentFile(files));
  const hasWordpress = files.some((file) => generatedFileName(file) === "wordpress.json");

  let elementStatus: DisplayStatus = "waiting";
  if (hasElement || (contract.elementSlotTitle && harnessDone)) elementStatus = "done";
  else if (generating) elementStatus = "generating";

  let contentStatus: DisplayStatus = "waiting";
  if (hasPostContent || hasWordpress) contentStatus = "done";
  else if (hasElement || (contract.elementSlotTitle == null && generating)) contentStatus = "generating";
  else if (elementStatus === "done") contentStatus = "generating";

  let wpStatus: DisplayStatus = "waiting";
  if (hasWordpress) wpStatus = "done";
  else if (hasPostContent || elementStatus === "done") wpStatus = "generating";

  const statuses: DisplayStatus[] = [];
  if (contract.elementSlotTitle) {
    statuses.push(elementStatus, contentStatus, wpStatus);
  } else if (contract.runKind === "wpUpload") {
    statuses.push(contentStatus, wpStatus);
  } else {
    return [];
  }

  return contract.pipelineTitles.map((title, sectionIndex) => ({
    sectionIndex,
    title,
    status: statuses[sectionIndex] ?? "waiting",
  }));
}

export function filterAiseoRowDisplayFiles<
  T extends { name?: string; fileName?: string },
>(runKind: BulkOptimizationState["runKind"] | undefined, files: T[]): T[] {
  const contract = getAiseoRowArtifactContract(runKind);
  if (!contract) return files;

  const out: T[] = [];
  if (contract.elementFileName) {
    const element = files.find((file) => generatedFileName(file) === contract.elementFileName);
    if (element) out.push(element);
  }
  if (contract.runKind === "aiFeaturedImage") {
    for (const extraName of ["google-image.png", "openrouter-image.png"]) {
      const extra = files.find((file) => generatedFileName(file) === extraName);
      if (extra) out.push(extra);
    }
  }
  const postContent = findAiseoPostContentFile(files);
  if (postContent) out.push(postContent);
  const uploadPayload = files.find((file) => {
    const n = generatedFileName(file);
    return n.startsWith("upload-payload-") && n.endsWith(".json");
  });
  if (uploadPayload) out.push(uploadPayload);
  const wordpress = files.find((file) => generatedFileName(file) === "wordpress.json");
  if (wordpress) out.push(wordpress);
  return out;
}

export function mergeAiseoRowFinishFiles(args: {
  runKind: BulkOptimizationState["runKind"];
  url: string;
  existingFiles: AiseoGeneratedFile[];
  elementFiles?: AiseoGeneratedFile[];
  postHtml?: string;
}): AiseoGeneratedFile[] {
  const existingWordpress = args.existingFiles.find(
    (file) => generatedFileName(file) === "wordpress.json",
  );
  const existingUploadPayload = args.existingFiles.find((file) => {
    const n = generatedFileName(file);
    return n.startsWith("upload-payload-") && n.endsWith(".json");
  });
  const merged = mergeGeneratedFilesByName(args.existingFiles, [
    ...(args.elementFiles ?? []),
    ...(args.postHtml?.trim()
      ? [buildAiseoPostContentHtmlFile(args.url, args.postHtml)].filter(
          (file): file is AiseoGeneratedFile => file != null,
        )
      : []),
  ]);
  let filtered = filterAiseoRowDisplayFiles(args.runKind, merged);
  if (
    existingUploadPayload &&
    !filtered.some((file) => generatedFileName(file) === generatedFileName(existingUploadPayload))
  ) {
    filtered = [...filtered, existingUploadPayload];
  }
  if (
    existingWordpress &&
    !filtered.some((file) => generatedFileName(file) === "wordpress.json")
  ) {
    filtered = [...filtered, existingWordpress];
  }
  return filtered.map((file) => ({
    name: generatedFileName(file),
    content: "content" in file && typeof file.content === "string" ? file.content : "",
    mimeType:
      "mimeType" in file && typeof file.mimeType === "string"
        ? file.mimeType
        : "application/octet-stream",
  }));
}

export function buildAiseoElementJsonFile(
  name: string,
  payload: unknown,
): AiseoGeneratedFile | null {
  const trimmedName = name.trim();
  if (!trimmedName) return null;
  return {
    name: trimmedName,
    content: JSON.stringify(payload, null, 2),
    mimeType: "application/json;charset=utf-8",
  };
}

export function buildAiseoElementHtmlFile(name: string, html: string): AiseoGeneratedFile | null {
  const body = html.trim();
  if (!body) return null;
  return {
    name: name.trim(),
    content: body,
    mimeType: "text/html;charset=utf-8",
  };
}

export function buildAiseoElementTextFile(
  name: string,
  text: string,
  mimeType = "text/markdown;charset=utf-8",
): AiseoGeneratedFile | null {
  const body = text.trim();
  if (!body) return null;
  return {
    name: name.trim(),
    content: body,
    mimeType,
  };
}

export type AiseoDownloadableFile = {
  name: string;
  content: string;
  mimeType: string;
};

function toAiseoDownloadableFile(
  file: { name?: string; fileName?: string; content?: string; mimeType?: string },
): AiseoDownloadableFile | undefined {
  const name = generatedFileName(file);
  const content = typeof file.content === "string" ? file.content : "";
  if (!name || !content.trim()) return undefined;
  return {
    name,
    content,
    mimeType:
      typeof file.mimeType === "string" && file.mimeType.trim()
        ? file.mimeType
        : "application/octet-stream",
  };
}

/** Map a fixed pipeline slot title to a downloadable file for Details drawers. */
export function resolveAiseoPipelineDownloadFile(
  runKind: AiseoFileSlotRunKind,
  title: string,
  files: Array<{ name?: string; fileName?: string; content?: string; mimeType?: string }>,
): AiseoDownloadableFile | undefined {
  if (title === AISEO_POST_CONTENT_SLOT_TITLE) {
    const match = findAiseoPostContentFile(files);
    return match ? toAiseoDownloadableFile(match) : undefined;
  }
  const fileName = aiseoRowPipelineFileName(runKind, title);
  if (!fileName) return undefined;
  const match = files.find((file) => generatedFileName(file) === fileName);
  return match ? toAiseoDownloadableFile(match) : undefined;
}

export function aiseoRowFilesForUpload(args: {
  runKind: BulkOptimizationState["runKind"];
  url: string;
  elementFiles?: AiseoGeneratedFile[];
  postHtml?: string;
}): AiseoGeneratedFile[] {
  return mergeAiseoRowFinishFiles({
    runKind: args.runKind,
    url: args.url,
    existingFiles: [],
    elementFiles: args.elementFiles,
    postHtml: args.postHtml,
  });
}
