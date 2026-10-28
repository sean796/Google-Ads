import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { permalinkParentPrefixFromPageUrl } from "@/lib/seo-redirect-csv";

/**
 * SEO titles often append the site / brand after `|`. Tiles and WP REST–sourced labels use only the
 * primary segment (before the first `|`), never the suffix.
 */
export function overviewTitlePrimarySegment(raw: string | undefined | null): string {
  const s = raw?.trim() ?? "";
  if (!s) return "";
  const i = s.indexOf("|");
  if (i === -1) return s;
  return s.slice(0, i).trim();
}

export function metaDisplayTitle(
  row: OverviewRow,
  wpTitlesByUrl?: Record<string, string> | null,
): string {
  const ai = overviewTitlePrimarySegment(row.aiTitle);
  const t = overviewTitlePrimarySegment(row.title);
  const h1 = overviewTitlePrimarySegment(row.pageHeading);
  const fromWp = overviewTitlePrimarySegment(
    wpTitlesByUrl && typeof wpTitlesByUrl === "object" ? wpTitlesByUrl[row.url] : undefined,
  );
  if (ai) return decodeOverviewDisplayText(ai);
  if (t) return decodeOverviewDisplayText(t);
  if (h1) return decodeOverviewDisplayText(h1);
  if (fromWp) return decodeOverviewDisplayText(fromWp);
  try {
    const u = new URL(row.url);
    const seg = u.pathname.split("/").filter(Boolean);
    const last = seg[seg.length - 1];
    if (last) return decodeURIComponent(last).replace(/-/g, " ");
    return row.url;
  } catch {
    return row.url;
  }
}

function decodeOverviewDisplayText(text: string): string {
  const t = text.trim();
  if (!t) return t;
  if (typeof document === "undefined") {
    return t
      .replace(/&#0*38;/gi, "&")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;/gi, "'");
  }
  const el = document.createElement("textarea");
  el.innerHTML = t;
  return el.value.trim() || t;
}

/** Compact row date: e.g. Jun 5, 2026 (single line, no time). */
export function formatOverviewRowDateLabel(raw?: string | null): string {
  const s = raw?.trim() ?? "";
  if (!s) return " - ";

  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (isoDateOnly) {
    const d = new Date(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3]));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    }
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  return s;
}

/** Collapsed list rows: pathname only (no origin). Posts/SAP omit collection permalink prefix. */
export function overviewRowUrlPathLabel(
  url: string,
  options?: { source?: OverviewSitemapSource },
): string {
  const s = url?.trim() ?? "";
  if (!s) return "";
  let pathname: string;
  try {
    pathname = new URL(s).pathname || "/";
  } catch {
    const withoutOrigin = s.replace(/^https?:\/\/[^/]+/i, "");
    pathname = withoutOrigin.startsWith("/") ? withoutOrigin : `/${withoutOrigin}`;
  }

  const source = options?.source;
  if (source === "posts" || source === "sap") {
    const parent = permalinkParentPrefixFromPageUrl(s);
    if (parent) {
      const strip = `/${parent.replace(/\/+$/, "")}/`;
      if (pathname.toLowerCase().startsWith(strip.toLowerCase())) {
        const remainder = pathname.slice(strip.length);
        pathname = remainder.startsWith("/") ? remainder : `/${remainder}`;
      }
    }
  }

  return pathname;
}

/** Bulk generator studio: show computed relative path (/blog/…, page, or SAP) without Posts strip. */
export function bulkStudioRowPathLabel(row: Pick<OverviewRow, "url" | "aiSuggestedPath">): string {
  const suggested = row.aiSuggestedPath?.trim();
  if (suggested) {
    return suggested.startsWith("/") ? suggested : `/${suggested}`;
  }
  return overviewRowUrlPathLabel(row.url);
}

/** Public href for bulk studio rows (dock sitemap path + site origin). */
export function bulkStudioRowPublicUrl(
  row: Pick<OverviewRow, "url" | "aiSuggestedPath">,
  siteUrl: string | null | undefined,
): string {
  const path = bulkStudioRowPathLabel(row);
  const raw = siteUrl?.trim();
  if (raw) {
    try {
      const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const origin = new URL(withProto).origin.replace(/\/$/, "");
      if (path.startsWith("/")) return `${origin}${path}`;
    } catch {
      // fall through
    }
  }
  return row.url;
}

export function overviewRowDateLabel(row: OverviewRow): string {
  const modifier = row.dateModifier?.trim();
  if (modifier) return formatOverviewRowDateLabel(modifier);
  return formatOverviewRowDateLabel(row.wpDateGmt);
}

export function formatWpDateLine(iso?: string): string {
  if (!iso?.trim()) return " - ";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function wpStatusLabel(wpStatus?: string): string {
  if (!wpStatus?.trim()) return " - ";
  const s = wpStatus.toLowerCase();
  if (s === "publish") return "Published";
  if (s === "future") return "Scheduled";
  if (s === "draft") return "Draft";
  if (s === "pending") return "Pending";
  return wpStatus;
}
