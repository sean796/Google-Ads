import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  isOverviewBulkWorkerActive,
  resolveOverviewOptimizingRowUrl,
} from "@/components/overview/overview-tab/overview-bulk-run-helpers";
import { OverviewStudioRevisionsPage } from "@/components/overview/studio/OverviewStudioRevisionsPage";
import { OverviewStudioTabShell } from "@/components/overview/studio/OverviewStudioTabShell";
import { OverviewVisualDocCanvas } from "@/components/overview/studio/OverviewVisualDocCanvas";
import type { OverviewTabContentProps } from "@/components/overview/overview-tab/overview-tab-content-types";
import { useOverviewTabController } from "@/hooks/overview/use-overview-tab-controller";
import { useOverviewTabShellDerived } from "@/hooks/overview/use-overview-tab-shell-derived";
import { usePulseAssistOverviewBridge } from "@/hooks/use-pulse-assist-overview-bridge";
import { consumeOverviewOptimizedUpload } from "@/lib/overview/overview-content-opt-html-store";
import { resolveStudioDrawerElementorHeaders } from "@/lib/overview/overview-studio-drawer-section-headers";
import { setStudioDocRevisionsViewBridge } from "@/lib/overview/studio-doc-revisions-view-bridge";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
export type StudioCenterView = "document" | "revisions";

export function OverviewTabContent(props: OverviewTabContentProps) {
  const ctrl = useOverviewTabController(props);
  const derived = useOverviewTabShellDerived(ctrl);
  const [inFlightAutoSeoUrl, setInFlightAutoSeoUrl] = useState<string | null>(null);
  const [studioCenterView, setStudioCenterView] = useState<StudioCenterView>("document");

  const batchRunning = useMemo(
    () =>
      ctrl.site
        ? isOverviewBulkWorkerActive(
            ctrl.opt.isOptimizingContent,
            derived.bulkBatchKey,
            ctrl.site.id,
            derived.batchBulkState,
          )
        : false,
    [
      ctrl.site,
      ctrl.opt.isOptimizingContent,
      derived.bulkBatchKey,
      derived.batchBulkState,
    ],
  );

  const optimizingRowUrl = useMemo(
    () =>
      resolveOverviewOptimizingRowUrl({
        batchBulkState: derived.batchBulkState,
        batchRunning,
        siteId: ctrl.site?.id,
        isOptimizingContent: ctrl.opt.isOptimizingContent,
        pendingOptimization: ctrl.opt.pendingOptimization,
        optimizationProgress: ctrl.opt.optimizationProgress,
        inFlightAutoSeoUrl,
      }),
    [
      derived.batchBulkState,
      batchRunning,
      ctrl.site?.id,
      ctrl.opt.isOptimizingContent,
      ctrl.opt.pendingOptimization,
      ctrl.opt.optimizationProgress,
      inFlightAutoSeoUrl,
    ],
  );

  // Apply newly generated AISEO Content HTML to rows as each post in a batch completes
  useEffect(() => {
    const statuses = derived.batchBulkState?.urlStatuses;
    if (!statuses) return;
    for (const [url, status] of Object.entries(statuses)) {
      if (status !== "completed") continue;
      const payload = consumeOverviewOptimizedUpload(url);
      if (!payload?.html?.trim()) continue;
      const urlKey = normalizePageUrlKey(url);
      const rowIdx = ctrl.rowsRef.current.findIndex(
        (r) => normalizePageUrlKey(r.url) === urlKey,
      );
      if (rowIdx >= 0) {
        ctrl.updateRow(rowIdx, {
          postContent: payload.html,
          postContentOptimized: payload.html,
          ...(payload.link?.trim() ? { url: payload.link.trim() } : {}),
        });
      }
    }
  }, [derived.batchBulkState?.urlStatuses, ctrl]);

  const prevSitemapSourceRef = useRef(ctrl.sitemapSource);
  // Auto-select the first available article when none is selected so the Visual Doc Studio is immediately active
  useEffect(() => {
    const sitemapSourceChanged = prevSitemapSourceRef.current !== ctrl.sitemapSource;
    prevSitemapSourceRef.current = ctrl.sitemapSource;

    if (sitemapSourceChanged) {
      const firstUrl = ctrl.displayRows[0]?.url;
      if (firstUrl) {
        ctrl.setExpandedPageUrl(firstUrl);
        return;
      }
      ctrl.setExpandedPageUrl(null);
      return;
    }

    if (ctrl.expandedPageUrl) {
      const activeKey = normalizePageUrlKey(ctrl.expandedPageUrl);
      const exists = ctrl.displayRows.some(
        (r) => normalizePageUrlKey(r.url) === activeKey,
      );
      if (exists) return;
    }
    const firstUrl = ctrl.displayRows[0]?.url;
    if (firstUrl) {
      ctrl.setExpandedPageUrl(firstUrl);
    }
  }, [
    ctrl.sitemapSource,
    ctrl.expandedPageUrl,
    ctrl.displayRows,
    ctrl.setExpandedPageUrl,
  ]);

  const activeRowIndex = useMemo(() => {
    if (!ctrl.expandedPageUrl) return -1;
    const activeKey = normalizePageUrlKey(ctrl.expandedPageUrl);
    return ctrl.rows.findIndex((r) => normalizePageUrlKey(r.url) === activeKey);
  }, [ctrl.expandedPageUrl, ctrl.rows]);

  const activeRow = activeRowIndex >= 0 ? ctrl.rows[activeRowIndex] ?? null : null;

  const expandedPageTitle = useMemo(() => {
    if (!activeRow) return null;
    return activeRow.title || ctrl.wpTitlesByUrl[activeRow.url] || null;
  }, [activeRow, ctrl.wpTitlesByUrl]);

  usePulseAssistOverviewBridge({
    sitemapSource: ctrl.sitemapSource,
    expandedPageUrl: activeRow?.url ?? ctrl.expandedPageUrl,
    expandedPageTitle,
  });

  useEffect(() => {
    setStudioDocRevisionsViewBridge({
      openRevisions: () => setStudioCenterView("revisions"),
    });
    return () => setStudioDocRevisionsViewBridge(null);
  }, []);

  useEffect(() => {
    setStudioCenterView("document");
  }, [activeRow?.url]);

  const isStudioDataReady = useMemo(() => {
    if (props.studioRowSource === "bulk-generator") return true;
    if (!ctrl.site?.id) return true;
    if (ctrl.displayRows.length === 0) return false;
    if (!activeRow) return false;
    if (activeRow.status === "scraping") return false;
    const hasTitle = Boolean(
      (
        activeRow.title ||
        activeRow.pageHeading ||
        ctrl.wpTitlesByUrl[activeRow.url] ||
        ""
      ).trim(),
    );
    if (!hasTitle) return false;
    const headerCount = resolveStudioDrawerElementorHeaders(
      activeRow,
      ctrl.site,
      ctrl.sitemapSource,
    ).length;
    const rawBody = (
      activeRow.postContentOptimized ||
      activeRow.postContent ||
      ""
    ).trim();
    const hasBody = rawBody.length > 0 && rawBody !== "<p></p>";
    return headerCount > 0 || hasBody;
  }, [
    props.studioRowSource,
    ctrl.site,
    ctrl.displayRows.length,
    ctrl.wpTitlesByUrl,
    ctrl.sitemapSource,
    activeRow,
  ]);

  const [splashDismissedForSiteId, setSplashDismissedForSiteId] = useState<string | null>(
    null,
  );
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);

  useEffect(() => {
    setMinSplashElapsed(false);
    const minTimer = window.setTimeout(() => {
      setMinSplashElapsed(true);
    }, 650);
    const maxTimer = window.setTimeout(() => {
      if (ctrl.site?.id) {
        setSplashDismissedForSiteId(ctrl.site.id);
      }
    }, 6000);
    return () => {
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
    };
  }, [ctrl.site?.id]);

  useEffect(() => {
    if (isStudioDataReady && minSplashElapsed && ctrl.site?.id) {
      setSplashDismissedForSiteId(ctrl.site.id);
    }
  }, [isStudioDataReady, minSplashElapsed, ctrl.site?.id]);

  const splashVisible =
    props.studioRowSource !== "bulk-generator" &&
    Boolean(ctrl.site?.id) &&
    (splashDismissedForSiteId !== ctrl.site?.id || activeRow?.status === "scraping");

  const selectDocUrl = (url: string) => {
    if (normalizePageUrlKey(ctrl.expandedPageUrl ?? "") === normalizePageUrlKey(url)) {
      return;
    }
    ctrl.setExpandedPageUrl(url);
  };

  return (
    <OverviewStudioTabShell
      splashVisible={splashVisible}
      dock={{
        ctrl,
        activeUrl: activeRow?.url ?? ctrl.expandedPageUrl,
        optimizingRowUrl,
        batchBulkState: derived.batchBulkState,
        batchRunning,
        onSelectUrl: selectDocUrl,
        bulkWorkspaceBusy: derived.bulkWorkspaceBusy,
        optimizerSection: props.optimizerSection,
        onOptimizerSectionChange: props.onOptimizerSectionChange,
      }}
      main={
        studioCenterView === "revisions" && activeRow ? (
          <OverviewStudioRevisionsPage
            row={activeRow}
            wpTitlesByUrl={ctrl.wpTitlesByUrl}
            siteId={ctrl.site?.id ?? null}
            onBackToEditor={() => setStudioCenterView("document")}
          />
        ) : (
          <OverviewVisualDocCanvas
            ctrl={ctrl}
            row={activeRow}
            rowIndex={activeRowIndex}
            bulkWorkspaceBusy={derived.bulkWorkspaceBusy}
            bulkMicroSnapshot={derived.bulkMicroSnapshot}
            batchBulkState={derived.batchBulkState}
            optimizingRowUrl={optimizingRowUrl}
            onInFlightAutoSeoUrlChange={setInFlightAutoSeoUrl}
            onOpenRevisions={() => setStudioCenterView("revisions")}
          />
        )
      }
    />
  );
}
