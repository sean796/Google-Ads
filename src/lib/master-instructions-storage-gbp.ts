import { getMasterInstructionsPayload } from "@/lib/master-instructions-storage-core";
import type { GbpMasterRulesGrounding } from "@/lib/master-instructions-storage-types";
import {
  findGbpMasterRulesSource,
  groundingFromParsed,
  groundingFromParsedAllowMissingName,
  parseGbpTriplesBody,
} from "@/lib/master-instructions-storage-gbp-parse";

export function gbpGroundingFailureReason(siteId: string | undefined | null): string {
  const { sources } = getMasterInstructionsPayload(siteId);
  const gbp = findGbpMasterRulesSource(sources);
  if (!gbp) {
    return `No GBP-business-gbp.txt on this property (${sources.length} Master Rules file(s)).`;
  }
  const parsed = parseGbpTriplesBody(gbp.content);
  const missing: string[] = [];
  if (parsed.latitude == null || parsed.longitude == null) missing.push("latitude/longitude");
  if (!parsed.businessName.trim()) missing.push("business name");
  if (missing.length === 0) return `GBP-business-gbp.txt found (${gbp.content.length} chars) but could not build grounding.`;
  return `GBP-business-gbp.txt found (${gbp.content.length} chars) but missing ${missing.join(" and ")}.`;
}

/** GBP name + coordinates from Master Rules `GBP-business-gbp.txt` (no live DataForSEO). */
export function gbpGroundingFromMasterInstructions(
  siteId: string | undefined | null,
): GbpMasterRulesGrounding | null {
  const { sources } = getMasterInstructionsPayload(siteId);
  const gbpFile = findGbpMasterRulesSource(sources);
  const ordered = gbpFile
    ? [gbpFile]
    : [
        ...sources.filter((s) => s.kind === "gbp-address-json"),
        ...sources.filter((s) => s.kind === "semantic-triples"),
      ];

  for (const s of ordered) {
    const body = s.content.trim();
    if (!body) continue;

    if (s.kind === "gbp-address-json") {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        const businessName =
          (typeof parsed.businessName === "string" && parsed.businessName.trim()) ||
          (typeof parsed.name === "string" && parsed.name.trim()) ||
          "";
        const latitude =
          typeof parsed.latitude === "number"
            ? parsed.latitude
            : typeof parsed.lat === "number"
              ? parsed.lat
              : null;
        const longitude =
          typeof parsed.longitude === "number"
            ? parsed.longitude
            : typeof parsed.lng === "number"
              ? parsed.lng
              : null;
        const hit = groundingFromParsed({
          businessName,
          latitude,
          longitude,
          placeId: typeof parsed.placeId === "string" ? parsed.placeId.trim() : null,
          cid: parsed.cid != null ? String(parsed.cid).trim() : null,
          city: typeof parsed.city === "string" ? parsed.city.trim() : "",
          region: typeof parsed.region === "string" ? parsed.region.trim() : "",
          postalCode: typeof parsed.postalCode === "string" ? parsed.postalCode.trim() : "",
          address:
            (typeof parsed.formattedAddress === "string" && parsed.formattedAddress.trim()) ||
            (typeof parsed.address === "string" && parsed.address.trim()) ||
            "",
        });
        if (hit) return hit;
      } catch {
        /* try triples below */
      }
    }

    const triples = parseGbpTriplesBody(body);
    const hit = groundingFromParsed(triples);
    if (hit) return hit;
  }

  return null;
}

/** Coords from Master Rules; business name may be filled by caller from NAP. */
export function gbpCoordsFromMasterInstructions(
  siteId: string | undefined | null,
): Pick<GbpMasterRulesGrounding, "latitude" | "longitude" | "placeId" | "cid" | "businessName"> | null {
  const { sources } = getMasterInstructionsPayload(siteId);
  const gbpFile = findGbpMasterRulesSource(sources);
  if (!gbpFile) return null;
  return groundingFromParsedAllowMissingName(parseGbpTriplesBody(gbpFile.content));
}
