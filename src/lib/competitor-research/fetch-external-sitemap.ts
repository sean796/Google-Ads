import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";

export type ExternalSitemapResult = {
  urls: string[];
  sitemapUrl: string | null;
  origin: string | null;
  error?: string;
};

export async function fetchExternalSitemap(args: {
  domain?: string;
  url?: string;
  signal?: AbortSignal;
}): Promise<ExternalSitemapResult> {
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const endpoint = `${base}/api/seo/fetch-external-sitemap`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(args.domain ? { domain: args.domain } : {}),
      ...(args.url ? { url: args.url } : {}),
    }),
    signal: args.signal,
  });
  const j = (await res.json()) as ExternalSitemapResult & { error?: string };
  if (!res.ok) {
    return { urls: [], sitemapUrl: null, origin: null, error: j.error || `Sitemap fetch failed (${res.status})` };
  }
  return {
    urls: Array.isArray(j.urls) ? j.urls : [],
    sitemapUrl: j.sitemapUrl ?? null,
    origin: j.origin ?? null,
    error: j.error,
  };
}
