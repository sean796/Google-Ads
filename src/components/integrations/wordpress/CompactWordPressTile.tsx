import React, { useCallback, useState } from "react";
import { Card } from "@/components/ui/card";
import { XCircle, Copy, Power, Wand2, Trash2, Pencil, MoreHorizontal, ExternalLink } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { loadApiKey } from "@/lib/api";
import { applyGbpPropertyWand } from "@/lib/wordpress-site-display-name-from-dfs-gmb";
import { wordpressSiteCanonicalName } from "@/lib/wordpress-site-display-name";
import { type WordPressSite } from "../types";
import { editorialContentPackageShortLabelForSite } from "@/lib/editorial-content-package";
import { propertyWpAdminUrl } from "./property-profile-view-model";
import type { WordPressPropertyRowDisplay } from "@/lib/wordpress-properties-row-display";
import { getCyberpunkCardClasses, getCyberpunkTextClasses, getPropertyListRowBlackIconButtonClass, getPropertyListRowIconButtonHoverGlowClass } from "./cyberpunk-theme";
import { Button, TextButton } from "@/ui";

type CopyControlTone = "default" | "white";

interface CompactWordPressTileProps {
  site: WordPressSite;
  isTesting: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onTest?: () => void;
  onToggleEnabled?: () => void;
  /**
   * "card" renders the full tile as a standalone Card (legacy; prefer listRow in lists).
   * "header" is used inside the merged expanded container (no outer Card/border).
   * "menu" is used inside the expanded menu row (single-line title+URL, no connection button).
   * "listRow" is a compact horizontal summary for collapsed list rows (no Card).
   */
  variant?: "card" | "header" | "menu" | "listRow";
  /** List / menu row density only (Integrations Properties). */
  propertyRowDisplay?: WordPressPropertyRowDisplay;
  /** Brighter copy control on dark rows (e.g. multi-site optimizer). */
  copyControlTone?: CopyControlTone;
  /** When set, shows a wand beside Copy to set `site.name` from DataForSEO Business Listings + GBP title. */
  onApplyDisplayNameFromGmb?: (name: string) => void;
  /** `listRow` only: copy + GBP wand use flat black icon chrome (Properties + multi-site). */
  listRowBlackActionChrome?: boolean;
  /** Hide the copy-URL icon (e.g. multi-site Content rows). */
  hideCopyUrl?: boolean;
  /** Site title opens `site.siteUrl` in a new tab instead of plain text. */
  linkTitleToSite?: boolean;
  /** Opens the property profile modal (Properties list). */
  onOpenProfile?: () => void;
  /** List row: delete property (trash icon beside profile). */
  onDelete?: () => void;
  /** Properties list: edit stored property name (canonical, not header menu label). */
  onEditCanonicalName?: () => void;
}

function copySiteUrlButton(
  site: WordPressSite,
  compact: boolean | undefined,
  tone: CopyControlTone,
  matchOptimizeRow?: boolean,
) {
  return (
    <Button
      size="icon" icon={Copy}
      pressed={Boolean(matchOptimizeRow)}
      variant="quiet"
      aria-label={`Copy site URL: ${site.siteUrl}`}
      title={site.siteUrl}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(site.siteUrl);
      }}
    ></Button>
  );
}

type ListRowActions = {
  onDelete?: () => void;
  onEditCanonicalName?: () => void;
  onToggleEnabled?: () => void;
  onApplyGmbName?: () => void;
  isResolvingGmbName?: boolean;
  isTesting?: boolean;
};

const ROW_MENU_ITEM = "gap-2 text-base";

/** Properties list: one labeled actions menu per row (copy URL, GBP name, edit name, enable/disable, delete). */
function listRowActionsMenu(site: WordPressSite, actions: ListRowActions) {
  const isEnabled = site.enabled !== false;
  const busy = Boolean(actions.isTesting || actions.isResolvingGmbName);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Property actions"
        title="Property actions"
        onClick={stop}
        onPointerDown={stop}
        className={cn(
          getPropertyListRowBlackIconButtonClass(true),
          getPropertyListRowIconButtonHoverGlowClass("powerOff"),
        )}
      >
        {busy ? (
          null
        ) : (
          <MoreHorizontal className="h-4 w-4 shrink-0" aria-hidden />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={stop} onPointerDown={stop}>
        <DropdownMenuItem className={ROW_MENU_ITEM} onSelect={() => void navigator.clipboard.writeText(site.siteUrl)}>
          <Copy className="h-4 w-4" aria-hidden />
          Copy site URL
        </DropdownMenuItem>
        {actions.onApplyGmbName ? (
          <DropdownMenuItem className={ROW_MENU_ITEM} disabled={actions.isResolvingGmbName} onSelect={actions.onApplyGmbName}>
            <Wand2 className="h-4 w-4" aria-hidden />
            Set name from Google Business Profile
          </DropdownMenuItem>
        ) : null}
        {actions.onEditCanonicalName ? (
          <DropdownMenuItem className={ROW_MENU_ITEM} onSelect={actions.onEditCanonicalName}>
            <Pencil className="h-4 w-4" aria-hidden />
            Edit property name
          </DropdownMenuItem>
        ) : null}
        {actions.onToggleEnabled ? (
          <DropdownMenuItem className={ROW_MENU_ITEM} disabled={actions.isTesting} onSelect={actions.onToggleEnabled}>
            <Power className="h-4 w-4" aria-hidden />
            {isEnabled ? "Disable property" : "Enable property"}
          </DropdownMenuItem>
        ) : null}
        {actions.onDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className={cn(ROW_MENU_ITEM, "text-ui-danger-hover focus:text-ui-danger-hover")} onSelect={actions.onDelete}>
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete property
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Single row: actions menu (list rows) or copy URL + GBP wand (other variants), then title. */
function menuInnerSummary(
  site: WordPressSite,
  rowDisplay: WordPressPropertyRowDisplay,
  copyControlTone: CopyControlTone,
  gmbDisplayNameWand: React.ReactNode,
  listRowBlackChrome: boolean,
  options?: {
    hideCopyUrl?: boolean;
    linkTitleToSite?: boolean;
    onOpenProfile?: () => void;
    listRowActions?: ListRowActions;
  },
) {
  const compact = rowDisplay === "compact";
  const displayName = wordpressSiteCanonicalName(site);
  const titleClass = cn(
    "shrink-0 whitespace-nowrap text-base font-bold leading-none",
    getCyberpunkTextClasses("primary"),
  );
  const siteHref = site.siteUrl?.trim()
    ? site.siteUrl.startsWith("http")
      ? site.siteUrl
      : `https://${site.siteUrl}`
    : undefined;

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-nowrap items-center px-0.5 text-left",
        compact ? "gap-2" : "gap-3",
      )}
    >
      {options?.listRowActions ? (
        <>
          {listRowActionsMenu(site, options.listRowActions)}
          {editorialContentPackageShortLabelForSite(site) ? (
            <span
              className="inline-flex h-8 min-h-8 w-24 shrink-0 items-center justify-center rounded-none bg-ui-field px-2 text-base font-medium tabular-nums text-foreground sm:h-9 sm:min-h-9"
              title="Editorial content package"
            >
              {editorialContentPackageShortLabelForSite(site)}
            </span>
          ) : null}
          {siteHref ? (
            <a
              href={propertyWpAdminUrl(site)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open WP admin for ${displayName}`}
              title={`Open WP admin: ${propertyWpAdminUrl(site)}`}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                getPropertyListRowBlackIconButtonClass(true),
                getPropertyListRowIconButtonHoverGlowClass("powerOff"),
              )}
            >
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
            </a>
          ) : null}
        </>
      ) : (
        <>
          {!options?.hideCopyUrl ? copySiteUrlButton(site, compact, copyControlTone, listRowBlackChrome) : null}
          {gmbDisplayNameWand}
        </>
      )}
      {options?.onOpenProfile ? (
        <TextButton
          tone="plain"
          type="button"
          title="Open profile"
          onClick={(e) => {
            e.stopPropagation();
            options.onOpenProfile?.();
          }}
        >
          {displayName}
        </TextButton>
      ) : options?.linkTitleToSite && siteHref ? (
        <a
          href={siteHref}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open ${siteHref}`}
          className={cn(titleClass, "hover:text-primary hover:underline")}
          onClick={(e) => e.stopPropagation()}
        >
          {displayName}
        </a>
      ) : (
        <h3 className={titleClass} title={displayName}>
          {displayName}
        </h3>
      )}
    </div>
  );
}

export const CompactWordPressTile: React.FC<CompactWordPressTileProps> = ({
  site,
  isTesting,
  isExpanded,
  onToggle,
  onTest,
  onToggleEnabled,
  variant = "card",
  propertyRowDisplay = "compact",
  copyControlTone = "default",
  onApplyDisplayNameFromGmb,
  listRowBlackActionChrome = false,
  hideCopyUrl = false,
  linkTitleToSite = false,
  onOpenProfile,
  onDelete,
  onEditCanonicalName,
}) => {
  const [isResolvingGmbDisplayName, setIsResolvingGmbDisplayName] = useState(false);

  const resolveGmbDisplayName = useCallback(
    async () => {
      if (!onApplyDisplayNameFromGmb || isResolvingGmbDisplayName) return;
      setIsResolvingGmbDisplayName(true);
      try {
        const r = await applyGbpPropertyWand(site, {
          openRouterApiKey: loadApiKey()?.trim() || undefined,
        });
        if (r.ok === false) {
          notify.error(r.error);
          return;
        }
        const next = r.name.trim();
        if (next !== site.name.trim()) {
          onApplyDisplayNameFromGmb(next);
        }
      } catch (err) {
        notifyHeaderError("GBP name resolve failed", err);
      } finally {
        setIsResolvingGmbDisplayName(false);
      }
    },
    [isResolvingGmbDisplayName, onApplyDisplayNameFromGmb, site],
  );

  const rowCompact = propertyRowDisplay === "compact";
  const listRowBlackChrome = Boolean(listRowBlackActionChrome && variant === "listRow");
  const gmbDisplayNameWand =
    onApplyDisplayNameFromGmb != null ? (
      <Button
        pressed={!listRowBlackChrome}
        variant="quiet"
        aria-label="Set site name from Google Business Profile (DataForSEO)"
        title="Set site name from Google Business Profile (DataForSEO)"
        disabled={isResolvingGmbDisplayName}
        onClick={(e) => {
          e.stopPropagation();
          void resolveGmbDisplayName();
        }}
      >
        {isResolvingGmbDisplayName ? (
          null
        ) : (
          <Wand2
            className={cn(
              "shrink-0",
              listRowBlackChrome ? (rowCompact ? "h-3.5 w-3.5 sm:h-4 sm:w-4" : "h-4 w-4") : rowCompact ? "h-3 w-3" : "h-3.5 w-3.5",
            )}
            aria-hidden
          />
        )}
      </Button>
    ) : null;

  const showConnectionButton = !(variant === "header" && isExpanded);
  const isEnabled = site.enabled !== false;
  const isConnected = site.connectionStatus === "success";

  const handleConnectionButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTesting) return;

    if (isConnected && onToggleEnabled) {
      onToggleEnabled();
    } else if (onTest) {
      onTest();
    }
  };

  const powerButton = showConnectionButton ? (
    <Button
      pressed={Boolean(rowCompact)}
      variant="quiet"
      onClick={handleConnectionButtonClick}
      disabled={isTesting}
      title={
        isTesting
          ? "Testing connection..."
          : isConnected
            ? isEnabled
              ? "Click to turn off"
              : "Click to turn on"
            : "Click to test connection"
      }
    >
      {isTesting ? (
        null
      ) : site.connectionStatus === "failed" ? (
        <XCircle className="h-3.5 w-3.5" />
      ) : (
        <Power className="h-3.5 w-3.5 text-primary" aria-hidden />
      )}
    </Button>
  ) : (
    <div className={cn("shrink-0", rowCompact ? "h-7 w-7" : "h-8 w-8")} aria-hidden />
  );

  const listRowSummaryOptions = {
    hideCopyUrl,
    linkTitleToSite,
    onOpenProfile,
    listRowActions:
      variant === "listRow"
        ? {
            onDelete,
            onEditCanonicalName,
            onToggleEnabled,
            onApplyGmbName: onApplyDisplayNameFromGmb ? () => void resolveGmbDisplayName() : undefined,
            isResolvingGmbName: isResolvingGmbDisplayName,
            isTesting,
          }
        : undefined,
  };

  const content = (
    <div
      className={cn(
        "flex w-full min-w-0 flex-row items-center",
        rowCompact ? "gap-1.5 sm:gap-2" : "gap-2 sm:gap-3",
      )}
    >
      <div className="min-w-0 flex-1">
        {menuInnerSummary(
          site,
          propertyRowDisplay,
          copyControlTone,
          gmbDisplayNameWand,
          listRowBlackChrome,
          listRowSummaryOptions,
        )}
      </div>
      <div className="flex shrink-0 items-center justify-center">{powerButton}</div>
    </div>
  );

  /** List / menu row: one horizontal summary line (no h-full: breaks flex row height / scroll). */
  const stackedSummaryShell = (
    <div className="flex min-h-0 w-full min-w-0 items-center">
      {menuInnerSummary(
        site,
        propertyRowDisplay,
        copyControlTone,
        gmbDisplayNameWand,
        listRowBlackChrome,
        listRowSummaryOptions,
      )}
    </div>
  );

  if (variant === "listRow") {
    return stackedSummaryShell;
  }

  if (variant === "menu") {
    return stackedSummaryShell;
  }

  if (variant === "header") {
    return (
      <div
        className="w-full cursor-pointer p-4 transition-[padding,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        onClick={onToggle}
      >
        {content}
      </div>
    );
  }

  /** Allow opening the panel for failed/untested sites so users can Edit credentials or Test again. */
  const canOpenDetailPanel =
    isConnected ||
    site.connectionStatus === "failed" ||
    site.connectionStatus === "testing" ||
    site.connectionStatus === undefined;

  return (
    <Card
      title={
        canOpenDetailPanel
          ? undefined
          : "Connect successfully before opening the full property panel"
      }
      className={cn(
        "h-full w-full shrink-0 overflow-hidden rounded-xl border-0 p-4 shadow-none transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-0",
        canOpenDetailPanel ? "cursor-pointer" : "cursor-not-allowed",
        getCyberpunkCardClasses(false, true),
        isConnected && isEnabled && !isExpanded && "bg-black/20 hover:bg-black/30",
        !isConnected && "hover:bg-black/20",
        isExpanded && "bg-black/25",
      )}
      onClick={canOpenDetailPanel ? onToggle : undefined}
      role={canOpenDetailPanel ? "button" : undefined}
      tabIndex={canOpenDetailPanel ? 0 : -1}
      onKeyDown={
        canOpenDetailPanel
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle();
              }
            }
          : undefined
      }
    >
      {content}
    </Card>
  );
};
