import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DEEPSEEK_FLASH_MODEL } from "@/lib/global-agent-models";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { Input, Switch } from "@/ui";

import {
  BULK_HEADER_FIELD,
  BULK_HEADER_RUN_BTN,
} from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import {
  SEO_WORKSPACE_BODY_SCROLL_CLASS,
  SEO_WORKSPACE_HEADER_CLASS,
  SEO_WORKSPACE_SHELL_CLASS,
  SEO_WORKSPACE_TYPO_CLASS,
} from "@/components/seo/seo-workspace-layout";
import {
  buildUnifiedAgentLibraryEntries,
  DEFAULT_HUB_AGENTS,
  fetchAgentLibraryState,
  saveAgentLibrarySettings,
  toggleAgentLibraryEntry,
  type AgentLibraryCategoryFilter,
  type AgentLibraryDomainFilter,
  type AgentLibrarySection,
  type AgentLibrarySettingsPublic,
  type HubAgentDefinitionItem,
} from "@/lib/agent-library/agent-library-api";
import { cn } from "@/lib/utils";
import { AgentLibraryWorkspaceHeader } from "./AgentLibraryWorkspaceHeader";

const DOMAIN_BADGE_LABELS: Record<Exclude<AgentLibraryDomainFilter, "all">, string> = {
  "slack-hub": "Slack & Hub",
  aiseo: "AISEO",
  "blog-generator": "Blog Generator",
  "entity-sap": "Entity SAP",
  "sitemap-optimizer": "Sitemap",
  "competitor-research": "Competitor",
  reporting: "Reporting",
  "ppc-ads": "PPC & Ads",
  video: "Video",
  wikipedia: "Wikipedia",
  emcp: "Neo MCP",
};

export function AgentLibraryTabContent(): React.ReactElement {
  const { activeWordPressSiteId } = useActiveWordPressSite();
  const [activeSection, setActiveSection] = useState<AgentLibrarySection>("library");
  const [searchQuery, setSearchQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState<AgentLibraryDomainFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<AgentLibraryCategoryFilter>("all");

  const [hubAgents, setHubAgents] = useState<HubAgentDefinitionItem[]>(DEFAULT_HUB_AGENTS);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [settings, setSettings] = useState<AgentLibrarySettingsPublic>({
    openRouter: { configured: true, suffix: null },
    openRouterModel: DEEPSEEK_FLASH_MODEL,
    openRouterAccountEmail: "matt@neodigital.ca",
  });
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [openRouterApiKey, setOpenRouterApiKey] = useState("");
  const [openRouterModel, setOpenRouterModel] = useState<string>(DEEPSEEK_FLASH_MODEL);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const payload = await fetchAgentLibraryState();
      setHubAgents(payload.hubAgents);
      setOverrides(payload.overrides);
      setSettings(payload.settings);
      setOpenRouterModel(payload.settings.openRouterModel);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not sync Agent Library state.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const allEntries = useMemo(
    () => buildUnifiedAgentLibraryEntries(hubAgents, overrides, activeWordPressSiteId),
    [activeWordPressSiteId, hubAgents, overrides],
  );

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allEntries.filter((entry) => {
      if (domainFilter !== "all" && entry.domain !== domainFilter) return false;
      if (categoryFilter !== "all" && entry.category !== categoryFilter) return false;
      if (!q) return true;
      const hay = [
        entry.id,
        entry.label,
        entry.description,
        entry.sourceModule,
        entry.resolvedModel,
        entry.slashCommand ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allEntries, categoryFilter, domainFilter, searchQuery]);

  const handleToggleAgent = useCallback(
    async (agentId: string, nextEnabled: boolean) => {
      setTogglingId(agentId);
      setOverrides((prev) => ({ ...prev, [agentId]: nextEnabled }));
      try {
        const payload = await toggleAgentLibraryEntry(agentId, nextEnabled);
        setHubAgents(payload.hubAgents);
        setOverrides(payload.overrides);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to update agent status.");
      } finally {
        setTogglingId(null);
      }
    },
    [],
  );

  const handleSaveSettings = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaveStatus(null);
      setSavingSettings(true);
      try {
        const payload = await saveAgentLibrarySettings({
          openRouterApiKey: openRouterApiKey.trim() || undefined,
          openRouterModel: openRouterModel.trim() || undefined,
        });
        setSettings(payload.settings);
        setOpenRouterApiKey("");
        setSaveStatus("Saved to NEO Pulse Agent Library.");
      } catch (err) {
        setSaveStatus(err instanceof Error ? err.message : "Save failed.");
      } finally {
        setSavingSettings(false);
      }
    },
    [openRouterApiKey, openRouterModel],
  );

  return (
    <div className={cn(SEO_WORKSPACE_SHELL_CLASS, SEO_WORKSPACE_TYPO_CLASS)}>
      <div className={SEO_WORKSPACE_HEADER_CLASS}>
        <AgentLibraryWorkspaceHeader
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          domainFilter={domainFilter}
          onDomainFilterChange={setDomainFilter}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          totalCount={allEntries.length}
          visibleCount={filteredEntries.length}
          busy={loading || savingSettings || togglingId !== null}
          onRefresh={() => void loadLibrary()}
        />
      </div>

      <div className={cn(SEO_WORKSPACE_BODY_SCROLL_CLASS, "flex flex-col gap-3 pb-4")}>
        {errorMessage ? (
          <div className="bg-zinc-900 px-4 py-2.5 text-base text-red-400">
            {errorMessage}
          </div>
        ) : null}

        {activeSection === "settings" ? (
          <section className="flex flex-col gap-4 bg-zinc-950 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-white">
                NEO Pulse Agent Library OpenRouter Configuration
              </h3>
              <span className="font-mono text-base tabular-nums text-muted-foreground">
                {settings.openRouter.configured
                  ? `Active (${settings.openRouterAccountEmail}${settings.openRouter.suffix ? ` ...${settings.openRouter.suffix}` : ""})`
                  : `Unconfigured (${settings.openRouterAccountEmail})`}
              </span>
            </div>

            <form className="flex flex-col gap-3" onSubmit={(e) => void handleSaveSettings(e)}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Input
                  type="password"
                  value={openRouterApiKey}
                  onChange={(e) => setOpenRouterApiKey(e.target.value)}
                  placeholder="OpenRouter API key override (sk-or-...)"
                  aria-label="OpenRouter API key override"
                  autoComplete="off"
                  className={cn(BULK_HEADER_FIELD, "h-10 px-3")}
                />
                <Input
                  value={openRouterModel}
                  onChange={(e) => setOpenRouterModel(e.target.value)}
                  placeholder="Default Hub OpenRouter model (e.g. deepseek/deepseek-v4.1-flash)"
                  aria-label="Default Hub OpenRouter model"
                  className={cn(BULK_HEADER_FIELD, "h-10 px-3")}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className={cn(BULK_HEADER_RUN_BTN, "h-9 px-4 font-medium")}
                >
                  {savingSettings ? "Saving..." : "Save Agent Library Settings"}
                </button>
                {saveStatus ? (
                  <span className="text-base text-muted-foreground">{saveStatus}</span>
                ) : null}
              </div>
            </form>
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {filteredEntries.map((agent) => (
              <article
                key={agent.id}
                className="flex min-h-[7.5rem] flex-col justify-between gap-2.5 bg-zinc-900 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-white">{agent.label}</span>
                    <span className="bg-black px-2 py-0.5 text-base text-primary">
                      {DOMAIN_BADGE_LABELS[agent.domain]}
                    </span>
                    <span className="bg-black px-2 py-0.5 font-mono text-base text-muted-foreground">
                      {agent.category}
                    </span>
                    {agent.slashCommand ? (
                      <span className="bg-black px-2 py-0.5 font-mono text-base text-white">
                        {agent.slashCommand}
                      </span>
                    ) : null}
                    {agent.status === "beta" ? (
                      <span className="bg-black px-2 py-0.5 text-base text-amber-400">beta</span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-base tabular-nums text-muted-foreground">
                      {agent.enabled ? "On" : "Off"}
                    </span>
                    <Switch
                      checked={agent.enabled}
                      disabled={togglingId === agent.id}
                      onCheckedChange={(checked) => void handleToggleAgent(agent.id, checked)}
                      aria-label={`Toggle ${agent.label}`}
                    />
                  </div>
                </div>

                <p className="text-base text-muted-foreground">{agent.description}</p>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-base text-muted-foreground">
                  <span className="truncate">id: {agent.id}</span>
                  <span className="truncate text-white/80">{agent.resolvedModel}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
