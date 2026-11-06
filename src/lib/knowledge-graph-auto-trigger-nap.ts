import { notify } from "@/lib/app-notifications";
import { NOTIFY_DETECTING_LOCATIONS, NOTIFY_OPENROUTER_KEY, notifyDetectedXLocationxAndAddedToKnowle, notifyFailedToExtractNapX, notifyNapExtractionFailedX } from "@/lib/notify-messages";
import { getStoredSites, saveSites } from '@/components/integrations/storage';
import type { WordPressSite } from '@/components/integrations/types';
import { loadApiKey } from '@/lib/api';
import type { StoredFile } from '@/components/KnowledgeBaseTab';
import { extractNAPFromSite } from '@/lib/nap-extractor';
import { createNAPTemplate } from '@/lib/nap-kb-template';
import { KB_FILES_STORAGE_KEY } from "@/lib/knowledge-graph-auto-trigger-shared";
import { logger } from "@/lib/logger";

/**
 * Extract NAP information and save to knowledge base
 * Exported for manual triggering
 */
export async function extractNAPAndSaveToKB(site: WordPressSite): Promise<void> {
  
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
      logger.warn('[NAP Extraction] Location detection failed:', napResult.error);
      notify.error(notifyNapExtractionFailedX(napResult.error || 'Unknown error'));
    }
  } catch (error) {
    logger.error('[NAP Extraction] Error:', error);
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
    logger.warn('[NAP Silent] No OpenRouter API key; skipping background NAP');
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
    } else {
      logger.warn('[NAP Silent] Extraction failed:', napResult.error);
    }
  } catch (e) {
    logger.warn('[NAP Silent] Error:', e);
  }
}
