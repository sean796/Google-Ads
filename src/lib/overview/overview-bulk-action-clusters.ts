import type { LucideIcon } from "lucide-react";
import {
  Wand2,
  Download,
  Recycle,
  Search,
  FileDown,
  Sparkles,
  Upload,
  KeyRound,
  Eraser,
} from "lucide-react";
import { notify } from "@/lib/app-notifications";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import type { OverviewTabController } from "@/hooks/overview/use-overview-tab-controller";
import { isActiveBulkProgressSlice } from "@/lib/overview/overview-bulk-inline-status";

export type OverviewBulkClusterContext = {
  hasDetectedSitemaps: boolean;
  bulkWorkspaceBusy: boolean;
};

export type OverviewBulkClusterActionItem = {
  kind: "action";
  id: string;
  label: string;
  icon: LucideIcon;
  emphasize?: boolean;
  disabled: boolean;
  onSelect: () => void;
  trailing?: string;
  /** When false, flyout stays open after click (multi-pick menus). Default true. */
  closeOnSelect?: boolean;
};

export type OverviewBulkClusterCheckboxItem = {
  kind: "checkbox";
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export type OverviewBulkClusterSeparator = { kind: "separator"; id: string };

export type OverviewBulkClusterCategory = { kind: "category"; id: string; label: string };

export type OverviewBulkClusterItem =
  | OverviewBulkClusterActionItem
  | OverviewBulkClusterCheckboxItem
  | OverviewBulkClusterSeparator
  | OverviewBulkClusterCategory;

export type OverviewBulkActionCluster = {
  id: string;
  label: string;
  items: OverviewBulkClusterItem[];
};

export type OverviewBulkClusterColumn = {
  id: string;
  label?: string;
  items: OverviewBulkClusterItem[];
};

/** Split flat cluster items into mega-menu columns (category headers start a column). */
export function groupOverviewClusterItemsIntoColumns(
  items: OverviewBulkClusterItem[],
): OverviewBulkClusterColumn[] {
  const columns: OverviewBulkClusterColumn[] = [];
  let current: OverviewBulkClusterColumn | null = null;

  const flush = () => {
    if (current && current.items.length > 0) {
      columns.push(current);
    }
    current = null;
  };

  for (const item of items) {
    if (item.kind === "separator") {
      flush();
      continue;
    }
    if (item.kind === "category") {
      flush();
      current = { id: item.id, label: item.label, items: [] };
      continue;
    }
    if (!current) {
      current = { id: `col-${columns.length}`, items: [] };
    }
    current.items.push(item);
  }
  flush();
  return columns;
}

function noRows(c: OverviewTabController): boolean {
  return c.displayRows.length === 0;
}

export function buildOverviewBulkActionClusters(
  c: OverviewTabController,
  ctx: OverviewBulkClusterContext,
): OverviewBulkActionCluster[] {
  const p = c.bulkActionProgress;
  const siteId = c.site?.id;
  const optimizingSite = siteId ? Boolean(c.opt.isOptimizingContent[siteId]) : false;
  const batchKey = siteId ? `${siteId}-batch` : "";
  const optimizingBatch = batchKey ? Boolean(c.opt.isOptimizingContent[batchKey]) : false;
  const batchBulkState = batchKey ? c.opt.bulkOptimizationState[batchKey] : undefined;
  const aiTitleHarnessRunning = batchBulkState?.runKind === "aiTitle" && optimizingBatch;
  const aiMetaHarnessRunning = batchBulkState?.runKind === "aiMeta" && optimizingBatch;
  const aiUrlHarnessRunning = batchBulkState?.runKind === "aiUrl" && optimizingBatch;
  const keywordsHarnessRunning =
    isActiveBulkProgressSlice(p.contentKw) || isActiveBulkProgressSlice(p.entityKw);
  const researchHarnessRunning = batchBulkState?.runKind === "research" && optimizingBatch;
  const faqHarnessRunning = batchBulkState?.runKind === "aiFaq" && optimizingBatch;
  const headersHarnessRunning = batchBulkState?.runKind === "aiHeaders" && optimizingBatch;
  const contentCleanupRunning = batchBulkState?.runKind === "contentCleanup" && optimizingBatch;
  const linksHarnessRunning = batchBulkState?.runKind === "aiLinks" && optimizingBatch;
  const wikipediaLinkHarnessRunning =
    batchBulkState?.runKind === "aiWikipediaLink" && optimizingBatch;
  const overviewHarnessRunning = batchBulkState?.runKind === "aiOverview" && optimizingBatch;
  const answerHarnessRunning = batchBulkState?.runKind === "aiAnswer" && optimizingBatch;
  const scenarioHarnessRunning = batchBulkState?.runKind === "aiScenario" && optimizingBatch;
  const inContentImageHarnessRunning =
    batchBulkState?.runKind === "aiInContentImage" && optimizingBatch;

  const researchBusy = researchHarnessRunning;
  const keywordsBusy = keywordsHarnessRunning;

  const aiseo: OverviewBulkActionCluster = {
    id: "aiseo",
    label: "AISEO",
    items: [
      { kind: "category", id: "research-cat", label: "Research" },
      {
        kind: "action",
        id: "research-all",
        label: "All",
        icon: Search,
        disabled: noRows(c) || researchBusy,
        onSelect: () => void c.handleResearchAll(),
      },
      {
        kind: "action",
        id: "keywords-all",
        label: "Keywords",
        icon: KeyRound,
        disabled: noRows(c) || keywordsBusy || researchHarnessRunning,
        onSelect: () => void c.handleKeywordsAll(),
      },
      { kind: "category", id: "meta-cat", label: "Meta" },
      {
        kind: "action",
        id: "ai-all-meta",
        label: "All Meta",
        icon: Wand2,
        emphasize: true,
        disabled:
          noRows(c) ||
          !c.site ||
          ctx.bulkWorkspaceBusy ||
          optimizingBatch,
        onSelect: () => void c.handleAiAllMetaAll(),
      },
      {
        kind: "action",
        id: "ai-titles",
        label: "Titles",
        icon: Wand2,
        disabled: noRows(c) || aiTitleHarnessRunning,
        onSelect: () => void c.handleAiTitleAll(),
      },
      {
        kind: "action",
        id: "ai-meta",
        label: "MD",
        icon: Wand2,
        disabled: noRows(c) || aiMetaHarnessRunning,
        onSelect: () => void c.handleAiMetaAll(),
      },
      {
        kind: "action",
        id: "ai-url",
        label: "URLs",
        icon: Wand2,
        disabled: noRows(c) || aiUrlHarnessRunning,
        onSelect: () => void c.handleAiUrlAll(),
      },
      {
        kind: "action",
        id: "ai-faq",
        label: "FAQs",
        icon: Wand2,
        disabled: noRows(c) || faqHarnessRunning,
        onSelect: () => void c.handleAiFaqAll(),
      },
      { kind: "category", id: "content-cat", label: "Content" },
      {
        kind: "action",
        id: "optimize-all",
        label: "Content",
        icon: Sparkles,
        disabled:
          noRows(c) ||
          !c.site ||
          isActiveBulkProgressSlice(p.optimizeAll) ||
          optimizingSite ||
          optimizingBatch,
        onSelect: () => void c.handleOptimizeAll(),
      },
      ...(c.sitemapSource === "pages"
        ? [
            {
              kind: "action" as const,
              id: "bulk-seo-extra",
              label: "Extra Text",
              icon: Sparkles,
              disabled:
                noRows(c) ||
                !c.site ||
                optimizingSite ||
                optimizingBatch,
              onSelect: () => void c.handleBulkSeoExtraText(),
            },
          ]
        : []),
      {
        kind: "action",
        id: "ai-headers",
        label: "Headers",
        icon: Wand2,
        disabled: noRows(c) || headersHarnessRunning || ctx.bulkWorkspaceBusy,
        onSelect: () => void c.handleAiHeadersAll(),
      },
      {
        kind: "action",
        id: "content-cleanup",
        label: "Clean Up",
        icon: Eraser,
        disabled: noRows(c) || contentCleanupRunning || ctx.bulkWorkspaceBusy,
        onSelect: () => void c.handleContentCleanupAll(),
      },
      {
        kind: "action",
        id: "ai-links",
        label: "Links",
        icon: Wand2,
        disabled: noRows(c) || linksHarnessRunning || ctx.bulkWorkspaceBusy,
        onSelect: () => void c.handleAiLinksAll(),
      },
      ...(c.sitemapSource !== "pages"
        ? [
            {
              kind: "action" as const,
              id: "ai-wikipedia-link",
              label: "Wikipedia link",
              icon: Wand2,
              disabled: noRows(c) || wikipediaLinkHarnessRunning || ctx.bulkWorkspaceBusy,
              onSelect: () => void c.handleAiWikipediaLinkAll(),
            },
            {
              kind: "action" as const,
              id: "ai-answer",
              label: "Answer",
              icon: Wand2,
              disabled: noRows(c) || answerHarnessRunning || ctx.bulkWorkspaceBusy,
              onSelect: () => void c.handleAiAnswerAll(),
            },
            {
              kind: "action" as const,
              id: "ai-overview",
              label: "Overview",
              icon: Wand2,
              disabled: noRows(c) || overviewHarnessRunning || ctx.bulkWorkspaceBusy,
              onSelect: () => void c.handleAiOverviewAll(),
            },
            {
              kind: "action" as const,
              id: "ai-scenario",
              label: "Scenario",
              icon: Wand2,
              disabled: noRows(c) || scenarioHarnessRunning || ctx.bulkWorkspaceBusy,
              onSelect: () => void c.handleAiScenarioAll(),
            },
            {
              kind: "action" as const,
              id: "ai-in-content-image",
              label: "In Content Image",
              icon: Wand2,
              disabled: noRows(c) || inContentImageHarnessRunning || ctx.bulkWorkspaceBusy,
              onSelect: () => void c.handleAiInContentImageAll(),
            },
            {
              kind: "action" as const,
              id: "ai-featured-image",
              label: "Featured image",
              icon: Wand2,
              disabled: noRows(c) || !c.site,
              onSelect: () => void c.handleAiFeaturedImageAll(),
            },
          ]
        : []),
      ...(c.sitemapSource === "sap"
        ? [
            {
              kind: "action" as const,
              id: "find-local-image",
              label: "Find Local Image",
              icon: Search,
              disabled:
                noRows(c) || inContentImageHarnessRunning || ctx.bulkWorkspaceBusy,
              onSelect: () => void c.handleFindLocalImageAll(),
            },
            {
              kind: "category" as const,
              id: "generate-local-cat",
              label: "Generate Local",
            },
            {
              kind: "action" as const,
              id: "generate-local-image-new",
              label: "New",
              icon: Wand2,
              disabled:
                noRows(c) || inContentImageHarnessRunning || ctx.bulkWorkspaceBusy,
              onSelect: () => void c.handleGenerateLocalImageAll("new"),
            },
            {
              kind: "action" as const,
              id: "generate-local-image-old",
              label: "Old",
              icon: Wand2,
              disabled:
                noRows(c) || inContentImageHarnessRunning || ctx.bulkWorkspaceBusy,
              onSelect: () => void c.handleGenerateLocalImageAll("old"),
            },
            {
              kind: "action" as const,
              id: "generate-local-image-all",
              label: "All",
              icon: Wand2,
              disabled:
                noRows(c) || inContentImageHarnessRunning || ctx.bulkWorkspaceBusy,
              onSelect: () => void c.handleGenerateLocalImageAll("all"),
            },
          ]
        : []),
    ],
  };

  const wordpressItems: OverviewBulkClusterItem[] = [
    { kind: "category", id: "wp-site-cat", label: "Site" },
    {
      kind: "action",
      id: "wp-upload",
      label: "Upload",
      icon: Upload,
      disabled: false,
      onSelect: () => {
        void c.handleBulkUploadToWordPress();
      },
    },
    {
      kind: "action",
      id: "scrape-all",
      label: "Scrape",
      icon: Download,
      disabled: false,
      onSelect: () => void c.handleScrapeAll(),
    },
    {
      kind: "action",
      id: "update-dates",
      label: "Dates",
      icon: Recycle,
      disabled: false,
      onSelect: () => c.handleSetAllDatesToday(),
    },
    { kind: "category", id: "csv-cat", label: "CSV" },
    {
      kind: "action",
      id: "export-csv",
      label: "Overview",
      icon: FileDown,
      disabled: false,
      onSelect: () => void c.handleExportOverviewCsv(),
    },
    {
      kind: "action",
      id: "redirect-csv",
      label: "Redirect",
      icon: FileDown,
      disabled: false,
      onSelect: () => c.handleDownloadSeoRedirectCsv(),
    },
  ];

  if (c.gscQuickWinsFile && BACKEND_API_BASE) {
    wordpressItems.push({
      kind: "action",
      id: "gsc-csv",
      label: "GSC keywords",
      icon: FileDown,
      disabled: false,
      onSelect: () => {
        void (async () => {
          try {
            const filename = c.gscQuickWinsFile;
            const res = await fetch(
              `${BACKEND_API_BASE}/api/gsc/quick-wins-csv/${encodeURIComponent(filename)}`,
            );
            if (!res.ok) {
              const text = await res.text();
              notify.error(text || "Failed to download GSC CSV.");
              return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          } catch (err: unknown) {
            notify.error(
              err instanceof Error ? err.message : "Failed to download GSC keywords CSV.",
            );
          }
        })();
      },
    });
  }

  wordpressItems.push({
    kind: "action",
    id: "bulk-seo-csv",
    label: "Payload",
    icon: FileDown,
    disabled: false,
    onSelect: () => void c.handleBulkExportSeoCsv(),
  });

  const wordpress: OverviewBulkActionCluster = {
    id: "wordpress",
    label: "WordPress",
    items: wordpressItems,
  };

  return [aiseo, wordpress];
}
