import { describe, expect, it, vi } from "vitest";
import { resolveDfsArticleAuditWorkflowPayload } from "@/lib/workflow/resolve-dfs-article-audit-workflow-payload";

vi.mock("@/lib/task-execution-resolve-bucket-urls", () => ({
  resolveTaskExecutionBucketUrls: vi.fn(async () => ["https://example.com/post-1/"]),
}));

vi.mock("@/lib/wordpress-api/post-fields-discovery", () => ({
  getPostFieldsForUrl: vi.fn(async () => ({ fields: { keyword_focus: "test keyword" } })),
}));

describe("resolveDfsArticleAuditWorkflowPayload", () => {
  it("includes targetBucket posts when missing from workflow payload", async () => {
    const site = { id: "site-a", name: "Site", siteUrl: "https://example.com" } as never;
    const resolved = await resolveDfsArticleAuditWorkflowPayload(site, {
      auditQuestions: ["Grade this article"],
    });
    expect(resolved.targetBucket).toBe("posts");
    expect(resolved.targetUrl).toBe("https://example.com/post-1/");
    expect(resolved.focusKeyword).toBe("test keyword");
  });
});
