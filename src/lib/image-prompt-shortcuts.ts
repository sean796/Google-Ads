import { logger } from "@/lib/logger";
const STORAGE_KEY = "neo-pulse-image-prompt-shortcuts";

export interface SavedPrompt {
  id: string;
  name: string;
  content: string;
}

const DEFAULT_PROMPT: SavedPrompt = {
  id: "neo-digital",
  name: "Neo Digital Style",
  content: `MUST INCLUDE: Background #02050A, Accent #84BD00 
i want simple design, easy to read but impressive
tall and mobile opt
DONT MENTION THE COLOR THEME IN THE DESIGN FOR THE REPORT DONT MENTION, NEON NOIR, ETC, CYBER PUNK, ETC, AI, ETC, INCLUDE GOOGLE LOGO`,
};

export function getSavedPrompts(): SavedPrompt[] {
  if (typeof window === "undefined") return [DEFAULT_PROMPT];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as SavedPrompt[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    // Seed with default on first load
    localStorage.setItem(STORAGE_KEY, JSON.stringify([DEFAULT_PROMPT]));
    return [DEFAULT_PROMPT];
  } catch (e) {
    logger.error("[image-prompt-shortcuts] Failed to parse stored prompts:", e);
  }
  return [DEFAULT_PROMPT];
}

export function savePrompt(prompt: SavedPrompt): void {
  if (typeof window === "undefined") return;
  try {
    const prompts = getSavedPrompts();
    const index = prompts.findIndex((p) => p.id === prompt.id);
    const next = index >= 0
      ? prompts.map((p, i) => (i === index ? prompt : p))
      : [...prompts, prompt];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    logger.error("[image-prompt-shortcuts] Failed to save prompt:", e);
  }
}

export function deletePrompt(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const prompts = getSavedPrompts().filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
  } catch (e) {
    logger.error("[image-prompt-shortcuts] Failed to delete prompt:", e);
  }
}
