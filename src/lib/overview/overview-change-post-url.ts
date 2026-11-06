import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import { changeWordPressPostUrl } from "@/lib/wordpress-api/change-post-url";
import { getWordPressPostMeta } from "@/lib/wordpress-api";
import { restCollectionEndpointForSubtype } from "@/lib/overview/overview-bulk-seo-payload";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import {
  fullDestinationUrl,
  normalizeSeoRelativePath,
  normalizedPageUrlForCompare,
} from "@/lib/seo-redirect-csv";

export type OverviewSlugChangePlan = {
  needed: boolean;
  slug: string | null;
  newUrl: string | null;
};

/** Last path segment from AI suggested path (WordPress post_name, not parent prefix). */
export function wpSlugFromAiSuggestedPath(suggestedPath: string): string | null {
  const norm = normalizeSeoRelativePath(suggestedPath);
  if (!norm) return null;
  const segments = norm.replace(/\/+$/, "").split("/").filter(Boolean);
  return segments.length ? segments[segments.length - 1] : null;
}

export function lastPathSegmentFromUrl(fullUrl: string): string | null {
  try {
    const segments = new URL(fullUrl.trim()).pathname
      .replace(/\/+$/, "")
      .split("/")
      .filter(Boolean);
    if (!segments.length) return null;
    return segments[segments.length - 1].replace(/\.(html?|php)$/i, "");
  } catch {
    return null;
  }
}

export function overviewRowSlugChangePlan(row: OverviewRow): OverviewSlugChangePlan {
  const suggested = row.aiSuggestedPath?.trim();
  if (!suggested) return { needed: false, slug: null, newUrl: null };

  const slug = wpSlugFromAiSuggestedPath(suggested);
  if (!slug) return { needed: false, slug: null, newUrl: null };

  const newUrl = fullDestinationUrl(row.url, suggested);
  if (!newUrl) return { needed: false, slug: null, newUrl: null };

  return { needed: true, slug, newUrl };
}

/** True when live WordPress permalink already matches the suggested destination. */
export function overviewSuggestedUrlLiveOnWordPress(
  livePermalink: string | undefined,
  suggestedDestination: string | null,
): boolean {
  if (!livePermalink?.trim() || !suggestedDestination?.trim()) return false;
  const live = normalizedPageUrlForCompare(livePermalink);
  const dest = normalizedPageUrlForCompare(suggestedDestination);
  return Boolean(live && dest && live === dest);
}

async function fetchLivePermalink(
  site: WordPressSite,
  binding: OverviewBinding,
): Promise<string | null> {
  try {
    const meta = await getWordPressPostMeta(
      site.siteUrl,
      site.username,
      site.appPassword,
      binding.postId,
      binding.subtype,
      restCollectionEndpointForSubtype(binding.subtype),
    );
    if (meta.success && typeof meta.link === "string" && meta.link.trim()) {
      return meta.link.trim();
    }
  } catch {
    /* optional hydrate */
  }
  return null;
}

function isWordPressPreviewQueryPermalink(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    const pathname = parsed.pathname.replace(/\/+$/, "");
    if (pathname !== "") return false;
    return (
      parsed.searchParams.has("p") ||
      parsed.searchParams.has("page_id") ||
      parsed.searchParams.has("preview_id")
    );
  } catch {
    return false;
  }
}

export function verifyWordPressSlugMatchesPlan(
  livePermalink: string | null | undefined,
  plan: OverviewSlugChangePlan,
  confirmedSlug?: string | null,
): { ok: boolean; error?: string } {
  if (!plan.needed || !plan.slug || !plan.newUrl) {
    return { ok: true };
  }
  const expectedSlug = plan.slug.toLowerCase();
  if (
    confirmedSlug?.trim() &&
    confirmedSlug.trim().toLowerCase() === expectedSlug &&
    (!livePermalink?.trim() || isWordPressPreviewQueryPermalink(livePermalink))
  ) {
    return { ok: true };
  }
  if (!livePermalink?.trim()) {
    return { ok: false, error: "Could not read the live WordPress permalink after slug update." };
  }

  const liveNorm = normalizedPageUrlForCompare(livePermalink);
  const destNorm = normalizedPageUrlForCompare(plan.newUrl);
  const liveSegment = lastPathSegmentFromUrl(livePermalink);

  if (!liveNorm || !destNorm || liveNorm !== destNorm) {
    const still = liveSegment || "unknown";
    return {
      ok: false,
      error: `WordPress slug is still ${still}. Expected ${plan.slug}.`,
    };
  }

  if (!liveSegment || liveSegment.toLowerCase() !== expectedSlug) {
    return {
      ok: false,
      error: `WordPress slug is still ${liveSegment ?? "unknown"}. Expected ${plan.slug}.`,
    };
  }

  return { ok: true };
}

export async function applyOverviewRowSlugChangeToWordPress(
  site: WordPressSite,
  row: OverviewRow,
  binding: OverviewBinding,
  options?: { createRedirect?: boolean },
): Promise<{ ok: boolean; permalink?: string; slug?: string; error?: string }> {
  const plan = overviewRowSlugChangePlan(row);
  if (!plan.needed || !plan.slug) {
    return { ok: true };
  }

  const result = await changeWordPressPostUrl(
    site.siteUrl,
    site.username,
    site.appPassword,
    binding.postId,
    plan.slug,
    {
      postType: binding.subtype,
      postTypeEndpoint: restCollectionEndpointForSubtype(binding.subtype),
      createRedirect: options?.createRedirect ?? false,
    },
  );

  if (!result.ok) {
    const err = (result.error || "").trim();
    const unchanged =
      /unchanged|same as the current slug/i.test(err) || /neo-pulse_unchanged_slug/i.test(err);
    if (unchanged) {
      const live = await fetchLivePermalink(site, binding);
      if (overviewSuggestedUrlLiveOnWordPress(live ?? undefined, plan.newUrl)) {
        return { ok: true, permalink: live ?? undefined, slug: plan.slug };
      }
      if (isWordPressPreviewQueryPermalink(live)) {
        return { ok: true, permalink: plan.newUrl ?? undefined, slug: plan.slug };
      }
    }
    return { ok: false, error: result.error || "WordPress rejected the slug update." };
  }

  const permalink = result.permalink?.trim() || (await fetchLivePermalink(site, binding)) || "";
  const verify = verifyWordPressSlugMatchesPlan(permalink || null, plan, result.slug);
  if (!verify.ok) {
    return { ok: false, error: verify.error };
  }

  const resolvedPermalink =
    permalink && !isWordPressPreviewQueryPermalink(permalink)
      ? permalink
      : plan.newUrl || permalink || undefined;

  return {
    ok: true,
    permalink: resolvedPermalink,
    slug: result.slug || plan.slug,
  };
}
