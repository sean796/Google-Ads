import { useState, useCallback, useRef } from 'react';
import { logger } from "@/lib/logger";
import { GEMINI_FLASH_MODEL } from "@/lib/global-agent-models";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ALL_BLOG_IDEAS_ARE_ALREADY_SELECTED_PLEA, NOTIFY_FAILED_TO_GENERATE_CHECKLIST_PLEASE_TRY_, NOTIFY_PLEASE_DESELECT_AT_LEAST_ONE_BLOG_IDEA_T } from "@/lib/notify-messages";
import { resolveOpenRouterApiKeyForHarness } from '@/lib/openrouter-api-key-resolve';
import type { CSVRow } from '@/lib/bulk-auto-generate';
import { parseTitleTemplate } from '@/lib/title-template-parser';
import type { Message } from '@/lib/api';
import type { PromptBulkIdeasContext } from '@/lib/bulk/prompt-bulk-ideas-context';
import { resolvePromptBulkIdeasContext } from '@/lib/bulk/prompt-bulk-ideas-context';
import { getStoredSites } from "@/components/integrations/storage";
import type { WordPressSite } from "@/components/integrations/types";
import type { ConnectedSiteSummary } from '@/components/integrations/types';
import { getBlogModel, getResearchModel } from '@/lib/optimization-settings-storage';
import { resolveModelForAgentCategory } from '@/lib/openrouter-agent-category-api';
import type { KeywordAIAnalysis } from '@/lib/keyword-types';
import { mergePromptBulkIdeaSlots } from '@/lib/bulk/merge-prompt-bulk-idea-slots';
import { seedPromptBlogSlots } from '@/lib/bulk/prompt-blog-slots';
import { normalizeBulkSitemapScopeTags } from '@/lib/bulk/bulk-sitemap-mode';
import { generateSimplePromptIdeas } from '@/lib/bulk/prompt-bulk-ideas-simple';
import type { BulkSiteSitemapConfig } from '@/components/keyword-research/bulk/BulkGeneratorSitemapMenu';

export interface UsePromptBulkGenerateProps {
  apiKey?: string;
  openRouterApiKey?: string;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  flowPurpose?: string;
  // Blog generation settings - count is required; use the amount the user picked (no default/fallback).
  numberOfBlogs: number;
  entityMode?: 'auto' | 'manual' | 'blank';
  entityValue?: string;
  keywordMode?: 'same' | 'per-blog' | 'gsc-keywords';
  keywordValue?: string;
  gscExactKeywords?: string[]; // Exact GSC keywords to use
  optionalPrompt?: string;
  titleTemplate?: string; // Title template with variables like [Entity], [Keyword]
  entityList?: string; // Comma or newline-separated list of entity values
  keywordList?: string; // Comma or newline-separated list of keyword values
  locationList?: string; // Comma or newline-separated list of location values
  numberList?: string; // Comma or newline-separated list of number values
  featuredImagePerBlog?: boolean;
  // Connected WordPress site (for target topic)
  connectedSite?: ConnectedSiteSummary;
  siteConfigs?: Record<string, BulkSiteSitemapConfig>;
  selectedWordPressSites?: Set<string>;
  // Progress callback for sub-step tracking
  onProgress?: (step: string, progress: number) => void;
  // Keyword analysis results from Content Optimizer module
  keywordAnalysisResults?: Map<string, KeywordAIAnalysis>;
  promptIdeasContext?: PromptBulkIdeasContext | null;
  promptSiteContextReady?: boolean;
  sitemapInventoryLoading?: boolean;
}

const NO_GSC_EXACT_KEYWORDS: NonNullable<UsePromptBulkGenerateProps['gscExactKeywords']> = [];

export function usePromptBulkGenerate({
  apiKey,
  openRouterApiKey,
  selectedModel = getBlogModel(),
  temperature = 1.0,
  maxTokens = 4000,
  topP = 0.9,
  flowPurpose,
  numberOfBlogs,
  entityMode = 'blank',
  entityValue = '',
  keywordMode = 'per-blog',
  keywordValue = '',
  optionalPrompt = '',
  titleTemplate = '',
  entityList = '',
  keywordList = '',
  locationList = '',
  numberList = '',
  featuredImagePerBlog = true,
  connectedSite,
  siteConfigs,
  selectedWordPressSites,
  gscExactKeywords = NO_GSC_EXACT_KEYWORDS,
  onProgress,
  keywordAnalysisResults,
  promptIdeasContext = null,
  promptSiteContextReady = true,
  sitemapInventoryLoading = false,
}: UsePromptBulkGenerateProps) {
  const [userInput, setUserInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isGeneratingChecklist, setIsGeneratingChecklist] = useState(false);
  const [hasGeneratedChecklist, setHasGeneratedChecklist] = useState(false);
  const [generatedRows, setGeneratedRows] = useState<CSVRow[]>(() => []);
  const [wordPressPostsMetadata, setWordPressPostsMetadata] = useState<Array<{ id: number; slug: string; title: string; link: string }>>([]);
  /** Total URLs sent to AI across Posts + Pages + SAP buckets (null = not yet loaded). */
  const [lastInventorySentToAiCount, setLastInventorySentToAiCount] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  /**
   * Generate checklist from settings (no user prompt required)
   * @param keepIndices Optional array of indices to keep from existing generatedRows
   */
  const handleGenerateChecklist = useCallback(async (keepIndices?: number[]): Promise<CSVRow[] | undefined> => {
    const effectiveOpenRouterKey = (await resolveOpenRouterApiKeyForHarness()).trim();

    setIsGeneratingChecklist(true);
    setLastInventorySentToAiCount(null);

    const allSlotKeywords = generatedRows
      .slice(0, numberOfBlogs)
      .map((r) => r.keyword?.trim() ?? "");
    const allSlotModifiers = generatedRows
      .slice(0, numberOfBlogs)
      .map((r) => r.modifier?.trim() ?? "");

    // Calculate how many new blogs to generate
    const keptCount = keepIndices ? keepIndices.length : 0;
    const blogsToGenerate = numberOfBlogs - keptCount;

    const slotKeywordsForGeneration =
      keepIndices && keepIndices.length > 0
        ? allSlotKeywords.filter((_, i) => !keepIndices.includes(i))
        : allSlotKeywords.slice(0, blogsToGenerate);

    const slotModifiersForGeneration =
      keepIndices && keepIndices.length > 0
        ? allSlotModifiers.filter((_, i) => !keepIndices.includes(i))
        : allSlotModifiers.slice(0, blogsToGenerate);

    if (blogsToGenerate <= 0) {
      notify.error(NOTIFY_ALL_BLOG_IDEAS_ARE_ALREADY_SELECTED_PLEA);
      setIsGeneratingChecklist(false);
      return undefined;
    }
    
    const topicLine = [flowPurpose?.trim(), optionalPrompt?.trim()].filter(Boolean).join(". ");
    const userMessage = topicLine
      ? `Generate ${blogsToGenerate} blog post ideas for this topic: ${topicLine}`
      : `Generate ${blogsToGenerate} blog post ideas`;
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    let rowsInFlight: CSVRow[] = [];
    try {
      const logPromptBulkProgress = (step: string, pct: number) => {
        onProgress?.(step, pct);
      };


      logPromptBulkProgress("Starting ideas…", 0);

      let matchedWpSite: WordPressSite | null = null;
      if (connectedSite) {
        const sites = getStoredSites();
        const normalize = (url: string) =>
          url.trim().toLowerCase().replace(/\/$/, "").replace(/^https?:\/\/(www\.)?/, "");
        matchedWpSite =
          sites.find((s) => normalize(s.siteUrl) === normalize(connectedSite.siteUrl)) ?? null;
      }

      let ideasContext = promptIdeasContext;
      if (connectedSite && matchedWpSite) {
        if (!ideasContext?.isReady) {
          logPromptBulkProgress("Loading site inventory and GSC…", 5);
          ideasContext = await resolvePromptBulkIdeasContext(matchedWpSite);
        }
        if (!ideasContext.isReady) {
          throw new Error(
            "Site sitemap inventory and GSC keywords must be loaded before generating ideas.",
          );
        }
      }

      const promptSiteId =
        matchedWpSite?.id ?? Array.from(selectedWordPressSites ?? [])[0];
      const scopeFromConfig = normalizeBulkSitemapScopeTags(
        promptSiteId ? siteConfigs?.[promptSiteId]?.scopeTags : undefined,
      );
      const contentScope =
        scopeFromConfig.length > 0 ? scopeFromConfig : (["posts"] as const);
      const ideaModel =
        getResearchModel(matchedWpSite?.id)?.trim() ||
        resolveModelForAgentCategory("research", matchedWpSite?.id)?.trim() ||
        GEMINI_FLASH_MODEL;
      logPromptBulkProgress("Generating blog ideas…", 25);

      let cappedParsedRows = await generateSimplePromptIdeas({
        apiKey: effectiveOpenRouterKey,
        model: ideaModel,
        count: blogsToGenerate,
        topic: topicLine,
        slotKeywords: slotKeywordsForGeneration,
        slotModifiers: slotModifiersForGeneration,
        temperature: Math.min(temperature ?? 1, 0.35),
        maxTokens: Math.min(maxTokens || 4000, 8192),
        connectedSite: ideasContext?.connectedSite ?? null,
        siteInventoryJson: ideasContext?.siteInventoryJson,
        gscKeywords: ideasContext?.gscKeywords,
        contentScope: [...contentScope],
      });


      if (ideasContext?.inventoryUrlCount != null) {
        setLastInventorySentToAiCount(ideasContext.inventoryUrlCount);
      }
      rowsInFlight = cappedParsedRows.map((r) => ({ ...r }));

      if (featuredImagePerBlog) {
        cappedParsedRows = cappedParsedRows.map((row) => ({
          ...row,
          featuredImage: row.featuredImage ?? "y",
        }));
      }

      mergePromptBulkIdeaSlots({
        parsedRows: cappedParsedRows,
        generatedRows,
        slotKeywords: slotKeywordsForGeneration,
        slotModifiers: slotModifiersForGeneration,
        keepIndices,
      });

      // Helper function to parse list strings (split by newlines or commas)
      const parseListString = (list: string): string[] => {
        if (!list || !list.trim()) return [];
        return list
          .split(/[\n,]/)
          .map(item => item.trim())
          .filter(item => item.length > 0);
      };

      if (entityMode === "manual") {
        const entitySource = entityList?.trim() ? entityList : entityValue;
        if (entitySource?.trim()) {
          const entityValues = parseListString(entitySource);
          cappedParsedRows.forEach((row, index) => {
            const entityIndex = Math.min(index, entityValues.length - 1);
            row.entity = entityValues[entityIndex] || "";
          });
        }
      }

      if (titleTemplate && titleTemplate.trim()) {
        const entityValues = parseListString(entityList || '');
        const keywordValues = parseListString(keywordList || '');
        const locationValues = parseListString(locationList || '');
        const numberValues = parseListString(numberList || '');
        
        cappedParsedRows.forEach((row, index) => {
          const getListValue = (list: string[], fallback: string): string => {
            if (list.length > 0) {
              return list[Math.min(index, list.length - 1)] || fallback;
            }
            return fallback;
          };
          
          const variables: Record<string, string> = {
            Keyword: getListValue(keywordValues, row.keyword || ''),
            Entity: getListValue(entityValues, row.entity || ''),
            Location: getListValue(locationValues, ''),
            Number: getListValue(numberValues, String(index + 1)),
          };
          
          // FORCE template application - override any AI-generated title
          const templateTitle = parseTitleTemplate(titleTemplate, variables);
          if (templateTitle && templateTitle.trim()) {
            row.title = templateTitle.trim();
          }
          // Sync entity to row when template provided an Entity (so Origin ACF gets set from entity)
          if (variables.Entity && variables.Entity.trim() && variables.Entity.trim() !== 'N/A') {
            row.entity = variables.Entity.trim();
          }
        });
      }

      rowsInFlight = cappedParsedRows.map((r) => ({ ...r }));

      // Determine final rows (merged or new)
      let finalRows: CSVRow[];
      if (keepIndices && keepIndices.length > 0) {
        const keptRows = keepIndices.map(idx => generatedRows[idx]).filter(Boolean);
        finalRows = [...keptRows, ...cappedParsedRows].slice(0, numberOfBlogs);
      } else {
        finalRows = cappedParsedRows;
      }

      setGeneratedRows(finalRows);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: finalRows
            .map((r, i) => `${i + 1}. ${r.title}\nMeta: ${r.meta_description ?? ""}`)
            .join("\n\n"),
        },
      ]);

      logPromptBulkProgress("Done", 100);
      setHasGeneratedChecklist(true);
      return finalRows;
    } catch (error) {
      logger.error(
        "%c[Blog Ideas] ❌ Generation failed:",
        "color: #ff4444; font-weight: bold; font-size: 13px;",
        error,
      );
      onProgress?.("Generation failed", 0);
      const msg = error instanceof Error ? error.message : NOTIFY_FAILED_TO_GENERATE_CHECKLIST_PLEASE_TRY_;
      notify.error(msg);
      setChatMessages((prev) => prev.slice(0, -1));
      return undefined;
    } finally {
      setIsGeneratingChecklist(false);
    }
  }, [
    temperature,
    maxTokens,
    flowPurpose,
    numberOfBlogs,
    entityMode,
    entityValue,
    optionalPrompt,
    titleTemplate,
    entityList,
    keywordList,
    locationList,
    numberList,
    featuredImagePerBlog,
    connectedSite,
    generatedRows,
    onProgress,
    promptIdeasContext,
    siteConfigs,
    selectedWordPressSites,
  ]);

  /**
   * Reset the prompt generation state
   */
  const resetPromptGeneration = useCallback(() => {
    setUserInput('');
    setChatMessages([]);
    setHasGeneratedChecklist(false);
    setGeneratedRows(seedPromptBlogSlots(numberOfBlogs));
    setWordPressPostsMetadata([]);
    setLastInventorySentToAiCount(null);
  }, [numberOfBlogs]);

  /**
   * Modify the checklist (regenerate with modifications)
   */
  const handleModifyChecklist = useCallback(() => {
    setHasGeneratedChecklist(false);
    setGeneratedRows(seedPromptBlogSlots(numberOfBlogs));
    // Keep chat messages for context
  }, [numberOfBlogs]);

  /**
   * Regenerate unselected blog ideas, keeping selected ones
   * Returns the new indices of the kept items (they will be at the beginning of the array)
   */
  const handleRegenerateUnselected = useCallback(async (selectedIndices: Set<number>): Promise<Set<number>> => {
    if (selectedIndices.size >= generatedRows.length) {
      notify.error(NOTIFY_PLEASE_DESELECT_AT_LEAST_ONE_BLOG_IDEA_T);
      return new Set();
    }

    // Convert Set to sorted array for consistent ordering
    const keepIndices = Array.from(selectedIndices).sort((a, b) => a - b);
    await handleGenerateChecklist(keepIndices);
    
    // Return the new indices - kept items are always at the beginning (0, 1, 2, ...)
    return new Set(keepIndices.map((_, idx) => idx));
  }, [handleGenerateChecklist, generatedRows.length]);

  return {
    // State
    userInput,
    setUserInput,
    chatMessages,
    isGeneratingChecklist,
    hasGeneratedChecklist,
    setHasGeneratedChecklist,
    generatedRows,
    setGeneratedRows,
    wordPressPostsMetadata,
    lastInventorySentToAiCount,
    chatEndRef,
    
    // Actions
    handleGenerateChecklist,
    resetPromptGeneration,
    handleModifyChecklist,
    handleRegenerateUnselected,
  };
}

