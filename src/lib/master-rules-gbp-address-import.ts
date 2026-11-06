/**
 * Import DataForSEO GMB response into Master Rules as OpenRouter nested semantic triples.
 */

import type { WordPressSite } from "@/components/integrations/types";
import { loadApiKey } from "@/lib/api";
import { parseGmbDfsBusinessInfo } from "@/lib/gmb-dfs-parse";
import {
  getMasterInstructionsPayload,
  setMasterInstructions,
  type MasterInstructionSource,
} from "@/lib/master-instructions-storage";
import { summarizeGbpContextForMasterPrompt } from "@/lib/master-instructions-openrouter-summarize";
import { fetchLocationDiscovery, type LocationDiscoveryResult } from "@/lib/fetch-location-discovery";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";

export const GBP_ADDRESS_MASTER_RULES_FILENAME = "GBP-business-gbp.txt";

export const NEO_PULSE_MASTER_INSTRUCTIONS_CHANGED_EVENT = "neo-pulse-master-instructions-changed";

export function notifyMasterInstructionsChanged(siteId: string): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(
    new CustomEvent(NEO_PULSE_MASTER_INSTRUCTIONS_CHANGED_EVENT, { detail: { siteId } }),
  );
}

export type UpsertGbpAddressInMasterRulesResult = "updated" | "skipped" | "failed";

function siteNapBlob(
  site: WordPressSite,
  extras?: { locationDiscovery?: LocationDiscoveryResult; localBusinessHint?: unknown },
): string {
  try {
    return JSON.stringify(
      {
        siteUrl: site.siteUrl,
        productionSiteUrl: site.productionSiteUrl ?? null,
        publicSiteUrl: getPublicSiteUrl(site),
        propertyDisplayName: site.name,
        napInfo: site.napInfo ?? null,
        locations: site.locations ?? null,
        homepageLocationDiscovery: extras?.locationDiscovery ?? null,
        homepageLocalBusinessHint: extras?.localBusinessHint ?? null,
      },
      null,
      2,
    );
  } catch {
    return "";
  }
}

function dfsBlobForOpenRouter(
  site: WordPressSite,
  gmbJson: unknown,
  siteUrl: string,
  keyword: string,
  extras?: { locationDiscovery?: LocationDiscoveryResult; localBusinessHint?: unknown },
): string {
  let raw = "";
  try {
    raw = JSON.stringify(gmbJson, null, 2);
  } catch {
    raw = String(gmbJson);
  }
  const cap = 90_000;
  if (raw.length > cap) raw = `${raw.slice(0, cap)}\n…`;
  const nap = siteNapBlob(site, extras);
  return [
    `Property site URL (Integrations tile): ${siteUrl}`,
    `DataForSEO keyword: ${keyword}`,
    "",
    "NEO Pulse saved NAP / locations for this property:",
    nap,
    "",
    "DataForSEO google_my_business_info response (full JSON, including empty or no-match tasks):",
    raw,
  ].join("\n");
}

export async function upsertGbpTriplesInMasterRules(
  siteId: string,
  content: string,
  originalChars: number,
): Promise<UpsertGbpAddressInMasterRulesResult> {
  if (!siteId?.trim() || !content.trim()) return "skipped";

  try {
    const existing = getMasterInstructionsPayload(siteId);
    const row: MasterInstructionSource = {
      name: GBP_ADDRESS_MASTER_RULES_FILENAME,
      content,
      uploadedAt: Date.now(),
      kind: "semantic-triples",
      originalExtractedChars: originalChars,
    };
    const withoutPrior = existing.sources.filter((s) => s.name !== GBP_ADDRESS_MASTER_RULES_FILENAME);
    await setMasterInstructions(siteId, { sources: [...withoutPrior, row] });
    notifyMasterInstructionsChanged(siteId);
    return "updated";
  } catch {
    return "failed";
  }
}

export type ImportGbpAddressFromDfsResult =
  | { ok: true; masterRules: UpsertGbpAddressInMasterRulesResult; businessName: string }
  | { ok: false; error: string };

/**
 * OpenRouter nested triples from the single DataForSEO response; always upserts (raw blob if model empty).
 */
export async function importGbpAddressFromDfsForSite(
  site: WordPressSite,
  options: {
    gmbJson: unknown;
    signal?: AbortSignal;
    openRouterApiKey?: string;
    keyword?: string;
    locationDiscovery?: LocationDiscoveryResult;
    localBusinessHint?: unknown;
  },
): Promise<ImportGbpAddressFromDfsResult> {
  const apiKey = (options?.openRouterApiKey || loadApiKey() || "").trim();
  if (!apiKey) {
    return { ok: false, error: "OpenRouter API key required. Set it in Settings." };
  }

  const siteUrl = getPublicSiteUrl(site).trim() || site.siteUrl.trim();
  const keyword = options.keyword?.trim() ?? siteUrl;
  const blob = dfsBlobForOpenRouter(site, options.gmbJson, siteUrl, keyword, {
    locationDiscovery: options.locationDiscovery,
    localBusinessHint: options.localBusinessHint,
  });
  let content = blob;
  const businessName =
    site.napInfo?.name?.trim() ||
    parseGmbDfsBusinessInfo(options.gmbJson)?.title?.trim() ||
    site.name.trim();

  try {
    const triples = await summarizeGbpContextForMasterPrompt(blob, {
      siteId: site.id,
      fileName: GBP_ADDRESS_MASTER_RULES_FILENAME,
    });
    if (triples.trim()) content = triples.trim();
  } catch {
    content = blob;
  }

  const masterRules = await upsertGbpTriplesInMasterRules(site.id, content, blob.length);
  if (masterRules === "failed") {
    return { ok: false, error: "Could not save GBP data to Master Rules." };
  }

  return { ok: true, masterRules, businessName };
}

/** @deprecated use upsertGbpTriplesInMasterRules */
export async function upsertGbpAddressContentInMasterRules(
  siteId: string,
  content: string,
): Promise<UpsertGbpAddressInMasterRulesResult> {
  return upsertGbpTriplesInMasterRules(siteId, content, content.length);
}

export type { GbpAddressMasterRulesPayload } from "@/lib/master-rules-gbp-address-openrouter";
