import { appNavigate } from "@/lib/app-navigation";
import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";

const AGENT_RUN_VIEW_PATH_RE = /^\/generator\/([a-z-]+)\/agent-run\/(\d+)$/;

export function buildAgentRunViewPath(runId: number, section: BlogGeneratorSectionId | string): string {
  return `/generator/${section}/agent-run/${runId}`;
}

export function buildAgentRunOptimizerPath(runId: number): string {
  return buildAgentRunViewPath(runId, "opt");
}

export function parseAgentRunIdFromPath(pathname: string): number | null {
  const match = pathname.match(AGENT_RUN_VIEW_PATH_RE);
  if (!match) return null;
  const id = Number(match[2]);
  return id > 0 ? id : null;
}

export function isAgentRunOptimizerPath(pathname: string): boolean {
  return AGENT_RUN_VIEW_PATH_RE.test(pathname);
}

export function writeAgentRunViewPath(runId: number | null, section: BlogGeneratorSectionId | string = "opt"): void {
  appNavigate(runId && runId > 0 ? buildAgentRunViewPath(runId, section) : `/generator/${section}`);
}

export function writeAgentRunOptimizerPath(runId: number | null): void {
  writeAgentRunViewPath(runId, "opt");
}

export function writeGeneratorSectionPath(section: string): void {
  appNavigate(`/generator/${section}`);
}

export function parseGeneratorSectionFromPath(pathname: string): string | null {
  const agentRunMatch = pathname.match(AGENT_RUN_VIEW_PATH_RE);
  if (agentRunMatch) return agentRunMatch[1];
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "generator" || !parts[1]) return null;
  return parts[1];
}

export function isGeneratorPath(pathname: string): boolean {
  return pathname === "/generator" || pathname.startsWith("/generator/");
}
