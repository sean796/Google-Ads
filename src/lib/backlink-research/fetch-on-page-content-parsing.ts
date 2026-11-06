/**
 * DataForSEO On-Page Content Parsing (live) - fetch parsed page body for a URL.
 */

import { resolveMcpApiBase } from "@/lib/mcp-tools";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";

export async function fetchOnPageContentParsing(args: {
  url: string;
  enableJavascript?: boolean;
  acceptLanguage?: string;
  signal?: AbortSignal;
}): Promise<unknown> {
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const endpoint = `${base}/DataForSEO_on_page_content_parsing`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: args.url,
      enable_javascript: args.enableJavascript === true,
      accept_language: args.acceptLanguage ?? "en",
    }),
    signal: args.signal,
  });
  const j = (await res.json()) as { error?: string };
  if (!res.ok) {
    throw new Error(j.error || `On-page content parsing failed (${res.status})`);
  }
  return j;
}
