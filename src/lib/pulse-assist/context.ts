import type { WordPressSite } from "@/components/integrations/types";
import { wordpressSiteDisplayName } from "@/lib/wordpress-site-display-name";
import { buildLocationSummary } from "@/lib/pulse-assist/app-module-catalog";
import { forgeContextFromPath } from "@/lib/pulse-assist/navigation";
import {
  getMergedBulkInventorySessionSnapshot,
} from "@/lib/wordpress-bulk-inventory-session-cache";
import type {
  InventoryLookupMaps,
} from "@/lib/wordpress-api/inventory-match";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import type {
  AssistRequestPayload,
  AssistSubmode,
  PageContentMode,
  AssistTargetScope,
  PropertiesContextPayload,
  PulseContextPayload,
  SiteInventoryContextPayload,
  SiteInventoryContextRow,
  TeamContextPayload,
  TeamContextMember,
  TeamContextProject,
} from "./types";
import type { TeamMember, TeamSummary } from "@/lib/teams-types";
import type { TaskProject } from "@/lib/tasks-types";
import type { TeamContextPulseTask } from "@/lib/pulse-assist/types";

const MAX_TEAM_CONTEXT_PROJECTS = 30;

const MAX_SESSION_INVENTORY_ROWS = 500;

function rowsFromInventoryMaps(
  maps: InventoryLookupMaps,
  collection: string,
  seen: Set<number>,
  out: SiteInventoryContextRow[],
): void {
  for (const row of maps.byLink.values()) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(slimInventoryContextRow(row, collection));
    if (out.length >= MAX_SESSION_INVENTORY_ROWS) return;
  }
}

function slimInventoryContextRow(
  row: SitePostInventoryRow,
  collection: string,
): SiteInventoryContextRow {
  const acf =
    row.acf && typeof row.acf === "object" ? (row.acf as Record<string, unknown>) : {};
  const excerpt = String(row.fields?.excerpt ?? "").trim();
  const meta = String(row.fields?.meta ?? "").trim();
  const keyword =
    String(row.fields?.keyword ?? "").trim() ||
    String(acf.keyword_focus ?? "").trim() ||
    undefined;
  const acfLoaded = Boolean(row.acf && typeof row.acf === "object" && Object.keys(row.acf).length > 0);
  const seoResearch = acfLoaded ? String(acf.seo_research ?? "").trim() : "";
  const faq = acfLoaded ? String(acf.faq ?? "").trim() : "";
  return {
    title: String(row.fields?.title ?? "").trim(),
    url: row.url,
    collection,
    date_gmt: row.date_gmt?.trim() || undefined,
    status: typeof (row as { status?: string }).status === "string"
      ? (row as { status?: string }).status!.trim() || undefined
      : undefined,
    keyword,
    excerpt: excerpt || undefined,
    meta: meta || undefined,
    acf_loaded: acfLoaded || undefined,
    has_seo_research: acfLoaded ? Boolean(seoResearch) : undefined,
    has_faq: acfLoaded ? Boolean(faq) : undefined,
    has_featured_image: row.featuredMediaId ? true : undefined,
  };
}

export function buildSiteInventoryContext(
  siteId: string | null | undefined,
): SiteInventoryContextPayload | undefined {
  if (!siteId) return undefined;
  const snapshot = getMergedBulkInventorySessionSnapshot(siteId);
  if (!snapshot) return undefined;

  const seen = new Set<number>();
  const rows: SiteInventoryContextRow[] = [];
  rowsFromInventoryMaps(snapshot.postsMaps, "posts", seen, rows);
  if (rows.length < MAX_SESSION_INVENTORY_ROWS) {
    rowsFromInventoryMaps(snapshot.pagesMaps, "pages", seen, rows);
  }
  const custom = snapshot.customMapsByCollection ?? {};
  for (const [collection, maps] of Object.entries(custom)) {
    if (rows.length >= MAX_SESSION_INVENTORY_ROWS) break;
    rowsFromInventoryMaps(maps, collection, seen, rows);
  }

  if (rows.length === 0) return undefined;
  return { siteId, auditReady: true, rows };
}

export type PulseAssistContextInput = {
  site: WordPressSite | null;
  siteDisplayName: string;
  allSites: WordPressSite[];
  activeSiteId: string | null;
  managerTab: string;
  generatorSection?: string;
  dashboardCluster?: string;
  researchSection?: string;
  sitemapMode?: string;
  contentOptimizerSection?: string;
  sitemapSource?: string;
  expandedPageUrl?: string | null;
  expandedPageTitle?: string | null;
  postId?: number;
  submode: AssistSubmode;
  pageContentMode: PageContentMode;
  targetScope: AssistTargetScope;
  message: string;
  history: AssistRequestPayload["history"];
  team?: TeamSummary | null;
  teamMembers?: TeamMember[];
  taskProjects?: TaskProject[];
  activeTaskProjectId?: number | null;
  activeTaskProjectTitle?: string | null;
  pulseAssignedTasks?: TeamContextPulseTask[];
};

export function buildPropertiesContext(
  sites: WordPressSite[],
  activeSiteId: string | null,
): PropertiesContextPayload {
  return {
    count: sites.length,
    activePropertyId: activeSiteId ?? "",
    properties: sites.map((s) => ({
      id: s.id,
      name: wordpressSiteDisplayName(s),
      siteUrl: s.siteUrl,
      enabled: s.enabled !== false,
      ga4PropertyId: s.ga4PropertyId?.trim() || undefined,
      googleAdsCustomerId: s.googleAdsCustomerId?.replace(/\D/g, "") || undefined,
    })),
  };
}

export function buildPulseContext(
  input: Omit<PulseAssistContextInput, "message" | "history" | "submode" | "targetScope" | "pageContentMode">,
): PulseContextPayload {
  const forge = input.managerTab === "pulse-forge" ? forgeContextFromPath() : {};
  const locationSummary = buildLocationSummary({
    managerTab: input.managerTab,
    dashboardCluster: input.dashboardCluster,
    generatorSection: input.generatorSection,
    sitemapSource: input.sitemapSource,
    researchSection: input.researchSection,
    sitemapMode: input.sitemapMode,
    contentOptimizerSection: input.contentOptimizerSection,
    forgeSection: forge.forgeSection,
  });

  return {
    managerTab: input.managerTab,
    generatorSection: input.generatorSection,
    dashboardCluster: input.dashboardCluster,
    locationSummary,
    sitemapSource: input.sitemapSource,
    researchSection: input.researchSection,
    sitemapMode: input.sitemapMode,
    contentOptimizerSection: input.contentOptimizerSection,
    forgeSection: forge.forgeSection,
    forgeWorkflowId: forge.forgeWorkflowId,
    forgeRecipeKeyword: forge.forgeRecipeKeyword,
    pulseAppUrl: typeof window !== "undefined" ? window.location.href : "",
    siteId: input.site?.id ?? "",
    siteName: input.siteDisplayName || "",
    expandedPageUrl: input.expandedPageUrl || undefined,
    expandedPageTitle: input.expandedPageTitle || undefined,
  };
}

function matchProjectForSite(
  projects: TeamContextProject[],
  siteDisplayName: string,
): TeamContextProject | undefined {
  const needle = siteDisplayName.trim().toLowerCase();
  if (!needle) return undefined;
  return projects.find((p) => {
    const title = p.title.trim().toLowerCase();
    const keyword = (p.keyword ?? "").trim().toLowerCase();
    return (
      title.includes(needle) ||
      needle.includes(title) ||
      (keyword !== "" && (keyword.includes(needle) || needle.includes(keyword)))
    );
  });
}

export function buildTeamContext(input: {
  team?: TeamSummary | null;
  teamMembers?: TeamMember[];
  taskProjects?: TaskProject[];
  activeTaskProjectId?: number | null;
  activeTaskProjectTitle?: string | null;
  siteDisplayName?: string;
  wordpressSites?: WordPressSite[];
  pulseAssignedTasks?: TeamContextPulseTask[];
}): TeamContextPayload | undefined {
  const team = input.team;
  if (!team?.id) return undefined;

  const botMember = (input.teamMembers ?? []).find((m) => m.isBot && m.userId > 0);
  const humanMembers: TeamContextMember[] = (input.teamMembers ?? [])
    .filter((m) => !m.isBot && m.userId > 0)
    .map((m) => ({
      userId: m.userId,
      displayName: m.displayName?.trim() || m.email?.trim() || `User ${m.userId}`,
      role: m.accessRole,
      jobTitle: m.jobTitle?.trim() || undefined,
    }));

  const members: TeamContextMember[] = [...humanMembers];
  if (botMember) {
    members.push({
      userId: botMember.userId,
      displayName: botMember.displayName?.trim() || "NEO Pulse",
      role: botMember.accessRole,
      jobTitle: botMember.jobTitle?.trim() || undefined,
      isBot: true,
    });
  }

  const projects: TeamContextProject[] = (input.taskProjects ?? [])
    .slice(0, MAX_TEAM_CONTEXT_PROJECTS)
    .map((p) => ({
      id: p.id,
      title: p.title?.trim() || `Project ${p.id}`,
      keyword: p.keyword?.trim() || undefined,
    }));

  let activeProjectId = input.activeTaskProjectId ?? undefined;
  let activeProjectTitle =
    input.activeTaskProjectTitle?.trim() ||
    projects.find((p) => p.id === activeProjectId)?.title ||
    undefined;

  if (!activeProjectId && input.siteDisplayName?.trim()) {
    const inferred = matchProjectForSite(projects, input.siteDisplayName);
    if (inferred) {
      activeProjectId = inferred.id;
      activeProjectTitle = inferred.title;
    }
  }

  return {
    teamId: team.id,
    teamName: team.name?.trim() || `Team ${team.id}`,
    activeProjectId,
    activeProjectTitle,
    members,
    projects,
    pulseBotUserId: botMember?.userId,
    pulseAssignedTasks: input.pulseAssignedTasks,
    wordpressSites: (input.wordpressSites ?? [])
      .filter((s) => s.enabled !== false)
      .map((s) => ({
        id: s.id,
        name: wordpressSiteDisplayName(s),
      })),
  };
}

export function buildAssistPayload(input: PulseAssistContextInput): AssistRequestPayload {
  const pageUrl = input.targetScope === "site" ? "" : (input.expandedPageUrl || "");
  const postId = input.targetScope === "site" ? 0 : (input.postId || 0);
  const pageTitle = input.targetScope === "site" ? "" : (input.expandedPageTitle || "");

  return {
    message: input.message,
    history: input.history,
    admin_mode: "backend",
    admin_submode: input.submode,
    page_content_mode: input.pageContentMode,
    target_scope: input.targetScope,
    post_id: postId,
    page_url: pageUrl,
    page_title: pageTitle,
    pulse_context: buildPulseContext(input),
    properties_context: buildPropertiesContext(input.allSites, input.activeSiteId),
    site_inventory_context: buildSiteInventoryContext(input.site?.id ?? input.activeSiteId),
    team_context: buildTeamContext({
      team: input.team,
      teamMembers: input.teamMembers,
      taskProjects: input.taskProjects,
      activeTaskProjectId: input.activeTaskProjectId,
      activeTaskProjectTitle: input.activeTaskProjectTitle,
      siteDisplayName: input.siteDisplayName,
      wordpressSites: input.allSites,
      pulseAssignedTasks: input.pulseAssignedTasks,
    }),
  };
}
