import { NeoPulseAppBrand } from "@/components/manager/NeoPulseAppBrand";
import { writeStoredManagerSettingsCluster } from "@/components/manager/manager-settings-cluster";
import {
  MANAGER_NAV_TRIGGER_ACTIVE,
  MANAGER_NAV_TRIGGER_BASE,
  MANAGER_NAV_TRIGGER_INACTIVE,
} from "@/components/manager/manager-top-bar-nav-styles";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

/** In-app shortcuts; inner wrapper adds horizontal gutter so the footer never sits flush to the column edge. */
const FOOTER_APP_LINKS: { value: string; label: string }[] = [
  { value: "chat", label: "Chat" },
  { value: "dashboard", label: "Dashboard" },
  { value: "generator", label: "Generator" },
  { value: "research", label: "Research" },
  { value: "api", label: "API" },
];

export interface ManagerAppFooterProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  /** Footer brand → Dashboard home (Properties). Syncs mega menu cluster when provided. */
  onDashboardBrandClick?: () => void;
}

export function ManagerAppFooter({ currentTab, onTabChange, onDashboardBrandClick }: ManagerAppFooterProps) {
  const year = new Date().getFullYear();

  const footerNavBtnClass = cn(
    MANAGER_NAV_TRIGGER_BASE,
    MANAGER_NAV_TRIGGER_INACTIVE,
    "h-9 min-h-9 shrink-0 border-0 shadow-none",
  );

  const handleBrandClick = () => {
    if (onDashboardBrandClick) {
      onDashboardBrandClick();
    } else {
      writeStoredManagerSettingsCluster("properties");
      onTabChange("dashboard");
    }
  };

  return (
    <footer
      data-neo-pulse-manager-footer
      className="relative z-[1] mt-0 w-full shrink-0 overflow-hidden bg-black"
      role="contentinfo"
    >
      <div className="flex w-full min-w-0 flex-nowrap items-center gap-4 px-5 py-2.5 md:px-6 md:py-3">
        <div className="flex shrink-0 items-center">
          <NeoPulseAppBrand variant="default" onClick={handleBrandClick} />
        </div>

        <nav
          className="flex min-w-0 flex-1 shrink-0 flex-nowrap items-center gap-1 overflow-x-auto"
          aria-label="Primary workspace areas"
        >
          {FOOTER_APP_LINKS.map(({ value, label }) => {
            const active = currentTab === value;
            return (
              <Button
                pressed={Boolean(active)}
                variant="quiet"
                key={value}
                onClick={() => onTabChange(value)}
              >
                {label}
              </Button>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-4 text-base text-muted-foreground">
          <span className="hidden whitespace-nowrap sm:inline">© {year} NEO Pulse</span>
        </div>
      </div>
    </footer>
  );
}
