import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import type { HarnessSectionListItem } from "@/lib/bulk/harness-sections-reducer";
import { reduceHarnessSectionList } from "@/lib/bulk/harness-sections-reducer";
import {
  clearAgentRunHostedFiles,
  createHostedHrefForBulkFile,
  syncAgentRunHostedFilesFromBulk,
} from "@/lib/agent-runs/agent-run-hosted-files";
import type { AgentRunArtifactRecord } from "@/lib/agent-runs-api";
import { agentRunIsServerExecution } from "@/lib/agent-runs/agent-run-display";
import { resolveAgentRunRecipeKey } from "@/lib/agent-runs/agent-run-navigation";
import type { AgentRun, AgentRunStepArtifact, AgentRunUploadedPost } from "@/lib/agent-runs-types";
import { resolvePostCreatorPostCount } from "@/lib/post-creator/post-creator-post-count";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import {
  clearPostCreatorContentBucketBlobs,
  contentBucketFilesToHosted,
  type PostCreatorContentBucketFile,
} from "@/lib/post-creator/post-creator-inventory-bucket";

function postCreatorProofRowLabel(
  rowIndex: number,
  postCount: number,
  keyword?: string,
): string {
  const kw = keyword?.trim();
  if (kw) return kw;
  if (postCount > 1) return `Post ${rowIndex + 1}`;
  return "";
}

export type PostCreatorProofSlotKey =
  | "checklist"
  | "keyword"
  | "blueprint"
  | "content"
  | "image"
  | "wordpress"
  | "live";

export type PostCreatorProofSlotStatus = "waiting" | "generating" | "ready";

export type PostCreatorProofSlot = {
  key: PostCreatorProofSlotKey;
  label: string;
  status: PostCreatorProofSlotStatus;
  href?: string;
  fileName?: string;
  externalUrl?: string;
};

export type PostCreatorProofRow = {
  rowIndex: number;
  label: string;
  keyword?: string;
  slots: PostCreatorProofSlot[];
};

export type PostCreatorContentBucketProofFile = {
  bucket: string;
  name: string;
  href: string;
};

export type PostCreatorProofSnapshot = {
  postCount: number;
  activeRowIndex: number | null;
  rows: PostCreatorProofRow[];
  contentBucketFiles?: PostCreatorContentBucketProofFile[];
};

export const POST_CREATOR_PROOF_SLOTS: Array<{
  key: PostCreatorProofSlotKey;
  label: string;
  matchFileName: (name: string) => boolean;
}> = [
  {
    key: "keyword",
    label: "Keyword research",
    matchFileName: (name) =>
      /keyword-research|dfs_research|sem_rush|seo-research/i.test(name),
  },
  {
    key: "checklist",
    label: "Checklist",
    matchFileName: (name) => /blog-checklist|blog_checklist/i.test(name),
  },
  {
    key: "blueprint",
    label: "Blueprint",
    matchFileName: (name) => /^blueprint-/i.test(name),
  },
  {
    key: "content",
    label: "Content",
    matchFileName: (name) => /^content-/i.test(name) && /\.md$/i.test(name),
  },
  {
    key: "image",
    label: "Featured image",
    matchFileName: (name) =>
      /featured-image/i.test(name) ||
      /\.(png|jpe?g|webp)$/i.test(name),
  },
  {
    key: "wordpress",
    label: "WordPress upload",
    matchFileName: (name) => /wordpress-post/i.test(name),
  },
  {
    key: "live",
    label: "Published URL",
    matchFileName: () => false,
  },
];

type ProofStoreEntry = {
  postCount: number;
  activeRowIndex: number | null;
  harnessByRow: Map<number, HarnessSectionListItem[]>;
  uploadedPosts: AgentRunUploadedPost[];
  featuredImageEnabled: boolean;
  contentBucketFiles: PostCreatorContentBucketProofFile[];
  snapshot: PostCreatorProofSnapshot;
};

const proofByRunId = new Map<number, ProofStoreEntry>();
const proofListenersByRunId = new Map<number, Set<() => void>>();

function notifyProof(runId: number): void {
  for (const listener of proofListenersByRunId.get(runId) ?? []) {
    listener();
  }
}

type ServerCheckpoint = {
  rowIndex?: number;
  intraPhase?: string;
  checklistRows?: Array<{ keyword?: string; title?: string }>;
};

function parseServerPostStepKey(stepKey: string): { rowIndex: number; phase: string } | null {
  const trimmed = stepKey.trim();

  const compactOverview = /^post(\d+)harnessoverview$/.exec(trimmed);
  if (compactOverview) {
    const rowIndex = Number(compactOverview[1]);
    if (Number.isFinite(rowIndex) && rowIndex >= 0) {
      return { rowIndex, phase: "harnessoverview" };
    }
  }

  const compactHarness = /^post(\d+)harness(\d+)$/.exec(trimmed);
  if (compactHarness) {
    const rowIndex = Number(compactHarness[1]);
    if (Number.isFinite(rowIndex) && rowIndex >= 0) {
      return { rowIndex, phase: "harness" };
    }
  }

  const compactPhase = /^post(\d+)(keyword|checklist|blueprint|content|upload|image|start)$/.exec(trimmed);
  if (compactPhase) {
    const rowIndex = Number(compactPhase[1]);
    if (Number.isFinite(rowIndex) && rowIndex >= 0) {
      return { rowIndex, phase: compactPhase[2] };
    }
  }

  const dotted = /^post\.(\d+)\.([a-z]+)(?:\.(\d+|overview))?$/.exec(trimmed);
  if (dotted) {
    const rowIndex = Number(dotted[1]);
    if (!Number.isFinite(rowIndex) || rowIndex < 0) return null;
    const phaseSuffix = dotted[3];
    if (dotted[2] === "harness" && phaseSuffix === "overview") {
      return { rowIndex, phase: "harnessoverview" };
    }
    return { rowIndex, phase: dotted[2] };
  }

  const prefix = /^post(\d+)/.exec(trimmed);
  if (prefix) {
    const rowIndex = Number(prefix[1]);
    if (Number.isFinite(rowIndex) && rowIndex >= 0) {
      return { rowIndex, phase: "start" };
    }
  }

  return null;
}

function serverPhaseToProofSlot(phase: string): PostCreatorProofSlotKey | null {
  if (phase === "checklist") return "checklist";
  if (phase === "keyword") return "keyword";
  if (phase === "blueprint") return "blueprint";
  if (phase === "content" || phase === "harness" || phase === "harnessoverview") return "content";
  if (phase === "upload" || phase === "awaiting_client_upload") return "wordpress";
  if (phase === "image") return "image";
  return null;
}

function artifactSlotFromFileName(name: string): PostCreatorProofSlotKey | null {
  for (const slotDef of POST_CREATOR_PROOF_SLOTS) {
    if (slotDef.key === "live") continue;
    if (slotDef.matchFileName(name)) return slotDef.key;
  }
  return null;
}

function inferRowIndexFromStepKey(stepKey: string): number | null {
  const parsed = parseServerPostStepKey(stepKey);
  if (parsed) return parsed.rowIndex;
  const prefix = /^post(\d+)/.exec(stepKey.trim());
  if (!prefix) return null;
  const rowIndex = Number(prefix[1]);
  return Number.isFinite(rowIndex) && rowIndex >= 0 ? rowIndex : null;
}

function parseContentBucketFromArtifactName(name: string): string | null {
  const match = /^content-bucket-([^-]+)-/i.exec(name.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

function contentBucketFilesFromRunSteps(run: AgentRun): PostCreatorContentBucketProofFile[] {
  const out: PostCreatorContentBucketProofFile[] = [];
  const seen = new Set<string>();
  for (const step of run.steps ?? []) {
    const stepKey = step.stepKey?.trim().replace(/-/g, "") ?? "";
    if (stepKey !== "contentbucket") continue;
    const raw = step.payload?.artifacts;
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const name = String((item as { name?: string }).name ?? "").trim();
      const href = String((item as { url?: string }).url ?? "").trim();
      if (!name || !href) continue;
      if (!/^content-bucket-/i.test(name)) continue;
      const bucket = parseContentBucketFromArtifactName(name) ?? "posts";
      const key = `${bucket}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ bucket, name, href });
    }
  }
  return out;
}

function mergeContentBucketFiles(
  ...groups: readonly PostCreatorContentBucketProofFile[][]
): PostCreatorContentBucketProofFile[] {
  const out: PostCreatorContentBucketProofFile[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const file of group) {
      const key = `${file.bucket}:${file.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(file);
    }
  }
  return out;
}

function contentBucketReady(
  run: AgentRun,
  bucketFiles: readonly PostCreatorContentBucketProofFile[],
): boolean {
  if (bucketFiles.length > 0) return true;
  return (run.steps ?? []).some((step) => {
    const key = step.stepKey?.trim().replace(/-/g, "") ?? "";
    return key === "contentbucket" && step.status === "done";
  });
}

function contentBucketFilesFromServerArtifacts(
  artifacts: readonly AgentRunArtifactRecord[],
): PostCreatorContentBucketProofFile[] {
  const out: PostCreatorContentBucketProofFile[] = [];
  const seen = new Set<string>();
  for (const artifact of artifacts) {
    const stepKey = artifact.stepKey?.trim() ?? "";
    const name = artifact.name?.trim() ?? "";
    const url = artifact.url?.trim() ?? "";
    if (!name || !url) continue;
    const isBucket =
      stepKey === "content-bucket" ||
      stepKey === "contentbucket" ||
      /^content-bucket-/i.test(name);
    if (!isBucket) continue;
    const bucket = parseContentBucketFromArtifactName(name) ?? "posts";
    const key = `${bucket}:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ bucket, name, href: url });
  }
  return out;
}

function buildServerProofSnapshot(
  run: AgentRun,
  entry: ProofStoreEntry,
  artifacts: readonly AgentRunArtifactRecord[],
): PostCreatorProofSnapshot {
  const slotDefs = entry.featuredImageEnabled
    ? POST_CREATOR_PROOF_SLOTS
    : POST_CREATOR_PROOF_SLOTS.filter((s) => s.key !== "image");

  const server = (run.result?.checkpoint?.server ?? {}) as ServerCheckpoint;
  const uploadedPosts = run.result?.uploadedPosts ?? entry.uploadedPosts;
  const activeRowIndex =
    typeof server.rowIndex === "number" ? server.rowIndex : entry.activeRowIndex;
  const awaitingClientUpload = server.intraPhase === "awaiting_client_upload";
  const bucketReady = contentBucketReady(run, entry.contentBucketFiles);

  const artifactByRowSlot = new Map<string, AgentRunArtifactRecord>();
  for (const artifact of artifacts) {
    const stepKey = artifact.stepKey?.trim() ?? "";
    const parsed = parseServerPostStepKey(stepKey);
    const rowIndex = parsed?.rowIndex ?? inferRowIndexFromStepKey(stepKey);
    let slotKey = parsed ? serverPhaseToProofSlot(parsed.phase) : null;
    if (!slotKey && artifact.name) {
      slotKey = artifactSlotFromFileName(artifact.name);
    }
    if (rowIndex === null || !slotKey) continue;
    const key = `${rowIndex}:${slotKey}`;
    if (!artifactByRowSlot.has(key)) {
      artifactByRowSlot.set(key, artifact);
    }
  }

  const generatingByRowSlot = new Set<string>();
  for (const step of run.steps ?? []) {
    if (step.status !== "running") continue;
    const parsed = parseServerPostStepKey(step.stepKey?.trim() ?? "");
    if (!parsed) continue;
    if (parsed.phase === "upload" && awaitingClientUpload) continue;
    const slotKey = serverPhaseToProofSlot(parsed.phase);
    if (slotKey) generatingByRowSlot.add(`${parsed.rowIndex}:${slotKey}`);
  }

  const rows: PostCreatorProofRow[] = [];
  for (let rowIndex = 0; rowIndex < entry.postCount; rowIndex++) {
    const rowMeta = server.checklistRows?.[rowIndex];
    const keyword = rowMeta?.keyword?.trim() || rowMeta?.title?.trim();
    const uploaded = uploadedPosts[rowIndex];
    const liveUrl = uploaded?.url?.trim();

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

      const artifact = artifactByRowSlot.get(`${rowIndex}:${slotDef.key}`);
      if (artifact?.url) {
        return {
          key: slotDef.key,
          label: slotDef.label,
          status: "ready",
          href: artifact.url,
          fileName: artifact.name,
        };
      }

      if (
        slotDef.key === "keyword" &&
        activeRowIndex === rowIndex &&
        !artifactByRowSlot.has(`${rowIndex}:keyword`) &&
        !bucketReady
      ) {
        return { key: slotDef.key, label: slotDef.label, status: "waiting" };
      }

      if (generatingByRowSlot.has(`${rowIndex}:${slotDef.key}`)) {
        return { key: slotDef.key, label: slotDef.label, status: "generating" };
      }

      if (
        awaitingClientUpload &&
        activeRowIndex === rowIndex &&
        slotDef.key === "image" &&
        entry.featuredImageEnabled &&
        !artifactByRowSlot.has(`${rowIndex}:image`)
      ) {
        return { key: slotDef.key, label: slotDef.label, status: "generating" };
      }

      if (activeRowIndex === rowIndex) {
        const hasKeyword = artifactByRowSlot.has(`${rowIndex}:keyword`);
        const hasChecklist = artifactByRowSlot.has(`${rowIndex}:checklist`);
        if (!hasKeyword && slotDef.key === "keyword") {
          if (!bucketReady) {
            return { key: slotDef.key, label: slotDef.label, status: "waiting" };
          }
          return { key: slotDef.key, label: slotDef.label, status: "generating" };
        }
        if (hasKeyword && !hasChecklist && slotDef.key === "checklist") {
          return { key: slotDef.key, label: slotDef.label, status: "generating" };
        }
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
    activeRowIndex,
    rows,
    contentBucketFiles: entry.contentBucketFiles.length ? entry.contentBucketFiles : undefined,
  };
}

const PROOF_SLOT_STATUS_RANK: Record<PostCreatorProofSlotStatus, number> = {
  waiting: 0,
  generating: 1,
  ready: 2,
};

function mergeProofSnapshotMonotonic(
  prev: PostCreatorProofSnapshot,
  next: PostCreatorProofSnapshot,
): PostCreatorProofSnapshot {
  const rows = next.rows.map((row, rowIndex) => {
    const prevRow = prev.rows[rowIndex];
    if (!prevRow) return row;
    const slots = row.slots.map((slot, slotIndex) => {
      const prevSlot = prevRow.slots[slotIndex];
      if (!prevSlot || prevSlot.key !== slot.key) return slot;
      if (PROOF_SLOT_STATUS_RANK[prevSlot.status] <= PROOF_SLOT_STATUS_RANK[slot.status]) {
        return slot;
      }
      return {
        ...slot,
        status: prevSlot.status,
        href: prevSlot.href ?? slot.href,
        fileName: prevSlot.fileName ?? slot.fileName,
        externalUrl: prevSlot.externalUrl ?? slot.externalUrl,
      };
    });
    return { ...row, slots };
  });

  return {
    ...next,
    rows,
    contentBucketFiles: next.contentBucketFiles?.length
      ? next.contentBucketFiles
      : prev.contentBucketFiles,
  };
}

export function syncPostCreatorProofFromServerRun(
  run: AgentRun,
  artifacts: readonly AgentRunArtifactRecord[],
): PostCreatorProofSnapshot | null {
  if (!agentRunIsServerExecution(run)) return null;
  if (resolveAgentRunRecipeKey(run) !== "post_creator") return null;

  const postCount = resolvePostCreatorPostCountFromRun(run);
  if (postCount < 1) return null;

  const featuredImageEnabled = run.plan?.clientRunContract?.featuredImage !== false;
  let entry = proofByRunId.get(run.id);
  if (!entry) {
    initPostCreatorProof(run.id, postCount, featuredImageEnabled);
    entry = proofByRunId.get(run.id)!;
  }

  entry.postCount = postCount;
  entry.featuredImageEnabled = featuredImageEnabled;
  if (run.result?.uploadedPosts?.length) {
    entry.uploadedPosts = run.result.uploadedPosts;
  }

  const serverBucketFiles = mergeContentBucketFiles(
    contentBucketFilesFromServerArtifacts(artifacts),
    contentBucketFilesFromRunSteps(run),
  );
  if (serverBucketFiles.length > 0) {
    entry.contentBucketFiles = serverBucketFiles;
  }

  const prevSnapshot = entry.snapshot;
  entry.snapshot = buildServerProofSnapshot(run, entry, artifacts);
  if (prevSnapshot?.rows.length) {
    entry.snapshot = mergeProofSnapshotMonotonic(prevSnapshot, entry.snapshot);
  }
  proofByRunId.set(run.id, entry);
  notifyProof(run.id);
  return entry.snapshot;
}

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
