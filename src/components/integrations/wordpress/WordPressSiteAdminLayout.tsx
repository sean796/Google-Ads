import React from "react";
import type { LucideIcon } from "lucide-react";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

const PROPERTY_NAV_COLLAPSED_KEY = "neo-pulse-property-admin-nav-collapsed";

export type WordPressSiteAdminSectionId =
  | "overview"
  | "functions-updater"
  | "master-instructions"
  | "sitemaps"
  | "site-settings"
  | "ai-models"
  | "history";

export type SiteAdminSection<T extends string = string> = {
  id: T;
  label: string;
  /** Section icon + label (sidebar chrome in WordPressSiteAdminLayout). */
  icon?: LucideIcon;
  content: React.ReactNode;
  visible?: boolean;
};

export type WordPressSiteAdminSection = SiteAdminSection<WordPressSiteAdminSectionId>;

export type WordPressSiteAdminLayoutProps<T extends string = WordPressSiteAdminSectionId> = {
  sections: SiteAdminSection<T>[];
  defaultSectionId: T;
  /**
   * Lock the main content panel to this viewport height (e.g. "80vh") with internal scroll.
   * When omitted with {@link propertyTabContentShell}, the panel height is the measured tallest tab.
   */
  displayViewportHeight?: string;
  /** Fill a flex parent (min-h-0 flex-1) instead of relying on content-measured min-height. */
  fillParent?: boolean;
  /** Hide left / mobile section tabs (navigation lives elsewhere, e.g. mega menu). */
  hideSectionNav?: boolean;
  /** Controlled section (requires `onActiveSectionChange`). */
  activeSectionId?: T;
  onActiveSectionChange?: (id: T) => void;
  /** Rendered below section nav (e.g. Free Flow Generate under Video). */
  navFooter?: React.ReactNode;
  /** Manager dashboard: tighter inner padding (p-1 vs p-3). Main shell is always borderless. */
  flatContentPanel?: boolean;
  /**
   * Embedded property panel only: desktop nav can collapse to an icon rail; slimmer width when expanded.
   * Do not enable on shared shells (e.g. manager settings) — use only from WordPressSiteCard when embedded.
   */
  collapsibleSideNav?: boolean;
  /**
   * Legacy: measure every section and set the panel min-height to the tallest tab (avoids jump when switching tabs).
   * That min-height inflates scroll areas in the embedded manager. Default false: flex fill + natural tab height.
   */
  lockTabMinHeight?: boolean;
  /**
   * Embedded WordPress property card only: every section’s main pane shares the same muted surface, generous inset
   * padding, and a single inner scroll (scrollbar hidden). Do not use with manager settings (`flatContentPanel` alone).
   */
  propertyTabContentShell?: boolean;
};

export function WordPressSiteAdminLayout<T extends string = WordPressSiteAdminSectionId>({
  sections,
  defaultSectionId,
  displayViewportHeight,
  fillParent = false,
  hideSectionNav = false,
  activeSectionId: controlledActive,
  onActiveSectionChange,
  navFooter,
  flatContentPanel = false,
  collapsibleSideNav = false,
  lockTabMinHeight = false,
  propertyTabContentShell = false,
}: WordPressSiteAdminLayoutProps<T>) {
  const visibleSections = React.useMemo(
    () => sections.filter((s) => s.visible !== false),
    [sections]
  );
  const firstVisible = visibleSections[0]?.id ?? defaultSectionId;
  const defaultVisible = visibleSections.some((s) => s.id === defaultSectionId)
    ? defaultSectionId
    : firstVisible;

  const isControlled = onActiveSectionChange != null;
  const [internalActive, setInternalActive] = React.useState<T>(defaultVisible);

  const activeSectionId = isControlled
    ? (controlledActive !== undefined ? controlledActive : defaultVisible)
    : internalActive;

  const visibleSectionKey = visibleSections.map((s) => s.id).join("|");

  React.useEffect(() => {
    if (!visibleSections.some((s) => s.id === activeSectionId)) {
      if (isControlled) {
        onActiveSectionChange?.(defaultVisible);
      } else {
        setInternalActive(defaultVisible);
      }
    }
  }, [activeSectionId, defaultVisible, visibleSectionKey, isControlled, onActiveSectionChange, visibleSections]);

  const setActiveSectionId = React.useCallback(
    (id: T) => {
      if (isControlled) {
        onActiveSectionChange?.(id);
      } else {
        setInternalActive(id);
      }
    },
    [isControlled, onActiveSectionChange]
  );

  const activeContent = visibleSections.find((s) => s.id === activeSectionId)?.content;

  const panelMinHeightRef = React.useRef<number | null>(null);
  const [panelMinHeight, setPanelMinHeight] = React.useState<number | undefined>(undefined);

  const measureRefs = React.useRef<Array<HTMLDivElement | null>>([]);

  /** Flex column fill + skip max-tab measurement (unless {@link lockTabMinHeight}). */
  const layoutFlex =
    Boolean(displayViewportHeight) ||
    fillParent ||
    hideSectionNav ||
    flatContentPanel ||
    !lockTabMinHeight;
  /** Tighter inner padding for known manager shells only. */
  const useCompactPadding = fillParent || hideSectionNav || flatContentPanel;
  const propertyShell = Boolean(propertyTabContentShell);
  const headerNavPropertyShell = hideSectionNav && propertyShell;

  /** Embedded property shell without a fixed viewport: lock black panel to measured tallest tab. */
  const fixedPropertyPanelHeight =
    !displayViewportHeight &&
    propertyShell &&
    visibleSections.length > 0 &&
    typeof panelMinHeight === "number" &&
    panelMinHeight > 0;

  React.useLayoutEffect(() => {
    if (displayViewportHeight || visibleSections.length === 0) return;
    const shouldMeasure = !layoutFlex || propertyShell;
    if (!shouldMeasure) return;

    const heights = visibleSections.map((_, idx) => {
      return measureRefs.current[idx]?.offsetHeight ?? 0;
    });
    const max = Math.max(0, ...heights);
    if (max <= 0) return;
    if (panelMinHeightRef.current !== max) {
      panelMinHeightRef.current = max;
      setPanelMinHeight(max);
    }
  }, [visibleSectionKey, displayViewportHeight, layoutFlex, propertyShell, visibleSections]);

  const [sideNavCollapsed, setSideNavCollapsed] = React.useState(false);

  React.useEffect(() => {
    if (!collapsibleSideNav || typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(PROPERTY_NAV_COLLAPSED_KEY) === "1") {
        setSideNavCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, [collapsibleSideNav]);

  const persistNavCollapsed = React.useCallback((collapsed: boolean) => {
    setSideNavCollapsed(collapsed);
    if (!collapsibleSideNav || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(PROPERTY_NAV_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsibleSideNav]);

  const navItemBaseExpanded =
    "group flex w-full items-center gap-2 rounded-md border-0 px-2 py-2 text-left text-sm font-medium tracking-tight transition-colors md:rounded-none md:rounded-l-md";
  const navItemBaseCollapsed =
    "group flex w-full items-center justify-center rounded-md border-0 px-0 py-2.5 transition-colors md:rounded-none md:rounded-l-md";
  /** No stroke; surface + hover only. */
  const navItemInactive = "bg-card text-white hover:bg-tile-hover hover:text-white";
  const navItemActive = "bg-muted text-white shadow-none hover:bg-muted hover:text-white";

  const fillOrViewport = Boolean(displayViewportHeight || layoutFlex);

  const desktopNavWidth = collapsibleSideNav
    ? sideNavCollapsed
      ? "md:w-14"
      : "md:w-44"
    : "md:w-52";

  return (
    <div className={fillOrViewport ? "flex min-h-0 flex-1 flex-col" : undefined}>
      <div
        className={cn(
          "flex flex-col gap-dashboard md:flex-row",
          fillOrViewport && "min-h-0 flex-1",
          !hideSectionNav && "md:gap-0",
        )}
      >
        {!hideSectionNav ? (
          <>
        <nav
          className={cn(
            "hidden min-h-0 w-full shrink-0 flex-col gap-0 normal-case md:flex",
            desktopNavWidth,
            collapsibleSideNav && "border-0 bg-transparent",
          )}
        >
          {collapsibleSideNav ? (
            <div className="flex shrink-0 justify-end border-0 px-1 pb-1 pt-0.5">
              <Button
                variant="quiet"
                onClick={() => persistNavCollapsed(!sideNavCollapsed)}
                aria-expanded={!sideNavCollapsed}
                aria-controls="wp-site-admin-section-nav"
                title={sideNavCollapsed ? "Expand section nav" : "Collapse section nav"}
              >
                {sideNavCollapsed ? (
                  <PanelLeft className="h-4 w-4 shrink-0 text-white" aria-hidden />
                ) : (
                  <PanelLeftClose className="h-4 w-4 shrink-0 text-white" aria-hidden />
                )}
              </Button>
            </div>
          ) : null}
          <div id="wp-site-admin-section-nav" className="flex min-h-0 flex-1 flex-col gap-0">
            {visibleSections.map((s) => {
              const isActive = s.id === activeSectionId;
              const NavIcon = s.icon;
              const rowBase = collapsibleSideNav
                ? sideNavCollapsed
                  ? navItemBaseCollapsed
                  : navItemBaseExpanded
                : "group flex w-full items-center gap-2 rounded-md border-0 px-2 py-2 text-left text-base font-normal normal-case tracking-tight transition-colors md:rounded-none md:rounded-l-md";
              return (
                <Button
                  pressed={Boolean(isActive)}
                  variant="quiet"
                  key={String(s.id)}
                  onClick={() => setActiveSectionId(s.id)}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={collapsibleSideNav && sideNavCollapsed ? s.label : undefined}
                  title={collapsibleSideNav && sideNavCollapsed ? s.label : undefined}
                >
                  {NavIcon ? (
                    <NavIcon
                      className={`h-5 w-5 shrink-0 ${isActive ? "text-white" : "text-white group-hover:text-white"}`}
                      aria-hidden
                    />
                  ) : null}
                  {!(collapsibleSideNav && sideNavCollapsed) ? (
                    <span className="min-w-0 text-white">{s.label}</span>
                  ) : null}
                </Button>
              );
            })}
          </div>
          {navFooter ? (
            <div
              className={cn(
                "mt-3 shrink-0 space-y-dashboard pt-3",
                collapsibleSideNav && sideNavCollapsed && "px-0.5",
              )}
            >
              {navFooter}
            </div>
          ) : null}
        </nav>

        <div className="flex shrink-0 flex-col gap-dashboard md:hidden">
          <nav className="flex items-stretch gap-0 overflow-x-auto pb-1">
            {visibleSections.map((s) => {
              const isActive = s.id === activeSectionId;
              const NavIcon = s.icon;
              return (
                <Button
                  pressed={Boolean(isActive)}
                  variant="quiet"
                  key={String(s.id)}
                  onClick={() => setActiveSectionId(s.id)}
                  aria-current={isActive ? "page" : undefined}
                >
                  {NavIcon ? (
                    <NavIcon
                      className={`h-5 w-5 shrink-0 ${isActive ? "text-white" : "text-white group-hover:text-white"}`}
                      aria-hidden
                    />
                  ) : null}
                  <span className="min-w-0 text-white">{s.label}</span>
                </Button>
              );
            })}
          </nav>
          {navFooter ? <div className="shrink-0 pb-1">{navFooter}</div> : null}
        </div>
          </>
        ) : null}

        {/* Main content: borderless shell (surface only). */}
        <section className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col shadow-none ring-0 outline-none">
          {!displayViewportHeight && (!layoutFlex || propertyShell) ? (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                visibility: "hidden",
                pointerEvents: "none",
                zIndex: -1,
              }}
              aria-hidden="true"
            >
              {visibleSections.map((s, idx) => (
                <div
                  key={String(s.id)}
                  ref={(el) => (measureRefs.current[idx] = el)}
                  className={cn(
                    "w-full overflow-hidden",
                    headerNavPropertyShell
                      ? "rounded-none bg-black"
                      : propertyShell
                        ? "rounded-lg bg-background"
                        : "rounded-none bg-background",
                  )}
                >
                  {propertyShell ? (
                    <div
                      className={cn(
                        "flex min-w-0 flex-col",
                        headerNavPropertyShell
                          ? "px-3 pt-3 pb-3 sm:px-3.5 sm:pt-4 sm:pb-4"
                          : "px-4 pt-4 pb-4 sm:px-6 sm:pt-5 sm:pb-5 md:px-8 md:pt-6 md:pb-6",
                      )}
                    >
                      <div className="neo-pulse-property-panel-pane flex w-full flex-col overflow-x-hidden text-foreground">
                        {s.content}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full w-full p-2">{s.content}</div>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          <div
            className={cn(
              "w-full shadow-none ring-0",
              headerNavPropertyShell
                ? "rounded-none border-0 bg-black shadow-none"
                : propertyShell
                  ? "rounded-lg border-0 bg-background shadow-none"
                  : flatContentPanel
                    ? "rounded-none border-0 bg-transparent"
                    : "rounded-none border-0 bg-background",
              displayViewportHeight &&
                propertyShell &&
                "flex min-h-0 flex-col overflow-hidden overflow-x-hidden",
              displayViewportHeight &&
                !propertyShell &&
                "neo-pulse-manager-tab-scroll min-h-0 overflow-y-auto overflow-x-hidden",
              !displayViewportHeight &&
                layoutFlex &&
                propertyShell &&
                cn(
                  "flex min-h-0 flex-col overflow-hidden overflow-x-hidden overscroll-y-contain",
                  fixedPropertyPanelHeight ? "shrink-0" : "flex-1",
                ),
              !displayViewportHeight &&
                layoutFlex &&
                !propertyShell &&
                "neo-pulse-manager-tab-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain",
              !displayViewportHeight && !layoutFlex && "h-full overflow-hidden"
            )}
            style={
              displayViewportHeight
                ? { height: displayViewportHeight, maxHeight: displayViewportHeight }
                : fixedPropertyPanelHeight
                  ? {
                      height: panelMinHeight,
                      minHeight: panelMinHeight,
                      maxHeight: panelMinHeight,
                    }
                : !layoutFlex && panelMinHeight
                  ? { minHeight: panelMinHeight }
                  : undefined
            }
          >
            <div
              className={cn(
                "flex w-full flex-col",
                displayViewportHeight && "min-h-0 flex-1",
                !displayViewportHeight &&
                  layoutFlex &&
                  (fixedPropertyPanelHeight ? "min-h-0 h-full flex-1" : "min-h-0 flex-1"),
                !displayViewportHeight && !layoutFlex && "h-full"
              )}
            >
              <div
                className={cn(
                  "w-full",
                  propertyShell && layoutFlex && "flex min-h-0 flex-1 flex-col p-0",
                  !propertyShell &&
                    cn(
                      useCompactPadding ? "p-1" : "p-3",
                      displayViewportHeight && "flex min-h-0 flex-1 flex-col",
                      layoutFlex && "flex min-h-0 flex-1 flex-col",
                      !displayViewportHeight && !layoutFlex && "flex-1 h-full",
                    ),
                )}
              >
                {propertyShell && layoutFlex ? (
                  <div
                    className={cn(
                      "flex min-h-0 min-w-0 flex-1 flex-col",
                      headerNavPropertyShell
                        ? "px-3 pt-3 pb-3 sm:px-3.5 sm:pt-4 sm:pb-4"
                        : "px-4 pt-4 pb-4 sm:px-6 sm:pt-5 sm:pb-5 md:px-8 md:pt-6 md:pb-6",
                    )}
                  >
                    <div className="neo-pulse-property-panel-pane neo-pulse-hide-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden text-foreground">
                      {activeContent}
                    </div>
                  </div>
                ) : (
                  activeContent
                )}
              </div>
            </div>
          </div>
          {hideSectionNav && navFooter ? (
            <div className="mt-2 shrink-0 space-y-dashboard px-1 py-2 md:px-2">{navFooter}</div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
