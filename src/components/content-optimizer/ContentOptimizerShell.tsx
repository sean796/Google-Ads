import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OverviewTabContent } from "@/components/overview/OverviewTabContent";
import {
  type ContentOptimizerSectionId,
  readStoredContentOptimizerSection,
  writeStoredContentOptimizerSection,
} from "./content-optimizer-sections";
import type { ContentOptimizerGeneratorChrome } from "./content-optimizer-generator-chrome";
import { resolveActiveIntegrationSite } from "@/lib/integrations/resolve-active-integration-site";
import { resolveOverviewGridPaginationLayoutTotal } from "@/lib/overview/overview-grid-pagination-layout-total";

const CONTENT_OPTIMIZER_SHELL_FRAME_CLASS =
  "flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden";

export interface ContentOptimizerShellProps {
  apiKey: string;
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  generatorChrome?: ContentOptimizerGeneratorChrome;
}

export const ContentOptimizerShell: React.FC<ContentOptimizerShellProps> = ({
  apiKey,
  selectedModel,
  temperature,
  maxTokens,
  topP,
  generatorChrome,
}) => {
  const { sites } = useWordPressSites();
  const { activeWordPressSiteId, setActiveWordPressSiteId } = useWordPressOptimization();

  const [section, setSectionState] = useState<ContentOptimizerSectionId>(() =>
    readStoredContentOptimizerSection()
  );

  const setSection = useCallback((id: ContentOptimizerSectionId) => {
    setSectionState(id);
    writeStoredContentOptimizerSection(id);
  }, []);

  const enabledSites = useMemo(() => sites.filter((s) => s.enabled !== false), [sites]);

  useEffect(() => {
    if (sites.length === 0) return;
    const pool = enabledSites.length > 0 ? enabledSites : sites;
    if (pool.length === 0) return;
    if (!activeWordPressSiteId || !pool.some((s) => s.id === activeWordPressSiteId)) {
      setActiveWordPressSiteId(pool[0].id);
    }
  }, [sites, enabledSites, activeWordPressSiteId, setActiveWordPressSiteId]);

  const site = sites.find((s) => s.id === activeWordPressSiteId) ?? null;

  const paginationLayoutTotal = useMemo(
    () => resolveOverviewGridPaginationLayoutTotal(sites.map((s) => s.id)),
    [sites],
  );

  if (sites.length === 0) {
    return (
      <Card variant="neonFlat" className="w-full">
        <CardHeader>
          <CardTitle className="text-base text-primary">Content Optimizer</CardTitle>
          <CardDescription>
            Add a WordPress site under Integrations, then pick it here for sitemap SEO, per-page content runs, and bulk
            multi-URL optimization.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    );
  }

  if (!site) {
    return <div className={CONTENT_OPTIMIZER_SHELL_FRAME_CLASS} />;
  }

  return (
    <div className={CONTENT_OPTIMIZER_SHELL_FRAME_CLASS}>
      <OverviewTabContent
        site={site}
        apiKey={apiKey}
        selectedModel={selectedModel}
        temperature={temperature}
        maxTokens={maxTokens}
        topP={topP}
        optimizerSection={section}
        onOptimizerSectionChange={setSection}
        paginationLayoutTotal={paginationLayoutTotal}
        generatorChrome={generatorChrome}
      />
    </div>
  );
};
