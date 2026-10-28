import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { backendApiUrl } from "@/lib/wordpress-api/connection";

export type OverviewStudioSnapshotPayload = {
  siteId: string;
  source: OverviewSitemapSource;
  activeUrl: string | null;
  rows: OverviewRow[];
  updatedAt?: string;
};

const pendingSaveByKey = new Map<string, ReturnType<typeof setTimeout>>();

export async function fetchOverviewStudioSnapshotFromServer(
  siteId: string,
  source: OverviewSitemapSource,
): Promise<OverviewStudioSnapshotPayload | null> {
  if (!siteId?.trim() || typeof fetch !== "function") return null;
  try {
    const qs = new URLSearchParams({ siteId: siteId.trim(), source });
    const res = await fetch(backendApiUrl(`/api/overview/studio-snapshot?${qs.toString()}`), {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { snapshot?: OverviewStudioSnapshotPayload | null };
    const snap = data?.snapshot;
    if (!snap || !Array.isArray(snap.rows) || !snap.rows.length) return null;
    return snap;
  } catch {
    return null;
  }
}

export function saveOverviewStudioSnapshotToServer(
  siteId: string,
  source: OverviewSitemapSource,
  rows: OverviewRow[],
  activeUrl: string | null,
): void {
  if (!siteId?.trim() || !rows.length || typeof fetch !== "function") return;
  const key = `${siteId}:${source}`;
  const prevTimer = pendingSaveByKey.get(key);
  if (prevTimer) clearTimeout(prevTimer);

  const timer = setTimeout(() => {
    pendingSaveByKey.delete(key);
    void fetch(backendApiUrl("/api/overview/studio-snapshot"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: siteId.trim(),
        source,
        activeUrl: activeUrl ?? null,
        rows,
      }),
    }).catch(() => {});
  }, 150);

  pendingSaveByKey.set(key, timer);
}
