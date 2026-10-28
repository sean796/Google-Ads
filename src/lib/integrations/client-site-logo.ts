import type { WordPressSite } from "@/components/integrations/types";
import { fetchUrlTextViaApi } from "@/lib/proxy-fetch-text";

export type ClientLogoSource =
  | "og:image"
  | "twitter:image"
  | "apple-touch-icon"
  | "icon"
  | "json-ld"
  | "manual";

export type ClientSiteLogoResult = {
  logoUrl: string;
  source: ClientLogoSource;
};

const META_CONTENT_RE =
  /<meta[^>]+(?:property|name)=["'](og:image|twitter:image)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
const META_CONTENT_RE_ALT =
  /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](og:image|twitter:image)["'][^>]*>/gi;
const LINK_ICON_RE =
  /<link[^>]+rel=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
const LINK_ICON_RE_ALT =
  /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']([^"']+)["'][^>]*>/gi;

function resolveAbsoluteUrl(raw: string, pageUrl: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("data:")) return "";
  try {
    return new URL(trimmed, pageUrl).href;
  } catch {
    return "";
  }
}

function pickMetaImage(html: string, pageUrl: string, name: "og:image" | "twitter:image"): string {
  for (const re of [META_CONTENT_RE, META_CONTENT_RE_ALT]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const prop = (m[1] === name || m[2] === name ? name : null) as typeof name | null;
      if (!prop) continue;
      const content = m[1] === name ? m[2] : m[1];
      const abs = resolveAbsoluteUrl(content, pageUrl);
      if (abs) return abs;
    }
  }
  return "";
}

function pickLinkIcon(html: string, pageUrl: string): { url: string; source: ClientLogoSource } | null {
  const candidates: { url: string; score: number; source: ClientLogoSource }[] = [];
  for (const re of [LINK_ICON_RE, LINK_ICON_RE_ALT]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const rel = (m[1]?.includes("icon") ? m[1] : m[2] ?? "").toLowerCase();
      const href = m[1]?.includes("icon") ? m[2] : m[1];
      if (!rel || !href) continue;
      const abs = resolveAbsoluteUrl(href, pageUrl);
      if (!abs) continue;
      if (rel.includes("apple-touch-icon")) {
        candidates.push({ url: abs, score: 100, source: "apple-touch-icon" });
      } else if (rel.includes("icon")) {
        candidates.push({ url: abs, score: 50, source: "icon" });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return best ? { url: best.url, source: best.source } : null;
}

function pickJsonLdLogo(html: string, pageUrl: string): string {
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const url = findLogoInJsonLd(parsed);
      if (url) {
        const abs = resolveAbsoluteUrl(url, pageUrl);
        if (abs) return abs;
      }
    } catch {
      continue;
    }
  }
  return "";
}

function findLogoInJsonLd(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findLogoInJsonLd(item);
      if (found) return found;
    }
    return "";
  }
  const o = node as Record<string, unknown>;
  const logo = o.logo;
  if (typeof logo === "string" && logo.trim()) return logo.trim();
  if (logo && typeof logo === "object" && !Array.isArray(logo)) {
    const url = (logo as Record<string, unknown>).url;
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  if (typeof o["@graph"] !== "undefined") {
    return findLogoInJsonLd(o["@graph"]);
  }
  return "";
}

/** Public site origin for branding fetch (production URL when set). */
export function resolveClientSiteOrigin(site: Pick<WordPressSite, "siteUrl" | "productionSiteUrl">): string {
  const raw = (site.productionSiteUrl?.trim() || site.siteUrl?.trim() || "").replace(/\/+$/, "");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

export function extractLogoUrlFromHtml(html: string, pageUrl: string): ClientSiteLogoResult | null {
  if (!html.trim() || !pageUrl.trim()) return null;

  const og = pickMetaImage(html, pageUrl, "og:image");
  if (og) return { logoUrl: og, source: "og:image" };

  const twitter = pickMetaImage(html, pageUrl, "twitter:image");
  if (twitter) return { logoUrl: twitter, source: "twitter:image" };

  const icon = pickLinkIcon(html, pageUrl);
  if (icon) return { logoUrl: icon.url, source: icon.source };

  const jsonLd = pickJsonLdLogo(html, pageUrl);
  if (jsonLd) return { logoUrl: jsonLd, source: "json-ld" };

  return null;
}

export async function fetchClientSiteLogoUrl(
  site: Pick<WordPressSite, "siteUrl" | "productionSiteUrl">,
): Promise<ClientSiteLogoResult> {
  const origin = resolveClientSiteOrigin(site);
  if (!origin) {
    throw new Error("Site URL is missing.");
  }
  const html = await fetchUrlTextViaApi(origin.endsWith("/") ? origin : `${origin}/`);
  if (!html.trim()) {
    throw new Error(`Could not load homepage HTML for ${origin}.`);
  }
  const pageUrl = origin.endsWith("/") ? origin : `${origin}/`;
  const found = extractLogoUrlFromHtml(html, pageUrl);
  if (!found) {
    throw new Error(`No logo candidate found on ${origin}.`);
  }
  return found;
}
