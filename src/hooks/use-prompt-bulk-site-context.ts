import { useEffect, useState } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import type { BulkGscKeywordsHostedLink } from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import {
  resolvePromptBulkIdeasContext,
  type PromptBulkIdeasContext,
} from "@/lib/bulk/prompt-bulk-ideas-context";
import { useOverviewSiteWarmDetails } from "@/hooks/overview/use-overview-site-warm-details";

export type PromptBulkSiteContextState = {
  sitemapInventoryLinks: PromptBulkSitemapInventoryLink[];
  gscHostedLink: BulkGscKeywordsHostedLink | null;
  sitemapInventoryLoading: boolean;
  ideasContext: PromptBulkIdeasContext | null;
  promptSiteContextReady: boolean;
};

export function usePromptBulkSiteContext(
  site: WordPressSite | null | undefined,
): PromptBulkSiteContextState {
  const warm = useOverviewSiteWarmDetails(site ?? undefined);
  const [ideasContext, setIdeasContext] = useState<PromptBulkIdeasContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  useEffect(() => {
    if (!site?.id) {
      setIdeasContext(null);
      setContextLoading(false);
      return;
    }

    let cancelled = false;
    setContextLoading(true);
    void resolvePromptBulkIdeasContext(site)
      .then((ctx) => {
        if (!cancelled) setIdeasContext(ctx);
      })
      .catch(() => {
        if (!cancelled) setIdeasContext(null);
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [site?.id, site?.siteUrl]);

  const sitemapInventoryLoading = warm.sitemapInventoryLoading || contextLoading;
  const promptSiteContextReady = Boolean(ideasContext?.isReady) && !sitemapInventoryLoading;

  return {
    sitemapInventoryLinks: warm.sitemapInventoryLinks,
    gscHostedLink: warm.gscHostedLink,
    sitemapInventoryLoading,
    ideasContext,
    promptSiteContextReady,
  };
}
