import { useCallback } from "react";
import { flushSync } from "react-dom";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN } from "@/lib/notify-messages";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import { overviewInventoryCollectionsFromSource } from "@/lib/overview/overview-sitemap-source";
import { initBulkSliceWithStatus, patchActiveBulkSlice } from "@/lib/overview/overview-bulk-inline-status";
import { loadApiKey } from "@/lib/api";
import { runOverviewAiseoFeaturedImageRow } from "@/lib/overview/overview-aiseo-featured-image-run";
import { logFeaturedImagePipeline } from "@/lib/image-generator/featured-image-pipeline-log";
import { resolveAiseoHarnessSourceHtml } from "@/lib/overview/overview-aiseo-source-html";
import { updateWordPressPost, uploadWordPressMedia } from "@/lib/wordpress-api";
import { generatedFilesForUrl, storageKeyForUrlGeneratedFiles } from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import { buildAiseoPostContentHtmlFile } from "@/lib/overview/overview-aiseo-row-artifacts";
import { mergeGeneratedFilesByName } from "@/lib/overview/overview-peer-csv-details";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";
import { overviewBulkRowEntries } from "@/lib/overview/overview-bulk-row-scope";

type Args = Pick<
  OverviewTabBase,
  | "rowsRef"
  | "setBulkActionProgress"
  | "opt"
  | "getInventoryMatchForUrl"
  | "prefetchOverviewInventory"
  | "sitemapSource"
> & {
  site: WordPressSite | undefined;
  bulkScopeUrlKeys: Set<string>;
};

export function useOverviewTabFeaturedImageBatch({
  bulkScopeUrlKeys,
  rowsRef,
  site,
  opt,
  setBulkActionProgress,
  getInventoryMatchForUrl,
  prefetchOverviewInventory,
  sitemapSource,
}: Args) {
  const handleAiFeaturedImageAll = useCallback(async () => {
    if (!site) {
      notify.error(NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN);
      return;
    }
    const scopeKeys = bulkScopeUrlKeys;
    const scoped = overviewBulkRowEntries(rowsRef.current, scopeKeys);
    if (scoped.length === 0) {
      notify.error("No posts in the current selection. Check rows or clear filters.");
      return;
    }
    const apiKey = loadApiKey().trim();
    if (!apiKey) {
      notify.error("OpenRouter API key is missing. Set it in Settings.");
      return;
    }

    const batchKey = `${site.id}-batch`;
    const urls = scoped.map((entry) => entry.row.url.trim()).filter(Boolean);

    flushSync(() => {
      opt.resetBulkBatch(batchKey);
      setOptimizingState(opt.setIsOptimizingContent, batchKey, true);
      opt.setBulkOptimizationState((prev) => ({
        ...prev,
        [batchKey]: {
          urls,
          currentIndex: 0,
          urlStatuses: {},
          currentStep: "Featured image",
          currentUrl: urls[0],
          runKind: "aiFeaturedImage",
          harnessStartedAt: Date.now(),
          urlGeneratedFiles: {},
        },
      }));
      setBulkActionProgress((p) => {
        const next = { ...p };
        delete next.optimizeAll;
        next.aiFeaturedImage = initBulkSliceWithStatus("aiFeaturedImage", scoped.length, 0);
        return next;
      });
    });

    notify.info(`Featured image: ${scoped.length} post(s). Watch the progress bar below.`, {
      duration: 6000,
    });

    logFeaturedImagePipeline("Batch started", {
      site: site.name,
      rowCount: scoped.length,
      urls,
    });

    patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
      statusMessage: "Loading post HTML…",
    });
    if (site.username?.trim() && site.appPassword?.trim()) {
      logFeaturedImagePipeline("Prefetching WordPress inventory (content)", {
        urlCount: urls.length,
      });
      await prefetchOverviewInventory(site, {
        collections: overviewInventoryCollectionsFromSource(sitemapSource, site),
        includeContent: true,
        sitemapUrls: urls,
        forceRefresh: true,
      });
    }

    const attachRowFiles = (
      url: string,
      files: Array<{ name: string; content: string; mimeType: string }>,
    ) => {
      opt.setBulkOptimizationState((prev) => {
        const current = prev[batchKey];
        if (!current) return prev;
        const storageKey = storageKeyForUrlGeneratedFiles(
          current.urlGeneratedFiles,
          url,
          current.urls,
        );
        const existing = generatedFilesForUrl(current.urlGeneratedFiles, url);
        return {
          ...prev,
          [batchKey]: {
            ...current,
            currentUrl: url,
            urlGeneratedFiles: {
              ...(current.urlGeneratedFiles || {}),
              [storageKey]: mergeGeneratedFilesByName(existing, files),
            },
          },
        };
      });
    };

    let completedRows = 0;
    try {
      for (let i = 0; i < scoped.length; i++) {
        const row = scoped[i]!.row;
        let rowTitle = "";
        try {
        opt.setBulkOptimizationState((prev) => {
          const current = prev[batchKey];
          if (!current) return prev;
          return {
            ...prev,
            [batchKey]: {
              ...current,
              currentIndex: i,
              currentUrl: row.url,
              currentStep: "Featured image",
            },
          };
        });
        const inv = getInventoryMatchForUrl(site, row.url);
        let postId = row.postId ?? inv?.row.id ?? null;
        const title = (row.title || inv?.row.fields?.title || "").trim();
        rowTitle = title;
        if (!title) {
          throw new Error(`Missing title for featured image: ${row.url}`);
        }

        logFeaturedImagePipeline("Row started", {
          index: i + 1,
          total: scoped.length,
          url: row.url,
          title,
        });

        patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
          currentRow: i,
          statusMessage: "Loading post HTML…",
        });
        const { html: content } = await resolveAiseoHarnessSourceHtml({
          row,
          site,
          sitemapSource,
          getInventoryMatchForUrl,
        });
        if (!content.trim()) {
          throw new Error(`Missing post HTML for featured image: ${row.url}`);
        }
        if (postId == null || postId <= 0) {
          postId = inv?.row.id ?? null;
        }
        if (postId == null || postId <= 0) {
          throw new Error(`Missing post id for featured image: ${row.url}`);
        }

        patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
          currentRow: i,
          statusMessage: "Image requirements",
        });
        const keyword = (row.focusKeyword || inv?.row.fields?.keyword || "").trim();
        const featured = await runOverviewAiseoFeaturedImageRow({
          apiKey,
          siteId: site.id,
          title,
          contentHtml: content,
          keyword: keyword || undefined,
          onArtifacts: (files) => {
            attachRowFiles(row.url, files);
            logFeaturedImagePipeline("Pipeline artifact attached", {
              url: row.url,
              files: files.map((f) => f.name),
            });
            const names = new Set(files.map((f) => f.name));
            if (names.has("image-requirements.json")) {
              patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
                currentRow: i,
                statusMessage: "Google Image",
              });
            }
            if (names.has("google-image.png")) {
              patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
                currentRow: i,
                statusMessage: "OpenRouter Image",
              });
            }
            if (names.has("openrouter-image.png")) {
              patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
                currentRow: i,
                statusMessage: "WordPress upload",
              });
            }
          },
        });

        patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
          currentRow: i,
          statusMessage: "WordPress upload",
        });
        logFeaturedImagePipeline("WordPress upload: starting", {
          url: row.url,
          fileName: featured.uploadFileName,
        });
        const uploaded = await uploadWordPressMedia(
          site.siteUrl,
          site.username,
          site.appPassword,
          featured.uploadBase64,
          featured.uploadFileName,
          featured.mediaTitle,
        );
        const imageUrl = uploaded.url || uploaded.link;
        if (!uploaded.success || !uploaded.mediaId || !imageUrl) {
          throw new Error(uploaded.error || `Featured image upload failed: ${row.url}`);
        }
        const subtype = inv?.subtype;
        const postTypeEndpoint =
          subtype === "post" ? "posts" : subtype === "page" ? "pages" : subtype || undefined;
        const updated = await updateWordPressPost(
          site.siteUrl,
          site.username,
          site.appPassword,
          postId,
          title,
          content,
          undefined,
          (row.wpStatus as "draft" | "publish" | undefined) || undefined,
          row.postType || "post",
          uploaded.mediaId,
          undefined,
          undefined,
          inv?.row.slug,
          postTypeEndpoint,
        );
        if (!updated.success) {
          throw new Error(updated.error || `Featured image apply failed: ${row.url}`);
        }
        const postContentFile = buildAiseoPostContentHtmlFile(row.url, content);
        attachRowFiles(row.url, [
          ...(postContentFile ? [postContentFile] : []),
          {
            name: "wordpress.json",
            content: JSON.stringify(
              {
                url: imageUrl,
                mediaId: uploaded.mediaId,
                link: uploaded.link ?? imageUrl,
                postId,
              },
              null,
              2,
            ),
            mimeType: "application/json",
          },
        ]);
        logFeaturedImagePipeline("WordPress upload: complete", {
          url: row.url,
          mediaId: uploaded.mediaId,
          imageUrl,
        });
        completedRows = i + 1;
        patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
          completed: completedRows,
          currentRow: i,
          statusMessage: "Featured image",
        });
        } catch (rowError) {
          const rowMessage =
            rowError instanceof Error ? rowError.message : String(rowError);
          logFeaturedImagePipeline("Row failed (continuing batch)", {
            url: row.url,
            title: rowTitle || row.url,
            error: rowMessage,
          });
          notify.error(`Featured image skipped (${rowTitle || row.url}): ${rowMessage}`, {
            duration: 10000,
          });
        }
      }
      patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
        completed: completedRows,
        total: scoped.length,
        statusMessage: "Featured image",
      });
      logFeaturedImagePipeline("Batch finished", {
        completedRows,
        totalRows: scoped.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logFeaturedImagePipeline("Batch failed", { error: message });
      notify.error(message, { duration: 12000 });
      patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
        completed: completedRows,
        statusMessage: message,
      });
      throw error;
    } finally {
      setOptimizingState(opt.setIsOptimizingContent, batchKey, false);
    }
  }, [
    bulkScopeUrlKeys,
    rowsRef,
    site,
    opt,
    setBulkActionProgress,
    getInventoryMatchForUrl,
    prefetchOverviewInventory,
    sitemapSource,
  ]);

  return { handleAiFeaturedImageAll };
}
