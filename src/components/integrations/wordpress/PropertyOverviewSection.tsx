import { StatCell } from "@/components/hosting/site-profile/SiteOverviewSection";
import { PROFILE_CARD, PROFILE_CARD_HEAD, PROFILE_CARD_TITLE, PROFILE_STAT_GRID } from "@/components/hosting/site-profile/site-profile-theme";
import type { WordPressSite } from "../types";
import { isWpEngineHosted, propertyHostingLabel, propertyHostingNote, propertyWpEngineInstall } from "./property-profile-view-model";
import { WordPressCardActions } from "./WordPressCardActions";
import {
  editorialContentPackageShortLabelForSite,
  editorialQuotasForSite,
} from "@/lib/editorial-content-package";
import {
  readSiteLocationsList,
  readSiteServiceCity,
  readSiteServiceState,
} from "@/lib/wordpress-api/site-service-area";

export type PropertyOverviewSectionProps = {
  site: WordPressSite;
  isTesting: boolean;
  isDetecting: boolean;
  isExtractingNAPAndGraph: boolean;
  onTest: () => void;
  onDetect: () => void;
  onExtractNAPAndGraph?: () => void;
  onPatchSite?: (siteId: string, patch: Partial<WordPressSite>) => void;
};

function sitemapStat(site: WordPressSite): { value: string; note: string } {
  if (!site.sitemaps) return { value: "0", note: "Not detected" };
  if (site.sitemaps.type === "index") {
    const n = site.sitemaps.childSitemaps?.length ?? 0;
    return { value: String(n), note: n === 1 ? "child sitemap" : "child sitemaps" };
  }
  const n = site.sitemaps.urls?.length ?? 0;
  return { value: String(n), note: n === 1 ? "URL" : "URLs" };
}

function integrationStat(id: string | undefined): { value: string; note: string } {
  const trimmed = id?.trim() ?? "";
  return trimmed ? { value: "Configured", note: trimmed } : { value: "Not set", note: "" };
}

export function PropertyOverviewSection({ site, isTesting, isDetecting, isExtractingNAPAndGraph, onTest, onDetect, onExtractNAPAndGraph, onPatchSite }: PropertyOverviewSectionProps) {
  const sitemaps = sitemapStat(site);
  const scheduled = site.scheduledPosts;
  const ga4 = integrationStat(site.ga4PropertyId);
  const ads = integrationStat(site.googleAdsCustomerId);
  const gbp = integrationStat(site.gbpLocationId);
  const semrush = integrationStat(site.semrushSiteAuditProjectId ?? site.semrushPositionTrackingProjectId);
  const editorialTier = editorialContentPackageShortLabelForSite(site);
  const editorialQuotas = editorialQuotasForSite(site);
  const editorialNote = editorialQuotas
    ? `${editorialQuotas.blogsPerMonth} blogs, ${editorialQuotas.sapsPerMonth} SAP per month`
    : "";
  const wpEngineAccountId = site.wpEngineAccountId?.trim() ?? "";
  const wpEngine = wpEngineAccountId
    ? { value: propertyWpEngineInstall(site) || "Configured", note: wpEngineAccountId }
    : { value: "Not set", note: "" };
  const primaryKeyword = site.primaryLocalKeyword?.trim() ?? "";
  const allLocations = readSiteLocationsList(site);
  const primaryCity = readSiteServiceCity(site);
  const primaryState = readSiteServiceState(site);
  const primaryLocLabel = [primaryCity, primaryState].filter(Boolean).join(", ");
  const extraLocations = allLocations
    .slice(1)
    .map((l) => [l.city?.trim(), l.state?.trim()].filter(Boolean).join(", "))
    .filter(Boolean);
  const locationsNote =
    extraLocations.length > 0
      ? `+${extraLocations.length} more: ${extraLocations.join(" | ")}`
      : primaryLocLabel
        ? "Primary location"
        : "Set in Settings -> Profile";

  return (
    <div className="flex flex-col gap-5">
      <section className={PROFILE_CARD} aria-label="Connection">
        <div className={PROFILE_CARD_HEAD}>
          <h2 className={PROFILE_CARD_TITLE}>Connection</h2>
        </div>
        <div className={`${PROFILE_STAT_GRID} grid-cols-2 sm:grid-cols-3 xl:grid-cols-7`}>
          <StatCell
            label="WordPress"
            value={propertyHostingLabel(site)}
            note={propertyHostingNote(site)}
            tone={isWpEngineHosted(site) || site.connectionStatus === "success" ? "ok" : site.connectionStatus === "failed" ? "warn" : undefined}
          />
          <StatCell label="Sitemaps" value={sitemaps.value} note={sitemaps.note} />
          <StatCell label="Scheduled" value={scheduled ? String(scheduled.count) : "0"} note={scheduled ? (scheduled.count === 1 ? "post" : "posts") : "Not loaded"} />
          <StatCell
            label="Editorial"
            value={editorialTier ?? "Not set"}
            note={editorialNote}
          />
          <StatCell
            label="Primary keyword"
            value={primaryKeyword || "Not set"}
            note={primaryKeyword ? "Local Grid default" : "Set in Settings -> Profile"}
          />
          <StatCell
            label="Locations"
            value={primaryLocLabel || "Not set"}
            note={locationsNote}
          />
          <StatCell label="Property" value={site.enabled === false ? "Disabled" : "Enabled"} note={site.optimizationPackage ? `${site.optimizationPackage} package` : "No package"} />
        </div>
      </section>

      <section className={PROFILE_CARD} aria-label="Integrations">
        <div className={PROFILE_CARD_HEAD}>
          <h2 className={PROFILE_CARD_TITLE}>Integrations</h2>
        </div>
        <div className={`${PROFILE_STAT_GRID} grid-cols-5`}>
          <StatCell label="GA4" value={ga4.value} note={ga4.note} />
          <StatCell label="Google Ads" value={ads.value} note={ads.note} />
          <StatCell label="GBP" value={gbp.value} note={gbp.note} />
          <StatCell label="Semrush" value={semrush.value} note={semrush.note} />
          <StatCell label="WP Engine" value={wpEngine.value} note={wpEngine.note} />
        </div>
      </section>

      <WordPressCardActions
        site={site}
        isTesting={isTesting}
        isDetecting={isDetecting}
        isExtractingNAPAndGraph={isExtractingNAPAndGraph}
        onTest={onTest}
        onDetect={onDetect}
        onExtractNAPAndGraph={onExtractNAPAndGraph}
        onPatchSite={onPatchSite}
        tone="propertyBlack"
        layout="profileCard"
      />
    </div>
  );
}
