import React, { useEffect, useMemo } from "react";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SEO_WORKSPACE_BODY_SCROLL_CLASS,
  SEO_WORKSPACE_HEADER_CLASS,
} from "@/components/seo/seo-workspace-layout";
import { SocialCreatorCampaignsSection } from "@/components/social/creator/SocialCreatorCampaignsSection";
import { SocialCreatorWorkspaceHeader } from "@/components/social/creator/SocialCreatorWorkspaceHeader";
import {
  CONTENT_OPTIMIZER_BODY_INSET_CLASS,
  CONTENT_OPTIMIZER_WORKSPACE_SHELL_CLASS,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { useSocialCreatorWorkspace } from "@/hooks/social/use-social-creator-workspace";
import type { WordPressSite } from "@/components/integrations/types";
import { cn } from "@/lib/utils";

export type SocialCreatorCampaignWorkspaceProps = {
  apiKey: string;
  selectedModel: string;
  onPlatformChange: (tab: "gbp-post" | "content-calendar" | "social-creator") => void;
};

function SocialCreatorCampaignWorkspaceInner({
  site,
  apiKey,
  selectedModel,
  onPlatformChange,
}: {
  site: WordPressSite;
  apiKey: string;
  selectedModel: string;
  onPlatformChange: (tab: "gbp-post" | "content-calendar" | "social-creator") => void;
}) {
  const ctrl = useSocialCreatorWorkspace({ site, apiKey, selectedModel });

  return (
    <div className={CONTENT_OPTIMIZER_WORKSPACE_SHELL_CLASS}>
      <div className={SEO_WORKSPACE_HEADER_CLASS}>
        <SocialCreatorWorkspaceHeader ctrl={ctrl} onPlatformChange={onPlatformChange} />
      </div>
      <div className={cn(SEO_WORKSPACE_BODY_SCROLL_CLASS, CONTENT_OPTIMIZER_BODY_INSET_CLASS, "relative flex flex-col")}>
        <SocialCreatorCampaignsSection ctrl={ctrl} />
      </div>
    </div>
  );
}

export function SocialCreatorCampaignWorkspace({
  apiKey,
  selectedModel,
  onPlatformChange,
}: SocialCreatorCampaignWorkspaceProps) {
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
          <CardTitle className="text-base text-primary">Social Creator</CardTitle>
          <CardDescription>
            Add a WordPress site under Integrations, then return here to generate Social Creator from WordPress page
            copy.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    );
  }

  if (!site) return null;

  return (
    <SocialCreatorCampaignWorkspaceInner
      site={site}
      apiKey={apiKey}
      selectedModel={selectedModel}
      onPlatformChange={onPlatformChange}
    />
  );
}
