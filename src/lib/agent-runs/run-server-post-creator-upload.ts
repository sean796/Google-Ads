import type { WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import type { AgentConfig } from "@/types/agent-config";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import {
  ensureBulkGenerationWpInventory,
  loadBlogPlayLinkablesForSite,
} from "@/lib/bulk/bulk-generation-wp-inventory";
import {
  completeServerPostCreatorRowUpload,
  fetchAgentRun,
  fetchAgentRunArtifacts,
  fetchAgentRunDeliverableFiles,
  patchAgentRun,
  processAgentRun,
  uploadAgentRunArtifact,
  type AgentRunArtifactRecord,
} from "@/lib/agent-runs-api";
import { agentRunIsServerExecution } from "@/lib/agent-runs/agent-run-display";
import { resolveAgentRunRecipeKey } from "@/lib/agent-runs/agent-run-navigation";
import type { AgentRun, AgentRunStep } from "@/lib/agent-runs-types";
import { uploadPostCreatorRowToWordPress } from "@/lib/post-creator/post-creator-wordpress-upload";
import { postCreatorRowStepKey } from "@/lib/agent-runs/agent-run-step-keys";
import {
  resolveInternalLinkPlaceholdersInMarkdown,
} from "@/lib/content-generation/internal-link-placeholders";
import { generateServerPostCreatorFeaturedImage } from "@/lib/agent-runs/server-post-creator-featured-image";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";

const uploadsInFlight = new Set<string>();

function flightKey(runId: number, rowIndex: number): string {
  return `${runId}:${rowIndex}`;
}

function parseRowIndexFromStepKey(stepKey?: string): number | null {
  const trimmed = stepKey?.trim() ?? "";
  const dotted = /^post\.(\d+)\./.exec(trimmed);
  if (dotted) {
    const n = Number(dotted[1]);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  const compact = /^post(\d+)/.exec(trimmed);
  if (compact) {
    const n = Number(compact[1]);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

function stepIsRowUploadDone(step: AgentRunStep, rowIndex: number): boolean {
  if (step.status !== "done") return false;
  const key = step.stepKey?.trim() ?? "";
  if (parseRowIndexFromStepKey(key) !== rowIndex) return false;
  return key.includes("upload");
}

export function serverPostCreatorRowIndexFromStepKey(stepKey?: string): number | null {
  return parseRowIndexFromStepKey(stepKey);
}

function artifactsForRow(
  artifacts: readonly AgentRunArtifactRecord[],
  rowIndex: number,
): AgentRunArtifactRecord[] {
  return artifacts.filter((a) => parseRowIndexFromStepKey(a.stepKey) === rowIndex);
}

function findLatestArtifact(
  rowArtifacts: readonly AgentRunArtifactRecord[],
  pattern: RegExp,
): AgentRunArtifactRecord | undefined {
  const matches = rowArtifacts.filter((a) => pattern.test(a.name ?? ""));
  if (matches.length === 0) return undefined;
  return [...matches].sort((a, b) => (b.name ?? "").localeCompare(a.name ?? ""))[0];
}

function deliverableContentByName(
  deliverables: ReadonlyArray<{ fileName: string; content: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of deliverables) {
    const name = file.fileName.trim();
    const content = file.content;
    if (name && content) {
      map.set(name, content);
    }
  }
  return map;
}

function readArtifactText(
  deliverablesByName: Map<string, string>,
  artifact: AgentRunArtifactRecord,
): string {
  const name = artifact.name?.trim() ?? "";
  if (!name) return "";
  const content = deliverablesByName.get(name);
  if (content !== undefined) return content;
  throw new Error(`Artifact content missing for ${name}`);
}

function serverCheckpoint(run: AgentRun): Record<string, unknown> {
  const checkpoint = run.result?.checkpoint;
  if (!checkpoint || typeof checkpoint !== "object") return {};
  const server = (checkpoint as { server?: unknown }).server;
  return server && typeof server === "object" ? (server as Record<string, unknown>) : {};
}

function rowCount(run: AgentRun): number {
  const server = serverCheckpoint(run);
  const rows = server.checklistRows;
  if (Array.isArray(rows) && rows.length > 0) return rows.length;
  const contract = run.plan?.clientRunContract;
  if (contract && typeof contract.postCount === "number") return contract.postCount;
  return 1;
}

function rowData(run: AgentRun, rowIndex: number): CSVRow {
  const server = serverCheckpoint(run);
  const rows = server.checklistRows;
  if (Array.isArray(rows) && rows[rowIndex] && typeof rows[rowIndex] === "object") {
    const r = rows[rowIndex] as Record<string, unknown>;
    return {
      keyword: String(r.keyword ?? ""),
      title: String(r.title ?? r.keyword ?? ""),
      entity: String(r.entity ?? ""),
      origin: String(r.origin ?? ""),
    };
  }
  return { keyword: "", title: "" };
}

function serverRunAwaitingClientUpload(run: AgentRun): boolean {
  const server = serverCheckpoint(run);
  const phase = server.intraPhase;
  return phase === "awaiting_client_upload";
}

export function postCreatorRowUploadAlreadyComplete(run: AgentRun, rowIndex: number): boolean {
  const uploads = run.result?.uploadedPosts ?? [];
  for (const entry of uploads) {
    if (typeof entry.rowIndex === "number" && entry.rowIndex === rowIndex) {
      return true;
    }
  }
  if (uploads[rowIndex]?.url) {
    return true;
  }
  return (run.steps ?? []).some((step) => stepIsRowUploadDone(step, rowIndex));
}

export function resolvePostCreatorRunSiteId(run: AgentRun): string {
  const payload = run.plan?.executionPayload as
    | { wordpressSiteId?: string; siteId?: string }
    | undefined;
  return String(
    run.plan?.clientRunContract?.siteId ??
      run.context?.siteId ??
      payload?.wordpressSiteId ??
      payload?.siteId ??
      "",
  ).trim();
}

function resolvePostCreatorRunSite(
  run: AgentRun,
  sites: WordPressSite[],
): WordPressSite | null {
  const siteId = resolvePostCreatorRunSiteId(run);
  if (!siteId) return null;
  return sites.find((s) => s.id === siteId) ?? getStoredSites().find((s) => s.id === siteId) ?? null;
}

export async function advanceServerAgentRun(
  teamId: number,
  run: AgentRun,
  sites: WordPressSite[],
): Promise<AgentRun> {
  if (!agentRunIsServerExecution(run)) {
    throw new Error("Run is not server-executed.");
  }
  if (run.status !== "running" && run.status !== "queued") {
    return run;
  }

  if (serverRunAwaitingClientUpload(run)) {
    const uploaded = await maybeUploadServerPostCreatorRows(teamId, run, sites);
    if (uploaded) return uploaded;
    const refreshed = await fetchAgentRun(teamId, run.id);
    if (!refreshed) {
      throw new Error("Agent run missing after client upload tick.");
    }
    return refreshed;
  }

  const processed = await processAgentRun(teamId, run.id);
  if (!processed.ok || !processed.run) {
    throw new Error(processed.error ?? "Server agent run process failed.");
  }
  return processed.run;
}

export async function tickServerPostCreatorRun(
  teamId: number,
  run: AgentRun,
  sites: WordPressSite[],
): Promise<AgentRun | null> {
  if (!agentRunIsServerExecution(run)) return null;
  if (resolveAgentRunRecipeKey(run) !== "post_creator") return null;
  if (run.status !== "running" && run.status !== "queued") return null;

  try {
    return await advanceServerAgentRun(teamId, run, sites);
  } catch {
    return null;
  }
}

export async function maybeUploadServerPostCreatorRows(
  teamId: number,
  run: AgentRun,
  sites: WordPressSite[],
): Promise<AgentRun | null> {
  if (!agentRunIsServerExecution(run)) return null;
  if (resolveAgentRunRecipeKey(run) !== "post_creator") return null;
  if (run.status !== "running" && run.status !== "queued") return null;
  if (!serverRunAwaitingClientUpload(run)) return null;

  const server = serverCheckpoint(run);
  const rowIndex = typeof server.rowIndex === "number" ? server.rowIndex : 0;
  const key = flightKey(run.id, rowIndex);
  if (uploadsInFlight.has(key)) return null;
  if (postCreatorRowUploadAlreadyComplete(run, rowIndex)) return null;

  uploadsInFlight.add(key);

  try {
    const site = resolvePostCreatorRunSite(run, sites);
    if (!site) return null;

    const artifacts = await fetchAgentRunArtifacts(teamId, run.id);
    const rowArtifacts = artifactsForRow(artifacts, rowIndex);

    if (rowArtifacts.some((a) => /^wordpress-post-/i.test(a.name ?? ""))) {
      return null;
    }
    if (rowArtifacts.some((a) => /^upload-claim-row-/i.test(a.name ?? ""))) {
      return null;
    }

    const contentArtifact = findLatestArtifact(rowArtifacts, /^content-.*\.md$/i);
    const blueprintArtifact = findLatestArtifact(rowArtifacts, /^blueprint-/i);
    if (!contentArtifact || !blueprintArtifact) return null;

    await uploadAgentRunArtifact(teamId, run.id, {
      stepKey: postCreatorRowStepKey(rowIndex, "upload"),
      name: `upload-claim-row-${rowIndex}.json`,
      mime: "application/json",
      content: JSON.stringify({ rowIndex, claimedAt: new Date().toISOString() }),
    });

    const deliverablesByName = deliverableContentByName(
      await fetchAgentRunDeliverableFiles(teamId, run.id),
    );

    const inventory = await ensureBulkGenerationWpInventory(site);
    const wordPressPosts = await loadBlogPlayLinkablesForSite(site, inventory.rows ?? []);

    const markdownContent = readArtifactText(deliverablesByName, contentArtifact);
    const blueprintRaw = readArtifactText(deliverablesByName, blueprintArtifact);
    const blueprint = JSON.parse(blueprintRaw) as { agents?: AgentConfig[]; purpose?: string };
    const blueprintAgents = Array.isArray(blueprint.agents) ? blueprint.agents : [];

    const resolvedMarkdown = await resolveInternalLinkPlaceholdersInMarkdown(markdownContent, {
      siteId: site.id,
      siteUrl: site.siteUrl,
      wordPressPosts,
      apiKey: await resolveOpenRouterApiKeyForHarness(),
    });
    if (resolvedMarkdown !== markdownContent) {
      await uploadAgentRunArtifact(teamId, run.id, {
        stepKey: postCreatorRowStepKey(rowIndex, "content"),
        name: contentArtifact.name ?? `content-post-${Date.now()}.md`,
        mime: "text/markdown",
        content: resolvedMarkdown,
      });
    }

    const markdownForUpload = resolvedMarkdown;

    const keywordArtifact = findLatestArtifact(rowArtifacts, /^keyword-research-/i);
    let keywordResearch: Record<string, unknown> | null = null;
    if (keywordArtifact) {
      try {
        keywordResearch = JSON.parse(readArtifactText(deliverablesByName, keywordArtifact)) as Record<
          string,
          unknown
        >;
      } catch {
        keywordResearch = null;
      }
    }

    const row = rowData(run, rowIndex);
    const featuredImageEnabled = run.plan?.clientRunContract?.featuredImage !== false;
    let featuredImageId: number | undefined;
    const existingImageArtifact = findLatestArtifact(rowArtifacts, /\.(png|jpe?g|webp)$/i);

    if (featuredImageEnabled && !existingImageArtifact) {
      const title = row.title?.trim() || row.keyword?.trim() || "post";
      const blueprintPurpose =
        typeof blueprint.purpose === "string" ? blueprint.purpose : undefined;
      const featured = await generateServerPostCreatorFeaturedImage({
        site,
        title,
        keyword: row.keyword?.trim() || title,
        markdownContent: markdownForUpload,
        blueprintPurpose,
      });
      featuredImageId = featured.featuredImageId;

      await uploadAgentRunArtifact(teamId, run.id, {
        stepKey: postCreatorRowStepKey(rowIndex, "image"),
        name: featured.imageFileName,
        mime: "image/png",
        content: featured.imageBase64,
      });

      const slugPart =
        contentArtifact.name?.match(/^content-([^-]+(?:-[^-]+)*)-/)?.[1] ?? "post";
      const tsPart = contentArtifact.name?.match(/-(\d{14})\.md$/)?.[1] ?? String(Date.now());

      await uploadAgentRunArtifact(teamId, run.id, {
        stepKey: postCreatorRowStepKey(rowIndex, "image"),
        name: `featured-image-checklist-${slugPart}-${tsPart}.json`,
        mime: "application/json",
        content: featured.checklistJson,
      });
    } else if (featuredImageEnabled && existingImageArtifact) {
      const checklistArtifact = findLatestArtifact(rowArtifacts, /^featured-image-checklist-/i);
      if (checklistArtifact) {
        try {
          const doc = JSON.parse(readArtifactText(deliverablesByName, checklistArtifact)) as {
            mediaId?: number;
          };
          if (typeof doc.mediaId === "number" && doc.mediaId > 0) {
            featuredImageId = doc.mediaId;
          }
        } catch {
          // no image reuse without mediaId
        }
      }
    }

    const destination = run.plan?.clientRunContract?.postDestination;
    const upload = await uploadPostCreatorRowToWordPress({
      site,
      row,
      markdownContent: markdownForUpload,
      blueprintAgents,
      wordPressPosts,
      keywordResearch,
      featuredImageId,
      postDestination: destination === "draft" ? "draft" : "wordpress",
    });

    const slugMatch = contentArtifact.name?.match(/^content-([^-]+(?:-[^-]+)*)-/);
    const slugPart = slugMatch?.[1] ?? "post";
    const tsMatch = contentArtifact.name?.match(/-(\d{14})\.md$/);
    const tsPart = tsMatch?.[1] ?? String(Date.now());

    await uploadAgentRunArtifact(teamId, run.id, {
      stepKey: postCreatorRowStepKey(rowIndex, "upload"),
      name: `seo-research-${slugPart}-${tsPart}.json`,
      mime: "application/json",
      content: upload.seoResearchJson,
    });

    await uploadAgentRunArtifact(teamId, run.id, {
      stepKey: postCreatorRowStepKey(rowIndex, "upload"),
      name: `wordpress-post-${slugPart}-${tsPart}.json`,
      mime: "application/json",
      content: upload.wordpressArtifactJson,
    });

    const result = await completeServerPostCreatorRowUpload(teamId, run.id, rowIndex, {
      url: upload.postUrl,
      postId: upload.postId,
      title: upload.title,
    });

    return result.run ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Client upload failed";
    const failed = await patchAgentRun(teamId, run.id, {
      status: "failed",
      errorMessage: message,
      step: { label: message, status: "error", stepKey: "error" },
    });
    return failed.run ?? null;
  } finally {
    uploadsInFlight.delete(key);
  }
}

export async function warmInventoryForServerPostCreatorRun(
  run: AgentRun,
  sites: WordPressSite[],
): Promise<void> {
  if (!agentRunIsServerExecution(run)) return;
  if (resolveAgentRunRecipeKey(run) !== "post_creator") return;
  const site = resolvePostCreatorRunSite(run, sites);
  if (!site) return;
  await ensureBulkGenerationWpInventory(site);
}

export function pendingServerUploadRowIndex(run: AgentRun): number | null {
  if (!serverRunAwaitingClientUpload(run)) return null;
  const server = serverCheckpoint(run);
  return typeof server.rowIndex === "number" ? server.rowIndex : 0;
}

export function serverPostCreatorAwaitingUpload(run: AgentRun): boolean {
  return serverRunAwaitingClientUpload(run);
}

export function serverPostCreatorRowCount(run: AgentRun): number {
  return rowCount(run);
}
