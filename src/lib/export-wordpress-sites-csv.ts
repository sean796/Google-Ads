import type { WordPressSite } from "@/components/integrations/types";
import {
  readSiteServiceCity,
  readSiteServiceCountry,
  readSiteServiceState,
} from "@/lib/wordpress-api/site-service-area";

function csvEscape(value: string): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const HEADERS = [
  "name",
  "siteUrl",
  "serviceCity",
  "serviceCountry",
  "serviceState",
  "productionSiteUrl",
  "username",
  "appPassword",
  "id",
  "enabled",
  "ga4PropertyId",
  "googleAdsCustomerId",
  "gbpLocationId",
  "semrushSiteAuditProjectId",
  "semrushPositionTrackingProjectId",
  "semrushPositionTrackingCampaignId",
  "editorialCountsPeriodStartYmd",
  "optimizationPackage",
  "editorialContentPackage",
  "editorialPublishTimeLocal",
  "profileTags",
  "primaryLocalKeyword",
  "slackEnabledForProperty",
  "slackChannelId",
  "slackChannelName",
  "slackConnectionStatus",
  "entitySitemapUrl",
  "mainSitemapUrl",
  "connectionStatus",
] as const;

/**
 * All WordPress sites as CSV. Bulk Import still reads name, siteUrl, username, appPassword by header.
 */
export function buildWordPressSitesCsv(sites: WordPressSite[]): string {
  const lines: string[] = [HEADERS.join(",")];
  for (const s of sites) {
    const row = [
      csvEscape(s.name),
      csvEscape(s.siteUrl),
      csvEscape(readSiteServiceCity(s)),
      csvEscape(readSiteServiceCountry(s)),
      csvEscape(readSiteServiceState(s)),
      csvEscape(s.productionSiteUrl ?? ""),
      csvEscape(s.username),
      csvEscape(s.appPassword),
      csvEscape(s.id),
      csvEscape(s.enabled === false ? "false" : "true"),
      csvEscape(s.ga4PropertyId ?? ""),
      csvEscape(s.googleAdsCustomerId ?? ""),
      csvEscape(s.gbpLocationId ?? ""),
      csvEscape(s.semrushSiteAuditProjectId ?? ""),
      csvEscape(s.semrushPositionTrackingProjectId ?? ""),
      csvEscape(s.semrushPositionTrackingCampaignId ?? ""),
      csvEscape(s.editorialCountsPeriodStartYmd ?? ""),
      csvEscape(s.optimizationPackage ?? ""),
      csvEscape(s.editorialContentPackage ?? ""),
      csvEscape(s.editorialPublishTimeLocal ?? ""),
      csvEscape((s.profileTags ?? []).join(";")),
      csvEscape(s.primaryLocalKeyword ?? ""),
      csvEscape(s.slackEnabledForProperty === false ? "false" : "true"),
      csvEscape(s.slackChannelId ?? ""),
      csvEscape(s.slackChannelName ?? ""),
      csvEscape(s.slackConnectionStatus ?? ""),
      csvEscape(s.entitySitemapUrl ?? ""),
      csvEscape(s.sitemaps?.mainSitemapUrl ?? ""),
      csvEscape(s.connectionStatus ?? ""),
    ];
    lines.push(row.join(","));
  }
  return lines.join("\r\n");
}

/** UTF-8 with BOM for Excel and similar apps. */
export function buildWordPressSitesCsvForDownload(sites: WordPressSite[]): string {
  return `\uFEFF${buildWordPressSitesCsv(sites)}`;
}
