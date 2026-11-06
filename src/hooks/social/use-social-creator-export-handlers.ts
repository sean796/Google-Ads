import { useCallback, useMemo } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { SocialCreatorRow } from "@/lib/social/social-creator-types";
import type { SocialGenerateProgressState } from "@/lib/social/social-creator-progress-types";
import { socialCreatorGridRowCount, SOCIAL_CREATOR_PLACEHOLDER_ROW_COUNT } from "@/components/social/creator/social-creator-row-constants";
import { buildSocialCreatorExportCsv, socialCreatorExportFilename, triggerSocialCreatorCsvDownload } from "@/lib/social/export-social-creator-csv";
import { exportSocialCreatorZip } from "@/lib/social/export-social-creator-zip";

export function useSocialCreatorExportHandlers({
  isGenerating,
  generateProgress,
  displayPosts,
  posts,
  site,
}: {
  isGenerating: boolean;
  generateProgress: SocialGenerateProgressState | null;
  displayPosts: SocialCreatorRow[];
  posts: SocialCreatorRow[];
  site: WordPressSite;
}) {
  const bulkMicroSnapshot = useMemo((): MetaBulkMicroSnapshot | null => {
    if (!isGenerating || !generateProgress) return null;
    const active = generateProgress.steps.find((step) => step.status === "running");
    return {
      label: active?.label ?? generateProgress.label,
      completed: generateProgress.completed,
      total: generateProgress.total,
      statusMessage: generateProgress.statusMessage,
      progressPct:
        generateProgress.total > 0
          ? Math.round((generateProgress.completed / generateProgress.total) * 100)
          : 0,
    };
  }, [generateProgress, isGenerating]);

  const gridPaginationTotal = useMemo(
    () => socialCreatorGridRowCount(displayPosts.length),
    [displayPosts.length],
  );

  const paginationLayoutTotal = SOCIAL_CREATOR_PLACEHOLDER_ROW_COUNT;
  const handleExportSocialCreatorCsv = useCallback(() => {
    const csv = buildSocialCreatorExportCsv(posts);
    triggerSocialCreatorCsvDownload(socialCreatorExportFilename(site.name), csv);
  }, [posts, site.name]);

  const canExportSocialCreatorCsv = useMemo(
    () => posts.some((row) => Boolean(row.fbInstagramContent?.length)),
    [posts],
  );

  const handleExportSocialCreatorZip = useCallback(async () => {
    await exportSocialCreatorZip(posts, site.name);
  }, [posts, site.name]);

  const canExportSocialCreatorZip = useMemo(
    () =>
      posts.some(
        (row) =>
          Boolean(row.creative?.imagePreviewUrl || row.creative?.imageBase64) ||
          Boolean(row.fbInstagramContent?.length) ||
          Boolean(
            row.researchSections?.some((section) => section.status === "done" && section.markdown?.length),
          ),
      ),
    [posts],
  );


  return {
    bulkMicroSnapshot,
    gridPaginationTotal,
    paginationLayoutTotal,
    handleExportSocialCreatorCsv,
    canExportSocialCreatorCsv,
    handleExportSocialCreatorZip,
    canExportSocialCreatorZip,
  };
}
