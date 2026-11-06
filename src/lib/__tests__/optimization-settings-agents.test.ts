import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getAdsModel,
  getBlogModel,
  getImageModel,
  getMetaModel,
  getOptimizationSettings,
  getProductionModel,
  getReportModel,
  getResearchModel,
  getVideoModel,
  saveOptimizationSettings,
} from "@/lib/optimization-settings-storage";
import {
  writeGlobalAdsAgentModel,
  writeGlobalBlogAgentModel,
  writeGlobalImageAgentModel,
  writeGlobalMetaAgentModel,
  writeGlobalReportAgentModel,
  writeGlobalResearchAgentModel,
  writeGlobalVideoAgentModel,
} from "@/lib/global-agent-models";
import { resolveModelForAgentCategory } from "@/lib/openrouter-agent-category-api";
import { useOverviewAiOptimize } from "@/hooks/overview/use-overview-ai-optimize";
import { generateFaqIntroParagraph } from "@/lib/overview/overview-blog-faq-intro-agent";
import {
  generateAnswerSectionHtml,
  generateAndPrependOverviewHtml,
} from "@/lib/overview/overview-blog-overview-prepend";
import { analyzeScenarioInsertionPlan } from "@/lib/overview/overview-blog-scenario-placement-agent";
import { generateInContentImageFromHtml } from "@/lib/in-content-image-generator";
import {
  generateExtraImageForPage,
  generateExtraTextForPage,
} from "@/lib/content-generation/page-extra-content-generator";
import {
  extractFirstPartyClaims,
  planTopicResearchQueries,
} from "@/lib/content-optimization/topic-research-fanout-orchestration";
import { runOverviewAiseoFeaturedImageRow } from "@/lib/overview/overview-aiseo-featured-image-run";
import { runBlogHeadersPlanStream } from "@/lib/overview/overview-blog-headers-plan-stream";
import { runBlogLinksAddIntent } from "@/lib/overview/overview-blog-links-link-intent";
import type { AiAllMetaCatalogRow } from "@/lib/overview/overview-ai-all-meta-batch-catalog";
import type { AiAllMetaRowPatch } from "@/lib/overview/overview-ai-all-meta-batch-parse";
import type { OverviewKeywordCatalogRow } from "@/lib/overview/overview-keyword-batch-agent";

const streamChatCompletionMock = vi.fn();
const callOpenRouterChatCompletionMock = vi.fn();
const postOpenRouterAppChatMock = vi.fn();
const generateImageMock = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    loadApiKey: () => "sk-or-test-key",
    streamChatCompletion: (...args: unknown[]) => streamChatCompletionMock(...args),
  };
});

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: (...args: unknown[]) => callOpenRouterChatCompletionMock(...args),
}));

vi.mock("@/lib/openrouter-app-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/openrouter-app-api")>();
  return {
    ...actual,
    postOpenRouterAppChat: (...args: unknown[]) => postOpenRouterAppChatMock(...args),
  };
});

vi.mock("@/lib/image-api", () => ({
  generateImage: (...args: unknown[]) => generateImageMock(...args),
}));

vi.mock("@/lib/master-instructions-storage", () => ({
  ensureMasterInstructionsInMemory: vi.fn().mockResolvedValue(undefined),
  appendMasterInstructionsToSystemPrompt: (s: string) => s,
}));

vi.mock("@/lib/image-reference-research", () => ({
  researchGoogleImageReferences: vi.fn().mockResolvedValue({
    mode: "none",
    targets: [],
    references: [],
  }),
  buildGroundedImagePromptSuffix: () => "",
  collectReferenceDataUrls: () => [],
}));

vi.mock("@/lib/images/ai-generated-image-disclaimer", () => ({
  applyAiGeneratedImageDisclaimer: vi.fn(async (b64: string) => b64),
}));

vi.mock("@/lib/wordpress-api", () => ({
  uploadWordPressMedia: vi.fn().mockResolvedValue({
    success: true,
    url: "https://example.com/wp-content/uploads/test.png",
    mediaId: 42,
  }),
}));

const SITE = "site-agent-routing-test";

function createMemoryLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

describe("optimization settings and global AI & Models switching across all AISEO elements", () => {
  beforeEach(() => {
    const storage = createMemoryLocalStorage();
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("localStorage", storage);
    vi.clearAllMocks();
  });

  it("routes explicit per-site settings when saved for a site", () => {
    saveOptimizationSettings(SITE, {
      model: "blog/model",
      researchModel: "research/model",
      metaModel: "meta/model",
      reportModel: "report/model",
      adsModel: "ads/model",
      imageModel: "image/model",
      videoModel: "video/model",
      decisionModel: "liquid/d1.1",
      customModels: [],
      temperature: 1,
      maxTokens: 4000,
      topP: 0.9,
    });

    expect(getResearchModel(SITE)).toBe("research/model");
    expect(getProductionModel(SITE)).toBe("blog/model");
    expect(getBlogModel(SITE)).toBe("blog/model");
    expect(getMetaModel(SITE)).toBe("meta/model");
    expect(getReportModel(SITE)).toBe("report/model");
    expect(getAdsModel(SITE)).toBe("ads/model");
    expect(getImageModel(SITE)).toBe("image/model");
    expect(getVideoModel(SITE)).toBe("video/model");
  });

  it("uses global AI & Models selections when siteId has no stored optimization_settings", () => {
    writeGlobalResearchAgentModel("google/gemini-4-argon-research");
    writeGlobalBlogAgentModel("google/gemini-4-argon-blog");
    writeGlobalMetaAgentModel("google/gemini-4-argon-meta");
    writeGlobalReportAgentModel("google/gemini-4-argon-report");
    writeGlobalAdsAgentModel("google/gemini-4-argon-ads");
    writeGlobalImageAgentModel("google/gemini-3.1-flash-image-custom");
    writeGlobalVideoAgentModel("heygen/video-1-custom");

    expect(getResearchModel(SITE)).toBe("google/gemini-4-argon-research");
    expect(getBlogModel(SITE)).toBe("google/gemini-4-argon-blog");
    expect(getProductionModel(SITE)).toBe("google/gemini-4-argon-blog");
    expect(getMetaModel(SITE)).toBe("google/gemini-4-argon-meta");
    expect(getReportModel(SITE)).toBe("google/gemini-4-argon-report");
    expect(getAdsModel(SITE)).toBe("google/gemini-4-argon-ads");
    expect(getImageModel(SITE)).toBe("google/gemini-3.1-flash-image-custom");
    expect(getVideoModel(SITE)).toBe("heygen/video-1-custom");

    const siteSettings = getOptimizationSettings(SITE);
    expect(siteSettings.metaModel).toBe("google/gemini-4-argon-meta");
    expect(siteSettings.model).toBe("google/gemini-4-argon-blog");
    expect(siteSettings.researchModel).toBe("google/gemini-4-argon-research");
  });

  it("updates stale per-site optimization_settings in localStorage when switching global AI & Models", () => {
    // Simulate a browser that previously had DEFAULT_SETTINGS saved for this site
    saveOptimizationSettings(SITE, {
      model: "google/gemini-2.5-flash",
      researchModel: "deepseek/deepseek-v4.1-flash",
      metaModel: "google/gemini-2.5-flash",
      reportModel: "deepseek/deepseek-v4.1-flash",
      adsModel: "deepseek/deepseek-v4.1-flash",
      imageModel: "google/gemini-3.1-flash-image",
      videoModel: "heygen/video-1",
      decisionModel: "liquid/d1.1",
      customModels: [],
      temperature: 1,
      maxTokens: 4000,
      topP: 0.9,
    });

    // User switches models in Dashboard -> AI & Models
    writeGlobalMetaAgentModel("google/gemini-4-argon");
    writeGlobalBlogAgentModel("google/gemini-4-argon");
    writeGlobalResearchAgentModel("anthropic/claude-sonnet-4.5");
    writeGlobalImageAgentModel("openai/gpt-image-1");
    writeGlobalReportAgentModel("openai/gpt-5");
    writeGlobalAdsAgentModel("openai/gpt-5-mini");
    writeGlobalVideoAgentModel("google/veo-3");

    expect(getMetaModel(SITE)).toBe("google/gemini-4-argon");
    expect(getBlogModel(SITE)).toBe("google/gemini-4-argon");
    expect(getResearchModel(SITE)).toBe("anthropic/claude-sonnet-4.5");
    expect(getImageModel(SITE)).toBe("openai/gpt-image-1");
    expect(getReportModel(SITE)).toBe("openai/gpt-5");
    expect(getAdsModel(SITE)).toBe("openai/gpt-5-mini");
    expect(getVideoModel(SITE)).toBe("google/veo-3");

    expect(resolveModelForAgentCategory("meta", SITE)).toBe("google/gemini-4-argon");
    expect(resolveModelForAgentCategory("blog", SITE)).toBe("google/gemini-4-argon");
    expect(resolveModelForAgentCategory("research", SITE)).toBe("anthropic/claude-sonnet-4.5");
    expect(resolveModelForAgentCategory("image", SITE)).toBe("openai/gpt-image-1");
    expect(resolveModelForAgentCategory("report", SITE)).toBe("openai/gpt-5");
    expect(resolveModelForAgentCategory("ads", SITE)).toBe("openai/gpt-5-mini");
    expect(resolveModelForAgentCategory("video", SITE)).toBe("google/veo-3");
  });

  it("switches the active OpenRouter model across all AISEO Meta elements (MD, Titles, FAQs, All Meta, Keywords) even after hook mount", async () => {
    streamChatCompletionMock.mockImplementation(
      async (opts: { onContentChunk?: (c: string) => void }) => {
        opts.onContentChunk?.(
          '[{"question":"How do window blinds work?","answer":"They control light."}]',
        );
        return { content: "Optimized output" };
      },
    );

    let api!: ReturnType<typeof useOverviewAiOptimize> & {
      runAiAllMetaBatchForCatalog: (
        catalog: AiAllMetaCatalogRow[],
      ) => Promise<Map<string, AiAllMetaRowPatch>>;
      deriveFocusKeywordsFromPageContextBatch: (
        catalog: OverviewKeywordCatalogRow[],
      ) => Promise<Map<string, string>>;
    };
    function Harness() {
      api = useOverviewAiOptimize({
        apiKey: "sk-or-test-key",
        model: "google/gemini-2.5-flash",
        temperature: 1.0,
        maxTokens: 4000,
        topP: 0.9,
        wordPressSiteId: SITE,
      });
      return null;
    }
    renderToStaticMarkup(React.createElement(Harness));

    // Switch Meta agent in Dashboard -> AI & Models after hook is already mounted
    writeGlobalMetaAgentModel("google/gemini-4-argon");

    // 1. AISEO -> MD (optimizeMeta)
    await api.optimizeMeta(
      "https://example.com/blinds",
      "Old meta",
      "custom window blinds",
    );
    expect(streamChatCompletionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "google/gemini-4-argon" }),
    );

    // 2. AISEO -> Titles (optimizeTitle)
    await api.optimizeTitle(
      "https://example.com/blinds",
      "Old Title",
      "custom window blinds",
    );
    expect(streamChatCompletionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "google/gemini-4-argon" }),
    );

    // 3. AISEO -> FAQs (optimizeFaq, optimizeFaqQuestion, optimizeFaqAnswer, generateFaqIntroParagraph)
    await api.optimizeFaq(
      "https://example.com/blinds",
      "custom window blinds",
      "",
    );
    expect(streamChatCompletionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "google/gemini-4-argon" }),
    );

    callOpenRouterChatCompletionMock.mockResolvedValueOnce({
      content: "<p>Common questions about custom window blinds.</p>",
    });
    await generateFaqIntroParagraph({
      apiKey: "sk-or-test-key",
      model: getMetaModel(SITE),
      focusKeyword: "custom window blinds",
      pageTitle: "Custom Window Blinds",
      entries: [{ question: "Q1?", answer: "A1." }],
    });
    expect(callOpenRouterChatCompletionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "google/gemini-4-argon" }),
    );

    // 4. AISEO -> All Meta batch (runAiAllMetaBatchForCatalog)
    callOpenRouterChatCompletionMock.mockResolvedValueOnce({
      content: JSON.stringify({
        results: [
          {
            url: "https://example.com/blinds",
            metaDescription:
              "Explore Custom Window Blinds tailored for light control, privacy, and room comfort with durable materials and clean installation.",
            title: "Custom Window Blinds for Light Control and Privacy",
          },
        ],
      }),
    });
    await api.runAiAllMetaBatchForCatalog([
      {
        index: 0,
        url: "https://example.com/blinds",
        focusKeyword: "custom window blinds",
        includeTitle: true,
        existingTitle: "Old Title",
        existingMeta: "Old Meta",
        seoResearchBrief: "",
        faqMode: "none",
        faqPairCount: 0,
        seedCount: 0,
      },
    ]);
    expect(callOpenRouterChatCompletionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "google/gemini-4-argon" }),
    );

    // 5. AISEO -> Keywords (single & batch content/entity keywords)
    await api.deriveFocusKeywordFromPageContext(
      "https://example.com/blinds",
      "Custom Window Blinds",
      "Meta",
    );
    expect(streamChatCompletionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "google/gemini-4-argon" }),
    );

    callOpenRouterChatCompletionMock.mockResolvedValueOnce({
      content: JSON.stringify({
        results: [{ url: "https://example.com/blinds", focusKeyword: "custom window blinds" }],
      }),
    });
    await api.deriveFocusKeywordsFromPageContextBatch([
      { url: "https://example.com/blinds", title: "Custom Window Blinds", meta: "Meta" },
    ]);
    expect(callOpenRouterChatCompletionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "google/gemini-4-argon" }),
    );
  });

  it("switches the active OpenRouter model across AISEO Content, Research, and Image elements", async () => {
    writeGlobalBlogAgentModel("google/gemini-4-argon");
    writeGlobalResearchAgentModel("deepseek/deepseek-v4.1-flash");
    writeGlobalImageAgentModel("google/gemini-3.1-flash-image");

    // 1. AISEO -> Answer & Overview
    callOpenRouterChatCompletionMock.mockResolvedValueOnce({
      content: "<h2>Answer</h2><p>Direct answer paragraph.</p>",
    });
    await generateAnswerSectionHtml({
      articleTitle: "Window Blinds Guide",
      focusKeyword: "window blinds",
      bodyH2Titles: ["Styles", "Installation"],
      apiKey: "sk-or-test-key",
      model: getBlogModel(SITE),
    });
    expect(callOpenRouterChatCompletionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "google/gemini-4-argon" }),
    );

    callOpenRouterChatCompletionMock
      .mockResolvedValueOnce({
        content: "<h2>Answer</h2><p>Direct answer paragraph.</p>",
      })
      .mockResolvedValueOnce({
        content:
          '<h2>Overview</h2><p>Overview paragraph.</p><ul><li><strong>Styles</strong>: details.</li><li><strong>Installation</strong>: steps.</li></ul>',
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ bullets: [] }),
      });
    await generateAndPrependOverviewHtml({
      sourceHtml:
        '<h2 id="styles">Styles</h2><p>Body copy.</p><h2 id="installation">Installation</h2><p>More copy.</p>',
      articleTitle: "Window Blinds Guide",
      focusKeyword: "window blinds",
      apiKey: "sk-or-test-key",
      model: getBlogModel(SITE),
    });
    expect(callOpenRouterChatCompletionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "google/gemini-4-argon" }),
    );

    // 1b. AISEO -> Headers (runBlogHeadersPlanStream) & Links (runBlogLinksAddIntent)
    writeGlobalBlogAgentModel("anthropic/claude-sonnet-4.5");
    streamChatCompletionMock.mockImplementationOnce(
      async (opts: { onContentChunk?: (c: string) => void }) => {
        const json = JSON.stringify({
          h2Actions: [
            {
              action: "optimize",
              index: 0,
              proposedText: "Window Blinds Styles for Living Rooms",
              rationale: "Specific topic heading",
            },
          ],
        });
        opts.onContentChunk?.(json);
        return { content: json };
      },
    );
    await runBlogHeadersPlanStream(
      {
        index: 0,
        url: "https://example.com/blinds",
        postId: 1,
        title: "Window Blinds Guide",
        focusKeyword: "window blinds",
        seoResearchBrief: "",
        existingH2s: ["Styles"],
        html: "<h2>Styles</h2><p>Body copy.</p>",
        sectionLabels: ["Styles"],
        missingLeadingH2: false,
      },
      {
        apiKey: "sk-or-test-key",
        model: getBlogModel(SITE),
        siteId: SITE,
        siteUrl: "https://example.com",
      },
      () => {},
    );
    expect(streamChatCompletionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "anthropic/claude-sonnet-4.5" }),
    );

    callOpenRouterChatCompletionMock.mockResolvedValueOnce({
      content: JSON.stringify({
        proposedKeyword: "roller shades",
        anchorText: "roller shades",
      }),
    });
    await runBlogLinksAddIntent(
      {
        index: 0,
        url: "https://example.com/blinds",
        postId: 1,
        title: "Window Blinds Guide",
        focusKeyword: "window blinds",
        html: "<p>Compare window blinds and roller shades for your windows.</p>",
        seoResearchBrief: "",
        existingLinks: [],
        wordCount: 9,
        sectionHeadings: 0,
        linksToAdd: 1,
        paragraphCount: 1,
        linkPool: {
          postCount: 1,
          pageCount: 0,
          postInventory: [
            {
              url: "https://example.com/roller-shades",
              title: "Roller Shades Guide",
              focusKeyword: "roller shades",
              bucket: "post",
              slug: "roller-shades",
            },
          ],
          pageInventory: [],
        },
      },
      0,
      "Compare window blinds and roller shades for your windows.",
      {
        apiKey: "sk-or-test-key",
        model: getBlogModel(SITE),
        siteId: SITE,
        siteUrl: "https://example.com",
      },
      [],
      [],
    );
    expect(callOpenRouterChatCompletionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "anthropic/claude-sonnet-4.5" }),
    );

    // 2. AISEO -> Scenario placement (uses Research model when model not overridden)
    callOpenRouterChatCompletionMock.mockResolvedValueOnce({
      content: JSON.stringify({
        afterSectionHeader: "Styles",
        illustrativeH2Title: "Comparing cordless shade options",
      }),
    });
    await analyzeScenarioInsertionPlan({
      html: "<h2>Styles</h2><p>Body copy about styles.</p>",
      focusKeyword: "window blinds",
      pageTitle: "Window Blinds Guide",
      apiKey: "sk-or-test-key",
      model: getResearchModel(SITE),
    });
    expect(callOpenRouterChatCompletionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "deepseek/deepseek-v4.1-flash" }),
    );

    // 3. AISEO -> In-Content Image & Extra Image (uses Research model for checklist + Image model for generation)
    writeGlobalImageAgentModel("openai/gpt-image-1");
    streamChatCompletionMock.mockImplementation(
      async (opts: { onContentChunk?: (c: string) => void }) => {
        opts.onContentChunk?.("1. Subject\n   Show custom blinds in a bright living room.");
        return { content: "1. Subject\n   Show custom blinds in a bright living room." };
      },
    );
    generateImageMock.mockResolvedValue({
      imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    });

    await generateInContentImageFromHtml({
      html: "<h2>Styles</h2><p>Detailed paragraph about window blinds styles.</p>",
      flowTitle: "Window Blinds Guide",
      focusKeyword: "window blinds",
      forcedSectionHeader: "Styles",
      apiKey: "sk-or-test-key",
      site: {
        id: SITE,
        name: "Test Site",
        siteUrl: "https://example.com",
        username: "admin",
        appPassword: "pw",
        connectedAt: Date.now(),
      },
    });
    expect(streamChatCompletionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "deepseek/deepseek-v4.1-flash" }),
    );
    expect(generateImageMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "openai/gpt-image-1" }),
    );

    await generateExtraImageForPage({
      existingContent: "<p>Page content about window blinds.</p>",
      primaryKeyword: "window blinds",
      apiKey: "sk-or-test-key",
      siteId: SITE,
      site: {
        id: SITE,
        name: "Test Site",
        siteUrl: "https://example.com",
        username: "admin",
        appPassword: "pw",
        connectedAt: Date.now(),
      },
    });
    expect(generateImageMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "openai/gpt-image-1" }),
    );

    // 4. AISEO -> Research All (planTopicResearchQueries + extractFirstPartyClaims)
    writeGlobalResearchAgentModel("google/gemini-4-argon");
    callOpenRouterChatCompletionMock.mockResolvedValueOnce({
      content: JSON.stringify({
        researchQueries: [
          "custom window blinds installation cost Calgary",
          "motorized window blinds warranty Calgary",
          "cellular shades R-value windows Calgary",
        ],
        namedPrograms: [],
      }),
    });
    await planTopicResearchQueries({
      keyword: "custom window blinds",
      companyName: "Test Site",
      location: "Calgary, AB",
      siteId: SITE,
    });
    expect(callOpenRouterChatCompletionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "google/gemini-4-argon" }),
    );

    callOpenRouterChatCompletionMock.mockResolvedValueOnce({
      content: JSON.stringify({
        claims: [{ text: "Serving Calgary since 2010", source: "CHATGPT" }],
      }),
    });
    await extractFirstPartyClaims({
      chatGptTexts: ["Test Site has served Calgary since 2010."],
      siteUrl: "https://example.com",
      location: "Calgary, AB",
    });
    expect(callOpenRouterChatCompletionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "google/gemini-4-argon" }),
    );

    // 5. AISEO -> Extra Text (generateExtraTextForPage uses Research model)
    streamChatCompletionMock.mockImplementation(
      async (opts: { onContentChunk?: (c: string) => void }) => {
        const html = "<h2>Custom Window Blinds Options</h2><p>Details.</p><h3>Choosing Custom Window Blinds</h3><p>More details.</p>";
        opts.onContentChunk?.(html);
        return { content: html };
      },
    );
    await generateExtraTextForPage({
      existingContent: "<p>Existing page copy.</p>",
      primaryKeyword: "custom window blinds",
      secondaryKeywords: ["roller shades"],
      apiKey: "sk-or-test-key",
      siteId: SITE,
      site: {
        id: SITE,
        name: "Test Site",
        siteUrl: "https://example.com",
        username: "admin",
        appPassword: "pw",
        connectedAt: Date.now(),
      },
    });
    expect(streamChatCompletionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "google/gemini-4-argon" }),
    );

    // 6. AISEO -> Featured Image (runOverviewAiseoFeaturedImageRow uses Research + Image + Meta models)
    writeGlobalResearchAgentModel("anthropic/claude-sonnet-4.5");
    writeGlobalImageAgentModel("google/gemini-3.1-flash-image");
    writeGlobalMetaAgentModel("google/gemini-4-argon");
    callOpenRouterChatCompletionMock
      .mockResolvedValueOnce({
        content: JSON.stringify({ matureContentRequested: false }),
      })
      .mockResolvedValueOnce({
        content: "custom-window-blinds-calgary",
      });
    await runOverviewAiseoFeaturedImageRow({
      apiKey: "sk-or-test-key",
      siteId: SITE,
      title: "Custom Window Blinds Guide",
      contentHtml: "<h2>Styles</h2><p>Detailed content about custom window blinds.</p>",
      keyword: "custom window blinds",
    });
    expect(streamChatCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "anthropic/claude-sonnet-4.5" }),
    );
    expect(generateImageMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "google/gemini-3.1-flash-image" }),
    );
    expect(callOpenRouterChatCompletionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "google/gemini-4-argon" }),
    );
  });
});
