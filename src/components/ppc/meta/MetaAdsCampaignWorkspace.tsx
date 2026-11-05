import React, { useEffect, useMemo } from "react";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SEO_WORKSPACE_BODY_SCROLL_CLASS,
  SEO_WORKSPACE_HEADER_CLASS,
} from "@/components/seo/seo-workspace-layout";
import { MetaAdsCampaignsSection } from "@/components/ppc/meta/MetaAdsCampaignsSection";
import { MetaAdsWorkspaceHeader } from "@/components/ppc/meta/MetaAdsWorkspaceHeader";
import {
  CONTENT_OPTIMIZER_BODY_INSET_CLASS,
  CONTENT_OPTIMIZER_WORKSPACE_SHELL_CLASS,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { usePpcMetaWorkspace } from "@/hooks/ppc/use-ppc-meta-workspace";
import type { WordPressSite } from "@/components/integrations/types";
import { cn } from "@/lib/utils";

export type MetaAdsCampaignWorkspaceProps = {
  apiKey: string;
  selectedModel: string;
  onPlatformChange: (tab: "ppc-google" | "ppc-meta") => void;
};

function MetaAdsCampaignWorkspaceInner({
  site,
  apiKey,
  selectedModel,
  onPlatformChange,
}: {
  site: WordPressSite;
  apiKey: string;
  selectedModel: string;
  onPlatformChange: (tab: "ppc-google" | "ppc-meta") => void;
}) {
  const ctrl = usePpcMetaWorkspace({ site, apiKey, selectedModel });

  return (
    <div className={CONTENT_OPTIMIZER_WORKSPACE_SHELL_CLASS}>
      <div className={SEO_WORKSPACE_HEADER_CLASS}>
        <MetaAdsWorkspaceHeader ctrl={ctrl} onPlatformChange={onPlatformChange} />
      </div>
      <div className={cn(SEO_WORKSPACE_BODY_SCROLL_CLASS, CONTENT_OPTIMIZER_BODY_INSET_CLASS, "relative flex flex-col")}>
        <MetaAdsCampaignsSection ctrl={ctrl} />
      </div>
    </div>
  );
}

export function MetaAdsCampaignWorkspace({
  apiKey,
  selectedModel,
  onPlatformChange,
}: MetaAdsCampaignWorkspaceProps) {
  const { sites } = useWordPressSites();
  const { activeWordPressSiteId, setActiveWordPressSiteId } = useWordPressOptimization();

  const enabledSites = useMemo(() => sites.filter((site) => site.enabled !== false), [sites]);

  useEffect(() => {
    if (sites.length === 0) return;
    if (activeWordPressSiteId && sites.some((site) => site.id === activeWordPressSiteId)) {
      return;
    }
    const pool = enabledSites.length > 0 ? enabledSites : sites;
    if (pool.length === 0) return;
    setActiveWordPressSiteId(pool[0].id);
  }, [sites, enabledSites, activeWordPressSiteId, setActiveWordPressSiteId]);

  const site = sites.find((entry) => entry.id === activeWordPressSiteId) ?? null;

  if (sites.length === 0) {
    return (
      <Card variant="neonFlat" className="w-full">
        <CardHeader>
          <CardTitle className="text-base text-primary">Meta ads</CardTitle>
          <CardDescription>
            Add a WordPress site under Integrations, then return here to generate Meta ads from WordPress page
            copy.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    );
  }

  if (!site) return null;

  return (
    <MetaAdsCampaignWorkspaceInner
      site={site}
      apiKey={apiKey}
      selectedModel={selectedModel}
      onPlatformChange={onPlatformChange}
    />
  );
}
