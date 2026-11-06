import { describe, expect, it } from "vitest";
import {
  buildMetaBrandRules,
  buildMetaImageChecklistSystemPrompt,
  buildMetaImagePrompt,
  buildMetaImagePromptDescription,
  buildMetaImagePromptPreview,
  buildMetaCopySystemPrompt,
  META_IMAGE_ANTI_PATTERNS,
  META_IMAGE_NO_SPEC_FRAME_RULE,
  META_VALUE_PROPOSITION_RULES,
  META_IMAGE_LAYOUT_RULES,
  META_IMAGE_NO_PEOPLE_RULES,
  parseMetaChecklistItems,
  resolveMetaAdvertiserLabel,
} from "@/lib/ppc/meta-ad-prompt-builder";
import type { MetaAdCreativeBrief } from "@/lib/ppc/meta-ads-types";
import { META_IMAGE_REALISM_RULE } from "@/lib/ppc/meta-ad-image-realism-spec";
import { TYPOGRAPHY_PALETTE, SKYLINE_PALETTE, withToolPalette } from "@/lib/ppc/__tests__/meta-ad-test-fixtures";
import { META_DEVICE_SCREEN_ABSTRACT_RULE } from "@/lib/ppc/meta-ad-visual-tool-palette";

const sampleBrief: MetaAdCreativeBrief = withToolPalette(
  {
    strategyStatement: "Drive local SEO leads with a designed feed ad.",
    captionHook: "Customers search before they call.",
    onImageHeadline: "Get Found Locally",
    onImageSubline: "SEO that works",
    visualConcept: "Warm co-working loft with walnut desk and open laptop",
    visualVibe: "bold-minimal",
    backgroundTreatment: "Dark branded gradient with lime accent",
    useMapOverlay: false,
    creativeStyle: "designed_graphic",
  },
  TYPOGRAPHY_PALETTE,
);

describe("parseMetaChecklistItems", () => {
  it("reads items array", () => {
    const items = parseMetaChecklistItems({
      items: [{ id: "1", label: "Match focus keyword", detail: "Use exact phrase" }],
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("Match focus keyword");
  });

  it("reads checklist alias", () => {
    const items = parseMetaChecklistItems({
      checklist: [{ label: "Designed graphic" }, { text: "No logos" }],
    });
    expect(items).toHaveLength(2);
    expect(items[1]?.label).toBe("No logos");
  });

  it("reads root array", () => {
    const items = parseMetaChecklistItems([{ title: "Hero subject" }]);
    expect(items[0]?.label).toBe("Hero subject");
  });
});

describe("resolveMetaAdvertiserLabel", () => {
  it("uses connected site name when provided", () => {
    expect(resolveMetaAdvertiserLabel("Acme Windows")).toBe("Acme Windows");
  });

  it("throws when site name is missing", () => {
    expect(() => resolveMetaAdvertiserLabel()).toThrow("Connected site name is required");
  });

  it("buildMetaBrandRules uses site name not agency default", () => {
    const rules = buildMetaBrandRules("Acme Windows");
    expect(rules).toContain("Acme Windows");
    expect(rules).not.toContain("Neo Digital Inc agency");
  });
});

describe("meta ad style constants", () => {
  it("uses designed graphic language and realism rule", () => {
    expect(buildMetaBrandRules("Acme Windows")).toContain("Designed Instagram feed");
    expect(buildMetaBrandRules("Acme Windows")).not.toContain("#FFFFFF only");
    expect(META_IMAGE_LAYOUT_RULES).toContain("Designed graphic");
    expect(META_IMAGE_NO_PEOPLE_RULES).not.toMatch(/abstract branded graphics/i);
    expect(META_IMAGE_ANTI_PATTERNS).toBe(META_IMAGE_REALISM_RULE);
  });

  it("requires definitive outcomes in copy prompts", () => {
    expect(META_VALUE_PROPOSITION_RULES).toContain("We help Edmonton businesses");
    expect(buildMetaCopySystemPrompt("Acme Windows")).toContain("concrete outcome");
  });
});

describe("buildMetaImageChecklistSystemPrompt", () => {
  it("follows creative brief and visual plan without exclusion lists", () => {
    const prompt = buildMetaImageChecklistSystemPrompt({
      siteName: "Acme Windows",
    });
    expect(prompt).toContain("Follow creative brief visualConcept");
    expect(prompt).toContain("Do not add elements not in the plan");
    expect(prompt).not.toContain("forbiddenVisuals");
    expect(prompt).not.toContain("Forbidden on image");
    expect(prompt).not.toContain("Agency stack");
  });

  it("includes realism and on-image text rules", () => {
    const prompt = buildMetaImageChecklistSystemPrompt({
      siteName: "Acme Windows",
    });
    expect(prompt).toContain("physically plausible");
    expect(prompt).toContain("ON-IMAGE TEXT LOCK");
  });
});

describe("buildMetaImagePromptDescription", () => {
  it("references text lock once and bans focus keyword", () => {
    const description = buildMetaImagePromptDescription({
      creativeBrief: sampleBrief,
      focusKeyword: "AI SEO Edmonton",
      placement: "feed_1x1",
      typographyStyle: "montserrat",
      visualReferenceElements: [
        {
          id: "1",
          label: "Layout ref",
          kind: "layout",
          googleImageQuery: "instagram feed sponsored ad graphic design",
          acceptanceBrief: "Designed feed ad layout",
        },
      ],
    });
    expect(description).toContain("Apply ON-IMAGE TEXT LOCK only");
    expect(description).not.toContain('On-image headline (render exactly once): "Get Found Locally"');
    expect(description).toContain('DO NOT render focus keyword on image: "AI SEO Edmonton"');
    expect(description).not.toContain("Primary topic:");
    expect(description).toContain("Layout ref");
    expect(description).toContain("bold-minimal");
    expect(description).not.toContain("Forbidden on image");
  });

  it("does not repeat on-image strings in the description", () => {
    const description = buildMetaImagePromptDescription({
      creativeBrief: sampleBrief,
      placement: "feed_1x1",
    });
    expect(description).not.toContain('"Get Found Locally"');
    expect(description).not.toContain('"SEO that works"');
  });

  it("includes tool palette and scene spec without duplicate locality line", () => {
    const description = buildMetaImagePromptDescription({
      creativeBrief: sampleBrief,
      focusKeyword: "AI SEO Edmonton",
      placement: "feed_1x1",
      localityCity: "Edmonton",
      typographyStyle: "montserrat",
    });
    expect(description).not.toContain("Locality context: Edmonton");
    expect(description).toContain("Visual tool palette (degree):");
    expect(description).toContain("Warm co-working loft");
    expect(description).not.toContain("Scene composition:");
  });

  it("includes skyline when city_skyline degree is above zero", () => {
    const skylineBrief = withToolPalette(
      {
        ...sampleBrief,
        visualConcept: "Edmonton skyline backdrop with bold type",
      },
      SKYLINE_PALETTE,
    );
    const description = buildMetaImagePromptDescription({
      creativeBrief: skylineBrief,
      placement: "feed_1x1",
      localityCity: "Edmonton",
    });
    expect(description).toContain("City backdrop: Edmonton");
    expect(description).toContain("city_skyline degree 0.9");
  });

  it("omits device abstract rule when no device tool or refs", () => {
    const description = buildMetaImagePromptDescription({
      creativeBrief: {
        ...sampleBrief,
        visualConcept: "Bold typographic feed graphic with lime accent bars",
      },
      placement: "feed_1x1",
    });
    expect(description).toContain("SCENE SPEC");
    expect(description).not.toContain(META_DEVICE_SCREEN_ABSTRACT_RULE);
  });

  it("includes typography style when typography chance is above zero", () => {
    const description = buildMetaImagePromptDescription({
      creativeBrief: sampleBrief,
      placement: "feed_1x1",
      typographyStyle: "montserrat",
    });
    expect(description).toContain("Typography style: Montserrat Google Font");
  });

  it("includes abstract device rule for device refs", () => {
    const description = buildMetaImagePromptDescription({
      creativeBrief: sampleBrief,
      focusKeyword: "AI SEO Edmonton",
      placement: "feed_1x1",
      localityCity: "Edmonton",
      visualReferenceElements: [
        {
          id: "1",
          label: "Device ref",
          kind: "device",
          googleImageQuery: "2026 laptop mockup",
          acceptanceBrief: "Hardware vignette",
        },
      ],
    });
    expect(description).toContain("SCENE SPEC");
    expect(description).toContain("Warm co-working loft");
    expect(description).not.toContain("clean desk in a bright modern office");
    expect(description).toContain(META_DEVICE_SCREEN_ABSTRACT_RULE);
    expect(description).not.toContain("Agency stack visuals");
  });
});

describe("buildMetaImagePromptPreview", () => {
  it("returns designed Instagram creative preview", () => {
    const preview = buildMetaImagePromptPreview({
      focusKeyword: "window coverings",
      placement: "feed_1x1",
    });
    expect(preview).toContain("designed Instagram creative");
    expect(preview).toContain("modern vibe");
    expect(preview).toContain("no people");
    expect(preview).not.toContain("PROMPT DESCRIPTION");
  });

  it("omits no people when allowPeopleInImage is true", () => {
    const preview = buildMetaImagePromptPreview({
      focusKeyword: "window coverings",
      placement: "feed_1x1",
      allowPeopleInImage: true,
    });
    expect(preview).not.toContain("no people");
  });

  it("includes visual note in preview", () => {
    const preview = buildMetaImagePromptPreview({
      focusKeyword: "blinds",
      placement: "feed_4x5",
      imagePromptModifier: "Show close-up texture",
    });
    expect(preview).toContain("Show close-up texture");
  });
});

describe("buildMetaImagePrompt", () => {
  it("uses brief exact text once in text lock and omits ad copy strings", () => {
    const prompt = buildMetaImagePrompt({
      creativeBrief: sampleBrief,
      focusKeyword: "AI SEO Edmonton",
      checklist: [{ label: "Render exact on-image headline once" }],
      placement: "feed_4x5",
      siteName: "Acme Windows",
      typographyStyle: "inter",
      visualReferenceElements: [
        {
          id: "1",
          label: "Layout",
          kind: "layout",
          googleImageQuery: "instagram feed ad graphic design",
          acceptanceBrief: "Designed layout",
        },
      ],
    });
    expect(prompt).toContain("PROMPT DESCRIPTION");
    expect(prompt).toContain("Get Found Locally");
    expect(prompt).toContain("ON-IMAGE TEXT LOCK");
    expect(prompt).toContain(META_IMAGE_NO_SPEC_FRAME_RULE);
    expect(prompt).toContain("Feed 4:5");
    expect(prompt).toContain("Designed Instagram feed graphic");
    expect(prompt).toContain("DO NOT render focus keyword");
    expect(prompt).not.toContain("Primary topic:");
    expect(prompt).not.toContain("Customers search before they call.");
    expect(prompt).not.toContain("Hard reject visuals");
    const headlineCount = prompt.split("Get Found Locally").length - 1;
    expect(headlineCount).toBe(1);
    const sublineCount = prompt.split("SEO that works").length - 1;
    expect(sublineCount).toBe(1);
  });
});
