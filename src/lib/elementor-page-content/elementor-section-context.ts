import {
  parseElementorDataJson,
  type ElementorSectionHeader,
} from "@/lib/elementor-page-content/parse-elementor-section-outline";

type ElementorNode = {
  id?: string;
  elType?: string;
  widgetType?: string;
  settings?: Record<string, unknown>;
  elements?: ElementorNode[];
};

export type ElementorSectionRole = "hero" | "intro" | "body" | "cta" | "trust" | "faq" | "visual";
export type ElementorTextAlign = "left" | "center" | "right" | "justify" | "mixed";

export type ElementorCopyBlueprint = {
  primaryBodyWidget: "text-editor" | "html" | "none";
  bodyTextAlign: ElementorTextAlign;
  headingTextAlign: ElementorTextAlign;
  allowLists: boolean;
  allowOrderedLists: boolean;
  allowedTags: string[];
  forbiddenTags: string[];
  checklist: string[];
};

export type ElementorSectionContext = {
  sectionIndex: number;
  sectionCount: number;
  role: ElementorSectionRole;
  widgetTypes: string[];
  bodyWordCount: number;
  hasButton: boolean;
  hasImage: boolean;
  hasBackgroundImage: boolean;
  primaryHeadingSize: string | null;
  neighborTitles: string[];
  bodyTextAlign: ElementorTextAlign;
  copyBlueprint: ElementorCopyBlueprint;
  promptBlock: string;
};

function isTopLevelBand(node: ElementorNode): boolean {
  const t = node.elType;
  return t === "container" || t === "section";
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function normalizeAlign(value: unknown): ElementorTextAlign | "" {
  if (typeof value !== "string") return "";
  const v = value.toLowerCase().trim();
  if (v === "center" || v === "centre" || v === "middle") return "center";
  if (v === "right") return "right";
  if (v === "justify") return "justify";
  if (v === "left" || v === "start") return "left";
  return "";
}

function readAlignFromSettings(settings: Record<string, unknown>): ElementorTextAlign | "" {
  for (const key of ["align", "text_align", "content_align", "title_align", "button_text_align"]) {
    const aligned = normalizeAlign(settings[key]);
    if (aligned) return aligned;
  }
  const typography = settings.typography;
  if (typography && typeof typography === "object") {
    const aligned = normalizeAlign((typography as Record<string, unknown>).text_align);
    if (aligned) return aligned;
  }
  return "";
}

function readFlexCenter(settings: Record<string, unknown>): boolean {
  const keys = [
    "flex_align_items",
    "flex_justify_content",
    "content_align",
    "align_items",
    "justify_content",
  ];
  for (const key of keys) {
    const v = normalizeAlign(settings[key]);
    if (v === "center") return true;
  }
  return false;
}

function bodyHtmlLooksCentered(bodyHtml: string): boolean {
  return (
    /text-align\s*:\s*center/i.test(bodyHtml) ||
    /class="[^"]*text-center/i.test(bodyHtml) ||
    /align="center"/i.test(bodyHtml)
  );
}

function walkBandNodes(nodes: ElementorNode[], visit: (node: ElementorNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walkBandNodes(node.elements ?? [], visit);
  }
}

function bandHasBackgroundImage(band: ElementorNode): boolean {
  const settings = band.settings ?? {};
  const bg = settings.background_image;
  if (bg && typeof bg === "object") {
    const row = bg as Record<string, unknown>;
    if (typeof row.url === "string" && row.url.trim()) return true;
    if (row.id) return true;
  }
  return typeof settings.background_image_url === "string" && settings.background_image_url.trim().length > 0;
}

type BandLayoutAnalysis = {
  widgetTypes: Set<string>;
  hasButton: boolean;
  hasImage: boolean;
  primaryHeadingSize: string | null;
  bodyEditorAligns: ElementorTextAlign[];
  headingAligns: ElementorTextAlign[];
  hasHtmlWidget: boolean;
  bandFlexCenter: boolean;
};

function analyzeBandLayout(band: ElementorNode): BandLayoutAnalysis {
  const widgetTypes = new Set<string>();
  const bodyEditorAligns: ElementorTextAlign[] = [];
  const headingAligns: ElementorTextAlign[] = [];
  let hasButton = false;
  let hasImage = false;
  let hasHtmlWidget = false;
  let primaryHeadingSize: string | null = null;
  let bestHeadingRank = 99;
  let bandFlexCenter = readFlexCenter(band.settings ?? {});

  walkBandNodes(band.elements ?? [], (node) => {
    const settings = node.settings ?? {};
    if (node.elType === "column" || node.elType === "container") {
      if (readFlexCenter(settings)) bandFlexCenter = true;
      const colAlign = readAlignFromSettings(settings);
      if (colAlign === "center") bandFlexCenter = true;
    }

    if (node.elType !== "widget") return;
    const type = node.widgetType?.trim();
    if (!type) return;
    widgetTypes.add(type);

    if (type === "button") hasButton = true;
    if (type === "image" || type === "image-carousel" || type === "gallery") hasImage = true;
    if (type === "html") hasHtmlWidget = true;

    const align = readAlignFromSettings(settings);
    if (type === "text-editor" && align) bodyEditorAligns.push(align);
    if (type === "heading") {
      if (align) headingAligns.push(align);
      const size =
        typeof settings.header_size === "string" ? settings.header_size : "h2";
      const rank = size === "h1" ? 0 : size === "h2" ? 1 : size === "h3" ? 2 : 3;
      if (rank < bestHeadingRank) {
        bestHeadingRank = rank;
        primaryHeadingSize = size;
      }
    }
  });

  return {
    widgetTypes,
    hasButton,
    hasImage,
    primaryHeadingSize,
    bodyEditorAligns,
    headingAligns,
    hasHtmlWidget,
    bandFlexCenter,
  };
}

function dominantAlign(values: ElementorTextAlign[]): ElementorTextAlign {
  if (!values.length) return "left";
  const counts = new Map<ElementorTextAlign, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: ElementorTextAlign = values[0]!;
  let bestCount = 0;
  for (const [align, count] of counts) {
    if (count > bestCount) {
      best = align;
      bestCount = count;
    }
  }
  const unique = counts.size;
  if (unique > 1 && bestCount < values.length) return "mixed";
  return best;
}

function resolveBodyTextAlign(args: {
  bodyEditorAligns: ElementorTextAlign[];
  headingAligns: ElementorTextAlign[];
  bandFlexCenter: boolean;
  hasBackgroundImage: boolean;
  role: ElementorSectionRole;
  bodyHtml: string;
}): ElementorTextAlign {
  const editorAlign = dominantAlign(args.bodyEditorAligns);
  const headingAlign = dominantAlign(args.headingAligns);

  if (editorAlign !== "left") return editorAlign;
  if (headingAlign === "center") return "center";
  if (args.bandFlexCenter) return "center";
  if (args.hasBackgroundImage && args.role === "hero") return "center";
  if (bodyHtmlLooksCentered(args.bodyHtml)) return "center";
  return editorAlign;
}

function classifySectionRole(args: {
  sectionIndex: number;
  sectionCount: number;
  section: ElementorSectionHeader;
  bodyWordCount: number;
  hasButton: boolean;
  hasImage: boolean;
  hasBackgroundImage: boolean;
  primaryHeadingSize: string | null;
  widgetTypes: Set<string>;
}): ElementorSectionRole {
  const title = args.section.title.trim().toLowerCase();
  const isFirst = args.sectionIndex === 0;
  const isLast = args.sectionIndex === args.sectionCount - 1;
  const visualHeavy =
    !args.section.bodyHtml?.trim() &&
    !args.section.bodyText?.trim() &&
    (args.hasImage || args.widgetTypes.has("image-carousel"));

  if (visualHeavy) return "visual";
  if (/faq|questions|frequently asked/.test(title) || args.widgetTypes.has("accordion")) return "faq";
  if (/review|testimonial|what our clients|rating|trust/.test(title)) return "trust";
  if (isFirst || (args.hasBackgroundImage && args.sectionIndex <= 1)) return "hero";
  if (isLast && args.hasButton && args.bodyWordCount < 120) return "cta";
  if (args.sectionIndex === 1 && args.bodyWordCount < 180 && !args.hasButton) return "intro";
  return "body";
}

function buildCopyBlueprint(args: {
  role: ElementorSectionRole;
  bodyTextAlign: ElementorTextAlign;
  headingTextAlign: ElementorTextAlign;
  hasBackgroundImage: boolean;
  hasButton: boolean;
  primaryBodyWidget: ElementorCopyBlueprint["primaryBodyWidget"];
}): ElementorCopyBlueprint {
  const centered = args.bodyTextAlign === "center" || args.headingTextAlign === "center";
  const allowLists = !centered && args.bodyTextAlign !== "mixed";

  const allowedTags = allowLists
    ? ["<p>", "<ul>", "<li>", "<ol>", "<a href>"]
    : ["<p>", "<a href>"];
  const forbiddenTags = allowLists
    ? ["<table>"]
    : ["<ul>", "<ol>", "<li>", "<table>"];

  const checklist: string[] = [
    `Primary body widget: ${args.primaryBodyWidget}.`,
    `Detected text alignment: ${args.bodyTextAlign.toUpperCase()}${centered ? " (centered layout)" : ""}.`,
    `Section role on page: ${args.role}.`,
  ];

  if (args.hasBackgroundImage) {
    checklist.push("Layout: text sits on a background image overlay.");
  }
  if (args.hasButton) {
    checklist.push(
      "Layout: band includes separate button widget(s). Do not duplicate CTA buttons in HTML.",
    );
  }

  if (centered) {
    checklist.push(
      "Do not use <ul>, <ol>, or <li> in centered text-editor HTML (Elementor renders lists off-axis).",
    );
    checklist.push("Use <p> tags for body copy.");
    checklist.push(
      "If CURRENT SECTION has a list, convert each list item into its own <p> (preserve every item and detail, no lists in output).",
    );
  } else if (allowLists) {
    checklist.push("Use <p> for prose. You may use <ul>/<ol> when a scannable list fits the section.");
    checklist.push("Left-aligned layout supports bullet lists.");
  } else {
    checklist.push("Mixed alignment: use <p> tags only. No lists.");
  }

  checklist.push(
    "Read the full CURRENT SECTION in the user message before writing anything.",
  );
  checklist.push(
    centered
      ? "Preserve coverage: keep every paragraph, every list item (as its own <p>), and every major topic from CURRENT SECTION."
      : "Preserve coverage: keep every paragraph block, list block, and major topic from CURRENT SECTION.",
  );
  checklist.push(
    "Preserve every existing internal link tag exactly (href and anchor text). Fully rewrite all non-link prose (no minimal polish).",
  );
  checklist.push("Do not use <table>, markdown, or inline text-align styles.");
  checklist.push(
    "Rephrase every non-link sentence. Never copy verbatim, never summarize, never shorten, never drop themes.",
  );

  return {
    primaryBodyWidget: args.primaryBodyWidget,
    bodyTextAlign: args.bodyTextAlign,
    headingTextAlign: args.headingTextAlign,
    allowLists,
    allowOrderedLists: allowLists,
    allowedTags,
    forbiddenTags,
    checklist,
  };
}

function formatBlueprintPrompt(blueprint: ElementorCopyBlueprint, role: ElementorSectionRole): string {
  return [
    "=== COPY BLUEPRINT (mandatory — bodyHtml must satisfy every checklist item) ===",
    `Section role: ${role.toUpperCase()}.`,
    ...blueprint.checklist.map((item) => `[ ] ${item}`),
    "",
    `ALLOWED HTML: ${blueprint.allowedTags.join(", ")}.`,
    `FORBIDDEN HTML: ${blueprint.forbiddenTags.join(", ")}.`,
  ].join("\n");
}

export function buildElementorSectionContext(
  elementorJson: string,
  sectionId: string,
  section: ElementorSectionHeader,
  allSections?: ElementorSectionHeader[],
): ElementorSectionContext {
  const data = parseElementorDataJson(elementorJson) as ElementorNode[];
  const bands = data.filter((node) => node && isTopLevelBand(node));
  const sectionCount = bands.length;
  const sectionIndex = bands.findIndex((node) => node.id === sectionId);
  const band = sectionIndex >= 0 ? bands[sectionIndex]! : bands[0] ?? { elements: [] };

  const layout = analyzeBandLayout(band);
  const hasBackgroundImage = bandHasBackgroundImage(band);
  const bodyWordCount = countWords(section.bodyText || section.bodyHtml || "");
  const role = classifySectionRole({
    sectionIndex: Math.max(sectionIndex, 0),
    sectionCount: Math.max(sectionCount, 1),
    section,
    bodyWordCount,
    hasButton: layout.hasButton,
    hasImage: layout.hasImage,
    hasBackgroundImage,
    primaryHeadingSize: layout.primaryHeadingSize,
    widgetTypes: layout.widgetTypes,
  });

  const bodyHtml = section.bodyHtml?.trim() || "";
  const bodyTextAlign = resolveBodyTextAlign({
    bodyEditorAligns: layout.bodyEditorAligns,
    headingAligns: layout.headingAligns,
    bandFlexCenter: layout.bandFlexCenter,
    hasBackgroundImage,
    role,
    bodyHtml,
  });
  const headingTextAlign = dominantAlign(layout.headingAligns);

  const primaryBodyWidget: ElementorCopyBlueprint["primaryBodyWidget"] = layout.widgetTypes.has(
    "text-editor",
  )
    ? "text-editor"
    : layout.hasHtmlWidget
      ? "html"
      : "none";

  const copyBlueprint = buildCopyBlueprint({
    role,
    bodyTextAlign,
    headingTextAlign,
    hasBackgroundImage,
    hasButton: layout.hasButton,
    primaryBodyWidget,
  });

  const outline = allSections ?? [];
  const neighborTitles = outline
    .filter((_, i) => i !== sectionIndex && i >= 0)
    .map((s) => s.title.trim())
    .filter(Boolean)
    .slice(0, 6);

  const widgetList = [...layout.widgetTypes].sort().join(", ") || "text-editor";
  const promptBlock = [
    `SECTION POSITION: Band ${Math.max(sectionIndex, 0) + 1} of ${Math.max(sectionCount, 1)} on this page.`,
    `WIDGETS IN BAND: ${widgetList}.`,
    layout.primaryHeadingSize ? `Primary heading size: ${layout.primaryHeadingSize}.` : "",
    neighborTitles.length ? `Other sections on page: ${neighborTitles.join(" | ")}` : "",
    "",
    formatBlueprintPrompt(copyBlueprint, role),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    sectionIndex: Math.max(sectionIndex, 0),
    sectionCount: Math.max(sectionCount, 1),
    role,
    widgetTypes: [...layout.widgetTypes],
    bodyWordCount,
    hasButton: layout.hasButton,
    hasImage: layout.hasImage,
    hasBackgroundImage,
    primaryHeadingSize: layout.primaryHeadingSize,
    neighborTitles,
    bodyTextAlign,
    copyBlueprint,
    promptBlock,
  };
}

export function headerPromptForSectionContext(context: ElementorSectionContext): string {
  if (context.role === "hero") {
    return "One hero headline aligned with this band. Heading only, no body copy.";
  }
  return "One section heading aligned with this band's role on the page. Heading only, no body copy.";
}

export function validateBodyHtmlAgainstBlueprint(
  bodyHtml: string,
  blueprint: ElementorCopyBlueprint,
): void {
  const html = bodyHtml.trim();
  if (!html) throw new Error("Section body HTML is empty.");

  for (const tag of blueprint.forbiddenTags) {
    const name = tag.replace(/[<>\/]/g, "").trim().toLowerCase();
    if (!name) continue;
    const re = new RegExp(`<${name}\\b`, "i");
    if (re.test(html)) {
      throw new Error(
        `Section body used forbidden <${name}> for this widget layout (${blueprint.bodyTextAlign} alignment). Regenerate using the COPY BLUEPRINT.`,
      );
    }
  }
}
