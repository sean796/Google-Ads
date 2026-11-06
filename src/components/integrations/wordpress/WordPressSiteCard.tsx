import React from "react";
import { Card } from "@/ui";

import { type WordPressSite } from "../types";
import { WordPressCardHeader } from "./WordPressCardHeader";
import { WordPressCardStatus } from "./WordPressCardStatus";
import { getCyberpunkCardClasses, BREATHE_NEON_ANIMATION } from "./cyberpunk-theme";
import { UNIFIED_TOOLBAR_CLASS } from "@/components/shared/UnifiedWorkspaceChrome";
import {
  WordPressSiteAdminLayout,
  type WordPressSiteAdminSectionId,
} from "./WordPressSiteAdminLayout";
import { WordPressPropertySectionPills } from "./WordPressPropertySectionPills";
import { buildWordPressPropertySections } from "./buildWordPressPropertySections";

interface WordPressSiteCardProps {
  site: WordPressSite;
  isTesting: boolean;
  isDetecting: boolean;
  isFetchingScheduled: boolean;
  isScrapingSitemap: Record<string, boolean>;
  isGeneratingEntities?: Record<string, boolean>;
  isIndexingSitemap?: Record<string, boolean>;
  onTest: () => void;
  onDetect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onScrapeChildSitemap: (childSitemapUrl: string) => void;
  onEntityGeneration?: (sitemapUrl: string) => void;
  onSetEntitySitemap?: (sitemapUrl: string) => void;
  onSetCompetitorEntitySitemap?: (sitemapUrl: string) => void;
  onToggleChildSitemapDisabled?: (childSitemapUrl: string) => void;
  onAppendManualChildSitemap?: (url: string) => void;
  onIndexSitemap?: (sitemapUrl: string) => void;
  getScrapingKey: (siteId: string, sitemapUrl: string) => string;
  isLoadingCalendar?: Record<string, boolean>;
  onLoadCalendarPosts?: (sitemapUrl: string) => void;
  isExtractingNAPAndGraph?: boolean;
  onExtractNAPAndGraph?: () => void;
  showSiteInfoInHeader?: boolean;
  embedded?: boolean;
  hideHeader?: boolean;
  hideStatus?: boolean;
  displayViewportHeight?: string;
  onPatchSite?: (siteId: string, patch: Partial<WordPressSite>) => void;
  embeddedSiteEditPanel?: React.ReactNode;
}

export const WordPressSiteCard: React.FC<WordPressSiteCardProps> = ({
  site,
  isTesting,
  isDetecting,
  isFetchingScheduled,
  isScrapingSitemap,
  isGeneratingEntities = {},
  isIndexingSitemap = {},
  onTest,
  onDetect,
  onEdit,
  onDelete,
  onToggle,
  onScrapeChildSitemap,
  onEntityGeneration,
  onSetEntitySitemap,
  onSetCompetitorEntitySitemap,
  onToggleChildSitemapDisabled,
  onAppendManualChildSitemap,
  onIndexSitemap,
  getScrapingKey,
  isLoadingCalendar = {},
  onLoadCalendarPosts,
  isExtractingNAPAndGraph = false,
  onExtractNAPAndGraph,
  showSiteInfoInHeader = true,
  embedded = false,
  hideHeader = false,
  hideStatus = false,
  displayViewportHeight,
  onPatchSite,
  embeddedSiteEditPanel,
}) => {
  const [activeSectionId, setActiveSectionId] =
    React.useState<WordPressSiteAdminSectionId>("overview");

  React.useEffect(() => {
    setActiveSectionId("overview");
  }, [site.id]);

  const Wrapper: React.ElementType = embedded ? "div" : Card;
  const wrapperClassName = embedded
    ? "flex h-full min-h-0 min-w-0 flex-1 flex-col pt-0 px-0 pb-0"
    : `p-3 ${getCyberpunkCardClasses(false, true)} transition-all duration-300`;

  const sections = buildWordPressPropertySections({
    site,
    isTesting,
    isDetecting,
    isFetchingScheduled,
    isScrapingSitemap,
    isGeneratingEntities,
    isIndexingSitemap,
    isLoadingCalendar,
    isExtractingNAPAndGraph,
    onTest,
    onDetect,
    onScrapeChildSitemap,
    onEntityGeneration,
    onSetEntitySitemap,
    onSetCompetitorEntitySitemap,
    onToggleChildSitemapDisabled,
    onAppendManualChildSitemap,
    onIndexSitemap,
    onLoadCalendarPosts,
    onExtractNAPAndGraph,
    getScrapingKey,
    onPatchSite,
    shell: embedded ? "embedded" : "card",
    siteSettingsPanel: embeddedSiteEditPanel,
  });

  return (
    <>
      <style>{BREATHE_NEON_ANIMATION}</style>
      <Wrapper className={wrapperClassName}>
        {!hideHeader && (
          <WordPressCardHeader
            site={site}
            onEdit={onEdit}
            onDelete={onDelete}
            showSiteInfo={showSiteInfoInHeader}
          />
        )}

        {!hideStatus && (
          <WordPressCardStatus site={site} isTesting={isTesting} onToggle={onToggle} />
        )}

        {embedded ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <nav className={UNIFIED_TOOLBAR_CLASS} aria-label="Property sections">
              <WordPressPropertySectionPills
                sections={sections.map((s) => ({ id: s.id, label: s.label }))}
                activeSectionId={activeSectionId}
                onSectionChange={(id) => setActiveSectionId(id as WordPressSiteAdminSectionId)}
              />
            </nav>
            <WordPressSiteAdminLayout
              sections={sections}
              defaultSectionId="overview"
              displayViewportHeight={displayViewportHeight}
              hideSectionNav
              activeSectionId={activeSectionId}
              onActiveSectionChange={(id) =>
                setActiveSectionId(id as WordPressSiteAdminSectionId)
              }
              flatContentPanel
              propertyTabContentShell
              fillParent
            />
          </div>
        ) : (
          <WordPressSiteAdminLayout
            sections={sections}
            defaultSectionId="overview"
            displayViewportHeight={displayViewportHeight}
            flatContentPanel={embedded}
            collapsibleSideNav={embedded}
          />
        )}
      </Wrapper>
    </>
  );
};
