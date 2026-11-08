/**
 * Unified post fields client (NEO Pulse Fields via neo-pulse-app /api/wordpress).
 */

import type { WordPressSite } from "@/components/integrations/types";
import {
  discoverPostFieldKeys,
  getPostFieldsForPost,
  getPostFieldsForPostsBatch,
  getPostFieldsForUrlsBatch,
  siteSupportsSeoExtraTextField,
  type PostFieldsDiscoveryResult,
  type WpPostSnapshotFromFieldsByUrl,
} from "./post-fields-discovery";
import { resolveWordPressUrls } from "./posts";
import { siteHasNeoPulseWp } from "./post-fields-site-capabilities";

export type { PostFieldsDiscoveryResult, WpPostSnapshotFromFieldsByUrl };

export { siteSupportsSeoExtraTextField, siteHasNeoPulseWp };

function asRestFieldObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function mergeRestFieldObjects(
  base: Record<string, unknown> | null | undefined,
  plugin: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(base ?? {}) };
  if (!plugin) return merged;
  for (const [key, value] of Object.entries(plugin)) {
    const pluginText =
      typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
    const existing = merged[key];
    const existingText =
      typeof existing === "string" || typeof existing === "number" ? String(existing).trim() : "";
    if (pluginText || existingText === "") {
      merged[key] = value;
    }
  }
  return merged;
}

/** Extract custom fields from a WP REST full post (`neo_pulse_fields` only). */
export function restPostFieldsFromFullPost(
  fullPost: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!fullPost || typeof fullPost !== "object") return {};
  const plugin = asRestFieldObject(fullPost.neo_pulse_fields);
  return plugin ?? {};
}

export function siteUsesNeoPulseFieldsBackend(site: WordPressSite): boolean {
  return site.capabilities?.fieldsBackend === "neo_pulse_fields" || siteHasNeoPulseWp(site);
}

export async function discoverFieldGroups(
  site: WordPressSite,
  postType?: string,
  postTypeEndpoint?: string,
  sampleSize = 10,
): Promise<PostFieldsDiscoveryResult> {
  return discoverPostFieldKeys(site, postType, postTypeEndpoint, sampleSize);
}

export async function getFieldsForPost(
  site: WordPressSite,
  postId: number,
  postType?: string,
  postTypeEndpoint?: string,
) {
  return getPostFieldsForPost(site, postId, postType, postTypeEndpoint);
}

export async function getFieldsForPostsBatch(
  site: WordPressSite,
  items: Array<{ postId: number; postType?: string; postTypeEndpoint?: string }>,
) {
  return getPostFieldsForPostsBatch(site, items);
}

export async function getFieldsForUrlsBatch(
  site: WordPressSite,
  items: Array<{ url: string; postType?: string; postTypeEndpoint?: string }>,
) {
  return getPostFieldsForUrlsBatch(site, items);
}

/** @deprecated Site mirror index removed; returns empty (use inventory or resolve-urls). */
export async function getSiteMirrorIndex(
  _site: WordPressSite,
  _options?: { limit?: number; forceRefresh?: boolean },
): Promise<Array<{ id: number; url?: string; focus_keyword?: string }>> {
  return [];
}

export function clearSiteMirrorIndexCache(_siteId?: string): void {
  /* no-op */
}

export async function resolvePostUrlViaMirror(site: WordPressSite, url: string): Promise<number | null> {
  if (!siteHasNeoPulseWp(site)) return null;
  try {
    const resolved = await resolveWordPressUrls(
      site.siteUrl,
      site.username,
      site.appPassword,
      [url],
      site.entitySitemapUrl,
    );
    const first = resolved.resolved?.[0];
    if (first && typeof first.id === "number" && first.id > 0) {
      return first.id;
    }
  } catch {
    return null;
  }
  return null;
}

export function mergeMirrorIndexIntoInventoryKeyword(
  _site: WordPressSite,
  _url: string,
  existingKeyword: string,
  _index: Array<{ id: number; url?: string; focus_keyword?: string }>,
): string {
  return existingKeyword;
}
