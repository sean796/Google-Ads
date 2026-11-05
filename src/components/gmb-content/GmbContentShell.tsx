import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, RefreshCw } from "lucide-react";
import { useManagerSeedWorkspace } from "@/contexts/manager-seed-workspace-context";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import {
  getPublishedPosts,
  getPublishedPages,
  getPublishedServiceAreas,
} from "@/lib/wordpress-api";
import type { PublishedPostsResult } from "@/lib/wordpress-api/types";
import { notify } from "@/lib/app-notifications";
import { GmbContentTable, type GmbContentRow } from "./GmbContentTable";
import { Button } from "@/ui";

type PostTypeFilter = "post" | "page" | "service-area";

const POST_TYPE_LABELS: Record<PostTypeFilter, string> = {
  post: "Posts",
  page: "Pages",
  "service-area": "Service Areas",
};

export const GmbContentShell: React.FC = () => {
  const { enabledSites, connectedSite, canUseConnected } =
    useManagerSeedWorkspace();
  const { sites: allWordPressSites } = useWordPressSites();

  const site = useMemo(() => {
    if (enabledSites.length === 0) return null;
    return connectedSite ?? enabledSites[0];
  }, [enabledSites, connectedSite]);

  const [postTypeFilter, setPostTypeFilter] = useState<PostTypeFilter>("post");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<GmbContentRow[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchContent = useCallback(async () => {
    if (!site || !site.username?.trim() || !site.appPassword?.trim()) return;
    setLoading(true);
    try {
      let result: PublishedPostsResult;
      switch (postTypeFilter) {
        case "page":
          result = await getPublishedPages(
            site.siteUrl,
            site.username,
            site.appPassword,
            200,
          );
          break;
        case "service-area":
          result = await getPublishedServiceAreas(
            site.siteUrl,
            site.username,
            site.appPassword,
            200,
          );
          break;
        default:
          result = await getPublishedPosts(
            site.siteUrl,
            site.username,
            site.appPassword,
            200,
          );
      }

      if (result.error) {
        if (!result.error.includes("No published")) {
          notify.error(result.error);
        }
        setRows([]);
      } else {
        setRows(
          (result.posts ?? []).map((p) => ({
            id: p.id,
            title: p.title,
            url: p.link,
            date: p.date_gmt,
            excerpt: p.excerpt ?? "",
            postType: postTypeFilter,
          })),
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load content";
      if (!msg.includes("No published")) {
        notify.error(msg);
      }
      setRows([]);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [site, postTypeFilter]);

  useEffect(() => {
    if (site) {
      fetchContent();
    }
  }, [fetchContent, site]);

  if (!canUseConnected || enabledSites.length === 0) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
        <p className="text-base text-muted-foreground">
          Add a WordPress property under Dashboard &rarr; Properties, then
          select it in the header. GMB uses the connected site to list content
          and publish GBP posts.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" aria-hidden />
          <h2 className="text-lg font-semibold text-foreground">GMB</h2>
        </div>
        <Button
          variant="quiet"
          onClick={fetchContent}
          disabled={loading}
        >
          {loading ? (
            null
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {/* post type filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(POST_TYPE_LABELS) as PostTypeFilter[]).map((pt) => (
          <Button
            pressed={postTypeFilter === pt}
            key={pt}
            onClick={() => setPostTypeFilter(pt)}
          >
            {POST_TYPE_LABELS[pt]}
          </Button>
        ))}
      </div>

      {loading && !hasLoaded ? (
        <div className="flex items-center justify-center py-12">
          
        </div>
      ) : (
        <GmbContentTable
          rows={rows}
          site={site!}
          allSites={allWordPressSites}
          loading={loading}
        />
      )}
    </div>
  );
};
