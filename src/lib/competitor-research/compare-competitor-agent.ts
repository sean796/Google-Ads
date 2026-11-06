import { callOpenRouterJsonObject } from "@/lib/competitor-research/competitor-openrouter-json-object";
import type {
  CompetitorComparisonResult,
  CompetitorSiteProfile,
  ConnectedSiteProfile,
  FeatureBenefitRow,
  ServiceComparisonRow,
} from "@/lib/competitor-research/types";

const COMPARE_SYSTEM = `You are a neutral local-market comparison analyst for SEO content planning.

Output ONLY valid JSON:
{
  "serviceComparison": [
    { "service": "...", "competitorNotes": "...", "marketNotes": "...", "connectedSiteOffers": true|false }
  ],
  "featureBenefitTable": [
    { "feature": "...", "typicalApproach": "...", "practicalBenefit": "..." }
  ],
  "positioningNotes": "..."
}

Tone rules (mandatory):
- NEVER say the connected site is "best", "#1", "better than", or superior to competitors
- Use neutral framing: "compare options", "what to consider", "feature snapshot"
- featureBenefitTable rows should highlight practical buyer considerations; connected-site strengths may appear as factual offerings in typicalApproach or practicalBenefit without superlatives
- serviceComparison competitorNotes describe what the named competitor appears to offer (factual, not disparaging)
- marketNotes describe what buyers often look for in this category
- connectedSiteOffers is boolean only
- Do not use em dash characters
- Max 8 serviceComparison rows and 6 featureBenefitTable rows`;

export async function runCompareCompetitorAgent(args: {
  apiKey: string;
  model: string;
  keyword: string;
  promptModifier?: string;
  connected: ConnectedSiteProfile;
  competitor: CompetitorSiteProfile;
  signal?: AbortSignal;
}): Promise<CompetitorComparisonResult> {
  const payload = {
    keyword: args.keyword,
    promptModifier: args.promptModifier?.trim() || undefined,
    connectedSite: {
      name: args.connected.siteName,
      url: args.connected.siteUrl,
      services: args.connected.services,
      metaPatterns: args.connected.metaPatterns,
      samplePages: args.connected.samplePages.slice(0, 6),
    },
    competitor: {
      businessName: args.competitor.businessName,
      domain: args.competitor.domain,
      services: args.competitor.services,
      categories: args.competitor.categories,
      metaPatterns: args.competitor.metaPatterns,
      topPages: args.competitor.topPages.slice(0, 6).map((p) => ({
        url: p.url,
        title: p.title,
        metaDescription: p.metaDescription,
      })),
    },
  };

  const parsedRaw = await callOpenRouterJsonObject({
    apiKey: args.apiKey,
    model: args.model,
    system: COMPARE_SYSTEM,
    user: JSON.stringify(payload),
    maxTokens: 4096,
    temperature: 0.25,
    signal: args.signal,
  });

  const parsed = parsedRaw as {
    serviceComparison?: unknown;
    featureBenefitTable?: unknown;
    positioningNotes?: unknown;
  };

  const serviceComparison: ServiceComparisonRow[] = Array.isArray(parsed.serviceComparison)
    ? parsed.serviceComparison
        .map((row): ServiceComparisonRow | null => {
          if (!row || typeof row !== "object") return null;
          const r = row as Record<string, unknown>;
          const service = String(r.service ?? "").trim();
          if (!service) return null;
          return {
            service,
            competitorNotes: String(r.competitorNotes ?? "").trim(),
            marketNotes: String(r.marketNotes ?? "").trim(),
            connectedSiteOffers: Boolean(r.connectedSiteOffers),
          };
        })
        .filter((row): row is ServiceComparisonRow => row !== null)
        .slice(0, 8)
    : [];

  const featureBenefitTable: FeatureBenefitRow[] = Array.isArray(parsed.featureBenefitTable)
    ? parsed.featureBenefitTable
        .map((row): FeatureBenefitRow | null => {
          if (!row || typeof row !== "object") return null;
          const r = row as Record<string, unknown>;
          const feature = String(r.feature ?? "").trim();
          if (!feature) return null;
          return {
            feature,
            typicalApproach: String(r.typicalApproach ?? "").trim(),
            practicalBenefit: String(r.practicalBenefit ?? "").trim(),
          };
        })
        .filter((row): row is FeatureBenefitRow => row !== null)
        .slice(0, 6)
    : [];

  return {
    serviceComparison,
    featureBenefitTable,
    positioningNotes: String(parsed.positioningNotes ?? "").trim(),
  };
}

export function buildModifierFromComparison(comparison: CompetitorComparisonResult): string {
  return JSON.stringify({
    serviceComparison: comparison.serviceComparison,
    featureBenefitTable: comparison.featureBenefitTable,
    positioningNotes: comparison.positioningNotes,
  });
}
