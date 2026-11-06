import { describe, expect, it, vi } from "vitest";
import {
  buildDfsArticleAuditTask,
  buildDfsArticleAuditUserPrompt,
  clipSeoResearchBriefForAudit,
  countOkDfsArticleAuditPlatforms,
  DATAFORSEO_LLM_PROMPT_MAX,
} from "@/lib/dfs-article-audit/dfs-article-audit-dataforseo";
import {
  dfsArticleAuditArtifactName,
  dfsArticleAuditCompletionSummary,
  dfsArticleAuditMergedSchema,
  dfsArticleAuditTextPreview,
  dfsArticleAuditUrlSlug,
  normalizeDfsArticleAuditMerged,
  auditPlatformsForRun,
  auditPlatformsForSave,
  formatDfsArticleAuditPlatformLabels,
  resolveDfsArticleAuditPlatformsForRun,
} from "@/lib/dfs-article-audit/dfs-article-audit-types";
import { fetchDfsArticleAudit } from "@/lib/dfs-article-audit/fetch-dfs-article-audit";
import { formatDfsArticleAuditHarnessPromptBlock } from "@/lib/dfs-article-audit/format-dfs-article-audit-harness";
import { findWorkflowDfsArticleAuditFileRef } from "@/lib/workflow/workflow-dfs-article-audit-cache";

vi.mock("@/lib/llm-audit/dataforseo-llm-responses-live", () => ({
  dataforseoLlmResponsesLive: vi.fn(),
}));

describe("buildDfsArticleAuditUserPrompt", () => {
  it("includes article URL and focus keyword in a short prompt", () => {
    const prompt = buildDfsArticleAuditUserPrompt({
      platform: "chat_gpt",
      platformLabel: "ChatGPT",
      articleUrl: "https://example.com/how-to-measure-shades/",
      focusKeyword: "how to measure for shades",
      siteName: "Example Site",
    });
    expect(prompt.length).toBeLessThanOrEqual(DATAFORSEO_LLM_PROMPT_MAX);
    expect(prompt).toContain("https://example.com/how-to-measure-shades/");
    expect(prompt).toContain("how to measure for shades");
    expect(prompt).toContain("Example Site");
    expect(prompt).not.toContain("Scorecard categories");
  });
});

describe("buildDfsArticleAuditTask", () => {
  it("clips user_prompt and system_message to 500 characters", () => {
    const task = buildDfsArticleAuditTask("chat_gpt", {
      articleUrl: "https://example.com/how-to-measure-shades/",
      focusKeyword: "how to measure for shades",
      siteName: "Example Site",
      location: "Edmonton, AB, Canada",
    });
    expect(String(task.user_prompt).length).toBeLessThanOrEqual(DATAFORSEO_LLM_PROMPT_MAX);
    expect(String(task.system_message).length).toBeLessThanOrEqual(DATAFORSEO_LLM_PROMPT_MAX);
  });

  it("clips long audit questions into user_prompt without message_chain", () => {
    const longQuestion =
      "Can you find similar articles online and do a SWOT analysis comparing this article to the top competitors in detail with specific examples from each page?";
    const task = buildDfsArticleAuditTask("chat_gpt", {
      articleUrl: "https://example.com/post/",
      focusKeyword: "window shades",
      auditQuestions: [
        longQuestion,
        "What would make this an A+ article?",
      ],
    });
    expect(task.message_chain).toBeUndefined();
    expect(String(task.user_prompt).length).toBeLessThanOrEqual(DATAFORSEO_LLM_PROMPT_MAX);
    expect(String(task.user_prompt)).toContain("https://example.com/post/");
    expect(String(task.user_prompt)).toContain("window shades");
  });

  it("folds audit context into user_prompt for all platforms (no message_chain)", () => {
    for (const platform of ["chat_gpt", "gemini", "perplexity"] as const) {
      const task = buildDfsArticleAuditTask(platform, {
        articleUrl: "https://example.com/post/",
        focusKeyword: "window shades",
        auditQuestions: ["What would make this an A+ article?"],
        seoResearchBrief: "Prairie sun and frost at entry doors.",
      });
      expect(task.message_chain).toBeUndefined();
      expect(String(task.user_prompt)).toContain("A+");
      expect(String(task.user_prompt)).toContain("Prairie sun");
      expect(String(task.user_prompt).length).toBeLessThanOrEqual(DATAFORSEO_LLM_PROMPT_MAX);
    }
  });
});

describe("buildDfsArticleAuditUserPrompt context", () => {
  it("preserves URL and keyword when questions are long", () => {
    const prompt = buildDfsArticleAuditUserPrompt({
      platform: "chat_gpt",
      platformLabel: "ChatGPT",
      articleUrl: "https://example.com/how-to-measure-shades/",
      focusKeyword: "how to measure for shades",
      auditQuestions: ["x".repeat(600)],
    });
    expect(prompt.length).toBeLessThanOrEqual(DATAFORSEO_LLM_PROMPT_MAX);
    expect(prompt).toContain("https://example.com/how-to-measure-shades/");
    expect(prompt).toContain("how to measure for shades");
  });
});

describe("clipSeoResearchBriefForAudit", () => {
  it("clips long plain text to 500 characters", () => {
    const clipped = clipSeoResearchBriefForAudit("x".repeat(800));
    expect(clipped.length).toBeLessThanOrEqual(DATAFORSEO_LLM_PROMPT_MAX);
  });
});

describe("dfsArticleAuditUrlSlug", () => {
  it("derives slug from URL path", () => {
    expect(dfsArticleAuditUrlSlug("https://example.com/blog/my-post/")).toBe("my-post");
  });
});

describe("dfsArticleAuditArtifactName", () => {
  it("uses dfs-article-audit prefix", () => {
    expect(dfsArticleAuditArtifactName("https://example.com/my-post/")).toBe(
      "dfs-article-audit-my-post.json",
    );
  });
});

describe("dfsArticleAuditMergedSchema", () => {
  it("accepts valid merged payload", () => {
    const parsed = dfsArticleAuditMergedSchema.parse({
      overallScore: 8.3,
      letterGrade: "B+",
      scorecard: [{ category: "Search intent match", score: 9.5, maxScore: 10 }],
      strengths: ["Clear steps"],
      gaps: ["Needs visuals"],
      improvements: ["Add diagrams"],
      optimizationChecklist: ["Add annotated measuring diagram"],
    });
    const merged = normalizeDfsArticleAuditMerged(parsed);
    expect(merged.overallScore).toBe(8.3);
    expect(merged.optimizationChecklist[0]).toContain("diagram");
  });
});

describe("fetchDfsArticleAudit", () => {
  it("returns DFS platform responses with merged null (no OpenRouter)", async () => {
    const { dataforseoLlmResponsesLive } = await import("@/lib/llm-audit/dataforseo-llm-responses-live");
    vi.mocked(dataforseoLlmResponsesLive).mockResolvedValue({
      tasks: [
        {
          status_code: 20000,
          cost: 0.01,
          result: [
            {
              model_name: "o4-mini",
              web_search: true,
              input_tokens: 100,
              output_tokens: 200,
              items: [
                {
                  type: "message",
                  sections: [{ type: "text", text: "Grade B+. Strong search intent match." }],
                },
              ],
            },
          ],
        },
      ],
    });

    const audit = await fetchDfsArticleAudit({
      articleUrl: "https://example.com/how-to-measure/",
      focusKeyword: "how to measure for shades",
      auditPlatforms: ["chat_gpt"],
    });

    expect(audit.merged).toBeNull();
    expect(audit.platforms.length).toBe(1);
    expect(audit.platforms[0].status).toBe("ok");
    expect(audit.platforms[0].responseText).toContain("Grade B+");
    expect(dataforseoLlmResponsesLive).toHaveBeenCalled();
  });
});

describe("formatDfsArticleAuditHarnessPromptBlock", () => {
  it("renders merged audit directives", () => {
    const block = formatDfsArticleAuditHarnessPromptBlock({
      version: 1,
      articleUrl: "https://example.com/post/",
      focusKeyword: "keyword",
      generatedAt: new Date().toISOString(),
      platforms: [],
      merged: normalizeDfsArticleAuditMerged({
        overallScore: 8,
        letterGrade: "B",
        scorecard: [{ category: "Readability", score: 8, maxScore: 10 }],
        strengths: ["Good structure"],
        gaps: ["Weak visuals"],
        improvements: ["Add photos"],
        optimizationChecklist: ["Add real install photo"],
      }),
    });
    expect(block).toContain("DFS ARTICLE AUDIT");
    expect(block).toContain("Add real install photo");
  });

  it("uses DFS platform responseText when merged is null", () => {
    const block = formatDfsArticleAuditHarnessPromptBlock({
      version: 1,
      articleUrl: "https://example.com/post/",
      focusKeyword: "keyword",
      generatedAt: new Date().toISOString(),
      platforms: [
        {
          platform: "chat_gpt",
          label: "ChatGPT",
          model_name: "o4-mini",
          status: "ok",
          responseText: "Add annotated measuring diagram near step two.",
        },
      ],
      merged: null,
    });
    expect(block).toContain("DFS ARTICLE AUDIT");
    expect(block).toContain("annotated measuring diagram");
  });
});

describe("findWorkflowDfsArticleAuditFileRef", () => {
  it("matches artifact by URL slug", () => {
    const ref = findWorkflowDfsArticleAuditFileRef(
      [
        {
          id: 1,
          runId: 1,
          nodeId: "a1",
          variableKey: "dfs_llm_article_audit_1",
          scope: "run",
          label: "Audit",
          textPreview: "",
          fileRefs: [{ name: "dfs-article-audit-my-post.json", url: "https://x.test/a.json" }],
          createdAt: "",
        },
      ],
      "https://example.com/my-post/",
    );
    expect(ref?.name).toBe("dfs-article-audit-my-post.json");
  });
});

describe("countOkDfsArticleAuditPlatforms", () => {
  it("counts ok platforms", () => {
    const count = countOkDfsArticleAuditPlatforms([
      {
        platform: "chat_gpt",
        label: "ChatGPT",
        model_name: "o4-mini",
        status: "ok",
        responseText: "Grade B+",
      },
      {
        platform: "gemini",
        label: "Gemini",
        model_name: "gemini-2.5-flash",
        status: "error",
        error: "fail",
      },
    ]);
    expect(count).toBe(1);
  });
});

describe("dfsArticleAuditTextPreview", () => {
  it("summarizes merged audit", () => {
    const text = dfsArticleAuditTextPreview({
      version: 1,
      articleUrl: "https://example.com/post/",
      focusKeyword: "kw",
      generatedAt: new Date().toISOString(),
      platforms: [],
      merged: normalizeDfsArticleAuditMerged({
        overallScore: 8.3,
        letterGrade: "B+",
        scorecard: [{ category: "SEO optimization", score: 9, maxScore: 10 }],
        strengths: [],
        gaps: ["Limited visuals"],
        improvements: [],
        optimizationChecklist: ["Add diagram"],
      }),
    });
    expect(text).toContain("B+");
    expect(text).toContain("Limited visuals");
  });

  it("includes DFS platform excerpts when merged is null", () => {
    const text = dfsArticleAuditTextPreview({
      version: 1,
      articleUrl: "https://example.com/post/",
      focusKeyword: "kw",
      generatedAt: new Date().toISOString(),
      platforms: [
        {
          platform: "chat_gpt",
          label: "ChatGPT",
          model_name: "o4-mini",
          status: "ok",
          responseText: "Grade B+. Add more step photos.",
        },
      ],
      merged: null,
    });
    expect(text).toContain("ChatGPT");
    expect(text).toContain("step photos");
  });
});

describe("dfsArticleAuditCompletionSummary", () => {
  it("lists ok platform labels when merged is null", () => {
    const summary = dfsArticleAuditCompletionSummary({
      version: 1,
      articleUrl: "https://example.com/post/",
      focusKeyword: "kw",
      generatedAt: new Date().toISOString(),
      platforms: [
        {
          platform: "chat_gpt",
          label: "ChatGPT",
          model_name: "o4-mini",
          status: "ok",
          responseText: "Grade B+",
        },
      ],
      merged: null,
    });
    expect(summary).toContain("ChatGPT");
  });
});

describe("auditPlatformsForSave and auditPlatformsForRun", () => {
  it("defaults to all three platforms when unset", () => {
    expect(auditPlatformsForSave(undefined)).toEqual(["chat_gpt", "gemini", "perplexity"]);
    expect(auditPlatformsForRun(undefined)).toEqual(["chat_gpt", "gemini", "perplexity"]);
  });

  it("keeps only valid platform ids in order", () => {
    expect(auditPlatformsForSave(["perplexity", "chat_gpt", "bad", "chat_gpt"])).toEqual([
      "perplexity",
      "chat_gpt",
    ]);
  });

  it("rejects empty selection on run", () => {
    expect(() => auditPlatformsForRun([])).toThrow(/at least one LLM platform/i);
  });

  it("formats selected platform labels", () => {
    expect(formatDfsArticleAuditPlatformLabels(["chat_gpt", "perplexity"])).toBe(
      "ChatGPT, Perplexity",
    );
  });

  it("resolves platforms from plan execution payload when contract omits them", () => {
    expect(
      resolveDfsArticleAuditPlatformsForRun({
        executionPayload: { auditPlatforms: ["chat_gpt"] },
      }),
    ).toEqual(["chat_gpt"]);
  });
});
