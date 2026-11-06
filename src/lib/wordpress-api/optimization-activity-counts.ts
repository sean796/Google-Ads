import { BACKEND_API_BASE } from "./connection";
import type { OptimizationActivityCountsResult } from "./types";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export async function fetchOptimizationActivityCounts(payload: {
  siteUrl: string;
  username: string;
  appPassword: string;
  after: string;
  before: string;
  entitySitemapUrl?: string;
  manualEndpoint?: string;
}): Promise<OptimizationActivityCountsResult> {
  const url = `${BACKEND_API_BASE}/api/wordpress/get-optimization-activity-counts`;

  const response = await fetch(url, {
    method: "POST",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
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

  const data = (await response.json()) as OptimizationActivityCountsResult;

  if (!response.ok) {
    return {
      ok: false,
      postsOptimized: null,
      pagesOptimized: null,
      entityOptimized: null,
      entityConfigured: false,
      entityCountsAvailable: false,
      totalOptimized: null,
      error: data.error || `HTTP ${response.status}`,
    };
  }

  return data;
}
