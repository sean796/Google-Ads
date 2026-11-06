import { getMasterInstructionsText } from "@/lib/master-instructions-storage-core";

const BLOCK_START =
  "\n\n=== CLIENT MASTER INSTRUCTIONS (MANDATORY - OVERRIDES CONFLICTING DEFAULTS) ===\n";
const BLOCK_END = "\n=== END CLIENT MASTER INSTRUCTIONS ===\n";

export function hasMasterInstructions(siteId?: string | null): boolean {
  return getMasterInstructionsText(siteId).length > 0;
}

/** Prepended to SAP suggest/generate system prompts when per-site Master Rules exist. */
export function buildSapMasterRulesWorkflowPrefix(siteId?: string | null): string {
  if (!hasMasterInstructions(siteId)) return "";
  return `**CLIENT MASTER INSTRUCTIONS (read first):** When the **CLIENT MASTER INSTRUCTIONS** block appears at the end of this system message, it is the **source of truth** for **keyword theme mix**, **percentage splits across service lines** (e.g. 60%/40%), **SAP counts per theme**, and **service focus**. Apply those rules **exactly** across every \`keyword\` / \`seedKeyword\` you output. **Do not** default every row to one theme from post inventory, grid dominance, or optional **focusKeyword** when Master Rules specify a split. **Keyword strings stay geography-free** (no city, state, neighbourhood, landmark, or postal tokens in \`keyword\`); place names belong in \`entityHint\` / \`entity\` only. Use grid weakness weights, optional focusKeyword, and default allocation rules **only when** Master Rules are silent on those topics. `;
}

/** Mid-prompt recap when Master Rules exist (suggest + SAP generate). */
export function buildSapMasterRulesKeywordMixRecap(siteId?: string | null): string {
  if (!hasMasterInstructions(siteId)) return "";
  return `**Keyword theme mix (Master Rules):** Read **CLIENT MASTER INSTRUCTIONS** at the end of this message for **percentage splits** and **service-line themes**. Apply those ratios **across the full batch** of \`keyword\` / \`seedKeyword\` strings (count seeds and members). **Forbidden:** assigning one dominant theme to every row when Master Rules specify a split. **Forbidden:** city, state, neighbourhood, landmark, or postal tokens inside \`keyword\` (geography belongs in \`entityHint\` / \`entity\` only). Optional **focusKeyword** in the JSON payload and published-content samples are **secondary** when Master Rules define theme mix. Use grid weakness weights for SAP counts **only when** Master Rules are silent on allocation.`;
}

/** Suggest-only: distinct clusters must follow Master Rules theme caps, not one repeated seed. */
export function buildSapMasterRulesDistinctClustersBlock(siteId?: string | null): string {
  if (!hasMasterInstructions(siteId)) return "";
  return `**Multiple clusters + Master Rules (non-negotiable):** Each cluster is a **distinct service-line theme**, not the same \`seedKeyword\` repeated with different geography. **Count every \`seedKeyword\` and \`members[].keyword\` in the response.** Apply CLIENT MASTER INSTRUCTIONS percentage caps to that full count (e.g. if rules cap a theme at 60%, at most 60% of those strings may use that theme's phrasing). **Forbidden:** using the grid's dominant tracked keyword as every cluster's \`seedKeyword\`. **Forbidden:** reusing the same \`seedKeyword\` on multiple clusters. **Required:** clusters (and member keywords) for each non-dominant theme Master Rules specify. \`clusterId\` must be **unique per cluster** (short opaque id), not one theme label reused for every cluster.`;
}

export function appendMasterInstructionsToSystemPrompt(
  systemPrompt: string,
  siteId?: string | null,
): string {
  const extra = getMasterInstructionsText(siteId);
  if (!extra) return systemPrompt;
  return `${systemPrompt}${BLOCK_START}${extra}${BLOCK_END}`;
}
