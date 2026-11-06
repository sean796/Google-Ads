import type { AgentRunArtifactRecord } from "@/lib/agent-runs-api";
import { agentRunIsServerExecution } from "@/lib/agent-runs/agent-run-display";
import { resolveAgentRunRecipeKey } from "@/lib/agent-runs/agent-run-navigation";
import type { AgentRun } from "@/lib/agent-runs-types";
import {
  POST_CREATOR_PROOF_SLOTS,
  postCreatorProofRowLabel,
  type PostCreatorContentBucketProofFile,
  type PostCreatorProofRow,
  type PostCreatorProofSlot,
  type PostCreatorProofSnapshot,
  type PostCreatorProofSlotKey,
  type PostCreatorProofSlotStatus,
} from "./agent-run-post-creator-proof-types";
import {
  notifyProof,
  proofByRunId,
  type ProofStoreEntry,
} from "./agent-run-post-creator-proof-store";
import {
  initPostCreatorProof,
  resolvePostCreatorPostCountFromRun,
} from "./agent-run-post-creator-proof-files";

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
