/* @refresh reset */
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

const SCOPE_STORAGE_KEY = "neo-pulse-agent-run-optimizer-scope";

function isStoredGeneratorSection(value: unknown): value is BlogGeneratorSectionId {
  return value === "opt" || value === "bulk-csv" || value === "bulk-prompt";
}

export type AgentRunOptimizerScope = {
  runId: number;
  batchKey: string;
  siteId: string;
  title: string;
  generatorSection: BlogGeneratorSectionId;
};

type AgentRunOptimizerNavigation = {
  onManagerTabChange: (tab: string) => void;
  onGeneratorSectionChange: (section: string, options?: { keepAgentScope?: boolean }) => void;
};

export let navigationHandlers: AgentRunOptimizerNavigation | null = null;

export function registerAgentRunOptimizerNavigation(
  handlers: AgentRunOptimizerNavigation | null,
): void {
  navigationHandlers = handlers;
}

/** Navigate to Generator with a section when Index has registered handlers (e.g. Properties reporting shortcut). */
export function requestManagerGeneratorNavigation(section: string): void {
  if (!navigationHandlers) return;
  navigationHandlers.onManagerTabChange("generator");
  navigationHandlers.onGeneratorSectionChange(section);
}

export function readStoredScope(): AgentRunOptimizerScope | null {
  try {
    const raw = sessionStorage.getItem(SCOPE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Omit<AgentRunOptimizerScope, "generatorSection"> & {
      generatorSection?: string;
    };
    if (
      typeof parsed.runId === "number" &&
      parsed.runId > 0 &&
      typeof parsed.batchKey === "string" &&
      parsed.batchKey.trim() &&
      typeof parsed.siteId === "string" &&
      parsed.siteId.trim()
    ) {
      return {
        runId: parsed.runId,
        batchKey: parsed.batchKey.trim(),
        siteId: parsed.siteId.trim(),
        title: typeof parsed.title === "string" ? parsed.title : "",
        generatorSection:
          parsed.generatorSection === "report"
            ? "opt"
            : isStoredGeneratorSection(parsed.generatorSection)
              ? parsed.generatorSection
              : "opt",
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writeStoredScope(scope: AgentRunOptimizerScope | null): void {
  try {
    if (!scope) {
      sessionStorage.removeItem(SCOPE_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(SCOPE_STORAGE_KEY, JSON.stringify(scope));
  } catch {
    /* ignore */
  }
}

export function scopeFromRun(run: AgentRun): AgentRunOptimizerScope | null {
  const siteId = agentRunSiteId(run);
  if (!siteId) return null;
  const batchKey = resolveAgentRunBatchKey(run, siteId);
  if (!batchKey) return null;
  const recipeKey = resolveAgentRunRecipeKey(run);
  return {
    runId: run.id,
    batchKey,
    siteId,
    title: run.title?.trim() || `Run #${run.id}`,
    generatorSection: agentRunGeneratorSection(recipeKey),
  };
}

type AgentRunOptimizerScopeContextValue = {
  scope: AgentRunOptimizerScope | null;
  openAgentRunOptimizer: (run: AgentRun) => void;
  hydrateScopeFromRun: (run: AgentRun) => void;
  clearAgentRunOptimizerScope: () => void;
  agentRunOptimizerPath: (runId: number) => string;
};

export const AgentRunOptimizerScopeContext = createContext<AgentRunOptimizerScopeContextValue | null>(
  null,
);



export function useAgentRunOptimizerScope(): AgentRunOptimizerScopeContextValue {
  const ctx = useContext(AgentRunOptimizerScopeContext);
  if (!ctx) {
    throw new Error("useAgentRunOptimizerScope must be used within AgentRunOptimizerScopeProvider");
  }
  return ctx;
}
