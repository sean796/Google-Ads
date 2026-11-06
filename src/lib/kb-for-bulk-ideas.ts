import { reassembleChunkedFiles } from "@/lib/utils";
import { filterStoredFilesExcludingWpSiteInventory } from "@/lib/kb-wp-inventory";
import type { StoredFile } from "@/components/KnowledgeBaseTab";
import { logger } from "@/lib/logger";

const KB_FILES_STORAGE_KEY = "kb_files";
const KB_PROFILES_STORAGE_KEY = "kb_profiles";

interface KnowledgeProfile {
  id: string;
  name: string;
  content: string;
}

/**
 * Knowledge base text and file list for bulk blog ideation (RAG only; WP inventory JSON excluded).
 */
export function loadKnowledgeBaseForBulkIdeas(): {
  knowledgeFiles: Array<{ name: string; content: string }>;
  activeKnowledgeBaseText: string;
} {
  if (typeof localStorage === "undefined") {
    return {
      knowledgeFiles: [],
      activeKnowledgeBaseText: "",
    };
  }
  try {
    const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || "[]";
    const storedFiles = JSON.parse(storedFilesString) as StoredFile[];
    const filesForRagIdeas = filterStoredFilesExcludingWpSiteInventory(storedFiles);

    const knowledgeFiles = filesForRagIdeas.map((file) => ({
      name: file.name,
      content: file.content,
    }));

    const storedProfilesString = localStorage.getItem(KB_PROFILES_STORAGE_KEY) || "[]";
    const profiles = JSON.parse(storedProfilesString) as KnowledgeProfile[];
    const manualText = profiles.map((p) => p.content).filter(Boolean).join("\n\n---\n\n");

    const fileContents = reassembleChunkedFiles(filesForRagIdeas);
    const activeKnowledgeBaseText = [manualText, fileContents].filter(Boolean).join("\n\n---\n\n");

    return {
      knowledgeFiles,
      activeKnowledgeBaseText,
    };
  } catch (error) {
    logger.error("Error loading knowledge base from storage:", error);
    return {
      knowledgeFiles: [],
      activeKnowledgeBaseText: "",
    };
  }
}
