import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import { reduceHarnessSectionList } from "@/lib/bulk/harness-sections-reducer";
import {
  clearAgentRunHostedFiles,
  createHostedHrefForBulkFile,
  syncAgentRunHostedFilesFromBulk,
} from "@/lib/agent-runs/agent-run-hosted-files";
import { resolveAgentRunRecipeKey } from "@/lib/agent-runs/agent-run-navigation";
import type { AgentRun, AgentRunUploadedPost } from "@/lib/agent-runs-types";
import { resolvePostCreatorPostCount } from "@/lib/post-creator/post-creator-post-count";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import {
  clearPostCreatorContentBucketBlobs,
  contentBucketFilesToHosted,
  type PostCreatorContentBucketFile,
} from "@/lib/post-creator/post-creator-inventory-bucket";
import {
  POST_CREATOR_PROOF_SLOTS,
  postCreatorProofRowLabel,
  type PostCreatorProofRow,
  type PostCreatorProofSlot,
  type PostCreatorProofSnapshot,
  type PostCreatorProofSlotKey,
} from "./agent-run-post-creator-proof-types";
import {
  notifyProof,
  proofByRunId,
  proofListenersByRunId,
  type ProofStoreEntry,
} from "./agent-run-post-creator-proof-store";

function parseWordPressLink(content: string): string | undefined {
  try {
    const parsed = JSON.parse(content) as { link?: string; post_url?: string };
    return parsed.link?.trim() || parsed.post_url?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function harnessTargetsSlot(title: string): PostCreatorProofSlotKey | null {
  const lower = title.trim().toLowerCase();
  if (!lower) return null;
  if (lower.includes("blueprint") || lower.includes("content") || lower.includes("overview")) {
    return "blueprint";
  }
  if (lower.includes("checklist")) return "checklist";
  if (lower.includes("image") || lower.includes("featured")) return "image";
  return "blueprint";
}

function isCompletedBulkFile(file: BulkGeneratedFile): boolean {
  return file.status === "completed" || (file.status === "error" && Boolean(file.content?.trim()));
}

function findFeaturedImageFile(
  rowIndex: number,
  files: readonly BulkGeneratedFile[],
): BulkGeneratedFile | undefined {
  const rowFiles = files.filter((f) => f.rowIndex === rowIndex && isCompletedBulkFile(f));
  const raster = rowFiles.filter((f) => f.mimeType?.startsWith("image/"));
  if (raster.length > 0) {
    return raster.sort((a, b) => b.timestamp - a.timestamp)[0];
  }
  return rowFiles.find((f) => /featured-image-checklist/i.test(f.fileName));
}

function findFileForSlot(
  rowIndex: number,
  slotKey: PostCreatorProofSlotKey,
  files: readonly BulkGeneratedFile[],
): BulkGeneratedFile | undefined {
  if (slotKey === "image") {
    return findFeaturedImageFile(rowIndex, files);
  }
  const slotDef = POST_CREATOR_PROOF_SLOTS.find((s) => s.key === slotKey);
  if (!slotDef) return undefined;
  return files.find(
    (file) =>
      file.rowIndex === rowIndex &&
      isCompletedBulkFile(file) &&
      slotDef.matchFileName(file.fileName),
  );
}

function buildProofSnapshot(
  runId: number,
  entry: ProofStoreEntry,
  files: readonly BulkGeneratedFile[],
): PostCreatorProofSnapshot {
  const slotDefs = entry.featuredImageEnabled
    ? POST_CREATOR_PROOF_SLOTS
    : POST_CREATOR_PROOF_SLOTS.filter((s) => s.key !== "image");
  const rows: PostCreatorProofRow[] = [];
  for (let rowIndex = 0; rowIndex < entry.postCount; rowIndex++) {
    const rowFiles = files.filter((f) => f.rowIndex === rowIndex);
    const keyword = rowFiles[0]?.rowData?.keyword?.trim() || rowFiles[0]?.rowData?.title?.trim();
    const harness = entry.harnessByRow.get(rowIndex) ?? [];
    const generatingSlot = harness.find((s) => s.status === "generating");
    const generatingKey = generatingSlot ? harnessTargetsSlot(generatingSlot.title) : null;

    const uploaded = entry.uploadedPosts[rowIndex];
    const wpFile = findFileForSlot(rowIndex, "wordpress", files);
    const liveFromArtifact = wpFile?.content ? parseWordPressLink(wpFile.content) : undefined;
    const liveUrl = uploaded?.url || liveFromArtifact;

    const slots: PostCreatorProofSlot[] = slotDefs.map((slotDef) => {
      if (slotDef.key === "live") {
        if (liveUrl) {
          return {
            key: slotDef.key,
            label: slotDef.label,
            status: "ready",
            externalUrl: liveUrl,
            fileName: liveUrl,
          };
        }
        return { key: slotDef.key, label: slotDef.label, status: "waiting" };
      }

      const file = findFileForSlot(rowIndex, slotDef.key, files);
      if (file) {
        return {
          key: slotDef.key,
          label: slotDef.label,
          status: "ready",
          href: createHostedHrefForBulkFile(runId, file),
          fileName: file.fileName,
        };
      }

      if (
        entry.activeRowIndex === rowIndex &&
        generatingKey === slotDef.key
      ) {
        return { key: slotDef.key, label: slotDef.label, status: "generating" };
      }

      if (
        slotDef.key === "image" &&
        entry.featuredImageEnabled &&
        entry.activeRowIndex === rowIndex &&
        findFileForSlot(rowIndex, "content", files) &&
        !findFeaturedImageFile(rowIndex, files)
      ) {
        return { key: slotDef.key, label: slotDef.label, status: "generating" };
      }

      if (
        entry.activeRowIndex === rowIndex &&
        slotDef.key === "keyword" &&
        !generatingKey &&
        rowFiles.length === 0
      ) {
        return { key: slotDef.key, label: slotDef.label, status: "generating" };
      }

      return { key: slotDef.key, label: slotDef.label, status: "waiting" };
    });

    rows.push({
      rowIndex,
      label: postCreatorProofRowLabel(rowIndex, entry.postCount, keyword),
      keyword,
      slots,
    });
  }

  return {
    postCount: entry.postCount,
    activeRowIndex: entry.activeRowIndex,
    rows,
    contentBucketFiles: entry.contentBucketFiles.length ? entry.contentBucketFiles : undefined,
  };
}

export function initPostCreatorProof(
  runId: number,
  postCount: number,
  featuredImageEnabled = true,
): PostCreatorProofSnapshot {
  const entry: ProofStoreEntry = {
    postCount: Math.max(1, postCount),
    activeRowIndex: null,
    harnessByRow: new Map(),
    uploadedPosts: [],
    featuredImageEnabled,
    contentBucketFiles: [],
    snapshot: { postCount: Math.max(1, postCount), activeRowIndex: null, rows: [] },
  };
  entry.snapshot = buildProofSnapshot(runId, entry, []);
  proofByRunId.set(runId, entry);
  notifyProof(runId);
  return entry.snapshot;
}

export type SyncPostCreatorProofArgs = {
  postCount: number;
  files: readonly BulkGeneratedFile[];
  harnessPayload?: BulkHarnessSectionPayload;
  activeRowIndex?: number | null;
  uploadedPosts?: AgentRunUploadedPost[];
  featuredImageEnabled?: boolean;
  contentBucketFiles?: readonly PostCreatorContentBucketFile[];
};

export function syncPostCreatorContentBucketProof(
  runId: number,
  files: readonly PostCreatorContentBucketFile[],
): PostCreatorProofSnapshot | null {
  const entry = proofByRunId.get(runId);
  if (!entry) return null;
  entry.contentBucketFiles = contentBucketFilesToHosted(runId, files).map((file) => ({
    bucket: file.id.replace("content-bucket-", ""),
    name: file.name,
    href: file.href,
  }));
  entry.snapshot = buildProofSnapshot(runId, entry, []);
  notifyProof(runId);
  return entry.snapshot;
}

export function syncPostCreatorProof(runId: number, args: SyncPostCreatorProofArgs): PostCreatorProofSnapshot {
  syncAgentRunHostedFilesFromBulk(runId, args.files);

  let entry = proofByRunId.get(runId);
  if (!entry) {
    initPostCreatorProof(runId, args.postCount);
    entry = proofByRunId.get(runId)!;
  }

  entry.postCount = Math.max(1, args.postCount);
  if (args.featuredImageEnabled !== undefined) {
    entry.featuredImageEnabled = args.featuredImageEnabled;
  }
  if (args.activeRowIndex !== undefined) {
    entry.activeRowIndex = args.activeRowIndex;
  }
  if (args.uploadedPosts) {
    entry.uploadedPosts = args.uploadedPosts;
  }
  if (args.contentBucketFiles?.length) {
    entry.contentBucketFiles = contentBucketFilesToHosted(runId, args.contentBucketFiles).map((file) => ({
      bucket: file.id.replace("content-bucket-", ""),
      name: file.name,
      href: file.href,
    }));
  }

  if (args.harnessPayload) {
    const rowIndex = args.harnessPayload.rowIndex;
    const prev = entry.harnessByRow.get(rowIndex) ?? [];
    entry.harnessByRow.set(rowIndex, reduceHarnessSectionList(prev, args.harnessPayload));
    entry.activeRowIndex = rowIndex;
  }

  entry.snapshot = buildProofSnapshot(runId, entry, args.files);
  proofByRunId.set(runId, entry);
  notifyProof(runId);
  return entry.snapshot;
}

export function getPostCreatorProof(runId: number): PostCreatorProofSnapshot | null {
  return proofByRunId.get(runId)?.snapshot ?? null;
}

export function subscribePostCreatorProof(runId: number, listener: () => void): () => void {
  let set = proofListenersByRunId.get(runId);
  if (!set) {
    set = new Set();
    proofListenersByRunId.set(runId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

export function clearPostCreatorProof(runId: number): void {
  proofByRunId.delete(runId);
  proofListenersByRunId.delete(runId);
  clearAgentRunHostedFiles(runId);
  clearPostCreatorContentBucketBlobs(runId);
  notifyProof(runId);
}

export function postCreatorProofCollapsedHint(snapshot: PostCreatorProofSnapshot | null): string | null {
  if (!snapshot || snapshot.rows.length === 0) return null;
  const activeIndex = snapshot.activeRowIndex ?? 0;
  const row = snapshot.rows[activeIndex];
  if (!row) return null;

  const generating = row.slots.find((s) => s.status === "generating");
  if (generating) return `${generating.label} generating`;

  const ready = row.slots.filter((s) => s.status === "ready");
  if (ready.length > 0) {
    const last = ready[ready.length - 1];
    return `${last.label} ready`;
  }

  const keyword = row.keyword?.trim();
  if (keyword) return keyword;

  return null;
}

export function resolvePostCreatorPostCountFromRun(run: AgentRun): number {
  try {
    return resolvePostCreatorPostCount(null, run);
  } catch {
    return 0;
  }
}

export function buildStaticWaitingProofSnapshot(
  postCount: number,
  featuredImageEnabled = true,
): PostCreatorProofSnapshot {
  const slotDefs = featuredImageEnabled
    ? POST_CREATOR_PROOF_SLOTS
    : POST_CREATOR_PROOF_SLOTS.filter((s) => s.key !== "image");
  const count = Math.max(1, postCount);
  const rows: PostCreatorProofRow[] = Array.from({ length: count }, (_, rowIndex) => ({
    rowIndex,
    label: postCreatorProofRowLabel(rowIndex, count),
    slots: slotDefs.map((slotDef) => ({
      key: slotDef.key,
      label: slotDef.label,
      status: "waiting" as const,
    })),
  }));
  return { postCount: count, activeRowIndex: null, rows };
}

export function ensurePostCreatorProofFromRun(run: AgentRun): PostCreatorProofSnapshot | null {
  if (resolveAgentRunRecipeKey(run) !== "post_creator") return null;
  const existing = getPostCreatorProof(run.id);
  if (existing) return existing;

  const postCount = resolvePostCreatorPostCountFromRun(run);
  if (postCount < 1) return null;

  const featuredImageEnabled = run.plan?.clientRunContract?.featuredImage !== false;
  initPostCreatorProof(run.id, postCount, featuredImageEnabled);
  const uploadedPosts = run.result?.uploadedPosts;
  if (uploadedPosts?.length) {
    return syncPostCreatorProof(run.id, {
      postCount,
      files: [],
      uploadedPosts,
      featuredImageEnabled,
    });
  }
  return getPostCreatorProof(run.id);
}

export function getPostCreatorProofForRun(run: AgentRun): PostCreatorProofSnapshot | null {
  if (resolveAgentRunRecipeKey(run) !== "post_creator") return null;
  const live = ensurePostCreatorProofFromRun(run);
  if (live) return live;
  const postCount = resolvePostCreatorPostCountFromRun(run);
  if (postCount < 1) return null;
  return buildStaticWaitingProofSnapshot(
    postCount,
    run.plan?.clientRunContract?.featuredImage !== false,
  );
}
