import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SEO_WORKSPACE_BODY_SCROLL_CLASS } from "@/components/seo/seo-workspace-layout";
import { fetchHostedSiteActivity, fetchHostingJob, refreshHostedSiteStats, type HostedEnvironment, type HostedSiteActivity, type HostedSiteGroup } from "@/lib/hosting-api";
import { setPulseHostRoute, type PulseHostRoute, type SiteProfileSection } from "@/lib/hosting/pulse-host-route";
import type { TeamMember } from "@/lib/teams-types";
import { cn } from "@/lib/utils";
import type { EnvironmentAction } from "../my-sites/EnvironmentKebabMenu";
import { MY_SITES_CARD, MY_SITES_LINK, MY_SITES_STATUS_LINE } from "../my-sites/my-sites-theme";
import { SiteActivitySection } from "./SiteActivitySection";
import { SiteBackupsSection } from "./SiteBackupsSection";
import { SiteOverviewSection } from "./SiteOverviewSection";
import { SitePluginsThemesSection } from "./SitePluginsThemesSection";
import { SiteProfileHeader } from "./SiteProfileHeader";
import { SiteProfileNav } from "./SiteProfileNav";
import { SiteUsageSection } from "./SiteUsageSection";
import { SiteUsersSection } from "./SiteUsersSection";
import { pickEnvironment } from "./site-profile-view-model";
import { PROFILE_BODY, PROFILE_TITLE_BAND } from "./site-profile-theme";
import { Button } from "@/ui";

export type SiteRoute = Extract<PulseHostRoute, { view: "site" }>;

export type SiteProfilePageProps = {
  route: SiteRoute;
  groups: HostedSiteGroup[];
  groupsLoading: boolean;
  canAdmin: boolean;
  teamMembers: TeamMember[];
  onEnvironmentAction: (action: EnvironmentAction, env: HostedEnvironment) => Promise<void>;
  onAddEnvironment: (group: HostedSiteGroup) => void;
  onManageTags: (group: HostedSiteGroup) => void;
  onReloadGroups: () => Promise<void>;
};

const REFRESH_POLL_MS = 1500;
const REFRESH_POLL_MAX = 30;

export function SiteProfilePage({ route, groups, groupsLoading, canAdmin, teamMembers, onEnvironmentAction, onAddEnvironment, onManageTags, onReloadGroups }: SiteProfilePageProps) {
  const group = useMemo(() => groups.find((g) => g.id === route.groupId) ?? null, [groups, route.groupId]);
  const env = useMemo(() => (group ? pickEnvironment(group, route.envId) : null), [group, route.envId]);
  const [activity, setActivity] = useState<HostedSiteActivity | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const envId = env?.id ?? null;
  const currentEnvId = useRef(envId);
  currentEnvId.current = envId;

  /* Canonical hash carries the environment id so refresh and sharing land on the same install. */
  useEffect(() => {
    if (!group || !envId || route.envId === envId) return;
    setPulseHostRoute({ view: "site", groupId: group.id, envId, section: route.section });
  }, [group, envId, route.envId, route.section]);

  const loadActivity = useCallback(async () => {
    if (!envId) return;
    setActivityLoading(true);
    const res = await fetchHostedSiteActivity(envId);
    /* Ignore responses for an environment the user already switched away from. */
    if (currentEnvId.current !== envId) return;
    setActivityLoading(false);
    if (res.ok === false) {
      setIsError(true);
      setMessage(res.error);
      return;
    }
    setActivity({ backups: res.backups, deploys: res.deploys, jobs: res.jobs, audit: res.audit });
  }, [envId]);

  useEffect(() => {
    setActivity(null);
    setMessage("");
    setIsError(false);
    void loadActivity();
  }, [loadActivity]);

  function go(section: SiteProfileSection, target: HostedEnvironment | null = env) {
    if (!group || !target) return;
    setPulseHostRoute({ view: "site", groupId: group.id, envId: target.id, section });
  }

  async function runAction(action: EnvironmentAction, target: HostedEnvironment) {
    if (action === "users") {
      go("users", target);
      return;
    }
    await onEnvironmentAction(action, target);
    await loadActivity();
  }

  async function refreshStats() {
    if (!env) return;
    setRefreshing(true);
    setIsError(false);
    setMessage("Refreshing stats…");
    const res = await refreshHostedSiteStats(env.id);
    if (res.ok === false) {
      setRefreshing(false);
      setIsError(true);
      setMessage(res.error);
      return;
    }
    let status = "queued";
    let errorMessage: string | null = null;
    for (let i = 0; i < REFRESH_POLL_MAX && (status === "queued" || status === "running"); i += 1) {
      await new Promise((r) => setTimeout(r, REFRESH_POLL_MS));
      const job = await fetchHostingJob(res.jobId);
      if (job.ok === false) {
        errorMessage = job.error;
        break;
      }
      status = job.job.status;
      errorMessage = job.job.errorMessage ?? null;
    }
    await Promise.all([onReloadGroups(), loadActivity()]);
    setRefreshing(false);
    setIsError(status !== "completed");
    setMessage(status === "completed" ? "Stats refreshed." : errorMessage || `Stats refresh ${status}.`);
  }

  if (!group || !env) {
    return (
      <>
        <div className={PROFILE_TITLE_BAND}>
          <Button variant="quiet" onClick={() => setPulseHostRoute({ view: "list" })}>
            Back to Sites
          </Button>
        </div>
        <div className={cn(MY_SITES_CARD, "flex h-32 items-center justify-center text-muted-foreground")}>
          {groupsLoading && groups.length === 0 ? "Loading…" : "Site not found. It may have been deleted."}
        </div>
      </>
    );
  }

  return (
    <>
      <SiteProfileHeader
        group={group}
        env={env}
        canAdmin={canAdmin}
        onBack={() => setPulseHostRoute({ view: "list" })}
        onSelectEnvironment={(target) => go(route.section, target)}
        onAddEnvironment={onAddEnvironment}
        onManageTags={onManageTags}
        onEnvironmentAction={(action, target) => void runAction(action, target)}
      />
      <p className={cn(MY_SITES_STATUS_LINE, isError ? "text-ui-danger-hover" : "")} title={message || undefined}>
        <span className="break-words">{message}</span>
      </p>
      <div className={cn(SEO_WORKSPACE_BODY_SCROLL_CLASS, PROFILE_BODY, "pb-4")}>
        <SiteProfileNav active={route.section} onChange={(section) => go(section)} />
        <div className="min-w-0">
          {route.section === "overview" ? (
            <SiteOverviewSection env={env} canAdmin={canAdmin} refreshing={refreshing} onRefreshStats={() => void refreshStats()} onOpenUsage={() => go("usage")} />
          ) : null}
          {route.section === "plugins-themes" ? <SitePluginsThemesSection group={group} env={env} /> : null}
          {route.section === "backups" ? (
            <SiteBackupsSection env={env} backups={activity?.backups ?? []} loading={activityLoading} canAdmin={canAdmin} onBackupNow={() => void runAction("backup", env)} />
          ) : null}
          {route.section === "users" ? <SiteUsersSection env={env} teamMembers={teamMembers} canAdmin={canAdmin} /> : null}
          {route.section === "usage" ? <SiteUsageSection env={env} /> : null}
          {route.section === "activity" ? <SiteActivitySection activity={activity} loading={activityLoading} /> : null}
        </div>
      </div>
    </>
  );
}
