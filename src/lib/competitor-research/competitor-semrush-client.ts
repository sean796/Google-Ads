import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import type {
  CompetitorDomainEnrichment,
  CompetitorResearchSemrushResponse,
  SemrushCompetitorRow,
} from "@/lib/competitor-research/types";

export async function fetchCompetitorResearchSemrush(options: {
  siteUrl: string;
  database?: string;
  displayLimit?: number;
  /** Cap domains that receive domain_organic keyword enrichment (server default 15). */
  enrichmentLimit?: number;
  portfolioBlockedHosts?: string[];
}): Promise<CompetitorResearchSemrushResponse> {
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const url = `${base}/api/semrush/competitor-research`;
  const res = await fetch(url, {
    method: "POST",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      siteUrl: options.siteUrl ?? "",
      database: options.database,
      displayLimit: options.displayLimit,
      enrichmentLimit: options.enrichmentLimit,
      portfolioBlockedHosts: options.portfolioBlockedHosts,
    }),
  });
  const j = (await res.json()) as { error?: string } & CompetitorResearchSemrushResponse;
  if (!res.ok) {
    throw new Error(j.error || `Semrush competitor request failed (${res.status})`);
  }
  return j;
}

export async function fetchManualCompetitorDomain(options: {
  domain: string;
  /** Seed site URL - server picks Semrush regional DB from hostname when database is omitted. */
  siteUrl?: string;
  database?: string;
}): Promise<{
  row: SemrushCompetitorRow;
  enrichment: CompetitorDomainEnrichment;
  /** Semrush `domain_organic` top phrases as CSV (server). */
  domainOrganicCsv: string;
  errors?: { step: string; message: string }[];
}> {
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const url = `${base}/api/semrush/competitor-research/manual-domain`;
  const res = await fetch(url, {
    method: "POST",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      domain: options.domain.trim(),
      siteUrl: options.siteUrl ?? "",
      database: options.database,
    }),
  });
  const j = (await res.json()) as {
    error?: string;
    row?: SemrushCompetitorRow;
    enrichment?: CompetitorDomainEnrichment;
    domainOrganicCsv?: string;
    errors?: { step: string; message: string }[];
  };
  if (!res.ok || !j.row || !j.enrichment) {
    const d = options.domain.trim();
    const base = j.error || `Manual competitor request failed (${res.status})`;
    throw new Error(`${base}${d ? ` - ${d}` : ""}`);
  }
  const domainOrganicCsv =
    typeof j.domainOrganicCsv === "string" ? j.domainOrganicCsv : "";
  return { row: j.row, enrichment: j.enrichment, domainOrganicCsv, errors: j.errors };
}
