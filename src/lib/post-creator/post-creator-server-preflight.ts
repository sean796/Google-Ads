import type { LoadBulkSitemapInventoryResult } from "@/lib/bulk/bulk-sitemap-inventory-session";
import {
  buildContentBucketFiles,
  type PostCreatorContentBucketFile,
} from "@/lib/post-creator/post-creator-inventory-bucket";

export type PostCreatorServerPreflight = {
  inventory: LoadBulkSitemapInventoryResult;
  bucketJson: string;
  siteKwJsonText: string;
  bucketFiles: PostCreatorContentBucketFile[];
};

export type PostCreatorServerPreflightPayload = {
  bucketJson: string;
  siteKwJsonText: string;
};

function inventoryFromPostsBucketJson(json: string): LoadBulkSitemapInventoryResult {
  const trimmed = json.trim();
  let rowCount = 0;
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as { posts?: unknown[]; urls?: unknown[] };
      if (Array.isArray(parsed.posts)) rowCount = parsed.posts.length;
      else if (Array.isArray(parsed.urls)) rowCount = parsed.urls.length;
    } catch {
      rowCount = trimmed.split("\n").filter(Boolean).length;
    }
  }
  return {
    links: [],
    buckets: {
      pages: { json: "", rowCount: 0 },
      posts: { json: trimmed, rowCount },
      sap: { json: "", rowCount: 0 },
    },
    totalRows: rowCount,
    sources: ["posts"],
    errors: {},
    postsMetadata: [],
  };
}

export function buildPostCreatorServerPreflightFromPayload(
  preflight: PostCreatorServerPreflightPayload,
  siteUrl: string,
): PostCreatorServerPreflight {
  const bucketJson = preflight.bucketJson.trim();
  const siteKwJsonText = preflight.siteKwJsonText.trim();
  if (!bucketJson) {
    throw new Error("Post creator content-bucket-posts preflight is missing.");
  }
  if (!siteKwJsonText) {
    throw new Error("Post creator site-kw preflight is missing.");
  }
  const inventory = inventoryFromPostsBucketJson(bucketJson);
  return {
    inventory,
    bucketJson,
    siteKwJsonText,
    bucketFiles: buildContentBucketFiles(inventory, siteUrl),
  };
}

export function preflightFromWorkerCheckpoint(
  checkpoint: Record<string, unknown> | undefined,
  siteUrl: string,
): PostCreatorServerPreflight {
  const server =
    checkpoint?.server && typeof checkpoint.server === "object"
      ? (checkpoint.server as Record<string, unknown>)
      : {};
  return buildPostCreatorServerPreflightFromPayload(
    {
      bucketJson: String(server.preflightBucketJson ?? ""),
      siteKwJsonText: String(server.preflightSiteKwJson ?? ""),
    },
    siteUrl,
  );
}
