import { describe, expect, it, afterEach } from "vitest";
import {
  clearPostCreatorProof,
  getPostCreatorProof,
  getPostCreatorProofForRun,
  initPostCreatorProof,
  syncPostCreatorContentBucketProof,
  syncPostCreatorProof,
  syncPostCreatorProofFromServerRun,
} from "@/lib/agent-runs/agent-run-post-creator-proof";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type {
  AgentRun,
  AgentRunCheckpoint,
  AgentRunStep,
  AgentRunUploadedPost,
} from "@/lib/agent-runs-types";

function serverRun(input: {
  id: number;
  featuredImage?: boolean;
  server: NonNullable<AgentRunCheckpoint["server"]>;
  uploadedPosts?: AgentRunUploadedPost[];
  steps?: AgentRunStep[];
}): AgentRun {
  return {
    id: input.id,
    teamId: 1,
    createdBy: 1,
    title: "Post creator",
    recipeKey: "post_creator",
    recipeTitle: "Post creator",
    status: "running",
    source: "task_manager",
    taskId: 1,
    taskTitle: "Post creator",
    context: {},
    plan: {
      executionMode: "server",
      clientRunContract: { siteId: "site-1", postCount: 1, featuredImage: input.featuredImage ?? false },
    },
    result: {
      executionMode: "server",
      checkpoint: { completedUrls: [], uploadedUrls: [], server: input.server },
      ...(input.uploadedPosts ? { uploadedPosts: input.uploadedPosts } : {}),
    },
    errorMessage: "",
    clientBatchKey: "",
    startedAt: null,
    finishedAt: null,
    createdAt: "",
    updatedAt: "",
    steps: input.steps ?? [],
  };
}

function serverStep(input: Pick<AgentRunStep, "stepKey" | "label" | "status"> & Partial<AgentRunStep>): AgentRunStep {
  return { id: 1, stepIndex: 0, createdAt: "", ...input };
}

function stubFile(partial: Partial<BulkGeneratedFile> & Pick<BulkGeneratedFile, "id" | "fileName">): BulkGeneratedFile {
  return {
    rowIndex: 0,
    content: '{"ok":true}',
    mimeType: "application/json",
    status: "completed",
    timestamp: Date.now(),
    rowData: { keyword: "test", title: "Test" },
    ...partial,
  };
}

describe("agent-run-post-creator-proof", () => {
  afterEach(() => {
    clearPostCreatorProof(42);
    clearPostCreatorProof(55);
  });

  it("maps blog-checklist filename to checklist slot ready for row 0", () => {
    initPostCreatorProof(42, 1);
    syncPostCreatorProof(42, {
      postCount: 1,
      files: [stubFile({ id: "a", fileName: "blog-checklist-foo.json", rowIndex: 0 })],
    });
    const snapshot = getPostCreatorProof(42);
    const checklist = snapshot?.rows[0]?.slots.find((s) => s.key === "checklist");
    expect(checklist?.status).toBe("ready");
    expect(checklist?.fileName).toBe("blog-checklist-foo.json");
  });

  it("emits waiting slots for all rows when postCount is 3 and files empty", () => {
    initPostCreatorProof(42, 3);
    const snapshot = getPostCreatorProof(42);
    expect(snapshot?.rows).toHaveLength(3);
    for (const row of snapshot?.rows ?? []) {
      expect(row.slots.every((s) => s.status === "waiting")).toBe(true);
    }
  });

  it("fills live slot from wordpress artifact link", () => {
    initPostCreatorProof(42, 1);
    syncPostCreatorProof(42, {
      postCount: 1,
      files: [
        stubFile({
          id: "wp",
          fileName: "wordpress-post-test.json",
          rowIndex: 0,
          content: JSON.stringify({ link: "https://example.com/post" }),
        }),
      ],
    });
    const live = getPostCreatorProof(42)?.rows[0]?.slots.find((s) => s.key === "live");
    expect(live?.status).toBe("ready");
    expect(live?.externalUrl).toBe("https://example.com/post");
  });

  it("marks blueprint slot generating from harness payload", () => {
    initPostCreatorProof(42, 1);
    syncPostCreatorProof(42, {
      postCount: 1,
      files: [],
      harnessPayload: {
        rowIndex: 0,
        sectionIndex: 0,
        totalSections: 3,
        title: "Blueprint overview",
        phase: "start",
      },
      activeRowIndex: 0,
    });
    const blueprint = getPostCreatorProof(42)?.rows[0]?.slots.find((s) => s.key === "blueprint");
    expect(blueprint?.status).toBe("generating");
  });

  it("resolves postCount from run title when contract missing", () => {
    const snapshot = getPostCreatorProofForRun({
      id: 55,
      teamId: 1,
      createdBy: 1,
      title: "Create 3 scheduled blog posts — Advance Blinds",
      recipeKey: "post_creator",
      recipeTitle: "Post creator",
      status: "running",
      source: "task_manager",
      taskId: 1,
      taskTitle: "Post creator",
      context: {},
      plan: {},
      result: null,
      errorMessage: "",
      clientBatchKey: "",
      startedAt: null,
      finishedAt: null,
      createdAt: "",
      updatedAt: "",
    });
    expect(snapshot?.rows).toHaveLength(3);
    expect(snapshot?.rows[0]?.label).toBe("Post 1");
  });

  it("maps SEO-named PNG to featured image slot", () => {
    initPostCreatorProof(42, 1);
    syncPostCreatorProof(42, {
      postCount: 1,
      files: [
        stubFile({
          id: "img",
          fileName: "motorized-blinds-maintenance-guide.png",
          rowIndex: 0,
          mimeType: "image/png",
          content: "data:image/png;base64,abc",
        }),
      ],
    });
    const image = getPostCreatorProof(42)?.rows[0]?.slots.find((s) => s.key === "image");
    expect(image?.status).toBe("ready");
    expect(image?.fileName).toBe("motorized-blinds-maintenance-guide.png");
    expect(image?.href).toBe("data:image/png;base64,abc");
  });

  it("surfaces content bucket downloads in proof snapshot", () => {
    initPostCreatorProof(42, 1);
    syncPostCreatorContentBucketProof(42, [
      {
        bucket: "posts",
        name: "content-bucket-posts-advanceblinds.json",
        content: '["https://example.com/a"]',
        mimeType: "application/json",
      },
    ]);
    const snapshot = getPostCreatorProof(42);
    expect(snapshot?.contentBucketFiles).toHaveLength(1);
    expect(snapshot?.contentBucketFiles?.[0]?.bucket).toBe("posts");
    expect(snapshot?.contentBucketFiles?.[0]?.href).toMatch(/^blob:/);
  });

  it("maps server artifacts to proof download slots", () => {
    clearPostCreatorProof(99);
    const run = serverRun({
      id: 99,
      server: {
        rowIndex: 0,
        checklistRows: [{ keyword: "motorized blinds", title: "Motorized Blinds Guide" }],
      },
      uploadedPosts: [{ url: "https://example.com/post", postId: 5266 }],
    });

    syncPostCreatorProofFromServerRun(run, [
      {
        id: "abc",
        name: "keyword-research.json",
        url: "https://neodigital.ca/wp-content/uploads/neo-pulse/agent-runs/99/post0keyword-abc-keyword-research.json",
        stepKey: "post0keyword",
      },
      {
        id: "def",
        name: "content.md",
        url: "https://neodigital.ca/wp-content/uploads/neo-pulse/agent-runs/99/post0content-def-content.md",
        stepKey: "post0content",
      },
    ]);

    const snapshot = getPostCreatorProof(99);
    const row = snapshot?.rows[0];
    expect(row?.slots.find((s) => s.key === "keyword")?.status).toBe("ready");
    expect(row?.slots.find((s) => s.key === "keyword")?.href).toContain("keyword-research.json");
    expect(row?.slots.find((s) => s.key === "content")?.status).toBe("ready");
    expect(row?.slots.find((s) => s.key === "live")?.externalUrl).toBe("https://example.com/post");
  });

  it("keeps keyword waiting until content bucket is ready even when keyword step is running", () => {
    clearPostCreatorProof(101);
    const run = serverRun({
      id: 101,
      server: {
        rowIndex: 0,
        intraPhase: "keyword",
        checklistRows: [{ keyword: "smart blinds", title: "Smart Blinds" }],
      },
      steps: [serverStep({ stepKey: "post0keyword", label: "Keyword research…", status: "running" })],
    });

    syncPostCreatorProofFromServerRun(run, []);

    const snapshot = getPostCreatorProof(101);
    expect(snapshot?.contentBucketFiles).toBeUndefined();
    expect(snapshot?.rows[0]?.slots.find((s) => s.key === "keyword")?.status).toBe("waiting");
  });

  it("shows content bucket from run step payload before artifacts poll", () => {
    clearPostCreatorProof(102);
    const run = serverRun({
      id: 102,
      server: { rowIndex: 0, intraPhase: "keyword", checklistRows: [{ keyword: "x" }] },
      steps: [
        serverStep({
          stepKey: "content-bucket",
          label: "53 post URLs loaded",
          status: "done",
          payload: {
            artifacts: [
              {
                id: "abc",
                name: "content-bucket-posts-advanceblinds.com.json",
                url: "https://neodigital.ca/wp-content/uploads/neo-pulse/agent-runs/102/contentbucket-abc-content-bucket-posts.json",
              },
            ],
          },
        }),
        serverStep({
          stepKey: "post0keyword",
          label: "Keyword research…",
          status: "running",
        }),
      ],
    });

    syncPostCreatorProofFromServerRun(run, []);

    const snapshot = getPostCreatorProof(102);
    expect(snapshot?.contentBucketFiles).toHaveLength(1);
    expect(snapshot?.contentBucketFiles?.[0]?.href).toContain("contentbucket");
    expect(snapshot?.rows[0]?.slots.find((s) => s.key === "keyword")?.status).toBe("generating");
  });

  it("surfaces server content-bucket artifact as green download in proof", () => {
    clearPostCreatorProof(100);
    const run = serverRun({
      id: 100,
      server: { rowIndex: 0, checklistRows: [{ keyword: "smart blinds" }] },
    });

    syncPostCreatorProofFromServerRun(run, [
      {
        id: "bucket",
        name: "content-bucket-posts-advanceblindsanddrapery.com.json",
        url: "https://neodigital.ca/wp-content/uploads/neo-pulse/agent-runs/100/contentbucket-bucket-content-bucket-posts.json",
        stepKey: "content-bucket",
      },
    ]);

    const snapshot = getPostCreatorProof(100);
    expect(snapshot?.contentBucketFiles).toHaveLength(1);
    expect(snapshot?.contentBucketFiles?.[0]?.bucket).toBe("posts");
    expect(snapshot?.contentBucketFiles?.[0]?.name).toContain("content-bucket-posts");
  });

  it("shows content generating while overview harness is running", () => {
    clearPostCreatorProof(62);
    const run = serverRun({
      id: 62,
      server: {
        rowIndex: 0,
        intraPhase: "content",
        checklistRows: [{ keyword: "motorized blinds", title: "Motorized Blinds Guide" }],
      },
      steps: [
        serverStep({
          stepKey: "post0harnessoverview",
          label: "Writing Overview section…",
          status: "running",
        }),
      ],
    });

    syncPostCreatorProofFromServerRun(run, [
      {
        id: "bp",
        name: "blueprint-motorized-blinds.json",
        url: "https://neodigital.ca/wp-content/uploads/neo-pulse/agent-runs/62/post0blueprint-bp-blueprint.json",
        stepKey: "post0blueprint",
      },
    ]);

    const snapshot = getPostCreatorProof(62);
    expect(snapshot?.rows[0]?.slots.find((s) => s.key === "content")?.status).toBe("generating");
  });

  it("keeps content ready and shows image generating during awaiting_client_upload", () => {
    clearPostCreatorProof(103);
    const run = serverRun({
      id: 103,
      featuredImage: true,
      server: {
        rowIndex: 0,
        intraPhase: "awaiting_client_upload",
        checklistRows: [{ keyword: "smart blinds", title: "Smart Blinds" }],
      },
    });

    syncPostCreatorProofFromServerRun(run, [
      {
        id: "content",
        name: "content.md",
        url: "https://neodigital.ca/wp-content/uploads/neo-pulse/agent-runs/103/post0content-content.md",
        stepKey: "post0content",
      },
    ]);

    const snapshot = getPostCreatorProof(103);
    expect(snapshot?.rows[0]?.slots.find((s) => s.key === "content")?.status).toBe("ready");
    expect(snapshot?.rows[0]?.slots.find((s) => s.key === "image")?.status).toBe("generating");
  });
});
