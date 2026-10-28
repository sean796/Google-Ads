import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { InContentImageGenerator } from './InContentImageGenerator';
import type { ImageType } from '@/lib/image-section-analyzer';
import { type WordPressSite } from '../types';
import { useOptimizationOptions, type OptimizationOptions } from '@/hooks/use-optimization-options';

interface OptimizationSettingsAccordionProps {
  site: WordPressSite;
  updateMode: 'update' | 'draft';
  optimizationOptions: OptimizationOptions;
  onUpdateModeChange: (mode: 'update' | 'draft') => void;
  onOptimizationOptionsChange: (options: OptimizationOptions) => void;
  inContentImageType?: ImageType | '';
  inContentImagePrompt?: string;
  onInContentImageTypeChange?: (imageType: ImageType | '') => void;
  onInContentImagePromptChange?: (prompt: string) => void;
  isOptimizing: boolean;
  disabled?: boolean;
  /** When true, show bulk-only options (e.g. multi-post Content Optimizer). */
  bulkOptionsVisible?: boolean;
}

export const OptimizationSettingsAccordion: React.FC<OptimizationSettingsAccordionProps> = ({
  site: _site,
  updateMode,
  optimizationOptions,
  onUpdateModeChange,
  onOptimizationOptionsChange,
  inContentImageType = '',
  inContentImagePrompt = '',
  onInContentImageTypeChange,
  onInContentImagePromptChange,
  isOptimizing,
  disabled = false,
  bulkOptionsVisible = false,
}) => {
  const {
    optimizeTitle,
    optimizeMeta,
    optimizeExcerpt,
    optimizeContent,
    optimizeFeaturedImage,
    featuredImageType,
    autoOptimize,
    testMode,
    hasEntity,
    optimizeExtraText,
    optimizeExtraImage,
    stagingSite,
    useAcfKeyword,
    manualKeyword,
    bulkFaqMinimum4,
    handleOptimizeTitleChange,
    handleOptimizeMetaChange,
    handleOptimizeExcerptChange,
    handleOptimizeContentChange,
    handleOptimizeFeaturedImageChange,
    handleFeaturedImageTypeChange,
    handleAutoOptimizeChange,
    handleTestModeChange,
    handleHasEntityChange,
    handleOptimizeExtraTextChange,
    handleOptimizeExtraImageChange,
    handleStagingSiteChange,
    handleUseAcfKeywordChange,
    handleManualKeywordChange,
    handleBulkFaqMinimum4Change,
  } = useOptimizationOptions({
    optimizationOptions,
    onOptimizationOptionsChange,
  });

  const isCustom =
    !optimizeTitle ||
    !optimizeMeta ||
    !optimizeExcerpt ||
    !optimizeContent ||
    optimizeFeaturedImage ||
    testMode ||
    optimizeExtraText ||
    optimizeExtraImage ||
    stagingSite ||
    useAcfKeyword ||
    (manualKeyword && manualKeyword.trim().length > 0) ||
    inContentImageType ||
    bulkFaqMinimum4;

  const isDisabled = disabled || isOptimizing;
  const scopeHeadingId = React.useId();
  // bulk content-only mode UI:
  // this accordion is used in content optimizer flows, so forbidden controls are hidden entirely
  // (not disabled/greyed out).
  const bulkContentOnlyMode = true;
  const featuredImageTypeEffective: 'ai-generated' | 'google-maps' =
    hasEntity === false ? 'ai-generated' : (featuredImageType || 'ai-generated');

  return (
    <section
      aria-labelledby={scopeHeadingId}
      className="mt-2 w-full rounded-lg bg-muted/10"
    >
      <div className="flex items-center justify-between bg-muted/5 px-3 py-2.5">
        <h3
          id={scopeHeadingId}
          className="text-xs font-semibold uppercase tracking-wider text-foreground"
        >
          <span className={isDisabled ? 'opacity-50' : ''}>What to include</span>
        </h3>
        {isCustom ? (
          <span className="text-xs font-normal normal-case text-muted-foreground">Custom</span>
        ) : null}
      </div>
      <div className="space-y-4 p-3">
            {/* bulk loadout cards */}
            <div className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {!bulkContentOnlyMode && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="optimize-title"
                      checked={optimizeTitle}
                      onCheckedChange={handleOptimizeTitleChange}
                      disabled={isDisabled}
                    />
                    <Label htmlFor="optimize-title" className="text-sm font-medium cursor-pointer">
                      Title
                    </Label>
                  </div>
                )}
                {!bulkContentOnlyMode && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="optimize-meta"
                      checked={optimizeMeta}
                      onCheckedChange={handleOptimizeMetaChange}
                      disabled={isDisabled}
                    />
                    <Label htmlFor="optimize-meta" className="text-sm font-medium cursor-pointer">
                      Meta
                    </Label>
                  </div>
                )}
                {!bulkContentOnlyMode && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="optimize-excerpt"
                      checked={optimizeExcerpt}
                      onCheckedChange={handleOptimizeExcerptChange}
                      disabled={isDisabled}
                    />
                    <Label htmlFor="optimize-excerpt" className="text-sm font-medium cursor-pointer">
                      Meta Description
                    </Label>
                  </div>
                )}
                <div className="flex items-center space-x-2 rounded-md bg-muted/30 p-3">
                  <Checkbox
                    id="optimize-content"
                    checked={optimizeContent}
                    onCheckedChange={handleOptimizeContentChange}
                    disabled={isDisabled}
                  />
                  <Label htmlFor="optimize-content" className="text-sm font-medium cursor-pointer">
                    Content
                  </Label>
                </div>
                <div className="flex items-center space-x-2 rounded-md bg-muted/30 p-3">
                  <Checkbox
                    id="optimize-featured-image"
                    checked={optimizeFeaturedImage}
                    onCheckedChange={handleOptimizeFeaturedImageChange}
                    disabled={isDisabled}
                  />
                  <Label htmlFor="optimize-featured-image" className="text-sm font-medium cursor-pointer">
                    Featured Image
                  </Label>
                </div>
                {!bulkContentOnlyMode && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="test-mode"
                      checked={testMode}
                      onCheckedChange={handleTestModeChange}
                      disabled={isDisabled}
                    />
                    <Label
                      htmlFor="test-mode"
                      className="text-sm font-medium cursor-pointer"
                      title="Test Mode: Skip all API research and use hardcoded keyword 'digital marketing near me'"
                    >
                      Test Mode
                    </Label>
                  </div>
                )}
                <div className="flex items-center space-x-2 rounded-md bg-muted/30 p-3">
                  <Checkbox
                    id="optimize-extra-text"
                    checked={optimizeExtraText}
                    onCheckedChange={handleOptimizeExtraTextChange}
                    disabled={isDisabled}
                  />
                  <Label htmlFor="optimize-extra-text" className="text-sm font-medium cursor-pointer">
                    Extra Text
                  </Label>
                </div>
                {!bulkContentOnlyMode && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="optimize-extra-image"
                      checked={optimizeExtraImage}
                      onCheckedChange={handleOptimizeExtraImageChange}
                      disabled={isDisabled}
                    />
                    <Label htmlFor="optimize-extra-image" className="text-sm font-medium cursor-pointer">
                      Extra Image
                    </Label>
                  </div>
                )}
                {!bulkContentOnlyMode && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="staging-site"
                      checked={stagingSite}
                      onCheckedChange={handleStagingSiteChange}
                      disabled={isDisabled}
                    />
                    <Label
                      htmlFor="staging-site"
                      className="text-sm font-medium cursor-pointer"
                      title="Staging Site: Skip Google Search Console entirely; use AI to derive keywords from URL, title, and content (for new sites with no GSC data)"
                    >
                      Staging Site
                    </Label>
                  </div>
                )}
                {!bulkContentOnlyMode && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="use-acf-keyword"
                      checked={useAcfKeyword}
                      onCheckedChange={handleUseAcfKeywordChange}
                      disabled={isDisabled}
                    />
                    <Label
                      htmlFor="use-acf-keyword"
                      className="text-sm font-medium cursor-pointer"
                      title="Use the NEO Fields keyword_focus field as the primary focus keyword. Locks the focus keyword, but still fetches GSC + PAA (manual override still wins)."
                    >
                      NEO Pulse Keyword
                    </Label>
                  </div>
                )}
              </div>
            </div>

            {bulkOptionsVisible ? (
              <div className="rounded-md bg-muted/20 p-3">
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="bulk-faq-minimum-4"
                    checked={bulkFaqMinimum4}
                    onCheckedChange={(c) => handleBulkFaqMinimum4Change(c === true)}
                    disabled={isDisabled}
                    className="mt-0.5"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="bulk-faq-minimum-4" className="text-sm font-medium cursor-pointer">
                      Bulk: minimum 4 FAQs
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      For each selected post, ensure at least four FAQ items in ACF. Fills gaps only; leaves posts
                      unchanged when they already have four or more.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Manual keyword override */}
            {!bulkContentOnlyMode && (
            <div className="pt-3 space-y-1">
              <Label htmlFor="manual-keyword" className="text-sm font-medium text-muted-foreground">
                Manual Keyword Override
              </Label>
              <Input
                id="manual-keyword"
                type="text"
                value={manualKeyword ?? ''}
                onChange={(e) => handleManualKeywordChange(e.target.value)}
                disabled={isDisabled}
                placeholder="Optional: use this exact keyword for this run"
                className="h-8 text-xs"
              />
              <p className="text-xs text-muted-foreground">
                When set, this keyword overrides GSC, URL intent, ACF, and prompt modifiers for this run only.
              </p>
            </div>
            )}

            {/* Entity Mode - binary toggle */}
            <div className="pt-2 space-y-2">
              <div className="flex items-start space-x-2 rounded-md bg-muted/30 p-3">
                <Checkbox
                  id="entity-mode"
                  checked={hasEntity === true}
                  onCheckedChange={(checked) => handleHasEntityChange(checked === true)}
                  disabled={isDisabled}
                  className="mt-0.5"
                />
                <div className="space-y-1">
                  <Label htmlFor="entity-mode" className="text-sm font-medium cursor-pointer">
                    Entity Mode (Location-Based Content)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    When enabled, content/images can include location context. When disabled, it behaves like a regular blog post.
                  </p>
                </div>
              </div>
            </div>

            {/* Featured Image Type Selection - shown when optimizeFeaturedImage is enabled */}
            {optimizeFeaturedImage && (
              <div className="pt-2 space-y-2">
                <Label className="text-sm font-medium text-muted-foreground">
                  Featured Image Type
                </Label>
                <Select
                  value={featuredImageTypeEffective}
                  onValueChange={(value: 'ai-generated' | 'google-maps') => handleFeaturedImageTypeChange(value)}
                  disabled={isDisabled || hasEntity === false}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select image type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ai-generated">AI Generated</SelectItem>
                    {hasEntity !== false && (
                      <SelectItem value="google-maps">Google Maps (requires entity)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {hasEntity === false
                    ? 'Google Maps requires Entity Mode. Using AI-generated images instead.'
                    : featuredImageTypeEffective === 'google-maps'
                      ? 'Google Maps images are generated with location context. Requires Entity Mode.'
                      : 'AI-generated images are created based on your content and keywords.'}
                </p>
              </div>
            )}

            {/* In-Content Image Options */}
            {onInContentImageTypeChange && onInContentImagePromptChange && (
              <div className="pt-2">
                <InContentImageGenerator
                  imageType={inContentImageType}
                  userPrompt={inContentImagePrompt}
                  onImageTypeChange={onInContentImageTypeChange}
                  onUserPromptChange={onInContentImagePromptChange}
                  disabled={isDisabled}
                />
              </div>
            )}
      </div>
    </section>
  );
};

// Keep the old export name for backward compatibility during transition
export const OptimizationSettingsPopover = OptimizationSettingsAccordion;
