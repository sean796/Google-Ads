import React, { useEffect, useMemo, useState } from "react";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GoogleAdsCampaignWorkspace } from "@/components/ppc/google/GoogleAdsCampaignWorkspace";
import {
  type PpcPlatformId,
  readStoredPpcPlatform,
  writeStoredPpcPlatform,
} from "@/components/ppc/ppc-sections";

const PPC_SHELL_FRAME_CLASS = "flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden";

export interface PpcShellProps {
  apiKey: string;
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  onPlatformChange: (tab: "ppc-google" | "ppc-meta") => void;
}

export const PpcShell: React.FC<PpcShellProps> = ({ apiKey, selectedModel, onPlatformChange }) => {
  const { sites } = useWordPressSites();
  const { activeWordPressSiteId, setActiveWordPressSiteId } = useWordPressOptimization();
  const [platform] = useState<PpcPlatformId>(() => readStoredPpcPlatform());

  const enabledSites = useMemo(() => sites.filter((s) => s.enabled !== false), [sites]);

  useEffect(() => {
    writeStoredPpcPlatform(platform);
  }, [platform]);

  useEffect(() => {
    if (sites.length === 0) return;
    if (activeWordPressSiteId && sites.some((s) => s.id === activeWordPressSiteId)) {
      return;
    }
    const pool = enabledSites.length > 0 ? enabledSites : sites;
    if (pool.length === 0) return;
    setActiveWordPressSiteId(pool[0].id);
  }, [sites, enabledSites, activeWordPressSiteId, setActiveWordPressSiteId]);

  const site = sites.find((s) => s.id === activeWordPressSiteId) ?? null;

  if (sites.length === 0) {
    return (
      <Card variant="neonFlat" className="w-full">
        <CardHeader>
          <CardTitle className="text-base text-primary">PPC</CardTitle>
          <CardDescription>
            Add a WordPress site under Integrations, then return here to generate Google Search campaigns from
            WordPress pages and GSC queries.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    );
  }

  if (!site) return null;

  if (platform === "google") {
    return (
      <div className={PPC_SHELL_FRAME_CLASS}>
        <GoogleAdsCampaignWorkspace
          site={site}
          apiKey={apiKey}
          selectedModel={selectedModel}
          onPlatformChange={onPlatformChange}
        />
      </div>
    );
  }

  return null;
};
