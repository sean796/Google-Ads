import { type WordPressSite } from "../types";
import {
  type SitemapSystemRole,
} from "@/lib/sitemap-child-tags";
import { cn } from "@/lib/utils";
import {
  WP_PANEL_SECTION_SHELL,
  WP_PANEL_LIST_GAP,
  WP_PANEL_ROW_TILE,
  WP_PANEL_MUTED,
  WP_PANEL_TOOLBAR_BTN,
} from "./wordpress-panel-chrome";

/** Scroll area: capped height; uses app-wide primary scrollbar from `index.css`. */
export const smFlatScroll = "max-h-[min(50vh,420px)] overflow-y-auto";

const smMenuContent = cn("rounded-md border-0 bg-popover text-popover-foreground shadow-lg");
const smMenuItem =
  "cursor-pointer rounded-sm text-base text-popover-foreground focus:bg-accent focus:text-accent-foreground";
const smMenuSep = "bg-muted";
const smBtnRow = cn(
  "h-9 min-h-9 shrink-0 gap-1 rounded-md border-0 bg-secondary px-2.5 text-base text-foreground shadow-none",
  "hover:bg-tile-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);
const smFieldWell = cn(
  "h-10 min-h-10 min-w-0 flex-1 rounded-md border-0 bg-muted text-base text-foreground shadow-none",
  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

export type SitemapSectionLayout = "default" | "modalFlat";

export function sitemapSectionChrome(layout: SitemapSectionLayout) {
  if (layout === "modalFlat") {
    return {
      sectionShell: "space-y-2",
      emptyShell: "flex flex-col items-center justify-center gap-3 py-10 text-center",
      muted: "text-base text-white/70",
      fieldWell:
        "h-10 min-h-10 min-w-0 flex-1 rounded-none border-0 bg-black text-base text-white shadow-none placeholder:text-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-0 focus-visible:ring-offset-black",
      btnRow:
        "h-10 min-h-10 shrink-0 gap-1 rounded-none border-0 bg-black px-3 text-base text-white shadow-none hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35",
      rowTile:
        "rounded-none border-0 bg-black px-3 py-2 text-base text-white shadow-none transition-colors",
      rowTileEntity: "bg-[#77AA00]/10 font-semibold text-white",
      urlText: "text-white",
      menuContent: "rounded-none border-0 bg-black text-white shadow-lg",
      menuItem:
        "cursor-pointer rounded-none text-base text-white focus:bg-white/10 focus:text-white",
      menuSep: "bg-white/10",
      badgeEntity: "h-9 shrink-0 rounded-none border-0 bg-black px-2 text-base text-[#77AA00]",
      badgeMuted: "h-9 shrink-0 rounded-none border-0 bg-black px-2 text-base text-white/70",
      badgeSecondary: "h-9 shrink-0 rounded-none border-0 bg-black px-2 text-base text-white/80",
      toolbarBtn: cn(
        "h-10 min-h-10 shrink-0 gap-1 rounded-none border-0 bg-black px-4 text-base text-white shadow-none",
        "hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35",
      ),
    };
  }
  return {
    sectionShell: cn(WP_PANEL_SECTION_SHELL, "space-y-2"),
    emptyShell: cn(WP_PANEL_SECTION_SHELL, "flex flex-col items-center justify-center gap-3 py-10 text-center"),
    muted: WP_PANEL_MUTED,
    fieldWell: smFieldWell,
    btnRow: smBtnRow,
    rowTile: WP_PANEL_ROW_TILE,
    rowTileEntity: "bg-muted font-semibold text-foreground",
    urlText: "text-foreground",
    menuContent: smMenuContent,
    menuItem: smMenuItem,
    menuSep: smMenuSep,
    badgeEntity: "h-9 shrink-0 rounded-md border-0 bg-secondary px-2 text-base text-foreground",
    badgeMuted: "h-9 shrink-0 rounded-md border-0 bg-muted px-2 text-base text-muted-foreground",
    badgeSecondary: "h-9 shrink-0 rounded-md border-0 bg-secondary px-2 text-base text-muted-foreground",
    toolbarBtn: cn(WP_PANEL_TOOLBAR_BTN, "px-4"),
  };
}

export type SitemapSectionChrome = ReturnType<typeof sitemapSectionChrome>;

export interface SitemapSectionProps {
  site: WordPressSite;
  layout?: SitemapSectionLayout;
  isScrapingSitemap: Record<string, boolean>;
  isGeneratingEntities?: Record<string, boolean>;
  isIndexingSitemap?: Record<string, boolean>;
  isLoadingCalendar?: Record<string, boolean>;
  getScrapingKey: (siteId: string, sitemapUrl: string) => string;
  onScrapeChildSitemap: (childSitemapUrl: string) => void;
  onEntityGeneration?: (sitemapUrl: string) => void;
  onSetEntitySitemap?: (sitemapUrl: string) => void;
  onSetCompetitorEntitySitemap?: (sitemapUrl: string) => void;
  /** Per child sitemap row: mark disabled (stored on site.sitemaps.disabledChildSitemapUrls). */
  onToggleChildSitemapDisabled?: (childSitemapUrl: string) => void;
  onIndexSitemap?: (sitemapUrl: string) => void;
  onLoadCalendarPosts?: (sitemapUrl: string) => void;
  onRefreshSitemaps?: () => void;
  isRefreshingSitemaps?: boolean;
  onAppendManualChildSitemap?: (url: string) => void;
  onAddCustomSitemapTagLabel?: (label: string) => void;
  onToggleChildSystemRole?: (childSitemapUrl: string, role: SitemapSystemRole) => void;
  onToggleChildCustomTag?: (childSitemapUrl: string, label: string) => void;
}

export const SYSTEM_ROLE_LABELS: Record<SitemapSystemRole, string> = {
  pages: "Pages",
  posts: "Posts",
  entity: "Entity",
  competitor: "Competitor",
};
