import type { WordPressSite } from '@/components/integrations/types';
import type { AIDrivenACFContext } from "@/lib/content-generation/ai-driven-post-fields-reader";

/** Extra prompt wiring for WordPress content optimizer (RAG page URL, GSC, shared ACF context). */
export type HarnessPromptEnv = {
  knowledgeBaseContext?: string;
  currentPageUrl?: string;
  gscKeywordsContext?: string;
  /** Overrides CSV row entity logic when set (optimizer blueprint entity). */
  harnessEntity?: string;
  acfContextOverride?: AIDrivenACFContext;
  /** Optimizer: passed to buildSystemPrompt for cache-scoped internal link list. */
  siteId?: string;
  primaryKeyword?: string;
  /** Predetermined page/blog link plan from Link targets harness step. */
  linkTargetsPlan?: import("@/lib/bulk/bulk-generation-wp-inventory").LinkTargetsPlan;
  /** Relaxes blog SEO rules (per-H2 exact keyword, etc.) for press releases */
  contentKind?: "press_release";
  /** Merged multi-platform LLM audit — mandatory local facts in harness sections. */
  llmAuditSummary?: string;
  dfsArticleAuditBlock?: string;
  firstPartyAuthorityBlock?: string;
  llmAuditAuthorityExternalPairs?: import("@/lib/content-generation/external-link-placeholders").ExternalLinkPair[];
  /** Full site record for primary city resolution (not { name, siteUrl } alone). */
  wordpressSite?: WordPressSite;
};
