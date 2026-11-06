import type { StoredFile } from "@/components/KnowledgeBaseTab";
import { logger } from "@/lib/logger";

const KB_FILES_STORAGE_KEY = "kb_files";

/**
 * Helper function to check if a file is a temp/processing file
 */
function isProcessingFile(content: string): boolean {
  return content.includes('[AI SUMMARIZATION IN PROGRESS]') || 
         content.includes('[SUMMARIZATION IN PROGRESS]') ||
         content.includes('Processing for RAG');
}

/**
 * Updates an existing file in the knowledge base by name, or creates it if it doesn't exist
 * Dispatches kb-files-updated event to notify UI
 */
export function updateKbFile(fileName: string, newContent: string, newSize?: number): void {
  try {
    const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
    const files = JSON.parse(storedFilesString) as StoredFile[];
    
    const existingFileIndex = files.findIndex(f => f.name === fileName);
    
    if (existingFileIndex >= 0) {
      // Update existing file
      // If it was processing, check if it still is (based on content)
      const wasProcessing = files[existingFileIndex].isProcessing || isProcessingFile(files[existingFileIndex].content);
      const stillProcessing = isProcessingFile(newContent);
      
      files[existingFileIndex] = {
        ...files[existingFileIndex],
        content: newContent,
        size: newSize !== undefined ? newSize : newContent.length,
        isProcessing: stillProcessing, // Update processing status based on content
      };
    } else {
      // File doesn't exist, create it (shouldn't happen but handle gracefully)
      const timestamp = Date.now();
      files.push({
        name: fileName,
        content: newContent,
        size: newSize !== undefined ? newSize : newContent.length,
        starred: false,
        timestamp: timestamp,
      });
    }
    
    // Save updated files
    localStorage.setItem(KB_FILES_STORAGE_KEY, JSON.stringify(files));
    
    // Dispatch event to notify UI
    window.dispatchEvent(new CustomEvent('kb-files-updated', { 
      detail: { files } 
    }));
    
  } catch (error) {
    logger.error(`[KB File Utils] Error updating file ${fileName}:`, error);
    throw error;
  }
}

/**
 * Creates a temporary placeholder file in the knowledge base
 * Returns the file name created
 */
export function createTempKbFile(entityName: string, statusMessage: string): string {
  try {
    const sanitizedEntity = entityName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    const timestamp = Date.now();
    const fileName = `wikipedia-${sanitizedEntity}-${timestamp}.csv`;
    
    const tempContent = `title,url,content
"${entityName}","","[AI SUMMARIZATION IN PROGRESS] ${statusMessage}\n\n🔄 Processing for RAG: Please wait while the content is being analyzed and summarized. All URLs will be preserved. This file will be updated automatically when ready for use."`;
    
    const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
    const files = JSON.parse(storedFilesString) as StoredFile[];
    
    files.push({
      name: fileName,
      content: tempContent,
      size: tempContent.length,
      starred: false,
      timestamp: timestamp,
      isProcessing: true, // Mark as processing
    });
    
    // Save files
    localStorage.setItem(KB_FILES_STORAGE_KEY, JSON.stringify(files));
    
    // Dispatch event to notify UI
    window.dispatchEvent(new CustomEvent('kb-files-updated', { 
      detail: { files } 
    }));
    
    return fileName;
  } catch (error) {
    logger.error(`[KB File Utils] Error creating temp file:`, error);
    throw error;
  }
}

