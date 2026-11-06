import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AgentRun } from "@/lib/agent-runs-types";
import {
  agentRunSiteId,
  resolveAgentRunBatchKey,
} from "@/lib/agent-runs/agent-run-batch-key";
import {
  buildAgentRunViewPath,
  writeAgentRunViewPath,
} from "@/lib/agent-runs/agent-run-optimizer-url";
import { managerTabFromPathname } from "@/lib/manager-tab-routes";
import {
  agentRunGeneratorSection,
  resolveAgentRunRecipeKey,
} from "@/lib/agent-runs/agent-run-navigation";
import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";
import { writeStoredContentOptimizerSection } from "@/components/content-optimizer/content-optimizer-sections";
import { writeStoredBlogGeneratorSection, readStoredBlogGeneratorSection } from "@/components/blog-generator/blog-generator-sections";

import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";

import {
  AgentRunOptimizerScopeContext,
  navigationHandlers,
  readStoredScope,
  scopeFromRun,
  writeStoredScope,
  type AgentRunOptimizerScope,
} from "./agent-run-optimizer-scope-context";

export function AgentRunOptimizerScopeProvider({ children }: { children: ReactNode }) {
  const { setActiveWordPressSiteId } = useActiveWordPressSite();
  const [scope, setScope] = useState<AgentRunOptimizerScope | null>(() => readStoredScope());

  const applyScope = useCallback(
    (next: AgentRunOptimizerScope | null) => {
      setScope(next);
      writeStoredScope(next);
      if (next) {
        setActiveWordPressSiteId(next.siteId);
        if (next.generatorSection === "opt") {
          writeStoredContentOptimizerSection("content");
        }
        writeStoredBlogGeneratorSection(next.generatorSection);
      }
    },
    [setActiveWordPressSiteId],
  );

  const clearAgentRunOptimizerScope = useCallback(() => {
    applyScope(null);
  }, [applyScope]);

  const hydrateScopeFromRun = useCallback(
    (run: AgentRun) => {
      const next = scopeFromRun(run);
      if (!next) return;
      applyScope(next);
    },
    [applyScope],
  );

  const openAgentRunView = useCallback(
    (run: AgentRun) => {
      const next = scopeFromRun(run);
      if (!next) return;
      const section = next.generatorSection;
      const alreadyScoped = scope?.runId === run.id;
      let onGenerator = false;
      let onSection = false;
      try {
        onGenerator = typeof window !== "undefined" && managerTabFromPathname(window.location.pathname) === "generator";
        onSection = readStoredBlogGeneratorSection() === section;
      } catch {
        /* ignore */
      }
      applyScope(next);
      if (alreadyScoped && onGenerator && onSection) {
        writeAgentRunViewPath(run.id, section);
        return;
      }
      navigationHandlers?.onManagerTabChange("generator");
      navigationHandlers?.onGeneratorSectionChange(section, { keepAgentScope: true });
      writeAgentRunViewPath(run.id, section);
    },
    [applyScope, scope?.runId],
  );

  const agentRunOptimizerPath = useCallback(
    (runId: number) => {
      const section = scope?.runId === runId ? scope.generatorSection : "opt";
      return buildAgentRunViewPath(runId, section);
    },
    [scope],
  );

  const value = useMemo(
    () => ({
      scope,
      openAgentRunOptimizer: openAgentRunView,
      hydrateScopeFromRun,
      clearAgentRunOptimizerScope,
      agentRunOptimizerPath,
    }),
    [scope, openAgentRunView, hydrateScopeFromRun, clearAgentRunOptimizerScope, agentRunOptimizerPath],
  );

  return (
    <AgentRunOptimizerScopeContext.Provider value={value}>
      {children}
    </AgentRunOptimizerScopeContext.Provider>
  );
}
