import type { KeywordData, KeywordResearchResult } from "./keyword-types";
import { logger } from "@/lib/logger";

const KEYWORD_DB_STORAGE_KEY = "keyword-research-db";

interface KeywordDatabaseEntry {
  id: string;
  keyword: string;
  keywordData: KeywordData;
  semanticKeywords: KeywordData[];
  searchIntent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  blueprintId?: string; // Link to blueprint if associated
  createdAt: string;
  updatedAt: string;
}

/**
 * Saves keyword research data to database (localStorage for now, can be extended to backend)
 */
export function saveKeywordResearchToDB(
  keyword: string,
  researchResult: KeywordResearchResult,
  blueprintId?: string
): string {
  try {
    const db = getKeywordDatabase();
    const entryId = `kw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const entry: KeywordDatabaseEntry = {
      id: entryId,
      keyword: keyword.toLowerCase(),
      keywordData: researchResult.keywordData,
      semanticKeywords: researchResult.semanticKeywords,
      searchIntent: researchResult.searchIntent,
      blueprintId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Check if entry with same keyword exists
    const existingIndex = db.findIndex(e => e.keyword === keyword.toLowerCase());
    if (existingIndex >= 0) {
      // Update existing
      db[existingIndex] = { ...entry, id: db[existingIndex].id, createdAt: db[existingIndex].createdAt };
    } else {
      // Add new
      db.push(entry);
    }

    // Keep only last 1000 entries
    const trimmed = db.slice(-1000);
    localStorage.setItem(KEYWORD_DB_STORAGE_KEY, JSON.stringify(trimmed));
    
    return entryId;
  } catch (error) {
    logger.error("Error saving keyword research to DB:", error);
    throw error;
  }
}

/**
 * Gets keyword research data from database
 */
export function getKeywordResearchFromDB(keyword: string): KeywordResearchResult | null {
  try {
    const db = getKeywordDatabase();
    const entry = db.find(e => e.keyword.toLowerCase() === keyword.toLowerCase());
    
    if (!entry) return null;

    return {
      primaryKeyword: entry.keyword,
      keywordData: entry.keywordData,
      semanticKeywords: entry.semanticKeywords,
      searchIntent: entry.searchIntent,
    };
  } catch (error) {
    logger.error("Error getting keyword research from DB:", error);
    return null;
  }
}

/**
 * Gets all keyword research entries for a blueprint
 */
export function getKeywordResearchByBlueprint(blueprintId: string): KeywordResearchResult[] {
  try {
    const db = getKeywordDatabase();
    const entries = db.filter(e => e.blueprintId === blueprintId);
    
    return entries.map(entry => ({
      primaryKeyword: entry.keyword,
      keywordData: entry.keywordData,
      semanticKeywords: entry.semanticKeywords,
      searchIntent: entry.searchIntent,
    }));
  } catch (error) {
    logger.error("Error getting keyword research by blueprint:", error);
    return [];
  }
}

/**
 * Gets all keyword research entries
 */
export function getAllKeywordResearch(): KeywordDatabaseEntry[] {
  return getKeywordDatabase();
}

/**
 * Deletes keyword research entry
 */
export function deleteKeywordResearch(keyword: string): void {
  try {
    const db = getKeywordDatabase();
    const filtered = db.filter(e => e.keyword.toLowerCase() !== keyword.toLowerCase());
    localStorage.setItem(KEYWORD_DB_STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    logger.error("Error deleting keyword research:", error);
  }
}

/**
 * Internal helper to get database
 */
function getKeywordDatabase(): KeywordDatabaseEntry[] {
  try {
    const stored = localStorage.getItem(KEYWORD_DB_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as KeywordDatabaseEntry[];
    }
  } catch (e) {
    logger.error("Failed to load keyword database:", e);
  }
  return [];
}

/**
 * Exports keyword research data for backup
 */
export function exportKeywordResearch(): string {
  const db = getKeywordDatabase();
  return JSON.stringify(db, null, 2);
}

/**
 * Imports keyword research data from backup
 */
export function importKeywordResearch(jsonData: string): void {
  try {
    const data = JSON.parse(jsonData) as KeywordDatabaseEntry[];
    if (Array.isArray(data)) {
      localStorage.setItem(KEYWORD_DB_STORAGE_KEY, JSON.stringify(data));
    }
  } catch (error) {
    logger.error("Error importing keyword research:", error);
    throw new Error("Invalid keyword research data format");
  }
}

/**
 * Clears all keyword research data from database
 */
export function clearKeywordResearchDB(): void {
  try {
    localStorage.removeItem(KEYWORD_DB_STORAGE_KEY);
  } catch (error) {
    logger.error("Error clearing keyword research database:", error);
  }
}

/**
 * Clears keyword research cache
 */
export function clearKeywordResearchCache(): void {
  try {
    localStorage.removeItem("keyword-research-cache");
  } catch (error) {
    logger.error("Error clearing keyword research cache:", error);
  }
}

/**
 * Clears all keyword research data (database + cache)
 */
export function clearAllKeywordData(): void {
  clearKeywordResearchDB();
  clearKeywordResearchCache();
}

