import type { WordPressSite } from "@/components/integrations/types";
import { siteHostLabel } from "./wp-engine-install-defaults";

type SemrushProjectDefault = {
  projectId: string;
  tracking: boolean;
  /** Semrush SEO project dashboard folder id (`fid` query param). */
  folderId?: string;
  /** Position Tracking campaign id (`{projectId}_{campaignNumericId}`). */
  positionTrackingCampaignId?: string;
};

/** Semrush SEO project dashboard (Position Tracking / Site Audit hub). */
export function semrushSeoProjectDashboardUrl(projectId: string, folderId?: string): string {
  const id = projectId.trim();
  if (!id) return "";
  const base = `https://www.semrush.com/seo/${encodeURIComponent(id)}/`;
  const fid = folderId?.trim();
  return fid ? `${base}?fid=${encodeURIComponent(fid)}` : base;
}

/** First hostname label (www stripped) -> Semrush project, from the account's project list (Oct 2026). */
export const SEMRUSH_PROJECT_BY_HOST_LABEL: Record<string, SemrushProjectDefault> = {
  advanceblindsanddrapery: { projectId: "28186948", tracking: true },
  blindmagic: { projectId: "25751625", tracking: true },
  blindswest: { projectId: "28186941", tracking: true },
  dminteriorsanddesign: { projectId: "28186952", tracking: true },
  intheshadeflorida: {
    projectId: "25786226",
    tracking: true,
    folderId: "8251906",
    positionTrackingCampaignId: "25786226_8251906",
  },
  interiorsbylaura: {
    projectId: "29036845",
    tracking: true,
    folderId: "11197899",
    positionTrackingCampaignId: "29036845_11197899",
  },
  lindseyblindsetc: { projectId: "31184849", tracking: true },
  neodigital: { projectId: "28187066", tracking: true },
  superiorblinds: { projectId: "26161179", tracking: true },
  kwbllp: { projectId: "28880203", tracking: false },
  phoenixpainting: { projectId: "28187169", tracking: false },
  "posh-outdoors": { projectId: "28187201", tracking: false },
  shutterspot: { projectId: "29672034", tracking: false },
  superiortentrentals: { projectId: "28187005", tracking: false },
  tailoredinteriors: { projectId: "29672799", tracking: false },
  youjunkit: { projectId: "28186981", tracking: false },
};

/** Fill Semrush Site Audit project ID (and Position Tracking project ID when tracking is on); never overwrites. */
export function applySemrushProjectDefaults(site: WordPressSite): WordPressSite {
  const row = SEMRUSH_PROJECT_BY_HOST_LABEL[siteHostLabel(site)];
  if (!row) return site;
  let next = site;
  if (!site.semrushSiteAuditProjectId?.trim()) {
    next = { ...next, semrushSiteAuditProjectId: row.projectId };
  }
  if (row.tracking && !site.semrushPositionTrackingProjectId?.trim()) {
    next = { ...next, semrushPositionTrackingProjectId: row.projectId };
  }
  if (row.positionTrackingCampaignId && !site.semrushPositionTrackingCampaignId?.trim()) {
    next = { ...next, semrushPositionTrackingCampaignId: row.positionTrackingCampaignId };
  }
  return next;
}

/** Resolved Semrush SEO project id for API requests (site field or host default). */
export function resolveSemrushProjectIdForSite(site: WordPressSite): string {
  const fromSite =
    site.semrushSiteAuditProjectId?.trim() ||
    site.semrushPositionTrackingProjectId?.trim() ||
    "";
  if (fromSite) return fromSite;
  const row = SEMRUSH_PROJECT_BY_HOST_LABEL[siteHostLabel(site)];
  return row?.projectId?.trim() ?? "";
}

export function resolveSemrushProjectDashboardUrlForSite(site: WordPressSite): string {
  const projectId = resolveSemrushProjectIdForSite(site);
  if (!projectId) return "";
  const row = SEMRUSH_PROJECT_BY_HOST_LABEL[siteHostLabel(site)];
  return semrushSeoProjectDashboardUrl(projectId, row?.folderId);
}
