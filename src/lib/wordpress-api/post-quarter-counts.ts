import { BACKEND_API_BASE } from "./connection";
import type { QuarterEditorialCountsResult } from "./types";

export async function fetchQuarterEditorialCounts(payload: {
  siteUrl: string;
  username: string;
  appPassword: string;
  after: string;
  before: string;
  entitySitemapUrl?: string;
  manualEndpoint?: string;
}): Promise<QuarterEditorialCountsResult> {
  const url = `${BACKEND_API_BASE}/api/wordpress/get-quarter-editorial-counts`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteUrl: payload.siteUrl,
      username: payload.username,
      appPassword: payload.appPassword,
      after: payload.after,
      before: payload.before,
      entitySitemapUrl: payload.entitySitemapUrl,
      manualEndpoint: payload.manualEndpoint,
    }),
  });

  let data: QuarterEditorialCountsResult;
  try {
    data = (await response.json()) as QuarterEditorialCountsResult;
  } catch {
    data = {
      ok: false,
      postsPublished: null,
      postsScheduled: null,
      entityPublished: null,
      entityScheduled: null,
      entityConfigured: false,
      entityCountsAvailable: false,
      published: null,
      scheduled: null,
      error: `HTTP ${response.status}`,
    };
  }

  if (!response.ok || !data.ok) {
    return {
      ok: false,
      postsPublished: null,
      postsScheduled: null,
      entityPublished: null,
      entityScheduled: null,
      entityConfigured: false,
      entityCountsAvailable: false,
      published: null,
      scheduled: null,
      error: data.error || `HTTP ${response.status}`,
    };
  }

  return data;
}
