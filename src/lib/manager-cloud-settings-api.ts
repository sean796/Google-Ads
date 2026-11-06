import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import type { ManagerCloudSnapshotV1 } from "@/lib/manager-cloud-settings-snapshot";
import { loadTeamWorkspace, saveTeamWorkspace } from "@/lib/teams-api";
import { AUTH_DISABLED } from "@/lib/auth-disabled";

function url(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return backendApiUrl(`/manager-cloud-settings${p}`);
}

export type ManagerCloudSettingsStatus = {
  ok: boolean;
  workspaceConfigured?: boolean;
  urlHost?: string | null;
  canAutoCreateTable?: boolean;
};

export async function getManagerCloudSettingsStatus(): Promise<ManagerCloudSettingsStatus> {
  try {
    const res = await fetch(url("/status"), { credentials: "include", headers: neoPulseApiHeaders() });
    const data = (await res.json().catch(() => ({}))) as ManagerCloudSettingsStatus;
    return { ok: res.ok && Boolean(data.ok), ...data };
  } catch {
    return { ok: false };
  }
}

export async function saveManagerSettingsToCloud(
  snapshot: ManagerCloudSnapshotV1,
  teamId?: number | null,
): Promise<{ ok: boolean; error?: string; code?: string; updatedAt?: string }> {
  if (!AUTH_DISABLED && teamId) {
    const r = await saveTeamWorkspace(teamId, snapshot);
    return { ok: r.ok, error: r.error, updatedAt: r.updatedAt };
  }
  try {
    const res = await fetch(url("/save"), {
      method: "POST",
      credentials: "include",
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ snapshot }),
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

export async function loadManagerSettingsFromCloud(teamId?: number | null): Promise<{
  ok: boolean;
  snapshot: ManagerCloudSnapshotV1 | null;
  updatedAt?: string | null;
  error?: string;
  code?: string;
}> {
  if (!AUTH_DISABLED && teamId) {
    const r = await loadTeamWorkspace(teamId);
    return { ok: r.ok, snapshot: r.snapshot, updatedAt: r.updatedAt };
  }
  try {
    const res = await fetch(url("/load"), { credentials: "include", headers: neoPulseApiHeaders() });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      snapshot?: ManagerCloudSnapshotV1 | null;
      updatedAt?: string | null;
      error?: string;
      code?: string;
    };
    if (!res.ok) {
      return { ok: false, snapshot: null, error: data.error || `HTTP ${res.status}`, code: data.code };
    }
    return {
      ok: Boolean(data.ok),
      snapshot: data.snapshot ?? null,
      updatedAt: data.updatedAt ?? null,
    };
  } catch (e) {
    return { ok: false, snapshot: null, error: e instanceof Error ? e.message : String(e) };
  }
}
