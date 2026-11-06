import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import { CONTENT_CREATOR_IG_MAX_CHARS } from "@/lib/social/content-creator-social-copy-limits";

const socialBriefAgent = vi.fn();
const fbCopyAgent = vi.fn();
const socialChecklistAgent = vi.fn();
const instagramGoalAgent = vi.fn();
const creativeBriefAgent = vi.fn();

vi.mock("@/lib/ppc/load-ppc-google-master-rules", () => ({
  loadPpcGoogleMasterRules: vi.fn(async () => ""),
}));

vi.mock("@/lib/ppc/google-ads-gsc-context", () => ({
  loadPpcGoogleGscContext: vi.fn(async () => []),
}));

vi.mock("@/lib/ppc/meta-ad-context-assembler", () => ({
  buildMetaGscQueriesMarkdown: vi.fn(() => ""),
  buildMetaUnifiedContextBlock: vi.fn(() => "page context"),
  loadMetaContextResearch: vi.fn(async () => ({
    markdown: "context",
    pageContext: "context",
    title: "Title",
    url: "https://example.com/page",
  })),
  loadMetaNeoPulseAppContextResearch: vi.fn(() => ({
    markdown: "neo-pulse",
    pageContext: "neo-pulse",
    title: "NEO Pulse",
    url: "https://neodigital.ca",
  })),
  metaContextResearchToLandingPage: vi.fn((_research, keyword) => ({
    url: "https://example.com/page",
    title: "Page",
    keyword,
  })),
  metaContextUrlsMatch: vi.fn(() => false),
  metaNeoPulseAppLandingPage: vi.fn((keyword) => ({
    url: "https://neodigital.ca",
    title: "NEO Pulse",
    keyword,
  })),
}));

vi.mock("@/lib/ppc/meta-ad-agents", () => ({
  runMetaAdCreativeBriefAgent: (...args: unknown[]) => creativeBriefAgent(...args),
  runMetaAdInstagramGoalAgent: (...args: unknown[]) => instagramGoalAgent(...args),
  runMetaAdImageAgent: vi.fn(),
  runMetaAdImageChecklistAgent: vi.fn(),
  runMetaAdInstagramReferenceAgent: vi.fn(),
  runMetaAdVisualReferencePlanAgent: vi.fn(),
}));

vi.mock("@/lib/social/content-creator-agents", () => ({
  runContentCalendarSocialBriefAgent: (...args: unknown[]) => socialBriefAgent(...args),
  runContentCalendarFbInstagramCopyAgent: (...args: unknown[]) => fbCopyAgent(...args),
  runContentCalendarSocialCopyChecklistAgent: (...args: unknown[]) => socialChecklistAgent(...args),
  formatContentCreatorChecklistFeedback: vi.fn(() => "fix caption"),
}));

vi.mock("@/lib/optimization-settings-storage", () => ({
  getImageModel: vi.fn(() => "image-model"),
  getResearchModel: vi.fn(() => "research-model"),
}));

import { createDefaultMetaVisualToolPalette } from "@/lib/social/social-creator-generate-config-defaults";
import { runSocialCreatorGenerate } from "@/lib/social/run-social-creator-generate";

const defaultPalette = createDefaultMetaVisualToolPalette();

const baseConfig = {
  postCount: 1,
  placement: "feed_1x1" as const,
  includeImage: false,
  landingPageSource: "random" as const,
  defaultColorPalette: {},
  defaultVisualToolPalette: defaultPalette,
  defaultVisualToolMode: "fixed" as const,
};

const site: WordPressSite = {
  id: "site-1",
  name: "Example Co",
  siteUrl: "https://example.com",
  username: "user",
  appPassword: "pass",
  connectedAt: 0,
  enabled: true,
};

describe("runSocialCreatorGenerate organic copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    instagramGoalAgent.mockResolvedValue({
      goalStatement: "Grow awareness",
      primaryTopic: "Edmonton SEO",
      audience: "Local owners",
      adAngle: "Results",
      hook: "Rank locally",
      visualDirection: "Clean graphic",
      creativeMode: "local_lead",
      referenceQueries: [],
    });
    creativeBriefAgent.mockResolvedValue({
      strategyStatement: "Strategy",
      captionHook: "Rank locally",
      onImageHeadline: "SEO",
      onImageSubline: "Local",
      visualConcept: "Graphic",
      visualVibe: "Bold",
      backgroundTreatment: "Dark",
      useMapOverlay: false,
      creativeStyle: "designed_graphic",
      visualToolPalette: defaultPalette,
    });
    socialBriefAgent.mockResolvedValue({
      strategyStatement: "Organic plan",
      captionHook: "Rank locally",
      postAngle: "SEO tips",
      ctaLine: "Link in bio",
      hashtags: ["#Seo", "#Local", "#Marketing"],
    });
    socialChecklistAgent.mockResolvedValue([]);
    fbCopyAgent.mockResolvedValue({
      fbInstagramContent: "Rank locally\nLink in bio\n#Seo #Local #Marketing",
    });
  });

  it("runs social brief before FB/Instagram copy", async () => {
    const stepOrder: string[] = [];
    await runSocialCreatorGenerate({
      site,
      apiKey: "test-key",
      model: "test-model",
      config: baseConfig,
      focusKeyword: "edmonton seo",
      landingPageUrl: "https://example.com/edmonton-seo",
      onProgress: (progress) => {
        const running = progress.steps.find((step) => step.status === "running");
        if (running?.id) stepOrder.push(running.id);
      },
    });

    expect(socialBriefAgent).toHaveBeenCalledBefore(fbCopyAgent);
    expect(stepOrder.indexOf("copy")).toBeLessThan(stepOrder.lastIndexOf("copy"));
    expect(socialBriefAgent).toHaveBeenCalledTimes(1);
    expect(fbCopyAgent).toHaveBeenCalledTimes(1);
  });

  it("clamps manual FB/Instagram draft to IG max chars", async () => {
    const longBody = "A".repeat(CONTENT_CREATOR_IG_MAX_CHARS + 80);
    const result = await runSocialCreatorGenerate({
      site,
      apiKey: "test-key",
      model: "test-model",
      config: baseConfig,
      focusKeyword: "edmonton seo",
      landingPageUrl: "https://example.com/edmonton-seo",
      fbInstagramContent: `${longBody}\n#One #Two #Three`,
      onProgress: () => undefined,
    });

    expect(result.fbInstagramContent.length).toBeLessThanOrEqual(CONTENT_CREATOR_IG_MAX_CHARS);
    expect(fbCopyAgent).not.toHaveBeenCalled();
  });

  it("skips fixed visual tool palette in context mode", async () => {
    const agentPalette = {
      ...defaultPalette,
      icon_cluster: { chance: 0, degree: 0 },
      photo_focal: { chance: 0.9, degree: 0.8 },
    };
    creativeBriefAgent.mockResolvedValue({
      strategyStatement: "Strategy",
      captionHook: "Rank locally",
      onImageHeadline: "SEO",
      onImageSubline: "Local",
      visualConcept: "Photo hero",
      visualVibe: "clean-premium",
      backgroundTreatment: "Dark",
      useMapOverlay: false,
      creativeStyle: "photo_hero",
      visualToolPalette: agentPalette,
    });

    const result = await runSocialCreatorGenerate({
      site,
      apiKey: "test-key",
      model: "test-model",
      config: { ...baseConfig, defaultVisualToolMode: "context" },
      focusKeyword: "edmonton seo",
      landingPageUrl: "https://example.com/edmonton-seo",
      visualToolPalette: undefined,
      onProgress: () => undefined,
    });

    expect(creativeBriefAgent).toHaveBeenCalledWith(
      expect.objectContaining({ visualToolPalette: undefined, visualToolMode: "context" }),
    );
    expect(result.creativeBrief.visualToolPalette.photo_focal.degree).toBe(0.8);
    expect(result.creativeBrief.visualToolPalette.icon_cluster.degree).toBe(0);
  });
});
