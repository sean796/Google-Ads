export type ElementorSectionHeader = {
  id: string;
  /** Section heading text (heading widget or first h1-h6 in body HTML). */
  title: string;
  /** True when band has a separate Elementor heading widget. */
  hasHeadingWidget: boolean;
  /** True when section title comes from h1-h6 inside text-editor HTML. */
  headingInBodyHtml: boolean;
  /** Full heading tag when headingInBodyHtml (e.g. `<h2>Title</h2>`). */
  headingHtml: string;
  depth: number;
  bodyText: string;
  /** Body HTML excluding the section heading tag when headingInBodyHtml. */
  bodyHtml: string;
};

type ElementorNode = {
  id?: string;
  elType?: string;
  widgetType?: string;
  settings?: Record<string, unknown>;
  elements?: ElementorNode[];
};

function stripHtml(raw: string): string {
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function headingRank(headerSize: unknown): number {
  if (headerSize === "h2") return 0;
  if (headerSize === "h1") return 1;
  if (headerSize === "h3") return 2;
  if (headerSize === "h4") return 3;
  return 4;
}

function isRatingLikeTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return true;
  if (/^\d+(\.\d+)?\+?$/.test(t)) return true;
  if (t.length <= 2) return true;
  return false;
}

function readSettingText(settings: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = settings[key];
    if (typeof value === "string" && value.trim()) return stripHtml(value);
  }
  return "";
}

function readRepeaterText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const parts: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    for (const key of [
      "tab_title",
      "tab_content",
      "text",
      "title",
      "title_text",
      "description",
      "description_text",
      "item_text",
      "content",
      "accordion_title",
      "accordion_content",
    ]) {
      const text = row[key];
      if (typeof text === "string" && text.trim()) parts.push(stripHtml(text));
    }
  }
  return parts.filter(Boolean).join(" ");
}

function widgetPlainText(node: ElementorNode): string {
  if (node.elType !== "widget") return "";
  const settings = node.settings ?? {};
  switch (node.widgetType) {
    case "heading":
      return readSettingText(settings, ["title"]);
    case "text-editor":
      return readSettingText(settings, ["editor"]);
    case "icon-box":
    case "image-box":
      return [readSettingText(settings, ["title_text"]), readSettingText(settings, ["description_text"])]
        .filter(Boolean)
        .join(" ");
    case "button":
      return readSettingText(settings, ["text"]);
    case "html":
      return readSettingText(settings, ["html"]);
    case "counter":
      return readSettingText(settings, ["title", "prefix", "suffix"]);
    case "testimonial":
    case "reviews":
      return [
        readSettingText(settings, ["content", "description", "testimonial_content"]),
        readRepeaterText(settings.testimonials),
        readRepeaterText(settings.slides),
      ]
        .filter(Boolean)
        .join(" ");
    case "accordion":
    case "toggle":
    case "tabs":
      return [
        readRepeaterText(settings.tabs),
        readRepeaterText(settings.accordion),
        readRepeaterText(settings.toggle),
      ]
        .filter(Boolean)
        .join(" ");
    case "icon-list":
      return readRepeaterText(settings.icon_list);
    case "price-list":
    case "price-table":
      return readRepeaterText(settings.price_list);
    case "call-to-action":
      return [readSettingText(settings, ["title", "description", "button"]), readRepeaterText(settings.cta_items)]
        .filter(Boolean)
        .join(" ");
    case "image":
    case "image-carousel":
      return [
        readSettingText(settings, ["caption", "caption_text"]),
        readRepeaterText(settings.carousel),
        readRepeaterText(settings.gallery),
      ]
        .filter(Boolean)
        .join(" ");
    default:
      return [
        readSettingText(settings, [
          "title",
          "title_text",
          "heading",
          "description",
          "description_text",
          "editor",
          "text",
          "html",
        ]),
        readRepeaterText(settings.tabs),
        readRepeaterText(settings.accordion),
        readRepeaterText(settings.icon_list),
        readRepeaterText(settings.slides),
      ]
        .filter(Boolean)
        .join(" ");
  }
}

type HeadingCandidate = { title: string; rank: number; order: number };

function collectHeadingCandidates(nodes: ElementorNode[], orderStart = 0): HeadingCandidate[] {
  const out: HeadingCandidate[] = [];
  let order = orderStart;
  for (const node of nodes) {
    if (node.elType === "widget" && node.widgetType === "heading") {
      const title = readSettingText(node.settings ?? {}, ["title"]);
      if (title) {
        out.push({
          title,
          rank: headingRank(node.settings?.header_size),
          order,
        });
        order += 1;
      }
    }
    const nested = collectHeadingCandidates(node.elements ?? [], order);
    out.push(...nested);
    order += nested.length;
  }
  return out;
}

function readEditorHtml(settings: Record<string, unknown>): string {
  const editor = settings.editor;
  if (typeof editor === "string" && editor.trim()) return editor.trim();
  const html = settings.html;
  return typeof html === "string" ? html.trim() : "";
}

function collectBandBodyHtml(nodes: ElementorNode[]): string {
  const parts: string[] = [];
  const walk = (list: ElementorNode[]) => {
    for (const node of list) {
      if (
        node.elType === "widget" &&
        (node.widgetType === "text-editor" || node.widgetType === "html")
      ) {
        const html = readEditorHtml(node.settings ?? {});
        if (html) parts.push(html);
      }
      walk(node.elements ?? []);
    }
  };
  walk(nodes);
  return parts.join("\n");
}

function collectBandTextParts(nodes: ElementorNode[]): string[] {
  const parts: string[] = [];
  const walk = (list: ElementorNode[]) => {
    for (const node of list) {
      if (node.elType === "widget") {
        const text = widgetPlainText(node);
        if (text.trim()) parts.push(text.trim());
      }
      walk(node.elements ?? []);
    }
  };
  walk(nodes);
  return parts;
}

function pickHeadingTitle(candidates: HeadingCandidate[]): { title: string; hasHeadingWidget: boolean } {
  const usable = candidates.filter((c) => !isRatingLikeTitle(c.title));
  if (!usable.length) {
    return { title: "", hasHeadingWidget: false };
  }
  const sorted = [...usable].sort((a, b) => a.rank - b.rank || a.order - b.order);
  return { title: sorted[0]!.title, hasHeadingWidget: true };
}

function buildBodyText(headingTitle: string, textParts: string[]): string {
  const chunks = headingTitle.trim()
    ? textParts.filter((part) => part.trim() && part.trim() !== headingTitle.trim())
    : textParts.filter((part) => part.trim());
  if (!chunks.length) return textParts.join("\n\n").trim();
  return chunks.join("\n\n").trim();
}

/** First h1-h6 at start of text-editor HTML (common Elementor pattern). */
export function extractInlineSectionHeadingFromHtml(html: string): {
  title: string;
  headingHtml: string;
  bodyHtml: string;
} | null {
  const trimmed = html.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(<h([1-6])\b[^>]*>)([\s\S]*?)(<\/h\2>)\s*/i);
  if (!match?.[1] || !match[3] || !match[4]) return null;
  const title = stripHtml(match[3]);
  if (!title || isRatingLikeTitle(title)) return null;
  const headingHtml = `${match[1]}${match[3]}${match[4]}`;
  return {
    title,
    headingHtml,
    bodyHtml: trimmed.slice(match[0].length).trim(),
  };
}

function isTopLevelBand(node: ElementorNode): boolean {
  const t = node.elType;
  return t === "container" || t === "section";
}

/** Walk Elementor JSON and return one header + body preview per top-level band. */
export function parseElementorSectionOutline(elementorData: unknown): ElementorSectionHeader[] {
  if (!Array.isArray(elementorData)) return [];
  const out: ElementorSectionHeader[] = [];
  for (let i = 0; i < elementorData.length; i += 1) {
    const node = elementorData[i] as ElementorNode;
    if (!node || typeof node !== "object") continue;
    if (!isTopLevelBand(node)) continue;
    const id = typeof node.id === "string" && node.id.trim() ? node.id.trim() : `band-${i}`;
    const children = node.elements ?? [];
    const textParts = collectBandTextParts(children);
    const bodyHtml = collectBandBodyHtml(children);
    const headingCandidates = collectHeadingCandidates(children);
    const pickedHeading = pickHeadingTitle(headingCandidates);
    const hasHeadingWidget = pickedHeading.hasHeadingWidget;
    let title = pickedHeading.title;
    let headingInBodyHtml = false;
    let headingHtml = "";
    let sectionBodyHtml = bodyHtml;
    let sectionBodyText = buildBodyText(title, textParts);

    if (!hasHeadingWidget && bodyHtml.trim()) {
      const inline = extractInlineSectionHeadingFromHtml(bodyHtml);
      if (inline) {
        title = inline.title;
        headingInBodyHtml = true;
        headingHtml = inline.headingHtml;
        sectionBodyHtml = inline.bodyHtml;
        sectionBodyText = stripHtml(inline.bodyHtml);
      }
    }

    out.push({
      id,
      title,
      hasHeadingWidget,
      headingInBodyHtml,
      headingHtml,
      depth: 0,
      bodyText: sectionBodyText,
      bodyHtml: sectionBodyHtml,
    });
  }
  return out;
}

/** Flat text corpus from Elementor tree (for harness slot detection). */
export function elementorTreePlainText(elementorData: unknown): string {
  if (!Array.isArray(elementorData)) return "";
  return collectBandTextParts(elementorData as ElementorNode[]).join(" ");
}

export function parseElementorDataJson(raw: string): unknown[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Elementor data must be a JSON array.");
  }
  return parsed;
}

export function assertSameTopLevelCount(before: unknown[], after: unknown[]): void {
  if (before.length !== after.length) {
    throw new Error(
      `Elementor optimize rejected: top-level section count changed (${before.length} → ${after.length}).`,
    );
  }
}
