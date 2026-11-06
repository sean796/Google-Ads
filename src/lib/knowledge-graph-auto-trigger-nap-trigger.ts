import { notify } from "@/lib/app-notifications";
import { notifyAutoTriggeringKnowledgeGraphGenerati, notifyFailedToTriggerKnowledgeGraphX, notifyNapFileNotFoundX } from "@/lib/notify-messages";
import { getStoredSites } from '@/components/integrations/storage';
import type { WordPressSite } from '@/components/integrations/types';
import type { StoredFile } from '@/components/KnowledgeBaseTab';
import { KB_FILES_STORAGE_KEY } from "@/lib/knowledge-graph-auto-trigger-shared";
import { triggerKnowledgeGraphWorkflow } from "@/lib/knowledge-graph-auto-trigger-workflow";
import { logger } from "@/lib/logger";

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
    logger.error('Error marking NAP as triggered:', e);
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
    return;
  }
  
  // Find associated site
  const site = findSiteByNAPFileName(napFile.name);
  if (!site) {
logger.warn('[Knowledge Graph] Could not find site for NAP file, skipping auto-trigger:', napFile.name);
    return;
  }
  
  // Mark as triggered before starting (to prevent duplicate triggers)
  markNAPAsTriggered(napFile.name);
// Trigger knowledge graph generation asynchronously (don't block)
  setTimeout(async () => {
    try {
      notify.info(notifyAutoTriggeringKnowledgeGraphGenerati(site.name || site.siteUrl));
      await triggerKnowledgeGraphWorkflow(site);
} catch (error) {
      logger.error('[Knowledge Graph] Error auto-triggering knowledge graph:', error);
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
        logger.error('[Knowledge Graph] Error handling NAP file:', error);
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
          logger.error('[Knowledge Graph] Error handling existing NAP file:', error);
        });
      }
    }
  } catch (error) {
    logger.error('[Knowledge Graph] Error checking existing NAP files:', error);
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
    logger.error('[Knowledge Graph] Error manually triggering:', error);
    notify.error(notifyFailedToTriggerKnowledgeGraphX(error instanceof Error ? error.message : 'Unknown error'));
  }
}
