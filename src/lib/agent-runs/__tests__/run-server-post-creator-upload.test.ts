import { describe, expect, it } from "vitest";
import {
  pendingServerUploadRowIndex,
  postCreatorRowUploadAlreadyComplete,
  resolvePostCreatorRunSiteId,
  serverPostCreatorRowCount,
} from "@/lib/agent-runs/run-server-post-creator-upload";
import type { AgentRun, AgentRunServerCheckpoint } from "@/lib/agent-runs-types";

function stubRun(checkpoint: AgentRunServerCheckpoint, extras?: Partial<AgentRun>): AgentRun {
  return {
    id: 1,
    teamId: 1,
    recipeKey: "post_creator",
    status: "running",
    context: { siteId: "site-1" },
    plan: { executionMode: "server", clientRunContract: { postCount: 2, siteId: "site-1" } },
    result: {
      executionMode: "server",
      checkpoint: { completedUrls: [], uploadedUrls: [], server: checkpoint },
    },
    ...extras,
  } as AgentRun;
}

describe("run-server-post-creator-upload", () => {
  it("returns row index when awaiting client upload", () => {
    const run = stubRun({ intraPhase: "awaiting_client_upload", rowIndex: 1 });
    expect(pendingServerUploadRowIndex(run)).toBe(1);
  });

  it("returns null when not awaiting upload", () => {
    const run = stubRun({ intraPhase: "content", rowIndex: 0 });
    expect(pendingServerUploadRowIndex(run)).toBeNull();
  });

  it("reads post count from checklist rows", () => {
    const run = stubRun({
      checklistRows: [{ keyword: "a" }, { keyword: "b" }, { keyword: "c" }],
    });
    expect(serverPostCreatorRowCount(run)).toBe(3);
  });

  it("resolves site id from context when contract is missing", () => {
    const run = stubRun(
      { intraPhase: "awaiting_client_upload", rowIndex: 0 },
      {
        context: { siteId: "wp-1779463285049" },
        plan: { executionMode: "server" },
      },
    );
    expect(resolvePostCreatorRunSiteId(run)).toBe("wp-1779463285049");
  });

  it("parses compact server step keys for row index", async () => {
    const { serverPostCreatorRowIndexFromStepKey } = await import(
      "@/lib/agent-runs/run-server-post-creator-upload"
    );
    expect(serverPostCreatorRowIndexFromStepKey("post0content")).toBe(0);
    expect(serverPostCreatorRowIndexFromStepKey("post1keyword")).toBe(1);
    expect(serverPostCreatorRowIndexFromStepKey("post.0.content")).toBe(0);
  });

  it("detects row upload already complete from sanitized step key", () => {
    const run = stubRun(
      { intraPhase: "awaiting_client_upload", rowIndex: 0 },
      {
        steps: [{ id: 1, stepIndex: 0, createdAt: "", stepKey: "post0upload", label: "Published", status: "done" }],
      },
    );
    expect(postCreatorRowUploadAlreadyComplete(run, 0)).toBe(true);
  });

  it("detects row upload already complete from uploadedPosts rowIndex", () => {
    const run = stubRun(
      { intraPhase: "awaiting_client_upload", rowIndex: 1 },
      {
        result: {
          executionMode: "server",
          checkpoint: {
            completedUrls: [],
            uploadedUrls: [],
            server: { intraPhase: "awaiting_client_upload", rowIndex: 1 },
          },
          uploadedPosts: [{ url: "https://example.com/a", rowIndex: 0 }],
        },
      },
    );
    expect(postCreatorRowUploadAlreadyComplete(run, 0)).toBe(true);
    expect(postCreatorRowUploadAlreadyComplete(run, 1)).toBe(false);
  });
});
