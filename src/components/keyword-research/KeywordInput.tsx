import { useState } from "react";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { logger } from "@/lib/logger";
import { NOTIFY_AI_ANALYZING_WIKIPEDIA_CONTENT_TO_SAVE_T, NOTIFY_FILE_UPLOAD_FUNCTIONALITY_NOT_AVAILABLE, NOTIFY_NO_CONTENT_FOUND_FOR_THIS_ENTITY, NOTIFY_PLEASE_ENTER_AN_ENTITY_NAME, notifyWikipediaContentSavedToKnowledgeBas, notifyWikipediaContentSavedToKnowledgeBas2 } from "@/lib/notify-messages";
import { fetchWikipediaContent, generateWikipediaCSV, type WikipediaFetchOptions } from "@/lib/wikipedia-api";
import { sanitizeFileName } from "@/lib/file-processing";
import type { StoredFile } from "@/components/KnowledgeBaseTab";
import { loadApiKey } from "@/lib/api";
import { createTempKbFile, updateKbFile } from "@/lib/kb-file-utils";
import { Button, Field, CheckField } from "@/ui";

interface KeywordInputProps {
  primaryKeyword: string;
  entity: string;
  forceRefresh: boolean;
  isAnalyzing: boolean;
  hasResult: boolean;
  onKeywordChange: (value: string) => void;
  onEntityChange: (value: string) => void;
  onForceRefreshChange: (checked: boolean) => void;
  onAnalyze: () => void;
  onClear: () => void;
  onClearCache: () => void;
  onAddFile?: (file: StoredFile) => void;
}

export function KeywordInput({
  primaryKeyword,
  entity,
  forceRefresh,
  isAnalyzing,
  hasResult,
  onKeywordChange,
  onEntityChange,
  onForceRefreshChange,
  onAnalyze,
  onClear,
  onClearCache,
  onAddFile,
}: KeywordInputProps) {
  const [isLoadingWikipedia, setIsLoadingWikipedia] = useState(false);

  const handleWikipediaFetch = async () => {
    const entityName = entity?.trim();

    if (!entityName) {
      logger.warn('[Wikipedia Button] Empty entity name');
      notify.error(NOTIFY_PLEASE_ENTER_AN_ENTITY_NAME);
      return;
    }

    if (!onAddFile) {
      logger.error('[Wikipedia Button] onAddFile callback not available');
      notify.error(NOTIFY_FILE_UPLOAD_FUNCTIONALITY_NOT_AVAILABLE);
      return;
    }

    setIsLoadingWikipedia(true);

    let tempFileName: string | null = null;

    try {
      // Load OpenRouter API key for AI summarization
      const openRouterApiKey = loadApiKey();
      const useAISummarization = !!openRouterApiKey && openRouterApiKey.trim().length > 0;
      
      // Create temp file immediately to show progress
      if (useAISummarization) {
        notify.info(NOTIFY_AI_ANALYZING_WIKIPEDIA_CONTENT_TO_SAVE_T);
        tempFileName = createTempKbFile(entityName, "AI summarization in progress. Analyzing content and preserving URLs...");
      }
      
      // Prepare fetch options with AI summarization
      const fetchOptions: WikipediaFetchOptions | undefined = useAISummarization ? {
        summarizeWithAI: true,
        openRouterApiKey: openRouterApiKey,
        onSummarizeProgress: (message) => {
          // Update temp file with progress
          if (tempFileName) {
            const progressContent = `title,url,content
"${entityName}","","[AI SUMMARIZATION IN PROGRESS] ${message}\n\nAnalyzing and summarizing content while preserving all URLs. This file will be updated automatically when complete."`;
            updateKbFile(tempFileName, progressContent);
          }
        },
      } : undefined;
      
      // Fetch Wikipedia content
      const chunks = await fetchWikipediaContent(entityName, fetchOptions);
      
      if (chunks.length === 0) {
        logger.warn('[Wikipedia Button] No chunks returned');
        // Remove temp file if it exists
        if (tempFileName) {
          try {
            const storedFilesString = localStorage.getItem('kb_files') || '[]';
            const files = JSON.parse(storedFilesString) as StoredFile[];
            const updatedFiles = files.filter(f => f.name !== tempFileName);
            localStorage.setItem('kb_files', JSON.stringify(updatedFiles));
            window.dispatchEvent(new CustomEvent('kb-files-updated', { detail: { files: updatedFiles } }));
          } catch (e) {
            logger.error('Error removing temp file:', e);
          }
        }
        notify.error(NOTIFY_NO_CONTENT_FOUND_FOR_THIS_ENTITY);
        return;
      }

      // Generate CSV
      const csvContent = generateWikipediaCSV(chunks);

      // Update temp file with final content if it exists, otherwise create new file
      if (tempFileName) {
        updateKbFile(tempFileName, csvContent, csvContent.length);
        notify.success(notifyWikipediaContentSavedToKnowledgeBas(chunks.length, Math.round(csvContent.length / 1024)));
      } else {
        // Create new file if no temp file was created
        const sanitizedEntity = sanitizeFileName(entityName);
        const timestamp = Date.now();
        const fileName = `wikipedia-${sanitizedEntity}-${timestamp}.csv`;
        
        const file: StoredFile = {
          name: fileName,
          size: csvContent.length,
          content: csvContent,
          starred: false,
          timestamp: timestamp,
        };

        onAddFile(file);
        notify.success(notifyWikipediaContentSavedToKnowledgeBas2(chunks.length));
      }
    } catch (error) {
      // Remove temp file on error
      if (tempFileName) {
        try {
          const storedFilesString = localStorage.getItem('kb_files') || '[]';
          const files = JSON.parse(storedFilesString) as StoredFile[];
          const updatedFiles = files.filter(f => f.name !== tempFileName);
          localStorage.setItem('kb_files', JSON.stringify(updatedFiles));
          window.dispatchEvent(new CustomEvent('kb-files-updated', { detail: { files: updatedFiles } }));
        } catch (e) {
          logger.error('[Wikipedia Button] Error removing temp file:', e);
        }
      }
      logger.error("[Wikipedia Button] Error details:", {
        error,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        entity: entityName,
      });
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : `Failed to fetch Wikipedia content: ${String(error)}`;
      
      notifyHeaderError("Keyword request failed", errorMessage);
    } finally {
      setIsLoadingWikipedia(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="primary-keyword">Primary Keyword</label>
        <div className="flex gap-2">
          <Field
            id="primary-keyword"
            value={primaryKeyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder="e.g., best seo tools"
            disabled={isAnalyzing}
          />
          <Button
            variant="run"
            onClick={onAnalyze}
            disabled={isAnalyzing || !primaryKeyword.trim()}
          >
            {isAnalyzing ? "Analyzing..." : forceRefresh ? "Analyze (Fresh)" : "Analyze"}
          </Button>
          {hasResult && (
            <>
              <Button onClick={onClear}>
                Clear
              </Button>
              <Button
                variant="quiet"
                onClick={onClearCache}
                title="Clear all cached keyword data"
              >
                Clear Cache
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Force Refresh Toggle */}
      <div className="flex items-center gap-2 p-2 bg-card/50 rounded border border-border">
        <CheckField
          checked={forceRefresh}
          onCheckedChange={onForceRefreshChange}
          label="Force fresh data (bypass cache) - Always search for new keywords"
        />
      </div>

      {/* Entity */}
      <div className="space-y-2">
        <label>Entity (Optional)</label>
        <div className="flex gap-2">
          <Field
            type="text"
            value={entity}
            onChange={(e) => onEntityChange(e.target.value)}
            placeholder="e.g., Local Business, Product Name"
            disabled={isLoadingWikipedia}
          />
          <Button
            onClick={handleWikipediaFetch}
            disabled={isLoadingWikipedia || !entity.trim() || !onAddFile}
            title="Fetch Wikipedia content and save to Knowledge Base"
          >
            {isLoadingWikipedia ? (
              null
            ) : (
              <span className="text-sm font-bold">W</span>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Used for content gap analysis, headlines, and checklist generation. Not used in keyword research API calls.
        </p>
      </div>
    </div>
  );
}

