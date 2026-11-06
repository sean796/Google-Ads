/**
 * One registration point for manager workspaces: tab id, route segment,
 * and the legacy hash that used to select the tab. The Index shell, the
 * mega menu, and the legacy redirect all read this table.
 */
export interface ManagerTabRoute {
  id: string;
  segment: string;
}

const TAB_IDS = [
  "dashboard",
  "integrations",
  "knowledge",
  "generator",
  "chat",
  "tasks",
  "support",
  "users",
  "sitemap-optimizer",
  "gbp-post",
  "content-calendar",
  "social-creator",
  "vertical-benchmarks",
  "ppc-google",
  "ppc-meta",
  "api",
  "pulse-forge",
  "organic-reporting",
  "local-dominator",
  "pulse-host",
  "agent-library",
  "image-generator",
  "video-generator",
] as const;

export const MANAGER_TAB_ROUTES: ManagerTabRoute[] = TAB_IDS.map((id) => ({
  id,
  segment: id,
}));

const TAB_ID_SET = new Set<string>(TAB_IDS);

export function isManagerTabId(value: string): boolean {
  return TAB_ID_SET.has(value);
}

/** Tab id for a pathname (first segment). Unknown paths land on dashboard. */
export function managerTabFromPathname(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  if (first === "" ) return "dashboard";
  return TAB_ID_SET.has(first) ? first : "dashboard";
}

/** Route path for a tab. Generator needs its section; vertical-benchmarks lives inside generator. */
export function managerTabPath(tabId: string, generatorSection?: string): string {
  if (tabId === "vertical-benchmarks") return "/generator/bulk-prompt";
  if (tabId === "generator") return `/generator/${generatorSection || "bulk-prompt"}`;
  if (TAB_ID_SET.has(tabId)) return `/${tabId}`;
  return "/dashboard";
}

/**
 * Map a pre-Wave-4 hash (without or with the leading #) to its route path.
 * Returns null for hashes that are not tab routing (OAuth payloads and the
 * register invite shim are handled by their own code).
 */
export function legacyHashToPath(rawHash: string): string | null {
  const body = rawHash.replace(/^#/, "").trim();
  if (body.startsWith("register")) return null;
  if (body === "" || body === "settings" || body === "dashboard" || body === "neo-emcp") {
    return "/dashboard";
  }
  if (body === "local-grid" || body === "local-dominator") return "/local-dominator";
  if (body === "vertical-benchmarks" || body === "generator/vertical-benchmarks") {
    return "/generator/bulk-prompt";
  }
  const chatMessage = /^m(\d+)$/.exec(body);
  if (chatMessage) return `/chat?message=${chatMessage[1]}`;
  if (body === "generator" || body.startsWith("generator/")) return `/${body}`;
  if (body === "api" || body === "api-docs") return "/api";
  if (body.startsWith("api/")) return `/${body}`;
  if (body.startsWith("api-docs/")) return `/api/${body.slice("api-docs/".length)}`;
  if (body === "pulse-forge" || body.startsWith("pulse-forge/")) return `/${body}`;
  if (body === "pulse-host" || body.startsWith("pulse-host/")) return `/${body}`;
  if (TAB_ID_SET.has(body)) return `/${body}`;
  return null;
}
