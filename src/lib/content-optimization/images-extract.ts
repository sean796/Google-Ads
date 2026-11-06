import { getResearchModel } from "@/lib/optimization-settings-storage";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

/**
 * Validates that an image URL is valid and points to an actual image.
 */
export function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== "string" || !url.trim()) return false;
  const trimmedUrl = url.trim();
  if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) return false;
  try {
    const urlObj = new URL(trimmedUrl);
    if (!urlObj.pathname || urlObj.pathname === "/" || urlObj.pathname.length < 2) return false;
  } catch {
    return false;
  }
  const urlLower = trimmedUrl.toLowerCase();
  const invalidPatterns = [
    "placeholder", "example.com", "lorem", "dummy", "fake", "test", "sample",
    "none", "null", "undefined", "#", "javascript:", "data:",
  ];
  if (invalidPatterns.some((p) => urlLower.includes(p))) return false;
  if (/^https?:\/\/[^/]+\/?$/.test(trimmedUrl)) return false;
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico"];
  const hasImageExtension = imageExtensions.some((ext) => urlLower.includes(ext));
  const imageHostingDomains = ["wordpress.com", "wp.com", "i.imgur.com", "cdn.", "images.", "img.", "media."];
  const isFromImageHost = imageHostingDomains.some((d) => urlLower.includes(d));
  return hasImageExtension || isFromImageHost || trimmedUrl.includes("?");
}

/** Same-site or CDN URL that is a media file/embed (uploads, image/video ext, known hosts). */
export function isMediaAssetUrl(url: string): boolean {
  if (!url?.trim()) return false;
  if (!isValidMediaUrl(url)) return false;
  const urlLower = url.trim().toLowerCase();
  if (urlLower.includes("/wp-content/uploads/")) return true;
  if (urlLower.includes("/wp-content/")) return true;
  const videoHosts = [
    "youtube.com", "youtu.be", "vimeo.com", "player.vimeo.com",
    "wistia.com", "fast.wistia", "dailymotion.com", "loom.com",
  ];
  if (videoHosts.some((h) => urlLower.includes(h))) return true;
  const mediaExt = [
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico",
    ".mp4", ".webm", ".mov", ".m4v", ".ogg",
  ];
  return mediaExt.some((ext) => urlLower.includes(ext));
}

/** Image or video/embed URL from existing post body. */
export function isValidMediaUrl(url: string): boolean {
  if (isValidImageUrl(url)) return true;
  if (!url || typeof url !== "string" || !url.trim()) return false;
  const trimmedUrl = url.trim();
  if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) return false;
  try {
    new URL(trimmedUrl);
  } catch {
    return false;
  }
  const urlLower = trimmedUrl.toLowerCase();
  const invalidPatterns = [
    "placeholder", "example.com", "lorem", "dummy", "fake", "test", "sample",
    "none", "null", "undefined", "#", "javascript:", "data:",
  ];
  if (invalidPatterns.some((p) => urlLower.includes(p))) return false;
  const videoHosts = [
    "youtube.com", "youtu.be", "vimeo.com", "player.vimeo.com",
    "wistia.com", "fast.wistia", "dailymotion.com", "loom.com",
  ];
  if (videoHosts.some((h) => urlLower.includes(h))) return true;
  const videoExt = [".mp4", ".webm", ".mov", ".m4v", ".ogg"];
  if (videoExt.some((ext) => urlLower.includes(ext))) return true;
  if (urlLower.includes("/embed/") || urlLower.includes("wp-content/uploads")) return true;
  return false;
}

export type ExtractedMediaItem = {
  url: string;
  /** Anchor label: prefer title, then alt, then short context. */
  linkLabel: string;
  altTag: string;
  title: string;
  kind: "image" | "video";
  context: string;
};

const EXTRACT_MEDIA_SYSTEM = `You are an expert at analyzing HTML and extracting EXISTING media metadata only.

Find REAL images and videos already in the HTML:
- Images: <img>, markdown ![alt](url)
- Videos: <video>/<source>, iframe/embed (YouTube, Vimeo, Wistia, etc.)

For each item return:
- url (exact src/href HTTP/HTTPS)
- altTag (img alt, or empty)
- title (title attribute, figcaption, aria-label, or empty)
- kind ("image" or "video")
- context (brief surrounding topic)

Rules:
- ONLY extract media that actually exists in the HTML. NEVER invent URLs.
- If none, return empty array.
- Prefer the media file/page URL (iframe src for embeds).

Return ONLY JSON: { "media": [ { "url", "altTag", "title", "kind", "context" } ] }`;

function mediaLinkLabel(item: {
  altTag?: string;
  title?: string;
  context?: string;
  kind?: string;
}): string {
  const title = (item.title ?? "").trim();
  if (title) return title.slice(0, 120);
  const alt = (item.altTag ?? "").trim();
  if (alt) return alt.slice(0, 120);
  const ctx = (item.context ?? "").trim();
  if (ctx) return ctx.slice(0, 80);
  return item.kind === "video" ? "Watch video" : "View image";
}

/** Parse img/iframe/video src from HTML without LLM (optimize path). */
export function extractMediaFromHtmlTags(htmlContent: string): ExtractedMediaItem[] {
  if (!htmlContent?.trim()) return [];
  const valid: ExtractedMediaItem[] = [];
  const seen = new Set<string>();

  const pushUrl = (url: string, kind: "image" | "video", altTag = "") => {
    const trimmed = url.trim();
    if (!trimmed || !isValidMediaUrl(trimmed) || seen.has(trimmed)) return;
    seen.add(trimmed);
    const linkLabel = altTag.trim() || (kind === "video" ? "Watch video" : "View image");
    valid.push({
      url: trimmed,
      altTag: altTag.trim(),
      title: altTag.trim(),
      linkLabel,
      kind,
      context: "",
    });
  };

  for (const match of htmlContent.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
    const tag = match[0] ?? "";
    const url = match[1] ?? "";
    const alt = tag.match(/alt=["']([^"']*)["']/i)?.[1] ?? "";
    pushUrl(url, "image", alt);
  }

  for (const match of htmlContent.matchAll(/<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
    pushUrl(match[1] ?? "", "video");
  }

  for (const match of htmlContent.matchAll(/<video[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
    pushUrl(match[1] ?? "", "video");
  }

  for (const match of htmlContent.matchAll(/<source[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
    pushUrl(match[1] ?? "", "video");
  }

  return valid;
}

/**
 * Extracts images and videos from existing HTML via OpenRouter (metadata only).
 */
export async function extractMediaFromContent(
  htmlContent: string,
  apiKey: string,
  model?: string
): Promise<ExtractedMediaItem[]> {
  const researchModel = model || getResearchModel();
  if (!htmlContent?.trim()) return [];
  const lower = htmlContent.toLowerCase();
  const hasMedia =
    lower.includes("<img") ||
    htmlContent.includes("![") ||
    lower.includes("<video") ||
    lower.includes("<iframe") ||
    lower.includes("<embed") ||
    lower.includes("<source");
  if (!hasMedia) return [];

  try {
    const response = await postOpenRouterAppChatFetch( {
      method: "POST",
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model: researchModel,
        messages: [
          { role: "system", content: EXTRACT_MEDIA_SYSTEM },
          {
            role: "user",
            content: `Extract all image and video media metadata from this HTML:\n\n${htmlContent.substring(0, 15000)}\n\nReturn JSON: { "media": [ { "url": "https://...", "altTag": "...", "title": "...", "kind": "image"|"video", "context": "..." } ] }`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2500,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) return [];
    const content = (await response.json()).choices?.[0]?.message?.content?.trim() || "";
    if (!content) return [];

    let parsed: {
      media?: Array<{
        url?: string;
        altTag?: string;
        title?: string;
        kind?: string;
        context?: string;
      }>;
      images?: Array<{ url?: string; altTag?: string; context?: string }>;
    };
    try {
      parsed = JSON.parse(content);
    } catch {
      return [];
    }

    const rawList = Array.isArray(parsed.media)
      ? parsed.media
      : Array.isArray(parsed.images)
        ? parsed.images.map((img) => ({ ...img, kind: "image", title: "" }))
        : Array.isArray(parsed)
          ? parsed
          : [];

    const seenUrls = new Set<string>();
    const valid: ExtractedMediaItem[] = [];

    for (const item of rawList as Array<{
      url?: string;
      altTag?: string;
      title?: string;
      kind?: string;
      context?: string;
    }>) {
      const url = (item.url ?? "").trim();
      if (!url || !isValidMediaUrl(url) || seenUrls.has(url)) continue;
      const kindRaw = (item.kind ?? "image").trim().toLowerCase();
      const kind: "image" | "video" = kindRaw === "video" ? "video" : "image";
      if (kind === "image" && !isValidImageUrl(url) && !isValidMediaUrl(url)) continue;
      const altTag = (item.altTag ?? "").trim();
      const title = (item.title ?? "").trim();
      const context = (item.context ?? "").trim();
      const linkLabel = mediaLinkLabel({ altTag, title, context, kind });
      if (!linkLabel) continue;
      seenUrls.add(url);
      valid.push({ url, linkLabel, altTag, title, kind, context });
    }
    return valid;
  } catch {
    return [];
  }
}

/**
 * @deprecated Prefer extractMediaFromContent (images + videos). Kept for callers that expect image-only shape.
 */
export async function extractImagesFromContent(
  htmlContent: string,
  apiKey: string,
  model?: string
): Promise<Array<{ url: string; altTag: string; context: string }>> {
  const media = await extractMediaFromContent(htmlContent, apiKey, model);
  return media
    .filter((m) => m.kind === "image")
    .map((m) => ({
      url: m.url,
      altTag: m.altTag || m.linkLabel,
      context: m.context,
    }))
    .filter((m) => m.altTag);
}

const MATCH_MEDIA_SYSTEM = `You are an expert at placing media citation links in SEO content.
Match each media item (by label, alt/title, and context) to the most semantically appropriate section heading.
Rules: Each item to exactly ONE section; no duplicates; use only provided section headings.
Return JSON: { "assignments": [ { "mediaUrl": "...", "linkLabel": "...", "targetSection": "exact heading text" } ] }.`;

/**
 * Uses AI to match media to content sections. Caller excludes intro/conclusion/FAQ via excludedPatterns.
 */
export async function matchMediaToSections(
  media: ExtractedMediaItem[],
  sectionHeadings: string[],
  excludedPatterns: string[],
  apiKey: string,
  model?: string
): Promise<Array<{ mediaUrl: string; linkLabel: string; targetSection: string }>> {
  const researchModel = model || getResearchModel();
  if (!media?.length || !sectionHeadings?.length) return [];

  const availableSections = sectionHeadings.filter((heading) => {
    const h = heading.toLowerCase();
    return !excludedPatterns.some((p) => h.includes(p.toLowerCase()));
  });
  if (!availableSections.length) return [];

  try {
    const mediaDescription = media
      .map(
        (m, idx) =>
          `${idx + 1}. URL: ${m.url}\n   Kind: ${m.kind}\n   Link label: "${m.linkLabel}"\n   Alt: "${m.altTag || ""}"\n   Title: "${m.title || ""}"\n   Context: "${m.context || ""}"`
      )
      .join("\n\n");
    const sectionsDescription = availableSections.map((s, idx) => `${idx + 1}. "${s}"`).join("\n");

    const response = await postOpenRouterAppChatFetch( {
      method: "POST",
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model: researchModel,
        messages: [
          { role: "system", content: MATCH_MEDIA_SYSTEM },
          {
            role: "user",
            content: `Match these media items to the best sections. Place each as a text link only (not an embed).\n\nMEDIA:\n${mediaDescription}\n\nAVAILABLE SECTIONS (use only these):\n${sectionsDescription}\n\nReturn JSON: { "assignments": [ { "mediaUrl": "...", "linkLabel": "...", "targetSection": "..." } ] }`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) return [];
    const content = (await response.json()).choices?.[0]?.message?.content?.trim() || "";
    if (!content) return [];

    let parsed: {
      assignments?: Array<{ mediaUrl?: string; imageUrl?: string; linkLabel?: string; altTag?: string; targetSection?: string }>;
    };
    try {
      parsed = JSON.parse(content);
    } catch {
      return [];
    }
    const assignments = Array.isArray(parsed.assignments) ? parsed.assignments : Array.isArray(parsed) ? parsed : [];
    const seenUrls = new Set<string>();
    const valid: Array<{ mediaUrl: string; linkLabel: string; targetSection: string }> = [];
    const byUrl = new Map(media.map((m) => [m.url, m]));

    for (const a of assignments) {
      const mediaUrl = ((a.mediaUrl ?? a.imageUrl) ?? "").trim();
      if (!mediaUrl || !isValidMediaUrl(mediaUrl) || seenUrls.has(mediaUrl)) continue;
      const fromMedia = byUrl.get(mediaUrl);
      const linkLabel = ((a.linkLabel ?? a.altTag) ?? "").trim() || fromMedia?.linkLabel || "";
      if (!linkLabel) continue;
      const targetSection = (a.targetSection ?? "").trim();
      if (!targetSection) continue;
      const matched = availableSections.find((s) => s.toLowerCase().trim() === targetSection.toLowerCase());
      const section =
        matched ??
        availableSections.find(
          (s) =>
            s.toLowerCase().includes(targetSection.toLowerCase()) ||
            targetSection.toLowerCase().includes(s.toLowerCase())
        );
      if (!section) continue;
      seenUrls.add(mediaUrl);
      valid.push({ mediaUrl, linkLabel, targetSection: section });
    }
    return valid;
  } catch {
    return [];
  }
}

/**
 * @deprecated Prefer matchMediaToSections.
 */
export async function matchImagesToSections(
  images: Array<{ url: string; altTag: string; context: string }>,
  sectionHeadings: string[],
  excludedPatterns: string[],
  apiKey: string,
  model?: string
): Promise<Array<{ imageUrl: string; altTag: string; targetSection: string }>> {
  const media: ExtractedMediaItem[] = images.map((img) => ({
    url: img.url,
    linkLabel: img.altTag,
    altTag: img.altTag,
    title: "",
    kind: "image" as const,
    context: img.context,
  }));
  const matched = await matchMediaToSections(media, sectionHeadings, excludedPatterns, apiKey, model);
  return matched.map((m) => ({
    imageUrl: m.mediaUrl,
    altTag: m.linkLabel,
    targetSection: m.targetSection,
  }));
}
