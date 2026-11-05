import { ChevronLeft, ExternalLink, Tag } from "lucide-react";
import { MY_SITES_LINK, MY_SITES_TOOL_BTN } from "@/components/hosting/my-sites/my-sites-theme";
import { PROFILE_META_BAND, PROFILE_TITLE_BAND } from "@/components/hosting/site-profile/site-profile-theme";
import { wordpressSiteDisplayName } from "@/lib/wordpress-site-display-name";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import type { WordPressSite } from "../types";
import { formatLastTested, isWpEngineHosted, propertyConnectionTone, propertyWpAdminUrl } from "./property-profile-view-model";
import { wordpressSiteDomainLabel } from "./wordpress-site-domain-label";
import { Button } from "@/ui";

const META_SEP = <span className="text-white/20" aria-hidden>·</span>;

export type PropertyProfileHeaderProps = {
  site: WordPressSite;
  onBack: () => void;
  onOpenTags: () => void;
};

export function PropertyProfileHeader({ site, onBack, onOpenTags }: PropertyProfileHeaderProps) {
  const tone = propertyConnectionTone(site);
  const publicUrl = getPublicSiteUrl(site);
  const domain = publicUrl ? wordpressSiteDomainLabel(publicUrl) : "";
  const wpAdminUrl = propertyWpAdminUrl(site);
  const tagCount = site.profileTags?.length ?? 0;

  return (
    <>
      <div className={PROFILE_TITLE_BAND}>
        <Button variant="quiet" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Properties
        </Button>
        <span className="h-5 w-px shrink-0 bg-white/10" aria-hidden />
        <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight text-white">{wordpressSiteDisplayName(site)}</h1>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button variant="quiet" type="button" title={site.profileTags?.join(", ") || "No tags"} onClick={onOpenTags}>
            <Tag className="h-4 w-4" aria-hidden />
            <span className="min-w-[1ch] tabular-nums">{tagCount}</span>
          </Button>
          {wpAdminUrl ? (
            <a className={`${MY_SITES_TOOL_BTN} inline-flex items-center text-primary`} href={wpAdminUrl} target="_blank" rel="noreferrer">
              WP Admin
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : (
            <span className={`${MY_SITES_TOOL_BTN} inline-flex items-center text-muted-foreground`}>WP Admin</span>
          )}
        </div>
      </div>
      <div className={PROFILE_META_BAND}>
        <span className="inline-flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 ${tone.dot}`} aria-hidden />
          <span className={`break-words ${tone.text}`}>{tone.label}</span>
        </span>
        {META_SEP}
        {publicUrl ? (
          <a className={`${MY_SITES_LINK} break-words`} href={publicUrl} target="_blank" rel="noreferrer">
            {domain}
          </a>
        ) : (
          <span className="break-words">No URL</span>
        )}
        {isWpEngineHosted(site) ? null : (
          <>
            {META_SEP}
            <span className="break-words">Last tested {formatLastTested(site.lastTested)}</span>
          </>
        )}
      </div>
    </>
  );
}
