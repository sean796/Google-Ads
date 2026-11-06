import { notify } from "@/lib/app-notifications";
import { logger } from "@/lib/logger";
import { NOTIFY_COULD_NOT_SAVE_FILES_TO_LOCAL_STORAGE } from "@/lib/notify-messages";
import type { StoredFile } from "@/lib/knowledge-base/types";

export const KB_FILES_STORAGE_KEY = "kb_files";
export const KB_PROFILES_STORAGE_KEY = "kb_profiles";

export const CSV_CHUNK_THRESHOLD = 100 * 1024;

export function saveFilesToLocalStorage(files: StoredFile[]): void {
  try {
    localStorage.setItem(KB_FILES_STORAGE_KEY, JSON.stringify(files));
  } catch (e) {
    logger.error("Error saving files to localStorage:", e);
    notify.error(NOTIFY_COULD_NOT_SAVE_FILES_TO_LOCAL_STORAGE);
  }
}

export function formatKbFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
