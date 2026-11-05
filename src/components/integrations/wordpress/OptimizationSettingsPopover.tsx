import React from 'react';
import { CheckField, SelectField } from '@/ui';
import { InContentImageGenerator } from './InContentImageGenerator';
import type { ImageType } from '@/lib/image-section-analyzer';
import { type WordPressSite } from '../types';
import { useOptimizationOptions, type OptimizationOptions } from '@/hooks/use-optimization-options';

const IMAGE_TYPE_OPTIONS_BASE = [{ value: 'ai-generated', label: 'AI Generated' }];
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
    testMode,
    hasEntity,
    optimizeExtraText,
    optimizeExtraImage,
    stagingSite,
    useAcfKeyword,
    manualKeyword,
    bulkFaqMinimum4,
    handleOptimizeContentChange,
    handleOptimizeFeaturedImageChange,
    handleFeaturedImageTypeChange,
    handleHasEntityChange,
    handleOptimizeExtraTextChange,
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
  const featuredImageTypeEffective: 'ai-generated' | 'google-maps' =
    hasEntity === false ? 'ai-generated' : (featuredImageType || 'ai-generated');

  return (
    <section aria-labelledby={scopeHeadingId} className="mt-2 flex w-full flex-col gap-3 bg-ui-field p-3">
      <div className="flex items-center justify-between">
        <h3 id={scopeHeadingId} className="text-base font-semibold uppercase tracking-wider text-foreground">
          <span className={isDisabled ? 'opacity-50' : ''}>What to include</span>
        </h3>
        {isCustom ? <span className="text-base text-muted-foreground">Custom</span> : null}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="bg-black p-3">
          <CheckField
            label="Content"
            checked={optimizeContent}
            onCheckedChange={handleOptimizeContentChange}
            disabled={isDisabled}
          />
        </div>
        <div className="bg-black p-3">
          <CheckField
            label="Featured Image"
            checked={optimizeFeaturedImage}
            onCheckedChange={handleOptimizeFeaturedImageChange}
            disabled={isDisabled}
          />
        </div>
        <div className="bg-black p-3">
          <CheckField
            label="Extra Text"
            checked={optimizeExtraText}
            onCheckedChange={handleOptimizeExtraTextChange}
            disabled={isDisabled}
          />
        </div>
      </div>

      {bulkOptionsVisible ? (
        <div className="flex flex-col gap-1 bg-black p-3">
          <CheckField
            label="Bulk: minimum 4 FAQs"
            checked={bulkFaqMinimum4}
            onCheckedChange={handleBulkFaqMinimum4Change}
            disabled={isDisabled}
          />
          <p className="text-base text-muted-foreground">
            For each selected post, ensure at least four FAQ items in ACF. Fills gaps only; leaves posts
            unchanged when they already have four or more.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1 bg-black p-3">
        <CheckField
          label="Entity Mode (Location-Based Content)"
          checked={hasEntity === true}
          onCheckedChange={handleHasEntityChange}
          disabled={isDisabled}
        />
        <p className="text-base text-muted-foreground">
          When enabled, content/images can include location context. When disabled, it behaves like a regular blog post.
        </p>
      </div>

      {optimizeFeaturedImage ? (
        <div className="flex flex-col gap-1">
          <SelectField
            placeholder="Featured image type"
            width="full"
            value={featuredImageTypeEffective}
            disabled={isDisabled || hasEntity === false}
            options={
              hasEntity !== false
                ? [...IMAGE_TYPE_OPTIONS_BASE, { value: 'google-maps', label: 'Google Maps (requires entity)' }]
                : IMAGE_TYPE_OPTIONS_BASE
            }
            onValueChange={(value) => handleFeaturedImageTypeChange(value as 'ai-generated' | 'google-maps')}
          />
          <p className="text-base text-muted-foreground">
            {hasEntity === false
              ? 'Google Maps requires Entity Mode. Using AI-generated images instead.'
              : featuredImageTypeEffective === 'google-maps'
                ? 'Google Maps images are generated with location context. Requires Entity Mode.'
                : 'AI-generated images are created based on your content and keywords.'}
          </p>
        </div>
      ) : null}

      {onInContentImageTypeChange && onInContentImagePromptChange ? (
        <InContentImageGenerator
          imageType={inContentImageType}
          userPrompt={inContentImagePrompt}
          onImageTypeChange={onInContentImageTypeChange}
          onUserPromptChange={onInContentImagePromptChange}
          disabled={isDisabled}
        />
      ) : null}
    </section>
  );
};

// Keep the old export name for backward compatibility during transition
export const OptimizationSettingsPopover = OptimizationSettingsAccordion;