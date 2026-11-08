import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import type { ManagerCloudSnapshotV1 } from "@/lib/manager-cloud-settings-snapshot";
import { WORKSPACE_CREDENTIAL_STORAGE_KEYS } from "@/lib/manager-cloud-settings-snapshot";
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

function credentialKeysFromSnapshot(snapshot: ManagerCloudSnapshotV1 | null | undefined): Record<string, string> {
  if (!snapshot?.keys || typeof snapshot.keys !== "object") return {};
  const out: Record<string, string> = {};
  for (const k of WORKSPACE_CREDENTIAL_STORAGE_KEYS) {
    const v = snapshot.keys[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

async function saveManagerSettingsFile(
  snapshot: ManagerCloudSnapshotV1,
): Promise<{ ok: boolean; error?: string; code?: string; updatedAt?: string }> {
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

async function loadManagerSettingsFile(): Promise<{
  ok: boolean;
  snapshot: ManagerCloudSnapshotV1 | null;
  updatedAt?: string | null;
  error?: string;
  code?: string;
}> {
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

export async function saveManagerSettingsToCloud(
  snapshot: ManagerCloudSnapshotV1,
  teamId?: number | null,
): Promise<{ ok: boolean; error?: string; code?: string; updatedAt?: string }> {
  const primary = await saveManagerSettingsFile(snapshot);
  if (!primary.ok) return primary;
  if (!AUTH_DISABLED && teamId) {
    const team = await saveTeamWorkspace(teamId, snapshot);
    if (!team.ok) {
      return { ok: false, error: team.error, updatedAt: primary.updatedAt };
    }
  }
  return primary;
}

export async function loadManagerSettingsFromCloud(teamId?: number | null): Promise<{
  ok: boolean;
  snapshot: ManagerCloudSnapshotV1 | null;
  updatedAt?: string | null;
  error?: string;
  code?: string;
}> {
  const manager = await loadManagerSettingsFile();
  if (!AUTH_DISABLED && teamId) {
    const team = await loadTeamWorkspace(teamId);
    if (team.snapshot?.keys) {
      const credentialKeys = credentialKeysFromSnapshot(manager.snapshot);
      return {
        ok: true,
        snapshot: {
          ...team.snapshot,
          keys: { ...team.snapshot.keys, ...credentialKeys },
        },
        updatedAt: team.updatedAt ?? manager.updatedAt,
      };
    }
  }
  return manager;
}
