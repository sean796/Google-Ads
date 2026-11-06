import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import type { WordPressSite } from "@/components/integrations/types";

function url(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return backendApiUrl(`/manager-wordpress-properties${p}`);
}

// Wave 0: the browser no longer syncs API keys to the server. Server keys
// live in env and wp-config constants only.

export type WordPressPropertiesWorkspaceStatus = {
  ok?: boolean;
  workspaceConfigured?: boolean;
  urlHost?: string | null;
  canAutoCreateTable?: boolean;
};

export async function getWordPressPropertiesWorkspaceStatus(): Promise<WordPressPropertiesWorkspaceStatus | null> {
  try {
    const res = await fetch(url("/status"), { credentials: "include", headers: neoPulseApiHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as WordPressPropertiesWorkspaceStatus;
  } catch {
    return null;
  }
}

/** @deprecated Use getWordPressPropertiesWorkspaceStatus */
export async function getWordPressPropertiesCloudStatus(): Promise<WordPressPropertiesWorkspaceStatus | null> {
  return getWordPressPropertiesWorkspaceStatus();
}

export async function loadWordPressPropertyPluginTokens(): Promise<
  { ok: boolean; tokens?: { siteId: string; pluginAccessToken: string }[]; error?: string }
> {
  try {
    const res = await fetch(url("/load"), { credentials: "include", headers: neoPulseApiHeaders() });
    const data = (await res.json()) as {
      ok?: boolean;
      tokens?: { siteId: string; pluginAccessToken: string }[];
      error?: string;
    };
    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    return { ok: Boolean(data.ok), tokens: data.tokens ?? [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveWordPressProperties(
  sites: WordPressSite[],
): Promise<{
  ok: boolean;
  error?: string;
  code?: string;
  updatedAt?: string;
  count?: number;
  tokens?: { siteId: string; pluginAccessToken: string }[];
}> {
  try {
    const res = await fetch(url("/save"), {
      method: "POST",
      credentials: "include",
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ sites }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      code?: string;
      updatedAt?: string;
      count?: number;
      tokens?: { siteId: string; pluginAccessToken: string }[];
    };
    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}`, code: data.code };
    }
    return {
      ok: Boolean(data.ok),
      updatedAt: data.updatedAt,
      count: typeof data.count === "number" ? data.count : undefined,
      tokens: data.tokens,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
