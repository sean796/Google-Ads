import React, { useEffect, useMemo } from "react";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SEO_WORKSPACE_BODY_SCROLL_CLASS,
  SEO_WORKSPACE_HEADER_CLASS,
} from "@/components/seo/seo-workspace-layout";
import { ContentCreatorCampaignsSection } from "@/components/social/content-creator/ContentCreatorCampaignsSection";
import { ContentCreatorWorkspaceHeader } from "@/components/social/content-creator/ContentCreatorWorkspaceHeader";
import {
  CONTENT_OPTIMIZER_BODY_INSET_CLASS,
  CONTENT_OPTIMIZER_WORKSPACE_SHELL_CLASS,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { useContentCreatorWorkspace } from "@/hooks/social/use-content-creator-workspace";
import type { WordPressSite } from "@/components/integrations/types";
import { cn } from "@/lib/utils";

import type { SocialPlatformTab } from "@/components/social/SocialPlatformPills";

export type ContentCreatorCampaignWorkspaceProps = {
  apiKey: string;
  selectedModel: string;
  onPlatformChange: (tab: SocialPlatformTab) => void;
};

function ContentCreatorCampaignWorkspaceInner({
  site,
  apiKey,
  selectedModel,
  onPlatformChange,
}: {
  site: WordPressSite;
  apiKey: string;
  selectedModel: string;
  onPlatformChange: (tab: SocialPlatformTab) => void;
}) {
  const ctrl = useContentCreatorWorkspace({ site, apiKey, selectedModel });

  return (
    <div className={CONTENT_OPTIMIZER_WORKSPACE_SHELL_CLASS}>
      <div className={SEO_WORKSPACE_HEADER_CLASS}>
        <ContentCreatorWorkspaceHeader ctrl={ctrl} onPlatformChange={onPlatformChange} />
      </div>
      <div className={cn(SEO_WORKSPACE_BODY_SCROLL_CLASS, CONTENT_OPTIMIZER_BODY_INSET_CLASS, "relative flex flex-col")}>
        <ContentCreatorCampaignsSection ctrl={ctrl} />
      </div>
    </div>
  );
}

export function ContentCreatorCampaignWorkspace({
  apiKey,
  selectedModel,
  onPlatformChange,
}: ContentCreatorCampaignWorkspaceProps) {
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
          <CardTitle className="text-base text-primary">Content Calendar</CardTitle>
          <CardDescription>
            Add a WordPress site under Integrations, then return here to generate social content calendar
            sheets.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    );
  }

  if (!site) return null;

  return (
    <ContentCreatorCampaignWorkspaceInner
      site={site}
      apiKey={apiKey}
      selectedModel={selectedModel}
      onPlatformChange={onPlatformChange}
    />
  );
}
