import { useMemo } from "react";
import { getStoredSites } from "@/components/integrations/storage";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { useManagerErrorLog } from "@/contexts/manager-error-log-context";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { resolveOrganicDashboardSite } from "@/lib/organic-dashboard/resolve-organic-dashboard-site";
import { LocalGridWorkspaceShell } from "./LocalGridWorkspaceShell";
import "./local-grid-studio.css";

export function OrganicReportingLocalGridSection() {
  const { sites: sitesFromHook } = useWordPressSites();
  const { activeWordPressSiteId } = useActiveWordPressSite();
  const { reportError } = useManagerErrorLog();

  const sites = useMemo(
    () => (sitesFromHook.length > 0 ? sitesFromHook : getStoredSites()),
    [sitesFromHook],
  );

  const defaultSite = useMemo(
    () => resolveOrganicDashboardSite(sites, undefined, activeWordPressSiteId) ?? sites[0] ?? null,
    [sites, activeWordPressSiteId],
  );

  if (!defaultSite || sites.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background p-8 text-base text-muted-foreground">
        Select a connected property in the top console to open Local Grid.
      </div>
    );
  }

  return (
    <LocalGridWorkspaceShell
      sites={sites}
      defaultSiteId={defaultSite.id}
      reportError={reportError}
    />
  );
}
