import type { VerifiedFact } from "@/lib/overview-seo-content-brief";


export function formatVerifiedFactsPromptBlock(
  facts: VerifiedFact[] | undefined,
  researchAsOf?: string,
): string {
  const rows = facts ?? [];
  const asOf = researchAsOf?.trim() || rows[0]?.asOf?.trim() || "";
  if (!rows.length) {
    return [
      "--- VERIFIED FACTS (SOURCE OF TRUTH — NON-NEGOTIABLE) ---",
      asOf ? `Research as of: ${asOf}` : "",
      "No confirmed official figures were extracted for this run.",
      "Do not invent numbers or copy stale figures from existing page HTML.",
      "Tier 2 only: illustrative economic bands from FIRST-PARTY CLAIMS or QFO when sourced.",
      "Otherwise use qualitative mechanism wording until a source is confirmed.",
      "--- END VERIFIED FACTS ---",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const confirmed = rows.filter((f) => f.status === "confirmed" && f.fact.trim());
  const contradicted = rows.filter((f) => f.status === "contradicted" && f.fact.trim());
  const notFound = rows.filter((f) => f.status === "not_found");

  const lines = [
    "--- VERIFIED FACTS (SOURCE OF TRUTH — NON-NEGOTIABLE) ---",
    asOf ? `Research as of: ${asOf}` : "",
    "",
    "PUBLISH RULE: Keep specificity when defensible. Use CONFIRMED figures prominently. Swap CONTRADICTED stale page figures for official current facts. For NOT FOUND, use Tier 2 illustrative band from FIRST-PARTY CLAIMS if present, else drivers only for that claim.",
  ];

  if (confirmed.length) {
    lines.push("", "CONFIRMED (publish prominently in matching H2 + Answer when relevant):");
    for (const f of confirmed) {
      lines.push(
        `- ${f.claimLabel}: ${f.fact.trim()} (source: ${f.sourceDomain || f.sourceUrl})`,
      );
    }
  }

  if (contradicted.length) {
    lines.push("", "CONTRADICTED (replace stale page claim with official current fact):");
    for (const f of contradicted) {
      lines.push(`- ${f.claimLabel}: official source says: ${f.fact.trim()}`);
    }
  }

  if (notFound.length) {
    lines.push(
      "",
      "NOT FOUND (do not copy stale excerpt number; Tier 2 illustrative band from FIRST-PARTY if available, else drivers only):",
    );
    for (const f of notFound) {
      lines.push(`- ${f.claimLabel}`);
    }
  }

  if (confirmed.filter((f) => /cost|payback|rate|kwh|savings|roi|\$|cad|export/i.test(f.claimLabel)).length >= 2) {
    lines.push(
      "",
      "NUMERIC DENSITY: At least two confirmed economic figures above must appear in cost/ROI/savings sections with units and CAD.",
    );
  }

  lines.push("--- END VERIFIED FACTS ---");
  return lines.join("\n");
}

export const PHRASE_VARIATION_RULE = `**PHRASE VARIATION (MANDATORY)**: Do not repeat the same sentence stem in adjacent paragraphs. Do not repeat the exact primary keyword phrase in consecutive paragraphs — use semantic variants instead. Forbidden stacked openers: "{keyword} offers", "{keyword} provides", "{keyword} involve", "{keyword} systems". Forbidden local stacks: "{keyword} {neighborhood} {city}" repeated as an SEO slug; prefer "homeowners in {neighborhood}, {city}" once entity/location is established. Vary the first clause of each paragraph. Site-first: prefer named products, mount types, room constraints, and sourced numbers over generic publisher phrasing. Unique wording every time is not required; repeating the same opener family across posts on this site is forbidden.`;

export const SERVICE_AREA_DENSITY_RULE = `**SERVICE AREA DENSITY (MANDATORY)**: In each section you write, use the exact service city or region name at most **2 times** total (city + province/state counts as one mention). Prefer "local", "regional", "area", or "homeowners here" for the rest. Never stack the city in consecutive sentences. When a place entity (street, neighborhood, district, landmark) is present, exact entity name at most **once per body H2** (skip if the prior H2 already used it); article-wide at most **~3** exact mentions in prose (Answer may use it once). After the first mention prefer here / this area / local. Place entity is a location modifier, not the topic. See A+ KEYWORD AUTHORITY.`;

