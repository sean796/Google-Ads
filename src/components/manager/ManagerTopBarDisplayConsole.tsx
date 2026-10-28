import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Download, Pencil, RefreshCw } from "lucide-react";
import { ManagerErrorLogDropdownSection } from "@/components/manager/ManagerErrorLogBell";
import { useManagerErrorLog } from "@/contexts/manager-error-log-context";
import { getAppNotificationState, subscribeAppNotifications } from "@/lib/app-notifications";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ManagerDisplayChipFace } from "@/components/manager/ManagerDisplayChipFace";
import { SiteDisplayNameDialog } from "@/components/manager/SiteDisplayNameDialog";
import {
  MANAGER_DISPLAY_CONSOLE_ROW,
  MANAGER_DISPLAY_DROPDOWN_PANEL,
  MANAGER_DISPLAY_NAME_LABEL,
  MANAGER_DISPLAY_NAME_BAND,
  MANAGER_DISPLAY_SITE_WARMING,
  MANAGER_HEADER_BADGE_SIZE,
  managerDisplayNameBandAlertClass,
} from "@/components/manager/manager-header-chip-styles";
import {
  MANAGER_NAV_DROPDOWN_ITEM_BASE,
  managerNavDropdownRowClass,
} from "@/components/manager/manager-top-bar-nav-styles";
import { cn } from "@/lib/utils";
import type { WordPressSite } from "@/components/integrations/types";
import { wordpressSiteMenuDisplayName } from "@/lib/wordpress-site-display-name";
import { navigateToOrganicReporting } from "@/lib/organic-dashboard/organic-reporting-nav";
import { useSitePrefetchState } from "@/hooks/use-site-prefetch-state";
import {
  getEntitySiteWarmCacheIfReady,
  refreshSitePrefetch,
} from "@/lib/local-analysis/entity-site-warm-cache";
import { htmlToMarkdown } from "@/lib/wordpress-converter";

const NAME_CHEVRON_PX = 28;

function chipLabelWidthPx(root: HTMLElement, labelMeasure: string): number {
  let maxLabel = 0;
  for (const el of Array.from(root.children)) {
    const row = el as HTMLElement;
    if (row.dataset.measure === labelMeasure) {
      maxLabel = Math.max(maxLabel, row.offsetWidth);
    }
  }
  return maxLabel > 0 ? maxLabel + NAME_CHEVRON_PX : 0;
}

function menuRowWidthPx(root: HTMLElement, rowMeasure: string): number {
  let maxRow = 0;
  for (const el of Array.from(root.children)) {
    const row = el as HTMLElement;
    if (row.dataset.measure === rowMeasure) {
      maxRow = Math.max(maxRow, row.offsetWidth);
    }
  }
  return maxRow;
}

function chipMenuWidthPx(root: HTMLElement, labelMeasure: string, rowMeasure: string): number {
  const fromLabel = chipLabelWidthPx(root, labelMeasure);
  const fromRow = menuRowWidthPx(root, rowMeasure);
  return Math.max(fromLabel, fromRow);
}

function csvCell(value: unknown): string {
  const text =
    value == null
      ? ""
      : typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadSitePrefetchBundle(site: WordPressSite): boolean {
  const bundle = getEntitySiteWarmCacheIfReady(site.id);
  if (!bundle) return false;
  const safeSite = wordpressSiteMenuDisplayName(site)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "site";
  const stamp = new Date(bundle.fetchedAt).toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const rows = (bundle.bulkInventoryRows ?? []).map((row) => {
    const rawContent = String(row.fields?.content ?? "");
    // WP REST only returns HTML; CSV content column is simple markdown (same path as Content Opt).
    const contentMd = rawContent.trim() ? htmlToMarkdown(rawContent) : "";
    return {
      collection: row.collection ?? "",
      url: row.url ?? "",
      id: row.id ?? "",
      slug: row.slug ?? "",
      title: row.fields?.title ?? "",
      meta: row.fields?.meta ?? "",
      keyword: row.fields?.keyword ?? "",
      excerpt: row.fields?.excerpt ?? "",
      pageHeading: row.fields?.pageHeading ?? "",
      content: contentMd,
      date_gmt: row.date_gmt ?? "",
      seo_research:
        row.acf && typeof row.acf === "object" && typeof row.acf.seo_research === "string"
          ? row.acf.seo_research
          : "",
      keyword_focus:
        row.acf && typeof row.acf === "object" && typeof row.acf.keyword_focus === "string"
          ? row.acf.keyword_focus
          : "",
      date_modifier:
        row.acf && typeof row.acf === "object" && typeof row.acf.date_modifier === "string"
          ? row.acf.date_modifier
          : "",
      faq:
        row.acf && typeof row.acf === "object" && typeof row.acf.faq === "string"
          ? row.acf.faq
          : "",
    };
  });
  const header = [
    "collection",
    "url",
    "id",
    "slug",
    "title",
    "meta",
    "keyword",
    "excerpt",
    "pageHeading",
    "content",
    "date_gmt",
    "seo_research",
    "keyword_focus",
    "date_modifier",
    "faq",
  ];
  const csv = [
    header.join(","),
    ...rows.map((row) => header.map((key) => csvCell(row[key as keyof typeof row])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeSite}-site-cache-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

export function ManagerTopBarDisplayConsole({
  variant,
}: {
  variant: "embedded" | "compact";
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isOrganicDashboardRoute = /^\/sites\/[^/]+\/organic\/?$/.test(location.pathname);
  const { sites, handleConnectSite, handlePatchSite } = useWordPressSites();
  const { activeWordPressSiteId, setActiveWordPressSiteId } = useActiveWordPressSite();
  const measureRef = useRef<HTMLDivElement>(null);
  const [siteMenuOpen, setSiteMenuOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameSite, setRenameSite] = useState<WordPressSite | null>(null);
  const [siteMenuWidthPx, setSiteMenuWidthPx] = useState(0);

  const displayLabels = useMemo(() => sites.map((s) => wordpressSiteMenuDisplayName(s)), [sites]);
  const activeSite = sites.find((s) => s.id === activeWordPressSiteId);
  const { loading: isSiteWarmLoading, refreshing } = useSitePrefetchState(activeSite?.id);
  const activeSitePrefetch = activeSite ? getEntitySiteWarmCacheIfReady(activeSite.id) : null;
  const utilityRowCount = 1 + (activeSitePrefetch ? 1 : 0);
  const [notifyPrimary, setNotifyPrimary] = useState(() => getAppNotificationState().primary);
  useEffect(() => {
    const sync = () => setNotifyPrimary(getAppNotificationState().primary);
    sync();
    return subscribeAppNotifications(sync);
  }, []);
  const { entries: errorLogEntries } = useManagerErrorLog();
  const hasErrorLog = errorLogEntries.length > 0;
  const nameAlertKind =
    !isSiteWarmLoading && hasErrorLog
      ? ("error" as const)
      : notifyPrimary && notifyPrimary.variant !== "loading"
        ? notifyPrimary.variant
        : null;
  const nameBandAlertClass = managerDisplayNameBandAlertClass(nameAlertKind);

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;
    setSiteMenuWidthPx(chipMenuWidthPx(root, "site-label", "site-row"));
  }, [displayLabels]);

  const siteChipWidthPx = siteMenuWidthPx > 0 ? siteMenuWidthPx : 120;
  const consoleWidthPx = siteChipWidthPx;

  const siteMenuWidthStyle: CSSProperties | undefined =
    siteMenuWidthPx > 0 ? { width: siteMenuWidthPx, minWidth: siteMenuWidthPx } : undefined;
  const consoleWidthStyle: CSSProperties = { width: consoleWidthPx, minWidth: consoleWidthPx };

  const dropdownAnimateClass =
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 duration-200";

  const dropdownItemClass = (index: number, selected = false) =>
    variant === "embedded"
      ? cn(MANAGER_NAV_DROPDOWN_ITEM_BASE, managerNavDropdownRowClass(index, selected))
      : "cursor-pointer rounded-none px-3 py-2.5 text-base font-normal outline-none focus:bg-zinc-800/90 data-[highlighted]:bg-zinc-800/90";

  const triggerHoverClass =
    variant === "embedded"
      ? "rounded-none hover:bg-zinc-800 data-[state=open]:bg-zinc-800"
      : "hover:bg-zinc-800 data-[state=open]:bg-zinc-800";

  return (
    <>
      <div
        ref={measureRef}
        className="pointer-events-none fixed top-0 -left-[10000px] opacity-0"
        aria-hidden
      >
        {sites.map((site) => (
          <span key={`site-label-${site.id}`} data-measure="site-label" className={MANAGER_DISPLAY_NAME_LABEL}>
            {wordpressSiteMenuDisplayName(site)}
          </span>
        ))}
        {sites.map((site) => (
          <div
            key={`site-row-${site.id}`}
            data-measure="site-row"
            className="inline-flex items-center gap-2.5 px-3"
          >
            <Pencil className="h-4 w-4 shrink-0" aria-hidden />
            <span className="whitespace-nowrap text-base font-normal leading-tight">
              {wordpressSiteMenuDisplayName(site)}
            </span>
          </div>
        ))}
      </div>
      <div className={MANAGER_DISPLAY_CONSOLE_ROW} style={consoleWidthStyle}>
        {sites.length === 0 || !activeSite ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  MANAGER_HEADER_BADGE_SIZE,
                  MANAGER_DISPLAY_NAME_BAND,
                  "inline-flex min-w-[7rem] items-center px-2.5 text-muted-foreground opacity-60",
                )}
                aria-label="None connected"
              >
                None connected
              </span>
            </TooltipTrigger>
            <TooltipContent>None connected</TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenu open={siteMenuOpen} onOpenChange={setSiteMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                style={siteMenuWidthStyle}
                className={cn(
                  "inline-flex h-9 shrink-0 cursor-pointer items-stretch overflow-visible border-0 bg-transparent p-0 text-left shadow-none outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-zinc-600 focus-visible:ring-offset-0",
                  triggerHoverClass,
                  isSiteWarmLoading && MANAGER_DISPLAY_SITE_WARMING,
                )}
                aria-label={`Connected site: ${wordpressSiteMenuDisplayName(activeSite)}${isSiteWarmLoading ? " (loading site data)" : ""}${notifyPrimary ? ` · ${notifyPrimary.title}` : ""}${hasErrorLog ? ` · ${errorLogEntries.length} error(s)` : ""}`}
                aria-haspopup="menu"
              >
                <ManagerDisplayChipFace
                  icon={null}
                  label={wordpressSiteMenuDisplayName(activeSite)}
                  isWarming={isSiteWarmLoading}
                  nameBandClassName={nameBandAlertClass || undefined}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              style={siteMenuWidthStyle}
              className={cn(MANAGER_DISPLAY_DROPDOWN_PANEL, dropdownAnimateClass)}
            >
              <DropdownMenuItem
                className={cn(dropdownItemClass(0), "shrink-0")}
                aria-label="Refresh site data"
                onSelect={() => {
                  if (activeSite) void refreshSitePrefetch(activeSite);
                }}
              >
                <div className="flex w-full shrink-0 items-center gap-2.5">
                  <RefreshCw
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground",
                      refreshing && "animate-spin",
                    )}
                    aria-hidden
                  />
                  <span className="whitespace-nowrap text-base font-normal leading-tight">Site data</span>
                </div>
              </DropdownMenuItem>
              {activeSitePrefetch ? (
                <DropdownMenuItem
                  className={cn(dropdownItemClass(1), "shrink-0")}
                  aria-label="Download cache"
                  onSelect={() => {
                    if (activeSite) downloadSitePrefetchBundle(activeSite);
                  }}
                >
                  <div className="flex w-full shrink-0 items-center gap-2.5">
                    <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="whitespace-nowrap text-base font-normal leading-tight">Cache</span>
                  </div>
                </DropdownMenuItem>
              ) : null}
              {sites.map((site, index) => {
                const selected = site.id === activeSite.id;
                const label = wordpressSiteMenuDisplayName(site);
                const iconClass = selected ? "text-primary" : "text-muted-foreground";
                return (
                  <DropdownMenuItem
                    key={site.id}
                    className={cn(dropdownItemClass(utilityRowCount + index, selected), "shrink-0")}
                    onSelect={(event) => {
                      if (selected) {
                        event.preventDefault();
                        return;
                      }
                      handleConnectSite(site);
                      setActiveWordPressSiteId(site.id);
                      if (isOrganicDashboardRoute) {
                        navigateToOrganicReporting(navigate, site.id);
                      }
                    }}
                  >
                    <div className="flex w-full shrink-0 items-center gap-2.5">
                      <button
                        type="button"
                        aria-label={`Rename ${label}`}
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center",
                          iconClass,
                          "hover:opacity-80",
                        )}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setRenameSite(site);
                          setSiteMenuOpen(false);
                          setRenameDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4 shrink-0" aria-hidden />
                      </button>
                      <span className="whitespace-nowrap text-base font-normal leading-tight">{label}</span>
                    </div>
                  </DropdownMenuItem>
                );
              })}
              <ManagerErrorLogDropdownSection />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <SiteDisplayNameDialog
        open={renameDialogOpen}
        site={renameSite}
        onOpenChange={(open) => {
          setRenameDialogOpen(open);
          if (!open) setRenameSite(null);
        }}
        onSave={(siteId, name) => {
          const site = sites.find((s) => s.id === siteId);
          const trimmed = name.trim();
          if (!site || !trimmed || trimmed === wordpressSiteMenuDisplayName(site)) return;
          handlePatchSite(siteId, { menuDisplayName: trimmed });
        }}
      />
    </>
  );
}

/** @deprecated Use ManagerTopBarDisplayConsole */
export const ManagerTopBarSiteStrip = ManagerTopBarDisplayConsole;
