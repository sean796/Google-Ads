import { useLocation } from "react-router-dom";
import { appNavigate } from "@/lib/app-navigation";

export type PulseForgeNavMode = "forge" | "recipes" | "workflows";

const VALID_SECTIONS = new Set<PulseForgeNavMode>(["forge", "recipes", "workflows"]);

export type PulseForgeRoute =
  | { section: "forge" }
  | { section: "recipes" }
  | { section: "recipes"; view: "builder"; recipeKeyword: string; workflowId?: number; workflowNodeId?: string }
  | { section: "workflows" }
  | { section: "workflows"; view: "new" }
  | { section: "workflows"; view: "edit"; workflowId: number };

export function isPulseForgePath(pathname: string): boolean {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return p === "/pulse-forge" || p.startsWith("/pulse-forge/");
}

export function pulseForgeNavModeFromRoute(route: PulseForgeRoute): PulseForgeNavMode {
  return route.section;
}

/** Workflow canvas + right rail (Setup/RAG), not recipe builder. */
export function isPulseForgeWorkflowRailOpen(route: PulseForgeRoute): boolean {
  return route.section === "workflows" && "view" in route;
}

export function isPulseForgeWorkflowEditorOpen(route: PulseForgeRoute): boolean {
  if (route.section === "recipes" && "view" in route && route.view === "builder") return true;
  return isPulseForgeWorkflowRailOpen(route);
}

function parsePulseForgeSection(sectionRaw: string): PulseForgeNavMode {
  if (VALID_SECTIONS.has(sectionRaw as PulseForgeNavMode)) return sectionRaw as PulseForgeNavMode;
  return "forge";
}

export function parsePulseForgeRoute(pathname: string): PulseForgeRoute {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "pulse-forge") {
    return { section: "forge" };
  }

  const section = parsePulseForgeSection(parts[1] ?? "forge");

  if (section === "recipes") {
    if (!parts[2]) return { section: "recipes" };
    const recipeKeyword = decodeURIComponent(parts[2]);
    if (parts[3] === "w" && parts[4] && parts[5]) {
      const workflowId = Number(parts[4]);
      const workflowNodeId = decodeURIComponent(parts[5]);
      if (Number.isFinite(workflowId) && workflowId > 0 && workflowNodeId.trim() !== "") {
        return { section: "recipes", view: "builder", recipeKeyword, workflowId, workflowNodeId };
      }
    }
    return { section: "recipes", view: "builder", recipeKeyword };
  }

  if (section === "workflows") {
    if (!parts[2]) return { section: "workflows" };
    if (parts[2] === "new") return { section: "workflows", view: "new" };
    const workflowId = Number(parts[2]);
    if (Number.isFinite(workflowId) && workflowId > 0) {
      return { section: "workflows", view: "edit", workflowId };
    }
    return { section: "workflows" };
  }

  return { section: "forge" };
}

export function buildPulseForgePath(route: PulseForgeRoute): string {
  if (route.section === "forge") return "/pulse-forge/forge";
  if (route.section === "recipes") {
    if ("view" in route && route.view === "builder") {
      if (route.workflowId && route.workflowNodeId) {
        return `/pulse-forge/recipes/${encodeURIComponent(route.recipeKeyword)}/w/${route.workflowId}/${encodeURIComponent(route.workflowNodeId)}`;
      }
      return `/pulse-forge/recipes/${encodeURIComponent(route.recipeKeyword)}`;
    }
    return "/pulse-forge/recipes";
  }
  if (route.section === "workflows") {
    if ("view" in route && route.view === "new") return "/pulse-forge/workflows/new";
    if ("view" in route && route.view === "edit") {
      return `/pulse-forge/workflows/${route.workflowId}`;
    }
    return "/pulse-forge/workflows";
  }
  return "/pulse-forge/forge";
}

export function setPulseForgeRoute(route: PulseForgeRoute): void {
  appNavigate(buildPulseForgePath(route));
}

export function usePulseForgeRoute(): PulseForgeRoute {
  const { pathname } = useLocation();
  return parsePulseForgeRoute(pathname);
}
