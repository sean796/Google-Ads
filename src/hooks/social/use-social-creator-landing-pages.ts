import { useCallback, useEffect, useRef, useState } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import type { SocialGenerateConfig } from "@/lib/social/social-creator-types";
import { createPpcPageBucketHostedLink, loadContentCreatorLandingPages, revokePpcPageBucketHostedLink, type PpcPageBucketHostedLink } from "@/lib/social/content-creator-landing-pages";
import type { PpcWpPageContext } from "@/lib/ppc/google-ads-types";
import { appendNeoPulseMetaStaticPages, getNeoPulseMetaPickerPages, isNeoDigitalAgencyTeam, isNeoPulseMetaStaticLandingUrl } from "@/lib/ppc/neo-pulse-meta-marketing-context";

export function useSocialCreatorLandingPages({
  site,
  teamName,
  generateConfig,
}: {
  site: WordPressSite;
  teamName: string | null;
  generateConfig: SocialGenerateConfig;
}) {
  const [wpPages, setWpPages] = useState<PpcWpPageContext[]>([]);
  const [wpPagesLoading, setWpPagesLoading] = useState(false);
  const [pageBucketHostedLink, setPageBucketHostedLink] = useState<PpcPageBucketHostedLink | null>(null);
  const pageBucketLinkRef = useRef<string | null>(null);
  const mergeNeoPulseLandingPages = useCallback(
    (pages: PpcWpPageContext[]): PpcWpPageContext[] => appendNeoPulseMetaStaticPages(pages, teamName),
    [teamName],
  );
  useEffect(() => {
    let cancelled = false;
    setWpPages([]);
    setWpPagesLoading(true);
    revokePpcPageBucketHostedLink(pageBucketLinkRef.current);
    pageBucketLinkRef.current = null;
    setPageBucketHostedLink(null);

    if (isNeoDigitalAgencyTeam(teamName)) {
      setWpPages(getNeoPulseMetaPickerPages());
      setWpPagesLoading(false);
      return () => {
        cancelled = true;
      };
    }

    loadContentCreatorLandingPages(site, generateConfig.landingPageSource)
      .then((pages) => {
        if (cancelled) return;
        const merged = mergeNeoPulseLandingPages(pages);
        setWpPages(merged);
        const link = createPpcPageBucketHostedLink(site.siteUrl, merged);
        pageBucketLinkRef.current = link.href;
        setPageBucketHostedLink(link);
      })
      .catch(() => {
        if (!cancelled) setWpPages([]);
      })
      .finally(() => {
        if (!cancelled) setWpPagesLoading(false);
      });

    return () => {
      cancelled = true;
      revokePpcPageBucketHostedLink(pageBucketLinkRef.current);
      pageBucketLinkRef.current = null;
    };
  }, [generateConfig.landingPageSource, mergeNeoPulseLandingPages, site, teamName]);

  const loadWpPagesForPicker = useCallback(async () => {
    if (wpPagesLoading) return;
    const hasClientBucket =
      wpPages.some((page) => !isNeoPulseMetaStaticLandingUrl(page.url)) && wpPages.length > 0;
    if (hasClientBucket) return;

    setWpPagesLoading(true);
    try {
      const pages = mergeNeoPulseLandingPages(
        await loadContentCreatorLandingPages(site, generateConfig.landingPageSource),
      );
      setWpPages(pages);
      revokePpcPageBucketHostedLink(pageBucketLinkRef.current);
      const link = createPpcPageBucketHostedLink(site.siteUrl, pages);
      pageBucketLinkRef.current = link.href;
      setPageBucketHostedLink(link);
    } catch {
      if (isNeoDigitalAgencyTeam(teamName)) {
        setWpPages(getNeoPulseMetaPickerPages());
      } else {
        setWpPages([]);
      }
    } finally {
      setWpPagesLoading(false);
    }
  }, [generateConfig.landingPageSource, mergeNeoPulseLandingPages, site, teamName, wpPages, wpPagesLoading]);

  return { wpPages, wpPagesLoading, pageBucketHostedLink, loadWpPagesForPicker };
}
