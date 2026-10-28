import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildPromptBulkIdeasResponseFormat,
  buildPromptBulkIdeasUserPayload,
  generateSimplePromptIdeas,
} from "@/lib/bulk/prompt-bulk-ideas-simple";

vi.mock("@/lib/openrouter-app-api", () => ({
  postOpenRouterAppChat: vi.fn(),
}));

describe("buildPromptBulkIdeasResponseFormat", () => {
  it("uses strict schema with exact item count", () => {
    const fmt = buildPromptBulkIdeasResponseFormat(2);
    expect(fmt.json_schema.strict).toBe(true);
    const ideas = fmt.json_schema.schema.properties as Record<string, unknown>;
    const ideasProp = ideas.ideas as { minItems?: number; maxItems?: number };
    expect(ideasProp.minItems).toBe(2);
    expect(ideasProp.maxItems).toBe(2);
  });
});

describe("buildPromptBulkIdeasUserPayload", () => {
  it("embeds full site inventory and GSC in the user JSON", () => {
    const inventory = JSON.stringify({
      posts: { posts: [{ slug: "national-seo", title: "What is National SEO?", link: "https://x.test/blog/national-seo/" }] },
    });
    const user = buildPromptBulkIdeasUserPayload({
      count: 2,
      topicLine: "SEO gaps",
      slots: [{ keyword: "", modifier: "" }, { keyword: "", modifier: "" }],
      connectedSite: { name: "Acme", siteUrl: "https://x.test" },
      siteInventoryJson: inventory,
      gscKeywords: ["local seo tips", "technical seo audit"],
      contentScope: ["posts"],
    });
    const parsed = JSON.parse(user) as Record<string, unknown>;
    expect(parsed.SITE_INVENTORY_JSON).toBeTruthy();
    expect(parsed.GSC_TOP_500).toEqual(["local seo tips", "technical seo audit"]);
    expect(parsed.CONNECTED_SITE).toEqual({ name: "Acme", siteUrl: "https://x.test" });
  });
});

describe("generateSimplePromptIdeas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps parsed ideas to CSV rows on one successful call", async () => {
    const { postOpenRouterAppChat } = await import("@/lib/openrouter-app-api");
    vi.mocked(postOpenRouterAppChat).mockResolvedValue({
      content: "",
      parsed: {
        ideas: [
          { keyword: "solar panel cost", title: "Solar Panel Cost In Alberta" },
          { keyword: "home battery backup", title: "Home Battery Backup Options" },
        ],
      },
      raw: {},
      finishReason: "stop",
    });

    const rows = await generateSimplePromptIdeas({
      apiKey: "sk-test",
      model: "test/model",
      count: 2,
      topic: "Alberta solar",
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]!.keyword).toBe("solar panel cost");
    expect(rows[0]!.title).toBe("Solar Panel Cost In Alberta");
    expect(postOpenRouterAppChat).toHaveBeenCalledTimes(1);
  });

  it("uses one inventory-aware call when GSC and site inventory are present", async () => {
    const { postOpenRouterAppChat } = await import("@/lib/openrouter-app-api");
    vi.mocked(postOpenRouterAppChat).mockResolvedValue({
      content: "",
      parsed: {
        ideas: [
          { keyword: "technical seo audit", title: "Technical SEO Audit Checklist For Small Sites" },
          { keyword: "schema markup basics", title: "Schema Markup Basics For Local Businesses" },
          { keyword: "core web vitals tips", title: "Core Web Vitals Tips That Actually Move Rankings" },
        ],
      },
      raw: {},
      finishReason: "stop",
    });

    const inventory = JSON.stringify({
      posts: { posts: [{ slug: "existing-slug-to-skip", title: "Existing Post", link: "https://x.test/blog/existing/" }] },
    });

    const rows = await generateSimplePromptIdeas({
      apiKey: "sk-test",
      model: "google/gemini-2.5-flash",
      count: 3,
      connectedSite: { name: "Acme", siteUrl: "https://x.test" },
      siteInventoryJson: inventory,
      gscKeywords: [
        "plantation shutters cost",
        "motorized blinds edmonton",
        "zebra blinds installation",
        "existing slug to skip",
      ],
    });

    expect(rows).toHaveLength(3);
    expect(postOpenRouterAppChat).toHaveBeenCalledTimes(1);
    const call = vi.mocked(postOpenRouterAppChat).mock.calls[0]![0];
    const user = JSON.parse(call.user) as Record<string, unknown>;
    expect(user.SITE_INVENTORY_JSON).toBeTruthy();
    expect(user.GSC_TOP_500).toBeTruthy();
  });

  it("filters out branded GSC queries and strips brand name from titles", async () => {
    const { postOpenRouterAppChat } = await import("@/lib/openrouter-app-api");
    vi.mocked(postOpenRouterAppChat).mockResolvedValue({
      content: "",
      parsed: {
        ideas: [
          { keyword: "modern kitchen cabinets", title: "Modern Kitchen Cabinet Layout Ideas" },
          { keyword: "custom drapery styles", title: "Custom Drapery Styles For Bright Rooms" },
        ],
      },
      raw: {},
      finishReason: "stop",
    });

    const inventory = JSON.stringify({
      posts: { posts: [{ slug: "kitchen-ideas", title: "Kitchen Ideas", link: "https://dminteriorsanddesign.com/blog/kitchen-ideas/" }] },
    });

    const rows = await generateSimplePromptIdeas({
      apiKey: "sk-test",
      model: "google/gemini-2.5-flash",
      count: 2,
      connectedSite: { name: "DM Interiors & Design", siteUrl: "https://dminteriorsanddesign.com" },
      siteInventoryJson: inventory,
      gscKeywords: [
        "dm interiors",
        "dm interiors & design",
        "modern kitchen cabinets",
        "custom drapery styles",
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]!.title).not.toContain("DM Interiors");
    expect(rows[1]!.title).not.toContain("DM Interiors");
    expect(postOpenRouterAppChat).toHaveBeenCalledTimes(1);
  });
});
