import { notify } from "@/lib/app-notifications";
import { NOTIFY_DETECTING_SITEMAPS, NOTIFY_FAILED_TO_DETECT_SITEMAPS_PLEASE_DETECT_, NOTIFY_GENERATING_KNOWLEDGE_GRAPH_FROM_SITEMAPS, NOTIFY_KNOWLEDGE_GRAPH_GENERATION_STARTED, NOTIFY_NO_SITEMAPS_FOUND_PLEASE_ENSURE_YOUR_SIT, NOTIFY_SITEMAPS_DETECTED_SUCCESSFULLY, notifyFailedX, notifyKnowledgeGraphGeneratedForXSavingT, notifyKnowledgeGraphWorkflowFailedX, notifyNapExtractionAndLinkGraphGeneration, notifyStartingKnowledgeGraphWorkflowForX, notifyStartingNapExtractionAndLinkGraphG, notifyXX3, notifyXXXXPosts } from "@/lib/notify-messages";
import { detectSitemaps, parseSitemap } from '@/lib/wordpress-api';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { getStoredSites, saveSites } from '@/components/integrations/storage';
import type { WordPressSite } from '@/components/integrations/types';
import { BACKEND_API_BASE } from '@/lib/wordpress-api/connection';
import { saveGraphToKnowledgeBase } from "@/lib/knowledge-graph-auto-trigger-save";
import { extractNAPAndSaveToKB } from "@/lib/knowledge-graph-auto-trigger-nap";

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
        const response = await fetch(`${BACKEND_API_BASE}/api/knowledge-model/progress/${jobId}`, { headers: neoPulseApiHeaders() });
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
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
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
