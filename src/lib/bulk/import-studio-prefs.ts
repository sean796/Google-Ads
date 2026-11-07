/** Session toggle: Import Studio passes file content through without OpenRouter meta extraction. */
export const IMPORT_STUDIO_RAW_STORAGE_KEY = "neo-pulse:import-studio-raw:v1";

export function readImportStudioRawToggle(): boolean {
  try {
    return sessionStorage.getItem(IMPORT_STUDIO_RAW_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
