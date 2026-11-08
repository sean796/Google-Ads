import { useState, useEffect } from 'react';

export interface OptimizationOptions {
  optimizeTitle: boolean;
  optimizeMeta: boolean;
  optimizeExcerpt: boolean;
  optimizeContent: boolean;
  optimizeFeaturedImage: boolean;
  featuredImageType?: 'ai-generated' | 'google-maps';
  autoOptimize?: boolean;
  testMode?: boolean;
  hasEntity?: boolean; // Manual toggle to dictate if post contains an entity (location-based content)
  optimizeExtraText?: boolean; // Generate extra text for pages (ACF field: seo_extra_text)
  optimizeExtraImage?: boolean; // Generate extra image for pages (ACF field: seo_extra_image)
  stagingSite?: boolean; // Skip GSC entirely (for new staging sites with no data)
  /** When true, use ACF keyword_focus directly as the primary keyword and skip GSC/AI keyword lookup. */
  useAcfKeyword?: boolean;
  /** When set, override ALL keyword discovery and use this exact keyword for the run (Content Optimizer + single). */
  manualKeyword?: string;
  /** Bulk multi-post only: ensure at least 4 FAQ items; fill gaps without replacing existing when already ≥4. */
  bulkFaqMinimum4?: boolean;
  /** Overview “Bulk & multi-URL” SEO extra text: generate + upload only the ACF `seo_extra_text` / `extra_text`
   * field. No main body, no meta, no other ACF (keyword, FAQ, date, etc.).
   */
  seoExtraTextFieldOnly?: boolean;
  /** When true, skip NEO Pulse redirect focus keyword / FAQ writes during WP REST upload (bulk Content Optimizer / content-only). */
  contentOnlyUpload?: boolean;
  /** Overview sitemap bucket that loaded inventory (posts | pages | sap). */
  inventorySitemapSource?: "posts" | "pages" | "sap";
}

interface UseOptimizationOptionsProps {
  optimizationOptions?: OptimizationOptions;
  onOptimizationOptionsChange?: (options: OptimizationOptions) => void;
}

export function useOptimizationOptions({
  optimizationOptions,
  onOptimizationOptionsChange,
}: UseOptimizationOptionsProps) {
  const [optimizeTitle, setOptimizeTitle] = useState(optimizationOptions?.optimizeTitle ?? true);
  const [optimizeMeta, setOptimizeMeta] = useState(optimizationOptions?.optimizeMeta ?? true);
  const [optimizeExcerpt, setOptimizeExcerpt] = useState(optimizationOptions?.optimizeExcerpt ?? true);
  const [optimizeContent, setOptimizeContent] = useState(optimizationOptions?.optimizeContent ?? true);
  const [optimizeFeaturedImage, setOptimizeFeaturedImage] = useState(optimizationOptions?.optimizeFeaturedImage ?? false);
  const [featuredImageType, setFeaturedImageType] = useState<'ai-generated' | 'google-maps'>(optimizationOptions?.featuredImageType ?? 'ai-generated');
  const [autoOptimize, setAutoOptimize] = useState(optimizationOptions?.autoOptimize ?? true);
  const [testMode, setTestMode] = useState(optimizationOptions?.testMode ?? false);
  const [hasEntity, setHasEntity] = useState(optimizationOptions?.hasEntity ?? undefined);
  const [optimizeExtraText, setOptimizeExtraText] = useState(optimizationOptions?.optimizeExtraText ?? false);
  const [optimizeExtraImage, setOptimizeExtraImage] = useState(optimizationOptions?.optimizeExtraImage ?? false);
  const [stagingSite, setStagingSite] = useState(optimizationOptions?.stagingSite ?? false);
  const [useAcfKeyword, setUseAcfKeyword] = useState(optimizationOptions?.useAcfKeyword ?? false);
  const [manualKeyword, setManualKeyword] = useState(optimizationOptions?.manualKeyword ?? '');
  const [bulkFaqMinimum4, setBulkFaqMinimum4] = useState(optimizationOptions?.bulkFaqMinimum4 ?? false);

  // Sync local state with props when they change
  useEffect(() => {
    if (optimizationOptions) {
      setOptimizeTitle(optimizationOptions.optimizeTitle);
      setOptimizeMeta(optimizationOptions.optimizeMeta);
      setOptimizeExcerpt(optimizationOptions.optimizeExcerpt);
      setOptimizeContent(optimizationOptions.optimizeContent);
      setOptimizeFeaturedImage(optimizationOptions.optimizeFeaturedImage);
      setFeaturedImageType(optimizationOptions.featuredImageType ?? 'ai-generated');
      setAutoOptimize(optimizationOptions.autoOptimize ?? true);
      setTestMode(optimizationOptions.testMode ?? false);
      setHasEntity(optimizationOptions.hasEntity);
      setOptimizeExtraText(optimizationOptions.optimizeExtraText ?? false);
      setOptimizeExtraImage(optimizationOptions.optimizeExtraImage ?? false);
      setStagingSite(optimizationOptions.stagingSite ?? false);
      setUseAcfKeyword(optimizationOptions.useAcfKeyword ?? false);
      setManualKeyword(optimizationOptions.manualKeyword ?? '');
      setBulkFaqMinimum4(optimizationOptions.bulkFaqMinimum4 ?? false);
    }
  }, [optimizationOptions]);

  // Helper to create updated options object
  const createUpdatedOptions = (updates: Partial<OptimizationOptions>): OptimizationOptions => ({
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
    ...updates,
  });

  // Handle option changes
  const handleOptimizeTitleChange = (checked: boolean) => {
    setOptimizeTitle(checked);
    if (onOptimizationOptionsChange) {
      onOptimizationOptionsChange(createUpdatedOptions({ optimizeTitle: checked }));
    }
  };

  const handleOptimizeMetaChange = (checked: boolean) => {
    setOptimizeMeta(checked);
    if (onOptimizationOptionsChange) {
      onOptimizationOptionsChange(createUpdatedOptions({ optimizeMeta: checked }));
    }
  };

  const handleOptimizeExcerptChange = (checked: boolean) => {
    setOptimizeExcerpt(checked);
    if (onOptimizationOptionsChange) {
      onOptimizationOptionsChange(createUpdatedOptions({ optimizeExcerpt: checked }));
    }
  };

  const handleOptimizeContentChange = (checked: boolean) => {
    setOptimizeContent(checked);
    if (onOptimizationOptionsChange) {
      onOptimizationOptionsChange(createUpdatedOptions({ optimizeContent: checked }));
    }
  };

  const handleOptimizeFeaturedImageChange = (checked: boolean) => {
    setOptimizeFeaturedImage(checked);
    if (onOptimizationOptionsChange) {
      onOptimizationOptionsChange(createUpdatedOptions({ optimizeFeaturedImage: checked }));
    }
  };

  const handleFeaturedImageTypeChange = (type: 'ai-generated' | 'google-maps') => {
    setFeaturedImageType(type);
    if (onOptimizationOptionsChange) {
      onOptimizationOptionsChange(createUpdatedOptions({ featuredImageType: type }));
    }
  };

  const handleAutoOptimizeChange = (checked: boolean) => {
    setAutoOptimize(checked);
    if (onOptimizationOptionsChange) {
      onOptimizationOptionsChange(createUpdatedOptions({ autoOptimize: checked }));
    }
  };

  const handleTestModeChange = (checked: boolean) => {
    setTestMode(checked);
    if (onOptimizationOptionsChange) {
      onOptimizationOptionsChange(createUpdatedOptions({ testMode: checked }));
    }
  };

  const handleHasEntityChange = (checked: boolean | undefined) => {
    setHasEntity(checked);
    if (onOptimizationOptionsChange) {
      onOptimizationOptionsChange(createUpdatedOptions({ hasEntity: checked }));
    }
  };

  const handleOptimizeExtraTextChange = (checked: boolean) => {
    setOptimizeExtraText(checked);
    if (onOptimizationOptionsChange) {
      onOptimizationOptionsChange(createUpdatedOptions({ optimizeExtraText: checked }));
    }
  };

  const handleOptimizeExtraImageChange = (checked: boolean) => {
    setOptimizeExtraImage(checked);
    if (onOptimizationOptionsChange) {
      onOptimizationOptionsChange(createUpdatedOptions({ optimizeExtraImage: checked }));
    }
  };

  const handleStagingSiteChange = (checked: boolean) => {
    setStagingSite(checked);
    if (onOptimizationOptionsChange) {
      onOptimizationOptionsChange(createUpdatedOptions({ stagingSite: checked }));
    }
  };

  const handleUseAcfKeywordChange = (checked: boolean) => {
    setUseAcfKeyword(checked);
    if (onOptimizationOptionsChange) {
      onOptimizationOptionsChange(createUpdatedOptions({ useAcfKeyword: checked }));
    }
  };

  const handleManualKeywordChange = (value: string) => {
    setManualKeyword(value);
    if (onOptimizationOptionsChange) {
      onOptimizationOptionsChange(createUpdatedOptions({ manualKeyword: value }));
    }
  };

  const handleBulkFaqMinimum4Change = (checked: boolean) => {
    setBulkFaqMinimum4(checked);
    if (onOptimizationOptionsChange) {
      onOptimizationOptionsChange(createUpdatedOptions({ bulkFaqMinimum4: checked }));
    }
  };

  return {
    // State values
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
    // Handlers
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
    // Current options object
    currentOptions: {
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
    },
  };
}

