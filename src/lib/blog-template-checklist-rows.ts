import type { AgentConfig } from "@/types/agent-config";
import { truncateTitleForSEO } from "./content-generation/content-sanitizer";
import { extractChecklistItemTitle } from "@/lib/post-creator/post-creator-checklist-post-process";
import {
  enforceForbiddenWordsOnBlueprint,
  sanitizeForbiddenHeadingTitle,
} from "@/lib/content-word-blocklist";
import { isLlmAuditAuthorityDumpChecklistItem } from "@/lib/content-optimization/harness-heading-titles";
import { ensureConnectedSiteHarnessMarkers } from "@/lib/bulk/connected-site-harness-markers";
import { INTERNAL_LINK_PLACEHOLDER_FEATURE_SUFFIX } from "@/lib/content-generation/internal-link-placeholders";
import type { BlogTemplateContext } from "./blog-template-builder-types";

const LINK_FEATURE_PLACEHOLDER = `[LINK]: ${INTERNAL_LINK_PLACEHOLDER_FEATURE_SUFFIX}`;

export function agentFromChecklistRow(item: string, index: number): AgentConfig {
  const extracted = sanitizeForbiddenHeadingTitle(extractChecklistItemTitle(item)).trim();
  const afterNumber = item.replace(/^\d+\.\s*/, "").trim();
  const beforeMarker = afterNumber.split("[")[0]?.trim() ?? "";
  const title = extracted || beforeMarker || afterNumber.slice(0, 80).trim();
  return {
    id: `agent-${index + 1}`,
    step: index + 1,
    title,
    description: `Section scope: ${title}.`,
    features: ["[STRUCTURE]: 2-3 paragraphs.", LINK_FEATURE_PLACEHOLDER],
    h2Count: 1,
    h3Count: 0,
    h3Enabled: false,
    headingLevel: 1,
    maxTokens: 2000,
  };
}

/** One harness agent per checklist row (same contract the blueprint LLM returns). */
export function buildBlueprintFromChecklistRows(
  checklist: string[],
  context: BlogTemplateContext,
  sapEntity?: string,
): { title: string; purpose: string; agents: AgentConfig[] } {
  const agents = checklist
    .filter((item) => !isLlmAuditAuthorityDumpChecklistItem(item))
    .map((item, index) => agentFromChecklistRow(item, index));
  return enforceForbiddenWordsOnBlueprint(
    {
      title: truncateTitleForSEO(context.flowTitle?.trim() || "Untitled Article", 50),
      purpose: context.flowPurpose?.trim() || "Not specified",
      agents: ensureConnectedSiteHarnessMarkers(agents, sapEntity),
    },
    { sapEntity },
  );
}
