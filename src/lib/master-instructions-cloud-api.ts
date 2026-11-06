import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

function url(siteId: string): string {
  const enc = encodeURIComponent(siteId);
  return backendApiUrl(`/master-instructions/${enc}`);
}

export async function fetchMasterInstructionsFromApi(siteId: string): Promise<{
  ok: boolean;
  sources?: unknown[];
  updatedAt?: string | null;
  error?: string;
  code?: string;
}> {
  try {
    const res = await fetch(url(siteId), { credentials: "include", headers: neoPulseApiHeaders() });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      sources?: unknown[];
      updatedAt?: string | null;
      error?: string;
      code?: string;
    };
    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}`, code: data.code };
    }
    return {
      ok: Boolean(data.ok),
      sources: Array.isArray(data.sources) ? data.sources : [],
      updatedAt: data.updatedAt ?? null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveMasterInstructionsToApi(
  siteId: string,
  sources: unknown[],
): Promise<{ ok: boolean; error?: string; code?: string; updatedAt?: string }> {
  try {
    const res = await fetch(url(siteId), {
      method: "PUT",
      credentials: "include",
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ sources }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      code?: string;
      updatedAt?: string;
    };
    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}`, code: data.code };
    }
    return { ok: Boolean(data.ok), updatedAt: data.updatedAt };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteMasterInstructionsFromApi(siteId: string): Promise<{
  ok: boolean;
  error?: string;
  code?: string;
}> {
  try {
    const res = await fetch(url(siteId), { method: "DELETE", credentials: "include", headers: neoPulseApiHeaders() });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string };
    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}`, code: data.code };
    }
    return { ok: Boolean(data.ok) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
