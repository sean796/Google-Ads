import type { QueryFanoutSerpRow, SerpOrganicTopEntry } from "@/lib/overview-seo-content-brief";
import { extractDataForSeoSerpBrief } from "@/lib/overview-seo-content-brief";

const PROVINCE_OFFICIAL_DOMAINS: Record<string, string[]> = {
  AB: ["alberta.ca", "gov.ab.ca", "efficiencyalberta.ca"],
  BC: ["gov.bc.ca"],
  ON: ["ontario.ca", "gov.on.ca"],
  SK: ["saskatchewan.ca"],
  MB: ["gov.mb.ca"],
  QC: ["quebec.ca", "gouv.qc.ca"],
};

const BASE_OFFICIAL_DOMAIN_SUFFIXES = ["canada.ca", "gc.ca"];

export function officialDomainsForLocation(location: string): string[] {
  const upper = location.trim().toUpperCase();
  const domains = [...BASE_OFFICIAL_DOMAIN_SUFFIXES];
  const provMatch = upper.match(/,\s*(AB|BC|ON|SK|MB|QC|NL|NB|NS|PE|YT|NT|NU)\b/);
  if (provMatch?.[1]) {
    domains.push(...(PROVINCE_OFFICIAL_DOMAINS[provMatch[1]] ?? []));
  }
  return domains;
}

export function isOfficialDomain(domain: string, preferDomains: string[], location: string): boolean {
  const d = domain.trim().toLowerCase();
  if (!d) return false;
  const candidates = [
    ...preferDomains.map((x) => x.trim().toLowerCase()).filter(Boolean),
    ...officialDomainsForLocation(location).map((x) => x.toLowerCase()),
  ];
  return candidates.some(
    (suffix) => d === suffix || d.endsWith(`.${suffix}`) || d.endsWith(suffix),
  );
}

export function pickOfficialOrganicResult(
  organicTop: SerpOrganicTopEntry[],
  preferDomains: string[],
  location: string,
): SerpOrganicTopEntry | undefined {
  for (const entry of organicTop) {
    const domain = entry.domain?.trim() ?? "";
    if (domain && isOfficialDomain(domain, preferDomains, location)) return entry;
    const url = entry.url?.trim() ?? "";
    if (url) {
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        if (isOfficialDomain(host, preferDomains, location)) return { ...entry, domain: host };
      } catch {
        // skip invalid URL
      }
    }
  }
  return undefined;
}

export function organicTopFromSerpDump(serpDumpJson: Record<string, unknown>): SerpOrganicTopEntry[] {
  const extracted = extractDataForSeoSerpBrief(serpDumpJson);
  return extracted.organic.map((o) => ({
    domain: o.domain,
    url: o.url,
    title: o.title,
    description: o.description,
  }));
}

export function serpRowFromDump(query: string, serpDumpJson: Record<string, unknown>): QueryFanoutSerpRow {
  const extracted = extractDataForSeoSerpBrief(serpDumpJson);
  const organicTop = organicTopFromSerpDump(serpDumpJson);
  return {
    query,
    organicTop,
    organicTitles: organicTop.map((o) => o.title).filter((t): t is string => Boolean(t)),
    paa: extracted.peopleAlsoAsk.map((p) => p.question).filter(Boolean),
  };
}

