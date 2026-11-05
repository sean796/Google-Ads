import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { PULSE_AGENT_REGISTRY, type PulseRegisteredAgentEntry } from "@/lib/agent-pipeline/pulse-agent-registry";
import type { AgentOpenRouterCategory } from "@/lib/openrouter-agent-category-api";
import { resolveModelForAgentCategory } from "@/lib/openrouter-agent-category-api";

export type AgentLibrarySection = "library" | "settings";

export type AgentLibraryDomainFilter =
  | "all"
  | "slack-hub"
  | "aiseo"
  | "blog-generator"
  | "entity-sap"
  | "sitemap-optimizer"
  | "competitor-research"
  | "reporting"
  | "ppc-ads"
  | "video"
  | "wikipedia"
  | "emcp";

export type AgentLibraryCategoryFilter = "all" | AgentOpenRouterCategory;

export interface HubAgentDefinitionItem {
  id: string;
  name: string;
  description: string;
  status: "active" | "beta" | "disabled";
  category: AgentOpenRouterCategory;
  domain: "slack-hub";
  slashCommand?: string;
  requiresGoogle?: boolean;
  sourceModule: string;
  enabled: boolean;
}

export interface AgentLibrarySettingsPublic {
  openRouter: {
    configured: boolean;
    suffix: string | null;
  };
  openRouterModel: string;
  openRouterAccountEmail: string;
}

export interface AgentLibraryServerPayload {
  ok: boolean;
  hubAgents: HubAgentDefinitionItem[];
  overrides: Record<string, boolean>;
  settings: AgentLibrarySettingsPublic;
  error?: string;
}

export interface UnifiedAgentLibraryEntry {
  id: string;
  label: string;
  description: string;
  category: AgentOpenRouterCategory;
  domain: Exclude<AgentLibraryDomainFilter, "all">;
  status: "active" | "beta" | "disabled";
  enabled: boolean;
  resolvedModel: string;
  sourceModule: string;
  slashCommand?: string;
  requiresGoogle?: boolean;
  useMasterInstructions?: boolean;
  useWordBlacklist?: boolean;
  origin: "slack-hub" | "pulse-mastra";
}

export const DEFAULT_HUB_AGENTS: HubAgentDefinitionItem[] = [
  {
    id: "meeting-notes",
    name: "Meeting Notes to Checklist",
    description:
      "Pick a Gemini meeting note from Gmail or use latest; OpenRouter builds a Slack task list and checklist.",
    status: "beta",
    category: "report",
    domain: "slack-hub",
    slashCommand: "/meeting-notes",
    requiresGoogle: true,
    sourceModule: "neo-agent-hub/packages/core/src/agents.ts",
    enabled: true,
  },
  {
    id: "meeting-notes-drive",
    name: "Meeting Notes to Drive",
    description:
      "Publish to Drive button after checklist; creates or copies a Google Doc recap (Drive + Docs API).",
    status: "beta",
    category: "report",
    domain: "slack-hub",
    slashCommand: "/meeting-notes",
    requiresGoogle: true,
    sourceModule: "neo-agent-hub/packages/core/src/agents.ts",
    enabled: true,
  },
  {
    id: "write",
    name: "Write & Proofread",
    description:
      "Fix or rewrite drafts: /write, composer drafts, and message shortcuts (correct, polish, shorten, adjust).",
    status: "active",
    category: "blog",
    domain: "slack-hub",
    slashCommand: "/write",
    requiresGoogle: false,
    sourceModule: "neo-agent-hub/packages/core/src/agents.ts",
    enabled: true,
  },
  {
    id: "email-desk",
    name: "Email Desk (Frontend / KWB)",
    description:
      "Watch Gmail for inbound client mail, draft replies, and propose site tasks; approve in Slack to send and run Neo MCP via NEO Pulse.",
    status: "beta",
    category: "research",
    domain: "slack-hub",
    slashCommand: "/email-desk",
    requiresGoogle: true,
    sourceModule: "neo-agent-hub/packages/core/src/agents.ts",
    enabled: true,
  },
];

export function buildUnifiedAgentLibraryEntries(
  hubAgents: HubAgentDefinitionItem[],
  overrides: Record<string, boolean>,
  siteId?: string | null,
): UnifiedAgentLibraryEntry[] {
  const hubRows: UnifiedAgentLibraryEntry[] = hubAgents.map((h) => ({
    id: h.id,
    label: h.name,
    description: h.description,
    category: h.category,
    domain: "slack-hub",
    status: h.status,
    enabled: overrides[h.id] !== undefined ? Boolean(overrides[h.id]) : h.enabled,
    resolvedModel: resolveModelForAgentCategory(h.category, siteId),
    sourceModule: h.sourceModule,
    slashCommand: h.slashCommand,
    requiresGoogle: h.requiresGoogle,
    origin: "slack-hub",
  }));

  const pulseRows: UnifiedAgentLibraryEntry[] = PULSE_AGENT_REGISTRY.map(
    (entry: PulseRegisteredAgentEntry) => ({
      id: entry.id,
      label: entry.label,
      description: entry.reason,
      category: entry.category,
      domain: entry.domain as Exclude<AgentLibraryDomainFilter, "all">,
      status: "active",
      enabled: overrides[entry.id] !== undefined ? Boolean(overrides[entry.id]) : true,
      resolvedModel: resolveModelForAgentCategory(entry.category, siteId),
      sourceModule: entry.sourceModule,
      useMasterInstructions: entry.useMasterInstructions,
      useWordBlacklist: entry.useWordBlacklist,
      origin: "pulse-mastra",
    }),
  );

  return [...hubRows, ...pulseRows];
}

export async function fetchAgentLibraryState(): Promise<AgentLibraryServerPayload> {
  const res = await fetch(backendApiUrl("/agent-library"), {
    method: "GET",
    credentials: "include",
  });
  const data = (await res.json()) as AgentLibraryServerPayload;
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Agent Library ${res.status}`);
  }
  return data;
}

export async function toggleAgentLibraryEntry(
  agentId: string,
  enabled: boolean,
): Promise<AgentLibraryServerPayload> {
  const res = await fetch(backendApiUrl("/agent-library/toggle"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, enabled }),
  });
  const data = (await res.json()) as AgentLibraryServerPayload;
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Toggle failed (${res.status})`);
  }
  return data;
}

export async function saveAgentLibrarySettings(params: {
  openRouterApiKey?: string;
  openRouterModel?: string;
}): Promise<AgentLibraryServerPayload> {
  const res = await fetch(backendApiUrl("/agent-library/settings"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as AgentLibraryServerPayload;
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Save failed (${res.status})`);
  }
  return data;
}
