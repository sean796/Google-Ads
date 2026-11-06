import { BACKEND_API_BASE, BACKEND_CONNECTION_ERROR } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { formatGscResolutionError } from "@/lib/wordpress-api/gsc";
import type { PageIndexingReport, PageIndexingReportParams } from "@/lib/organic-dashboard/page-indexing-report-types";

export async function fetchPageIndexingReport(
  params: PageIndexingReportParams,
  signal?: AbortSignal,
): Promise<PageIndexingReport> {
  const url = `${BACKEND_API_BASE}/api/gsc/page-indexing-report`;

  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl: params.siteUrl,
        sitemapUrl: params.sitemapUrl,
        username: params.username,
        appPassword: params.appPassword,
        maxUrls: params.maxUrls ?? 40,
      }),
      signal,
    });

    const text = await response.text();
    let data: PageIndexingReport & { error?: string; message?: string };
    try {
      data = JSON.parse(text) as PageIndexingReport & { error?: string; message?: string };
    } catch {
      throw new Error(text || `HTTP ${response.status}`);
    }

    if (!response.ok) {
      throw new Error(
        formatGscResolutionError(
          data as Parameters<typeof formatGscResolutionError>[0],
          response.status,
        ),
      );
    }

    if (!data.success) {
      throw new Error(data.error || data.message || "Page indexing report failed");
    }

    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    throw error;
  }
}
