import { useLocation } from "react-router-dom";
import { appNavigate } from "@/lib/app-navigation";

export const SITE_PROFILE_SECTIONS = ["overview", "plugins-themes", "backups", "users", "usage", "activity"] as const;
export type SiteProfileSection = (typeof SITE_PROFILE_SECTIONS)[number];

export const SITE_PROFILE_SECTION_LABEL: Record<SiteProfileSection, string> = {
  overview: "Overview",
  "plugins-themes": "Plugins and themes",
  backups: "Backups",
  users: "Users",
  usage: "Usage",
  activity: "Activity",
};

const SECTION_SET = new Set<string>(SITE_PROFILE_SECTIONS);
const ROOT = "pulse-host";

/** `/pulse-host` is the My Sites list; `/pulse-host/sites/<groupId>[/<envId>[/<section>]]` is a site profile. */
export type PulseHostRoute =
  | { view: "list" }
  | { view: "site"; groupId: string; envId: string | null; section: SiteProfileSection };

export function isPulseHostPath(pathname: string): boolean {
  return pathname === `/${ROOT}` || pathname.startsWith(`/${ROOT}/`);
}

export function parsePulseHostRoute(pathname: string): PulseHostRoute {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== ROOT || parts[1] !== "sites" || !parts[2]) return { view: "list" };
  const section = parts[4] && SECTION_SET.has(parts[4]) ? (parts[4] as SiteProfileSection) : "overview";
  return { view: "site", groupId: decodeURIComponent(parts[2]), envId: parts[3] ? decodeURIComponent(parts[3]) : null, section };
}

export function buildPulseHostPath(route: PulseHostRoute): string {
  if (route.view === "list") return `/${ROOT}`;
  const base = `/${ROOT}/sites/${encodeURIComponent(route.groupId)}`;
  if (!route.envId) return base;
  return `${base}/${encodeURIComponent(route.envId)}/${route.section}`;
}

export function setPulseHostRoute(route: PulseHostRoute): void {
  appNavigate(buildPulseHostPath(route));
}

export function usePulseHostRoute(): PulseHostRoute {
  const { pathname } = useLocation();
  return parsePulseHostRoute(pathname);
}
