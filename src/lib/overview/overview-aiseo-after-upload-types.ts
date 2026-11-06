import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { Dispatch, SetStateAction } from "react";

export function rowUrlHostname(url: string): string | null {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Row must belong to the connected WordPress site before any upload runs. */
export function rowUrlMatchesWordPressSite(rowUrl: string, site: WordPressSite): boolean {
  const rowHost = rowUrlHostname(rowUrl);
  const siteHost = rowUrlHostname(site.siteUrl ?? "");
  if (!rowHost || !siteHost) return false;
  return rowHost === siteHost;
}

export type OverviewAiseoGeneratedFile = {
  name: string;
  content: string;
  mimeType: string;
};

export type OverviewAiseoRowWpUploadResult = {
  ok: boolean;
  skipped: boolean;
  error?: string;
  postId?: number;
  link?: string;
  generatedFiles: OverviewAiseoGeneratedFile[];
};

export type UploadOverviewAiseoRowParams = {
  site: WordPressSite;
  row: OverviewRow;
  bindings: Record<string, OverviewBinding | undefined>;
  getInventoryMatchForUrl: (
    site: WordPressSite,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
};

export type AiseoAfterRowWriteParams = {
  index: number;
  url: string;
  html: string;
  rowFiles?: OverviewAiseoGeneratedFile[];
};

export type AiseoAfterRowWriteFn = (params: AiseoAfterRowWriteParams) => Promise<void>;

export type UploadAiseoRowAfterWriteDeps = {
  site: WordPressSite;
  rowsRef: { current: OverviewRow[] };
  bindings: Record<string, OverviewBinding | undefined>;
  resolveBindings: UploadOverviewAiseoWrittenRowsParams["resolveBindings"];
  getInventoryMatchForUrl: UploadOverviewAiseoWrittenRowsParams["getInventoryMatchForUrl"];
  batchKey: string;
  setBulkOptimizationState: Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
};

export type UploadOverviewAiseoWrittenRowsParams = {
  site: WordPressSite;
  rows: OverviewRow[];
  indices: number[];
  bindings: Record<string, OverviewBinding | undefined>;
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
  resolveBindings: (
    urls: string[],
    site: WordPressSite,
    extra?: undefined,
    options?: { inventoryOnly?: boolean },
  ) => Promise<Record<string, OverviewBinding | undefined>>;
  batchKey?: string;
  setBulkOptimizationState?: Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
};

