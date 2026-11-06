import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { type WordPressSite } from '../types';
import { UnifiedContentSelector } from './UnifiedContentSelector';

import type { ImageType } from '@/lib/image-section-analyzer';
import { saveSites, getStoredSites } from '../storage';
import { OptimizationSettingsAccordion } from './OptimizationSettingsPopover';
import type { OptimizationOptions } from '@/hooks/use-optimization-options';
import type { OptimizationProgressState } from '@/hooks/content-optimization/use-optimization-state';
import { OptimizationFileManager } from '@/lib/optimization-file-manager';
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/ui";

interface ContentOptimizationControlsProps {
  site: WordPressSite;
  url: string | string[];
  updateMode: 'update' | 'draft';
  isOptimizing: boolean;
  progress?: OptimizationProgressState;
  fileManager?: OptimizationFileManager;
  onUrlChange: (url: string | string[]) => void;
  onUpdateModeChange: (mode: 'update' | 'draft') => void;
  onOptimize: (postData?: {
    id: number;
    subtype: string;
    link: string;
    slug?: string;
    endpoint?: string;
    title?: string;
    content?: string;
    excerpt?: string;
    focusKeyword?: string;
    seoResearch?: string;
  } | null) => void;
  multiSelect?: boolean;
  optimizationOptions?: OptimizationOptions;
  onOptimizationOptionsChange?: (options: OptimizationOptions) => void;
  inContentImageType?: ImageType | '';
  inContentImagePrompt?: string;
  onInContentImageTypeChange?: (imageType: ImageType | '') => void;
  onInContentImagePromptChange?: (prompt: string) => void;
  /** When set, hides the URL/post picker (URL is shown on the parent tile; no duplicate here). */
  lockedPageUrl?: string;
  /** Resolved WP post for locked mode (from bindings); passed to onOptimize when the selector is hidden. */
  presetResolvedPost?: {
    id: number;
    subtype: string;
    link: string;
    slug?: string;
    endpoint?: string;
    title?: string;
    content?: string;
    excerpt?: string;
    focusKeyword?: string;
    seoResearch?: string;
  } | null;
  cardClassName?: string;
  /**
   * Card header title. Omit for default "Optimize Content". Pass null when a parent panel
   * already names this flow (avoids duplicate headings).
   */
  panelTitle?: string | null;
  /**
   * Overview “Bulk & multi-URL”: posts-only picker, update/draft, one CTA. No “What to include” / entity / in-content image.
   */
  seoExtraTextBulkMode?: boolean;
}

export const ContentOptimizationControls: React.FC<ContentOptimizationControlsProps> = ({
  site,
  url,
  updateMode,
  isOptimizing,
  onUrlChange,
  onUpdateModeChange,
  onOptimize,
  multiSelect = false,
  optimizationOptions,
  onOptimizationOptionsChange,
  inContentImageType = '',
  inContentImagePrompt = '',
  onInContentImageTypeChange,
  onInContentImagePromptChange,
  lockedPageUrl,
  presetResolvedPost,
  cardClassName,
  panelTitle,
  seoExtraTextBulkMode = false,
}) => {
  const resolvedPanelTitle: string | null =
    panelTitle === undefined ? 'Optimize Content' : panelTitle;
  const [postType, setPostType] = useState<'post' | 'service-area' | 'page' | 'both'>('post');
  const [selectedPostData, setSelectedPostData] = useState<{
    id: number;
    subtype: string;
    link: string;
    slug?: string;
    endpoint?: string;
    title?: string;
    content?: string;
    excerpt?: string;
    focusKeyword?: string;
  } | null>(null);
  const [manualEndpoint, setManualEndpoint] = useState<string>(site.manualEndpoint || '');

  // Save manual endpoint to site when changed (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (manualEndpoint.trim() !== (site.manualEndpoint || '')) {
        const sites = getStoredSites();
        const updated = sites.map((s) =>
          s.id === site.id ? { ...s, manualEndpoint: manualEndpoint.trim() || undefined } : s
        );
        saveSites(updated);
        if (manualEndpoint.trim()) {
          /* non-empty endpoint already persisted by saveSites */
        }
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timeoutId);
  }, [manualEndpoint, site.id, site.manualEndpoint]);

  const urls = multiSelect ? (Array.isArray(url) ? url : []) : [];
  const urlString = multiSelect ? undefined : typeof url === 'string' ? url : '';
  const bulkOptionsVisible = multiSelect && urls.length > 1;

  // Default optimization options if not provided (Extra Text on so page updates include it)
  const defaultOptions: OptimizationOptions = {
    optimizeTitle: true,
    optimizeMeta: true,
    optimizeExcerpt: true,
    optimizeContent: true,
    optimizeFeaturedImage: false,
    optimizeExtraText: true,
    optimizeExtraImage: false,
    autoOptimize: true,
    stagingSite: false,
    useAcfKeyword: true,
    manualKeyword: '',
    bulkFaqMinimum4: false,
  };

  const currentOptions = optimizationOptions || defaultOptions;

  return (
    <Card
      className={cardClassName ?? 'mt-4 w-full'}
      {...(!resolvedPanelTitle
        ? { role: 'region', 'aria-label': 'Content optimization' }
        : {})}
    >
      {resolvedPanelTitle ? (
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider">
            {resolvedPanelTitle}
          </CardTitle>
        </CardHeader>
      ) : null}
      <CardContent className={resolvedPanelTitle ? 'space-y-4' : 'space-y-4 pt-4'}>
        {!lockedPageUrl ? (
          <div className="space-y-2">
            <UnifiedContentSelector
              theme="default"
              site={site}
              value={multiSelect ? urls : urlString || ''}
              onValueChange={(newUrl) => {
                onUrlChange(newUrl);
                // Clear post data if URL is manually changed (not from dropdown)
                if (typeof newUrl === 'string' && newUrl !== urlString) {
                  setSelectedPostData(null);
                }
              }}
              postType={postType}
              onPostTypeChange={(value: 'post' | 'service-area' | 'page' | 'both') => {
                setPostType(value);
                // Clear selection and post data when switching types
                onUrlChange(multiSelect ? [] : '');
                setSelectedPostData(null);
              }}
              disabled={isOptimizing || site.enabled === false}
              multiSelect={multiSelect}
              onPostDataChange={setSelectedPostData}
            />
          </div>
        ) : null}

        {seoExtraTextBulkMode ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="self-center text-xs font-medium text-muted-foreground">Save as</span>
            <Button
              pressed={updateMode === 'update'}
              type="button"
              disabled={isOptimizing || site.enabled === false}
              onClick={() => onUpdateModeChange('update')}
            >
              Update live
            </Button>
            <Button
              pressed={updateMode === 'draft'}
              type="button"
              disabled={isOptimizing || site.enabled === false}
              onClick={() => onUpdateModeChange('draft')}
            >
              Draft
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              Generates and saves only the SEO extra text (ACF). Main content, title, meta, and other ACF fields are not changed.
            </p>
          </div>
        ) : null}

        {/* Optimization Settings Accordion - Full Width */}
        {!seoExtraTextBulkMode && onOptimizationOptionsChange && (
          <OptimizationSettingsAccordion
            site={site}
            updateMode={updateMode}
            optimizationOptions={currentOptions}
            onUpdateModeChange={onUpdateModeChange}
            onOptimizationOptionsChange={onOptimizationOptionsChange}
            inContentImageType={inContentImageType}
            inContentImagePrompt={inContentImagePrompt}
            onInContentImageTypeChange={onInContentImageTypeChange}
            onInContentImagePromptChange={onInContentImagePromptChange}
            isOptimizing={isOptimizing}
            disabled={isOptimizing || site.enabled === false}
            bulkOptionsVisible={bulkOptionsVisible}
          />
        )}

        {/* Optimize Button */}
        <Button
          variant="run"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOptimize(lockedPageUrl ? (presetResolvedPost ?? selectedPostData) : selectedPostData);
          }}
          disabled={isOptimizing || site.enabled === false}
        >
            {isOptimizing ? (
            <>
              
              {seoExtraTextBulkMode && multiSelect && urls.length > 0
                ? `Generating extra text for ${urls.length} ${postType === 'post' ? 'posts' : postType === 'service-area' ? 'entities' : postType === 'page' ? 'pages' : 'items'}...`
                : multiSelect && urls.length > 0
                ? `Optimizing ${urls.length} ${postType === 'post' ? 'posts' : postType === 'service-area' ? 'service areas' : 'items'}...`
                : 'Optimizing...'}
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3 mr-1" />
              {seoExtraTextBulkMode && multiSelect && urls.length > 0
                ? `Generate SEO extra text (${urls.length} ${postType === 'post' ? 'Posts' : postType === 'service-area' ? 'Entities' : postType === 'page' ? 'Pages' : 'Items'})`
                : multiSelect && urls.length > 0
                ? `Optimize ${urls.length} ${postType === 'post' ? 'Posts' : postType === 'service-area' ? 'Service Areas' : 'Items'}`
                : lockedPageUrl
                  ? 'Run full-page optimization'
                  : 'Optimize Content'}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
