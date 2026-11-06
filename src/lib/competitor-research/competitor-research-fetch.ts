import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import type { CompetitorResearchSemrushResponse } from "@/lib/competitor-research/types";
import { fetchCompetitorResearchSemrush, fetchManualCompetitorDomain } from "@/lib/competitor-research/competitor-semrush-client";

export async function fetchCompetitorResearchForTab(options: {
  semrushEnhanced: boolean;
  siteUrl: string;
  portfolioBlockedHosts?: string[];
  displayLimit?: number;
  enrichmentLimit?: number;
}): Promise<CompetitorResearchSemrushResponse> {
  if (options.semrushEnhanced) {
    return fetchCompetitorResearchSemrush({
      siteUrl: options.siteUrl,
      portfolioBlockedHosts: options.portfolioBlockedHosts,
      displayLimit: options.displayLimit,
      enrichmentLimit: options.enrichmentLimit,
    });
  }
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const url = `${base}/api/dataforseo/competitor-research`;
  const res = await fetch(url, {
    method: "POST",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      siteUrl: options.siteUrl ?? "",
      portfolioBlockedHosts: options.portfolioBlockedHosts,
      displayLimit: options.displayLimit,
      enrichmentLimit: options.enrichmentLimit,
    }),
  });
  const j = (await res.json()) as { error?: string } & CompetitorResearchSemrushResponse;
  if (!res.ok) {
    throw new Error(j.error || `DataForSEO competitor request failed (${res.status})`);
  }
  return j;
}

export async function fetchManualCompetitorDomainForTab(options: {
  semrushEnhanced: boolean;
  domain: string;
  siteUrl?: string;
  database?: string;
}): Promise<{
  row: import("@/lib/competitor-research/types").SemrushCompetitorRow;
  enrichment: import("@/lib/competitor-research/types").CompetitorDomainEnrichment;
  domainOrganicCsv: string;
  errors?: { step: string; message: string }[];
}> {
  if (options.semrushEnhanced) {
    return fetchManualCompetitorDomain({
      domain: options.domain,
      siteUrl: options.siteUrl,
      database: options.database,
    });
  }
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const url = `${base}/api/dataforseo/competitor-research/manual-domain`;
  const res = await fetch(url, {
    method: "POST",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      domain: options.domain.trim(),
      siteUrl: options.siteUrl ?? "",
    }),
  });
  const j = (await res.json()) as {
    error?: string;
    row?: import("@/lib/competitor-research/types").SemrushCompetitorRow;
    enrichment?: import("@/lib/competitor-research/types").CompetitorDomainEnrichment;
    domainOrganicCsv?: string;
    errors?: { step: string; message: string }[];
  };
  if (!res.ok || !j.row || !j.enrichment) {
    const d = options.domain.trim();
    const baseErr = j.error || `DataForSEO manual competitor request failed (${res.status})`;
    throw new Error(`${baseErr}${d ? ` - ${d}` : ""}`);
  }
  const domainOrganicCsv = typeof j.domainOrganicCsv === "string" ? j.domainOrganicCsv : "";
  return {
    row: j.row,
    enrichment: j.enrichment,
    domainOrganicCsv,
    errors: j.errors,
  };
}
