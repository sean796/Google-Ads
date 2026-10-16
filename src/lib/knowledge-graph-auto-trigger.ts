/**
 * Utility to automatically trigger knowledge graph generation and save to KB
 * Can be called from anywhere, doesn't require component mounting
 */

import { notify } from "@/lib/app-notifications";
import { NOTIFY_AI_ANALYZING_KNOWLEDGE_GRAPH_TO_CREATE_T, NOTIFY_AI_SUMMARIZATION_FAILED_SAVING_ORIGINAL_, NOTIFY_DETECTING_LOCATIONS, NOTIFY_DETECTING_SITEMAPS, NOTIFY_FAILED_TO_DETECT_SITEMAPS_PLEASE_DETECT_, NOTIFY_GENERATING_KNOWLEDGE_GRAPH_FROM_SITEMAPS, NOTIFY_KNOWLEDGE_GRAPH_GENERATION_STARTED, NOTIFY_NO_SITEMAPS_FOUND_PLEASE_ENSURE_YOUR_SIT, NOTIFY_OPENROUTER_KEY, NOTIFY_SITEMAPS_DETECTED_SUCCESSFULLY, notifyAutoTriggeringKnowledgeGraphGenerati, notifyDetectedXLocationxAndAddedToKnowle, notifyFailedToExtractNapX, notifyFailedToSaveGraphToKnowledgeBaseX, notifyFailedToTriggerKnowledgeGraphX, notifyFailedX, notifyKnowledgeGraphGeneratedForXSavingT, notifyKnowledgeGraphSavedToKnowledgeBase, notifyKnowledgeGraphSummarizedXkbXkb, notifyKnowledgeGraphWorkflowFailedX, notifyNapExtractionAndLinkGraphGeneration, notifyNapExtractionFailedX, notifyNapFileNotFoundX, notifyStartingKnowledgeGraphWorkflowForX, notifyStartingNapExtractionAndLinkGraphG, notifyXX3, notifyXXXXPosts } from "@/lib/notify-messages";
import { detectSitemaps, parseSitemap } from '@/lib/wordpress-api';
import { getStoredSites, saveSites } from '@/components/integrations/storage';
import type { WordPressSite } from '@/components/integrations/types';
import { exportGraphToJSON } from '@/lib/knowledge-graph-export';
import { loadApiKey, streamChatCompletion } from '@/lib/api';
import { createTempKbFile, updateKbFile } from '@/lib/kb-file-utils';
import type { StoredFile } from '@/components/KnowledgeBaseTab';
import { extractNAPFromSite } from '@/lib/nap-extractor';
import { createNAPTemplate } from '@/lib/nap-kb-template';
import { BACKEND_API_BASE } from '@/lib/wordpress-api/connection';
import { resolveModelForAgentCategory } from '@/lib/openrouter-agent-category-api';

const KB_FILES_STORAGE_KEY = 'kb_files';
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
    console.error('Error marking graph as saved:', e);
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
    console.error('[Knowledge Graph] Error summarizing with AI:', error);
    throw error;
  }
}

/**
 * Save graph to knowledge base with optional AI summarization
 * Exported for use in components
 */
export async function saveGraphToKnowledgeBase(graphData: any): Promise<void> {
  try {
    // Generate JSON from graph
    const graphJSON = exportGraphToJSON(graphData);
    
    // Check if already saved to prevent duplicates
    const siteId = graphJSON.metadata.site_id || 'unknown';
    const generatedAt = graphJSON.metadata.generated_at || '';
    if (isGraphAlreadySaved(siteId, generatedAt)) {
      console.log('[Knowledge Graph] Graph already saved, skipping duplicate');
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
        console.error('[Knowledge Graph] AI summarization failed, using original JSON:', error);
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
  } catch (error: any) {
    console.error('Error saving graph to knowledge base:', error);
    notify.error(notifyFailedToSaveGraphToKnowledgeBaseX(error.message || 'Unknown error'));
    throw error;
  }
}

/**
 * Poll for graph completion and save to KB
 */
async function pollForGraphCompletion(jobId: string, siteName: string): Promise<void> {
  // Validate jobId before polling
  if (!jobId || jobId === 'pending') {
    throw new Error('Invalid job ID. Cannot poll for progress.');
  }
  
  const maxAttempts = 600; // 5 minutes max (600 * 500ms = 300s)
  let attempts = 0;
  
  return new Promise((resolve, reject) => {
    const pollInterval = setInterval(async () => {
      attempts++;
      
      try {
        const response = await fetch(`${BACKEND_API_BASE}/api/knowledge-model/progress/${jobId}`);
        if (!response.ok) {
          // If 404, the job doesn't exist - stop polling immediately
          if (response.status === 404) {
            clearInterval(pollInterval);
            reject(new Error(`Job ${jobId} not found. The backend may have restarted or the job was never created.`));
            return;
          }
          if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            reject(new Error('Timeout waiting for graph generation'));
          }
          return;
        }
        
        const data = await response.json();
        if (data.success && data.progress) {
          const progress = data.progress;
          
          // Update progress notification (use consistent ID to update instead of creating new toasts)
          if (progress.status === 'collecting_content' || progress.status === 'processing') {
            const message = progress.currentStep || 'Processing...';
            const processed = progress.processedPosts || 0;
            const total = progress.totalPosts || 0;
            
            // Extract batch info from message if available
            let displayMessage = message;
            if (message.includes('Fetching batch')) {
              // Show simplified message with progress
              displayMessage = `Fetching posts`;
            }
            
            if (total > 0) {
              notify.info(notifyXXXXPosts(siteName, displayMessage, processed, total), {
                id: `knowledge-graph-progress-${siteName}`, // Use consistent ID to update existing toast
                duration: Infinity // Keep it visible until completion
              });
            } else {
              notify.info(notifyXX3(siteName, displayMessage), {
                id: `knowledge-graph-progress-${siteName}`,
                duration: Infinity
              });
            }
          }
          
          // Check if completed
          if (progress.status === 'completed' && progress.result) {
            clearInterval(pollInterval);
            console.log('[Knowledge Graph] Graph generation completed, saving to KB...');
            // Dismiss the progress toast
            notify.dismiss(`knowledge-graph-progress-${siteName}`);
            notify.success(notifyKnowledgeGraphGeneratedForXSavingT(siteName));
            
            try {
              await saveGraphToKnowledgeBase(progress.result);
              resolve();
            } catch (error) {
              reject(error);
            }
          } else if (progress.status === 'failed') {
            clearInterval(pollInterval);
            // Dismiss the progress toast
            notify.dismiss(`knowledge-graph-progress-${siteName}`);
            reject(new Error(progress.error || 'Graph generation failed'));
          }
        }
        
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          reject(new Error('Timeout waiting for graph generation'));
        }
      } catch (error) {
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          reject(error);
        }
      }
    }, 500); // Poll every 500ms
  });
}

/**
 * Extract NAP information and save to knowledge base
 * Exported for manual triggering
 */
export async function extractNAPAndSaveToKB(site: WordPressSite): Promise<void> {
  console.log('[NAP Extraction] Starting NAP extraction for:', site.name || site.siteUrl);
  
  try {
    const apiKey = loadApiKey();
    if (!apiKey || apiKey.trim().length === 0) {
      notify.error(NOTIFY_OPENROUTER_KEY);
      return;
    }
    
    const napProgressToastId = notify.loading(NOTIFY_DETECTING_LOCATIONS);

    const napResult = await extractNAPFromSite(site, apiKey, (progress) => {
      notify.loading(progress.message || `Detecting locations (${progress.progress}%)`, {
        id: napProgressToastId,
      });
    });
    
    notify.dismiss(napProgressToastId);
    
    if (napResult.success && napResult.napInfo) {
      // Save NAP info to site data
      const sites = getStoredSites();
      const updatedSites = sites.map(s => {
        if (s.id === site.id) {
          return {
            ...s,
            napInfo: napResult.napInfo,
            locations: napResult.napInfo.locations || [],
          };
        }
        return s;
      });
      saveSites(updatedSites);
      
      // Create NAP template and add to knowledge base
      const napTemplate = createNAPTemplate(
        napResult.napInfo,
        napResult.napInfo.locations
      );
      
      const sanitizeForFilename = (text: string): string => {
        return text
          .replace(/[^a-zA-Z0-9-_]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .toLowerCase()
          .substring(0, 50);
      };
      
      const siteNamePart = site.name
        ? sanitizeForFilename(site.name)
        : sanitizeForFilename(site.siteUrl.replace(/^https?:\/\//, '').split('/')[0]);
      
      const napFileName = `nap-info-${siteNamePart}-${Date.now()}.md`;
      const napFile: StoredFile = {
        name: napFileName,
        size: napTemplate.length,
        content: napTemplate,
        starred: false,
        timestamp: Date.now(),
      };
      
      const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
      const files = JSON.parse(storedFilesString) as StoredFile[];
      const updatedFiles = files.concat([napFile]);
      
      localStorage.setItem(KB_FILES_STORAGE_KEY, JSON.stringify(updatedFiles));
      window.dispatchEvent(new CustomEvent('kb-files-updated', { 
        detail: { files: updatedFiles } 
      }));
      
      const locationCount = napResult.napInfo.locations?.length || 0;
      notify.success(notifyDetectedXLocationxAndAddedToKnowle(locationCount, locationCount !== 1 ? 's' : ''));
    } else {
      console.warn('[NAP Extraction] Location detection failed:', napResult.error);
      notify.error(notifyNapExtractionFailedX(napResult.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('[NAP Extraction] Error:', error);
    notify.error(notifyFailedToExtractNapX(error instanceof Error ? error.message : 'Unknown error'));
    throw error;
  }
}

/**
 * Background NAP extraction after a successful WordPress connection: no toasts, no KB file.
 * Updates site.napInfo and site.locations in storage only.
 */
export async function extractNAPAndSaveToSiteSilent(site: WordPressSite): Promise<void> {
  const apiKey = loadApiKey();
  if (!apiKey?.trim()) {
    console.warn('[NAP Silent] No OpenRouter API key; skipping background NAP');
    return;
  }
  try {
    const napResult = await extractNAPFromSite(site, apiKey, () => {});
    if (napResult.success && napResult.napInfo) {
      const sites = getStoredSites();
      const updatedSites = sites.map((s) =>
        s.id === site.id
          ? { ...s, napInfo: napResult.napInfo, locations: napResult.napInfo.locations || [] }
          : s
      );
      saveSites(updatedSites);
      const n = napResult.napInfo.locations?.length ?? 0;
      console.log(`[NAP Silent] Saved ${n} location(s) for site ${site.id}`);
    } else {
      console.warn('[NAP Silent] Extraction failed:', napResult.error);
    }
  } catch (e) {
    console.warn('[NAP Silent] Error:', e);
  }
}

/**
 * Main function to trigger knowledge graph workflow
 * Detects sitemaps, generates graph, and saves to KB
 */
export async function triggerKnowledgeGraphWorkflow(site: WordPressSite): Promise<void> {
  console.log('[Knowledge Graph] Starting workflow for:', site.name || site.siteUrl);
  
  try {
    notify.info(notifyStartingKnowledgeGraphWorkflowForX(site.name || site.siteUrl));
    
    // Step 1: Detect sitemaps if they don't exist
    let siteWithSitemaps = site;
    if (!site.sitemaps?.mainSitemapUrl) {
      notify.info(NOTIFY_DETECTING_SITEMAPS);
      try {
        const sitemapResult = await detectSitemaps(
          site.siteUrl,
          site.username,
          site.appPassword
        );
        
        if (sitemapResult.found && sitemapResult.sitemapUrl) {
          // Parse the sitemap
          const parseResult = await parseSitemap(
            site.siteUrl,
            sitemapResult.sitemapUrl,
            site.username,
            site.appPassword
          );
          
          // Convert wp-sitemap.xml to sitemap_index.xml if needed
          let sitemapUrl = sitemapResult.sitemapUrl;
          if (sitemapUrl.includes('/wp-sitemap.xml')) {
            sitemapUrl = sitemapUrl.replace('/wp-sitemap.xml', '/sitemap_index.xml');
          }
          
          // Update site with sitemap info
          const sites = getStoredSites();
          const updated = sites.map(s => {
            if (s.id === site.id) {
              return {
                ...s,
                sitemaps: {
                  mainSitemapUrl: sitemapUrl,
                  detectedAt: Date.now(),
                  type: sitemapResult.type || parseResult.type,
                  childSitemaps: parseResult.childSitemaps,
                  urls: parseResult.urls,
                },
              };
            }
            return s;
          });
          
          saveSites(updated);
          siteWithSitemaps = updated.find(s => s.id === site.id) || site;
          notify.success(NOTIFY_SITEMAPS_DETECTED_SUCCESSFULLY);
        } else {
          notify.error(NOTIFY_NO_SITEMAPS_FOUND_PLEASE_ENSURE_YOUR_SIT);
          throw new Error('No sitemaps found');
        }
      } catch (error) {
        console.error('Error detecting sitemaps:', error);
        notify.error(NOTIFY_FAILED_TO_DETECT_SITEMAPS_PLEASE_DETECT_);
        throw error;
      }
    }
    
    // Step 2: Start knowledge graph generation
    console.log('[Knowledge Graph] Starting auto-graph generation...');
    notify.info(NOTIFY_GENERATING_KNOWLEDGE_GRAPH_FROM_SITEMAPS);
    
    const response = await fetch(`${BACKEND_API_BASE}/api/knowledge-model/auto-graph`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: siteWithSitemaps.id,
        siteUrl: siteWithSitemaps.siteUrl,
        username: siteWithSitemaps.username,
        appPassword: siteWithSitemaps.appPassword,
        gscData: []
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to start graph generation');
    }
    
    const data = await response.json();
    const jobId = data.jobId;
    
    if (!jobId || jobId === 'pending') {
      throw new Error('Invalid job ID returned from server. The backend may not be ready. Please try again.');
    }
    
    console.log('[Knowledge Graph] Auto-graph started with jobId:', jobId);
    notify.success(NOTIFY_KNOWLEDGE_GRAPH_GENERATION_STARTED);
    
    // Step 3: Poll for completion and save to KB
    await pollForGraphCompletion(jobId, site.name || site.siteUrl);
    
    console.log('[Knowledge Graph] Workflow completed successfully');
  } catch (error) {
    console.error('[Knowledge Graph] Error in workflow:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    notify.error(notifyKnowledgeGraphWorkflowFailedX(errorMessage));
    throw error;
  }
}

/**
 * Manual function to extract NAP and generate link graph
 * Combines NAP extraction and knowledge graph generation
 */
export async function extractNAPAndLinkGraph(site: WordPressSite): Promise<void> {
  console.log('[NAP & Link Graph] Starting extraction for:', site.name || site.siteUrl);
  
  try {
    notify.info(notifyStartingNapExtractionAndLinkGraphG(site.name || site.siteUrl));
    
    // Step 1: Extract NAP
    await extractNAPAndSaveToKB(site);
    
    // Step 2: Generate link graph
    await triggerKnowledgeGraphWorkflow(site);
    
    notify.success(notifyNapExtractionAndLinkGraphGeneration(site.name || site.siteUrl));
  } catch (error) {
    console.error('[NAP & Link Graph] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    notify.error(notifyFailedX(errorMessage));
    throw error;
  }
}

// Track which NAP files have already triggered knowledge graph generation
const NAP_TRIGGERED_GRAPHS_KEY = 'nap_triggered_graphs';

function markNAPAsTriggered(napFileName: string): void {
  try {
    const triggered = JSON.parse(sessionStorage.getItem(NAP_TRIGGERED_GRAPHS_KEY) || '[]') as string[];
    if (!triggered.includes(napFileName)) {
      triggered.push(napFileName);
      sessionStorage.setItem(NAP_TRIGGERED_GRAPHS_KEY, JSON.stringify(triggered));
    }
  } catch (e) {
    console.error('Error marking NAP as triggered:', e);
  }
}

function isNAPAlreadyTriggered(napFileName: string): boolean {
  try {
    const triggered = JSON.parse(sessionStorage.getItem(NAP_TRIGGERED_GRAPHS_KEY) || '[]') as string[];
    return triggered.includes(napFileName);
  } catch (e) {
    return false;
  }
}

/**
 * Extract site name from NAP filename
 * Format: nap-info-{siteNamePart}-{timestamp}.md
 */
function extractSiteNameFromNAPFileName(fileName: string): string | null {
if (!fileName.startsWith('nap-info-')) {
    return null;
  }
  
  // Remove 'nap-info-' prefix and '.md' suffix
  const withoutPrefix = fileName.replace(/^nap-info-/, '');
  const withoutSuffix = withoutPrefix.replace(/\.md$/, '');
  
  // Extract site name part (everything before the last timestamp)
  // Timestamp is typically at the end: -1234567890
  const parts = withoutSuffix.split('-');
  if (parts.length < 2) {
    return null;
  }
  
  // Last part is timestamp, everything before is site name
  const siteNameParts = parts.slice(0, -1);
  const siteName = siteNameParts.join('-');
return siteName || null;
}

/**
 * Find site by matching name or URL
 */
function findSiteByNAPFileName(napFileName: string): WordPressSite | null {
const siteNamePart = extractSiteNameFromNAPFileName(napFileName);
  if (!siteNamePart) {
return null;
  }
  
  const sites = getStoredSites();
  
  // Try to find site by matching name (sanitized) or URL domain
  const sanitizeForFilename = (text: string): string => {
    return text
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .substring(0, 50);
  };
  
  // Log all sites for debugging
  const sitesDebug = sites.map(s => ({
    id: s.id,
    name: s.name,
    sanitizedName: s.name ? sanitizeForFilename(s.name) : null,
    siteUrl: s.siteUrl,
    sanitizedDomain: s.siteUrl ? sanitizeForFilename(s.siteUrl.replace(/^https?:\/\//, '').split('/')[0]) : null,
  }));
for (const site of sites) {
    // Check if site name matches
    if (site.name) {
      const sanitizedName = sanitizeForFilename(site.name);
      if (sanitizedName === siteNamePart) {
return site;
      }
    }
    
    // Check if URL domain matches
    if (site.siteUrl) {
      const domain = site.siteUrl.replace(/^https?:\/\//, '').split('/')[0];
      const sanitizedDomain = sanitizeForFilename(domain);
      if (sanitizedDomain === siteNamePart) {
return site;
      }
    }
  }
return null;
}

/**
 * Handle NAP file creation - auto-trigger knowledge graph generation
 */
async function handleNAPFileCreated(napFile: StoredFile): Promise<void> {
// Check if already triggered for this NAP file
  if (isNAPAlreadyTriggered(napFile.name)) {
console.log('[Knowledge Graph] NAP file already triggered knowledge graph:', napFile.name);
    return;
  }
  
  // Find associated site
  const site = findSiteByNAPFileName(napFile.name);
  if (!site) {
console.warn('[Knowledge Graph] Could not find site for NAP file, skipping auto-trigger:', napFile.name);
    return;
  }
  
  // Mark as triggered before starting (to prevent duplicate triggers)
  markNAPAsTriggered(napFile.name);
// Trigger knowledge graph generation asynchronously (don't block)
  setTimeout(async () => {
    try {
      console.log('[Knowledge Graph] Auto-triggering knowledge graph generation for NAP file:', napFile.name);
      notify.info(notifyAutoTriggeringKnowledgeGraphGenerati(site.name || site.siteUrl));
      await triggerKnowledgeGraphWorkflow(site);
} catch (error) {
      console.error('[Knowledge Graph] Error auto-triggering knowledge graph:', error);
// Error already shown in toast by triggerKnowledgeGraphWorkflow
    }
  }, 1000); // Small delay to ensure NAP file is fully saved
}

/**
 * Initialize auto-trigger listener for NAP files
 * This should be called when the module loads
 */
export function initializeNAPAutoTrigger(): void {
const handleKBFilesUpdate = (e: CustomEvent) => {
const files = e.detail?.files as StoredFile[] | undefined;
    if (!files || !Array.isArray(files)) {
      return;
    }
    
    // Get previous files to detect new additions
    const previousFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
    const previousFiles = JSON.parse(previousFilesString) as StoredFile[];
    const previousFileNames = new Set(previousFiles.map(f => f.name));
    
    // Find newly added NAP files
    const newNapFiles = files.filter(file => 
      file.name.startsWith('nap-info-') && 
      file.name.endsWith('.md') &&
      !previousFileNames.has(file.name)
    );
// Handle each new NAP file
    for (const napFile of newNapFiles) {
      handleNAPFileCreated(napFile).catch(error => {
        console.error('[Knowledge Graph] Error handling NAP file:', error);
      });
    }
  };
  
  // Listen for kb-files-updated events
  window.addEventListener('kb-files-updated', handleKBFilesUpdate as EventListener);
}

/**
 * Check existing NAP files and trigger knowledge graph if needed
 */
function checkExistingNAPFiles(): void {
try {
    const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
    const files = JSON.parse(storedFilesString) as StoredFile[];
    
    const napFiles = files.filter(file => 
      file.name.startsWith('nap-info-') && 
      file.name.endsWith('.md')
    );
// Check each NAP file and trigger if not already triggered
    for (const napFile of napFiles) {
      if (!isNAPAlreadyTriggered(napFile.name)) {
handleNAPFileCreated(napFile).catch(error => {
          console.error('[Knowledge Graph] Error handling existing NAP file:', error);
        });
      }
    }
  } catch (error) {
    console.error('[Knowledge Graph] Error checking existing NAP files:', error);
  }
}

/**
 * Manually trigger knowledge graph for a specific NAP file
 * Exported for manual triggering from UI
 */
export async function manuallyTriggerKnowledgeGraphForNAP(napFileName: string): Promise<void> {
try {
    const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
    const files = JSON.parse(storedFilesString) as StoredFile[];
    const napFile = files.find(f => f.name === napFileName);
    
    if (!napFile) {
      notify.error(notifyNapFileNotFoundX(napFileName));
      return;
    }
    
    await handleNAPFileCreated(napFile);
  } catch (error) {
    console.error('[Knowledge Graph] Error manually triggering:', error);
    notify.error(notifyFailedToTriggerKnowledgeGraphX(error instanceof Error ? error.message : 'Unknown error'));
  }
}

// Initialize on module load
if (typeof window !== 'undefined') {
  initializeNAPAutoTrigger();
}

