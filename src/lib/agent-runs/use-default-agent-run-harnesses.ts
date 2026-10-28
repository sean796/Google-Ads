import { useEffect } from "react";
import {
  registerAgentRunHarness,
  unregisterAgentRunHarness,
} from "@/lib/agent-runs/harness-registry";
import type { AgentRunHarnessContext } from "@/lib/agent-runs/harness-registry";
import { runGscReportingDirectHarness } from "@/lib/agent-runs/run-gsc-reporting-client-harness";
import { runAdsReportingDirectHarness } from "@/lib/agent-runs/run-ads-reporting-client-harness";
import { runDfsArticleAuditDirectHarness } from "@/lib/agent-runs/run-dfs-article-audit-client-harness";
import { runChatGptAuditDirectHarness } from "@/lib/agent-runs/run-chatgpt-audit-client-harness";
import { runBrowserAutomationDirectHarness } from "@/lib/agent-runs/run-browser-automation-client-harness";
import { runContentGapCheckDirectHarness } from "@/lib/agent-runs/run-content-gap-check-client-harness";
import { runPostCreatorDirectHarness } from "@/lib/agent-runs/run-post-creator-client-harness";
import { runEntityPageCreatorDirectHarness } from "@/lib/agent-runs/run-entity-page-creator-client-harness";
import { runEntityGeneratorDirectHarness } from "@/lib/agent-runs/run-entity-generator-client-harness";
import { runSapGeneratorDirectHarness } from "@/lib/agent-runs/run-sap-generator-client-harness";
import { runLocalDominatorExportDirectHarness } from "@/lib/agent-runs/run-local-dominator-export-client-harness";
import type { AgentRun, AgentRunResult } from "@/lib/agent-runs-types";

async function stubHarness(run: AgentRun, _ctx: AgentRunHarnessContext): Promise<AgentRunResult> {
  if (run.recipeKey === "overview_pages_meta_batch") {
    throw new Error("Open Overview with the pages sitemap loaded, then dispatch from Pulse Assist Build.");
  }
  throw new Error("Open Content Optimizer or execute from a task with a target bucket.");
}

export function useDefaultAgentRunHarnesses(): void {
  useEffect(() => {
    registerAgentRunHarness("overview_pages_meta_batch", stubHarness);
    registerAgentRunHarness("content_optimizer_bulk", stubHarness);
    registerAgentRunHarness("gsc_reporting", runGscReportingDirectHarness);
    registerAgentRunHarness("ads_reporting", runAdsReportingDirectHarness);
    registerAgentRunHarness("post_creator", runPostCreatorDirectHarness);
    registerAgentRunHarness("entity_page_creator", runEntityPageCreatorDirectHarness);
    registerAgentRunHarness("entity_generator", runEntityGeneratorDirectHarness);
    registerAgentRunHarness("sap_generator", runSapGeneratorDirectHarness);
    registerAgentRunHarness("local_dominator_export", runLocalDominatorExportDirectHarness);
    registerAgentRunHarness("chatgpt_website_audit", runChatGptAuditDirectHarness);
    registerAgentRunHarness("dfs_llm_article_audit", runDfsArticleAuditDirectHarness);
    registerAgentRunHarness("browser_automation", runBrowserAutomationDirectHarness);
    registerAgentRunHarness("content_gap_check", runContentGapCheckDirectHarness);
    return () => {
      unregisterAgentRunHarness("overview_pages_meta_batch");
      unregisterAgentRunHarness("content_optimizer_bulk");
      unregisterAgentRunHarness("gsc_reporting");
      unregisterAgentRunHarness("ads_reporting");
      unregisterAgentRunHarness("post_creator");
      unregisterAgentRunHarness("entity_page_creator");
      unregisterAgentRunHarness("entity_generator");
      unregisterAgentRunHarness("sap_generator");
      unregisterAgentRunHarness("local_dominator_export");
      unregisterAgentRunHarness("chatgpt_website_audit");
      unregisterAgentRunHarness("dfs_llm_article_audit");
      unregisterAgentRunHarness("browser_automation");
      unregisterAgentRunHarness("content_gap_check");
    };
  }, []);
}
