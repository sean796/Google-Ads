import { getMasterInstructionsPayload } from "@/lib/master-instructions-storage-core";
import {
  MASTER_RULES_CITY_PREDICATES,
  MASTER_RULES_REGION_PREDICATES,
  firstTripleObjectValue,
} from "@/lib/master-instructions-storage-gbp-parse";

/** Best-effort city/region from saved Master Rules (GBP triples or gbp-address-json). */
export function cityRegionFromMasterInstructions(
  siteId: string | undefined | null,
): { city: string; region: string } {
  const { sources } = getMasterInstructionsPayload(siteId);
  for (const s of sources) {
    if (s.kind !== "gbp-address-json") continue;
    try {
      const parsed = JSON.parse(s.content.trim()) as Record<string, unknown>;
      const city = typeof parsed.city === "string" ? parsed.city.trim() : "";
      const region = typeof parsed.region === "string" ? parsed.region.trim() : "";
      if (city) return { city, region };
    } catch {
      /* ignore */
    }
  }

  let city = "";
  let region = "";
  for (const s of sources) {
    const body = s.content.trim();
    if (!body) continue;
    for (const line of body.split(/\r?\n/)) {
      const tab = line.indexOf("\t");
      if (tab < 0) continue;
      const pred = line.slice(0, tab).trim().toLowerCase();
      const obj = firstTripleObjectValue(line.slice(tab + 1));
      if (!obj) continue;
      if (!city && MASTER_RULES_CITY_PREDICATES.has(pred)) city = obj;
      if (!region && MASTER_RULES_REGION_PREDICATES.has(pred)) region = obj;
    }
    if (city) break;
  }
  return { city, region };
}
