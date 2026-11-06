import { notify } from "@/lib/app-notifications";
import { NOTIFY_AI_ANALYZING_KNOWLEDGE_GRAPH_TO_CREATE_T, NOTIFY_AI_SUMMARIZATION_FAILED_SAVING_ORIGINAL_, notifyFailedToSaveGraphToKnowledgeBaseX, notifyKnowledgeGraphSavedToKnowledgeBase, notifyKnowledgeGraphSummarizedXkbXkb } from "@/lib/notify-messages";
import { getStoredSites } from '@/components/integrations/storage';
import { exportGraphToJSON, type KnowledgeGraph } from '@/lib/knowledge-graph-export';
import { loadApiKey, streamChatCompletion } from '@/lib/api';
import { createTempKbFile, updateKbFile } from '@/lib/kb-file-utils';
import type { StoredFile } from '@/components/KnowledgeBaseTab';
import { resolveModelForAgentCategory } from '@/lib/openrouter-agent-category-api';
import { KB_FILES_STORAGE_KEY } from "@/lib/knowledge-graph-auto-trigger-shared";
import { logger } from "@/lib/logger";

const SAVED_GRAPHS_KEY = 'kg_saved_graphs'; // Track saved graphs to prevent duplicates

// Track which graphs have been saved (by site_id + generated_at)
function markGraphAsSaved(siteId: string, generatedAt: string): void {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SAVED_GRAPHS_KEY) || '[]') as string[];
    const key = `${siteId}-${generatedAt}`;
    if (!saved.includes(key)) {
      saved.push(key);
      sessionStorage.setItem(SAVED_GRAPHS_KEY, JSON.stringify(saved));
    }
  } catch (e) {
    logger.error('Error marking graph as saved:', e);
  }
}

function isGraphAlreadySaved(siteId: string, generatedAt: string): boolean {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SAVED_GRAPHS_KEY) || '[]') as string[];
    const key = `${siteId}-${generatedAt}`;
    return saved.includes(key);
  } catch (e) {
    return false;
  }
}

/**
 * Summarize knowledge graph JSON with AI
 */
async function summarizeKnowledgeGraphJSON(
  jsonString: string,
  apiKey: string,
  tempFileName: string
): Promise<string> {
  const systemPrompt = `You are a knowledge graph analyzer that creates token-optimized briefings from knowledge graph JSON data. Your task is to extract and summarize the essential information about keyword relationships, connections, and metadata in a concise format.

CRITICAL RULES:
1. PRESERVE ALL KEYWORDS - List all keywords with their post counts and connection counts
2. PRESERVE KEY CONNECTIONS - Include the most important connections (highest strength) between keywords
3. PRESERVE METADATA - Keep site_id, generated_at, total counts
4. TOKEN OPTIMIZATION - Use concise language, remove redundant data, focus on actionable insights
5. STRUCTURE CLEARLY - Organize by: metadata summary, top keywords, key connections
6. REMOVE REDUNDANCY - Don't repeat information, use abbreviations where clear

OUTPUT FORMAT:
- Brief metadata summary (site, date, totals)
- Top keywords list (keyword: post_count, connections)
- Key connections (source -> target: strength)
- Focus on the most important relationships only`;

  const userPrompt = `Create a token-optimized briefing from this knowledge graph JSON. Extract the essential keyword relationships and connections:

${jsonString}

Provide a concise summary that preserves all critical information while minimizing tokens. Focus on the most important keywords and their strongest connections.`;

  let summarizedText = "";
  
  try {
    updateKbFile(tempFileName, `[AI SUMMARIZATION IN PROGRESS] Analyzing knowledge graph structure and relationships...\n\nThis file will be updated automatically when the AI briefing is complete.`);
    
    await streamChatCompletion({
      apiKey,
      model: resolveModelForAgentCategory("research"),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      maxTokens: 4000,
      topP: 0.9,
      onContentChunk: (chunk) => {
        summarizedText += chunk;
      }
    });
    
    return summarizedText.trim();
  } catch (error) {
    logger.error('[Knowledge Graph] Error summarizing with AI:', error);
    throw error;
  }
}

/**
 * Save graph to knowledge base with optional AI summarization
 * Exported for use in components
 */
export async function saveGraphToKnowledgeBase(graphData: KnowledgeGraph): Promise<void> {
  try {
    // Generate JSON from graph
    const graphJSON = exportGraphToJSON(graphData);
    
    // Check if already saved to prevent duplicates
    const siteId = graphJSON.metadata.site_id || 'unknown';
    const generatedAt = graphJSON.metadata.generated_at || '';
    if (isGraphAlreadySaved(siteId, generatedAt)) {
      return;
    }
    
    const jsonString = JSON.stringify(graphJSON, null, 2);
    
    // Get site information for better filename
    const sites = getStoredSites();
    const site = sites.find(s => s.id === siteId);
    
    // Create a sanitized site name for filename
    const sanitizeForFilename = (text: string): string => {
      return text
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
        .substring(0, 50); // Limit length
    };
    
    let siteNamePart = 'unknown-site';
    if (site) {
      // Prefer site name, fallback to domain from URL
      if (site.name) {
        siteNamePart = sanitizeForFilename(site.name);
      } else if (site.siteUrl) {
        const domain = site.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0];
        siteNamePart = sanitizeForFilename(domain);
      }
    }
    
    // Create filename with site name and timestamp
    const timestamp = Date.now();
    const fileName = `knowledge-graph-${siteNamePart}-${timestamp}.json`;
    
    // Check if AI summarization is available
    const apiKey = loadApiKey();
    const useAISummarization = !!apiKey && apiKey.trim().length > 0;
    
    let finalContent = jsonString;
    let finalSize = jsonString.length;
    
    let tempFileName: string | null = null;
    
    if (useAISummarization && jsonString.length > 10000) {
      // Only summarize if file is large (>10KB)
      try {
        notify.info(NOTIFY_AI_ANALYZING_KNOWLEDGE_GRAPH_TO_CREATE_T);
        
        // Create temp file
        tempFileName = createTempKbFile(`knowledge-graph-${siteNamePart}`, 'AI summarization in progress. Creating token-optimized briefing...');
        
        // Summarize with AI
        const summarizedContent = await summarizeKnowledgeGraphJSON(jsonString, apiKey, tempFileName);
        finalContent = summarizedContent;
        finalSize = summarizedContent.length;
        
        notify.success(notifyKnowledgeGraphSummarizedXkbXkb(Math.round(jsonString.length / 1024), Math.round(finalSize / 1024)));
      } catch (error) {
        logger.error('[Knowledge Graph] AI summarization failed, using original JSON:', error);
        notify.warning(NOTIFY_AI_SUMMARIZATION_FAILED_SAVING_ORIGINAL_);
        // Continue with original content
        // Remove temp file if it exists
        if (tempFileName) {
          const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
          const files = JSON.parse(storedFilesString) as StoredFile[];
          const updatedFiles = files.filter(f => f.name !== tempFileName);
          localStorage.setItem(KB_FILES_STORAGE_KEY, JSON.stringify(updatedFiles));
          window.dispatchEvent(new CustomEvent('kb-files-updated', { detail: { files: updatedFiles } }));
        }
      }
    }
    
    // Create StoredFile object
    const storedFile: StoredFile = {
      name: fileName,
      size: finalSize,
      content: finalContent,
      starred: false,
      timestamp: timestamp,
    };
    
    // Get current files from localStorage
    const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
    const files = JSON.parse(storedFilesString) as StoredFile[];
    
    // Remove temp file if it exists and add final file
    const updatedFiles = files
      .filter(f => f.name !== tempFileName && (!f.name.includes(`knowledge-graph-${siteNamePart}-${timestamp}`) || !f.isProcessing))
      .concat([storedFile]);
    
    // Save to localStorage
    localStorage.setItem(KB_FILES_STORAGE_KEY, JSON.stringify(updatedFiles));
    
    // Dispatch event to notify UI
    window.dispatchEvent(new CustomEvent('kb-files-updated', { 
      detail: { files: updatedFiles } 
    }));
    
    const sizeText = useAISummarization && jsonString.length > 10000 
      ? `${Math.round(finalSize / 1024)}KB (AI optimized from ${Math.round(jsonString.length / 1024)}KB)`
      : `${Math.round(finalSize / 1024)}KB`;
    
    // Mark as saved to prevent duplicates
    markGraphAsSaved(siteId, generatedAt);
    
    notify.success(notifyKnowledgeGraphSavedToKnowledgeBase(sizeText));
  } catch (error) {
    logger.error('Error saving graph to knowledge base:', error);
    notify.error(notifyFailedToSaveGraphToKnowledgeBaseX(error instanceof Error ? error.message : 'Unknown error'));
    throw error;
  }
}
