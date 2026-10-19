import { useCallback, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import type { WordPressSite } from "@/components/integrations/types";
import { prefetchOrganicDashboardBundle } from "@/lib/organic-dashboard/organic-dashboard-prefetch";
import { openOrganicReporting } from "@/lib/organic-dashboard/organic-reporting-nav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MANAGER_NAV_DROPDOWN_ITEM_BASE,
  MANAGER_NAV_DROPDOWN_PANEL,
  MANAGER_NAV_DROPDOWN_Z,
  MANAGER_NAV_TRIGGER_ACTIVE,
  MANAGER_NAV_TRIGGER_BASE,
  MANAGER_NAV_TRIGGER_INACTIVE,
  managerNavDropdownRowClass,
} from "@/components/manager/manager-top-bar-nav-styles";
import { cn } from "@/lib/utils";
import {
  getManagerNavSections,
  isManagerNavItemActive,
  isManagerNavItemSelected,
  type ManagerNavItem,
  type ManagerNavSection,
} from "@/components/manager/manager-nav-sections";
import type { ManagerSettingsClusterId } from "@/components/manager/manager-settings-cluster";
import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";
import { useBlogGeneratorSection } from "@/hooks/use-blog-generator-section";
import { dashboardClusterToArea, managerTabToArea, useTeamPermission } from "@/hooks/use-team-permission";

export interface ManagerMegaMenuNavProps {
  managerTab: string;
  onManagerTabChange: (tab: string) => void;
  onGeneratorSectionChange?: (section: BlogGeneratorSectionId) => void;
  variant: "embedded" | "compact";
  dashboardCluster: ManagerSettingsClusterId;
  onDashboardClusterChange: (id: ManagerSettingsClusterId) => void;
}

export function ManagerMegaMenuNav({
  managerTab,
  onManagerTabChange,
  onGeneratorSectionChange,
  variant,
  dashboardCluster,
  onDashboardClusterChange,
}: ManagerMegaMenuNavProps) {
  const activeGeneratorSection = useBlogGeneratorSection();
  const triggerClass = useMemo(
    () =>
      variant === "embedded"
        ? cn(MANAGER_NAV_TRIGGER_BASE, MANAGER_NAV_TRIGGER_INACTIVE, "group h-9 min-h-9 shrink-0 border-0 shadow-none")
        : cn(
            "group inline-flex items-center gap-2 border border-primary/40 font-semibold tracking-tight outline-none transition-all duration-200 ease-out",
            "bg-black/35 shadow-none hover:bg-primary/10 hover:border-primary/60",
            "focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "data-[state=open]:bg-primary/12 data-[state=open]:border-primary/55",
            "h-9 min-h-9 rounded-lg px-2.5 text-base",
          ),
    [variant],
  );

  const embeddedActiveClass = MANAGER_NAV_TRIGGER_ACTIVE;
  const compactActiveClass =
    "bg-primary/12 text-foreground shadow-none ring-1 ring-inset ring-primary/35";

  const contentClass = cn(
    variant === "embedded"
      ? MANAGER_NAV_DROPDOWN_PANEL
      : cn(
          MANAGER_NAV_DROPDOWN_Z,
          "min-w-[16.5rem] rounded-xl border border-primary/45 bg-black/90 p-1.5 shadow-none backdrop-blur-md text-popover-foreground",
        ),
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
    "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1",
    "duration-200",
  );

  const { canRead } = useTeamPermission();
  const navigate = useNavigate();
  const location = useLocation();
  const { sites } = useWordPressSites();
  const { activeWordPressSiteId } = useActiveWordPressSite();
  const queryClient = useQueryClient();
  const isOrganicDashboardRoute =
    /^\/sites\/[^/]+\/organic\/?$/.test(location.pathname) ||
    managerTab === "organic-reporting";

  const resolveOrganicNavSite = useCallback((): WordPressSite | undefined => {
    const enabled = sites.filter((s) => s.enabled !== false);
    if (enabled.length === 0) return undefined;
    if (activeWordPressSiteId) {
      const byActive = enabled.find((s) => s.id === activeWordPressSiteId);
      if (byActive) return byActive;
    }
    return enabled[0];
  }, [activeWordPressSiteId, sites]);

  const warmOrganicReportingRoute = useCallback(
    (site: WordPressSite) => {
      prefetchOrganicDashboardBundle(queryClient, site);
    },
    [queryClient],
  );

  const applyNavItemSelection = useCallback(
    (item: ManagerNavItem) => {
      if (item.children?.length) return;
      if (item.organicDashboard) {
        const site = resolveOrganicNavSite();
        if (site) {
          warmOrganicReportingRoute(site);
          openOrganicReporting(navigate, location.pathname, site.id);
        } else {
          onDashboardClusterChange("properties");
          onManagerTabChange("dashboard");
        }
        return;
      }
      if (item.docsPath) {
        navigate(item.docsPath, { flushSync: true });
        return;
      }
      if (item.generatorSection) {
        onGeneratorSectionChange?.(item.generatorSection);
        return;
      }
      if (item.dashboardCluster) {
        onDashboardClusterChange(item.dashboardCluster);
        onManagerTabChange("dashboard");
      } else {
        onManagerTabChange(item.value);
      }
    },
    [
      navigate,
      onDashboardClusterChange,
      onGeneratorSectionChange,
      onManagerTabChange,
      resolveOrganicNavSite,
      warmOrganicReportingRoute,
      location.pathname,
    ],
  );

  const dropdownItemClass = (index: number, selected: boolean) =>
    variant === "embedded"
      ? cn(MANAGER_NAV_DROPDOWN_ITEM_BASE, managerNavDropdownRowClass(index, selected))
      : cn(
          "cursor-pointer rounded-lg px-2.5 py-2 outline-none transition-colors duration-150",
          selected
            ? "bg-primary text-black focus:bg-primary data-[highlighted]:bg-primary"
            : "focus:bg-accent data-[highlighted]:bg-accent",
        );

  const dropdownIconClass = (selected: boolean) =>
    variant === "embedded"
      ? cn("h-4 w-4 shrink-0", selected ? "text-black" : "text-muted-foreground")
      : selected
        ? "h-3.5 w-3.5 shrink-0 text-black"
        : "h-3.5 w-3.5 shrink-0 text-muted-foreground";

  const renderNavRow = (item: ManagerNavItem, index: number) => {
    const Icon = item.icon;

    if (item.children?.length) {
      const subActive = isManagerNavItemActive(
        managerTab,
        item,
        dashboardCluster,
        activeGeneratorSection,
      );
      return (
        <DropdownMenuSub key={item.id ?? item.value}>
          <DropdownMenuSubTrigger
            className={cn(
              dropdownItemClass(index, subActive),
              variant === "embedded"
                ? "[&>svg:last-child]:text-muted-foreground [&>svg:last-child]:h-4 [&>svg:last-child]:w-4"
                : "[&>svg:last-child]:text-muted-foreground",
            )}
          >
            <div className="flex w-full items-center gap-2.5">
              <Icon className={dropdownIconClass(subActive)} aria-hidden />
              <div className="min-w-0 flex-1 text-left">
                <span className="text-base font-normal leading-tight">{item.label}</span>
              </div>
            </div>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            sideOffset={2}
            className={cn(
              variant === "embedded"
                ? cn(MANAGER_NAV_DROPDOWN_PANEL, "border border-white/[0.08]")
                : cn(
                    MANAGER_NAV_DROPDOWN_Z,
                    "min-w-[12rem] rounded-xl border border-primary/45 bg-black/90 p-1.5 shadow-none backdrop-blur-md text-popover-foreground",
                  ),
            )}
          >
            {item.children.map((child, childIndex) => {
              const ChildIcon = child.icon;
              const selected = isManagerNavItemSelected(
                managerTab,
                child,
                dashboardCluster,
                activeGeneratorSection,
              );
              const prefetchOnHover =
                child.organicDashboard === true
                  ? () => {
                      const site = resolveOrganicNavSite();
                      if (site) warmOrganicReportingRoute(site);
                    }
                  : undefined;
              return (
                <DropdownMenuItem
                  key={child.id ?? child.value}
                  className={dropdownItemClass(childIndex, selected)}
                  onPointerEnter={prefetchOnHover}
                  onFocus={prefetchOnHover}
                  onSelect={() => applyNavItemSelection(child)}
                >
                  <div className="flex w-full items-center gap-2.5">
                    <ChildIcon className={dropdownIconClass(selected)} aria-hidden />
                    <div className="min-w-0 flex-1 text-left">
                      <span className="text-base font-normal leading-tight">{child.label}</span>
                    </div>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      );
    }

    const selected = item.organicDashboard
      ? isOrganicDashboardRoute
      : isManagerNavItemSelected(managerTab, item, dashboardCluster, activeGeneratorSection);
    return (
      <DropdownMenuItem
        key={item.id ?? item.value}
        className={dropdownItemClass(index, selected)}
        onSelect={() => applyNavItemSelection(item)}
      >
        <div className="flex w-full items-center gap-2.5">
          <Icon className={dropdownIconClass(selected)} aria-hidden />
          <div className="min-w-0 flex-1 text-left">
            <span className="text-base font-normal leading-tight">{item.label}</span>
          </div>
        </div>
      </DropdownMenuItem>
    );
  };

  const embeddedTriggerContentClass = (active: boolean) =>
    active ? "text-white" : "text-foreground group-hover:text-white";

  const navItemAllowed = useCallback(
    (item: ManagerNavItem): boolean => {
      if (item.docsPath || item.organicDashboard) return true;
      if (item.dashboardCluster) {
        const area = dashboardClusterToArea(item.dashboardCluster);
        return !area || canRead(area);
      }
      if (item.generatorSection === "opt") {
        return canRead("content-optimizer") && canRead("generator");
      }
      if (item.generatorSection) {
        return canRead("generator");
      }
      const area = managerTabToArea(item.value);
      return !area || canRead(area);
    },
    [canRead],
  );

  const filterSection = useCallback(
    (section: ManagerNavSection): ManagerNavSection | null => {
      const items = section.items
        .map((item) => {
          if (item.children?.length) {
            const children = item.children.filter(navItemAllowed);
            if (children.length === 0) return null;
            return { ...item, children };
          }
          return navItemAllowed(item) ? item : null;
        })
        .filter(Boolean) as ManagerNavItem[];
      if (items.length === 0) return null;
      return { ...section, items };
    },
    [navItemAllowed],
  );

  const navSections = useMemo(
    () => getManagerNavSections().map(filterSection).filter(Boolean) as ManagerNavSection[],
    [filterSection],
  );

  return (
    <nav
      className={cn(
        "flex min-w-0 items-center",
        variant === "embedded" ? "shrink-0 flex-nowrap gap-1" : "w-full flex-wrap gap-1.5",
      )}
      aria-label="Manager sections"
    >
      {navSections.map((section) => {
        const active =
          section.id === "reporting"
            ? isOrganicDashboardRoute
            : section.items.some((i) =>
                isManagerNavItemActive(managerTab, i, dashboardCluster, activeGeneratorSection),
              );
        const SectionIcon = section.icon;

        return (
          <DropdownMenu key={section.id} modal={false}>
            <DropdownMenuTrigger
              type="button"
              className={cn(
                triggerClass,
                active && (variant === "embedded" ? embeddedActiveClass : compactActiveClass),
              )}
            >
              <SectionIcon
                className={cn(
                  "shrink-0",
                  variant === "embedded"
                    ? cn("h-4 w-4", embeddedTriggerContentClass(active))
                    : active
                      ? "h-3.5 w-3.5 text-primary"
                      : "h-3.5 w-3.5 text-muted-foreground",
                )}
                aria-hidden
              />
              <span className={variant === "embedded" ? embeddedTriggerContentClass(active) : "text-foreground"}>
                {section.label}
              </span>
              <ChevronDown
                className={cn(
                  "shrink-0 transition-transform duration-200 ease-out group-data-[state=open]:rotate-180",
                  variant === "embedded"
                    ? cn("h-4 w-4", embeddedTriggerContentClass(active))
                    : "h-3.5 w-3.5 text-foreground",
                )}
                aria-hidden
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={4} className={contentClass}>
              {section.items.map((item, index) => renderNavRow(item, index))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </nav>
  );
}
