import { loadApiKey } from "@/lib/api";

// Wave 0: the server OpenRouter key never reaches the browser. The resolver
// is local-only: it returns the user's own locally saved key when present,
// and "" otherwise. Callers pass "" through the app transport, and the
// server resolves its env key. An unconfigured server fails visibly there.

/** Local Dashboard key only. Never fetches the server key. */
export function getOpenRouterApiKeyForApp(): string {
  return loadApiKey()?.trim() ?? "";
}

/** Local key when set, "" when not. Never throws, never calls the server. */
export async function resolveOpenRouterApiKeyForHarness(): Promise<string> {
  return getOpenRouterApiKeyForApp();
}
