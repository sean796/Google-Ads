import { useCallback, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ManagerMegaMenuNav } from "@/components/manager/ManagerMegaMenuNav";
import { ManagerTopBarDisplayConsole } from "@/components/manager/ManagerTopBarDisplayConsole";
import { ManagerAppFooter } from "@/components/manager/ManagerAppFooter";
import { NeoPulseAppBrand } from "@/components/manager/NeoPulseAppBrand";
import { ManagerErrorLogProvider } from "@/contexts/manager-error-log-context";
import { ManagerSeedWorkspaceProvider } from "@/contexts/manager-seed-workspace-context";
import {
  readStoredManagerSettingsCluster,
  writeStoredManagerSettingsCluster,
  type ManagerSettingsClusterId,
} from "@/components/manager/manager-settings-cluster";
import {
  MANAGER_SITE_CONSOLE_DOCK_CLASS,
  MANAGER_TOP_BAR_CLASS,
  MANAGER_TOP_BAR_EDGE_INSET_CLASS,
  MANAGER_TOP_BAR_MENU_RAIL_RESERVE_CLASS,
  MANAGER_TOP_BAR_ROW_CLASS,
} from "@/components/manager/manager-top-bar-nav-styles";
import { cn } from "@/lib/utils";

const MANAGER_TAB_STORAGE_KEY = "neo-pulse-manager-tab";

/** Same sticky mega menu + site console + footer as the main Index shell. */
export function ManagerEmbeddedPageChrome({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [managerDashboardCluster, setManagerDashboardCluster] = useState<ManagerSettingsClusterId>(() =>
    readStoredManagerSettingsCluster(),
  );

  const onManagerTabChange = useCallback(
    (tab: string) => {
      try {
        localStorage.setItem(MANAGER_TAB_STORAGE_KEY, tab);
      } catch {
        /* ignore */
      }
      const hash = tab === "dashboard" ? "settings" : tab;
      navigate({ pathname: "/", hash: `#${hash}` });
    },
    [navigate],
  );

  const onManagerDashboardClusterChange = useCallback((id: ManagerSettingsClusterId) => {
    setManagerDashboardCluster(id);
    writeStoredManagerSettingsCluster(id);
  }, []);

  const onDashboardBrandClick = useCallback(() => {
    writeStoredManagerSettingsCluster("properties");
    onManagerTabChange("dashboard");
  }, [onManagerTabChange]);

  /** Synthetic tab: Reporting mega menu stays active via route match in ManagerMegaMenuNav. */
  const managerTab = "organic-reporting";

  return (
    <ManagerErrorLogProvider>
      <ManagerSeedWorkspaceProvider>
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <div
            data-neo-pulse-manager-sticky-nav
            className={cn(
              "sticky top-0 z-50",
              MANAGER_TOP_BAR_ROW_CLASS,
              MANAGER_TOP_BAR_CLASS,
              "text-foreground shadow-none",
            )}
          >
            <div
              className={cn(
                "flex h-9 min-h-9 items-center gap-2 overflow-hidden self-center",
                MANAGER_TOP_BAR_EDGE_INSET_CLASS,
                MANAGER_TOP_BAR_MENU_RAIL_RESERVE_CLASS,
              )}
            >
              <div className="flex shrink-0 items-center">
                <NeoPulseAppBrand variant="default" showVersion onClick={onDashboardBrandClick} />
              </div>
              <div className="flex min-w-0 items-center overflow-x-auto">
                <ManagerMegaMenuNav
                  managerTab={managerTab}
                  onManagerTabChange={onManagerTabChange}
                  variant="embedded"
                  dashboardCluster={managerDashboardCluster}
                  onDashboardClusterChange={onManagerDashboardClusterChange}
                />
              </div>
            </div>
            <div className={MANAGER_SITE_CONSOLE_DOCK_CLASS}>
              <ManagerTopBarDisplayConsole variant="embedded" />
            </div>
          </div>

          <div className="flex h-0 min-h-0 w-full max-h-full flex-1 flex-col overflow-x-hidden overscroll-y-contain px-[10%]">
            {children}
          </div>

          <ManagerAppFooter
            currentTab={managerTab}
            onTabChange={onManagerTabChange}
            onDashboardBrandClick={onDashboardBrandClick}
          />
        </div>
      </ManagerSeedWorkspaceProvider>
    </ManagerErrorLogProvider>
  );
}
