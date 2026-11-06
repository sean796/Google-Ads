/**
 * Agentic links per section: ensure at least one internal link per H2 and H3 section.
 * Used after content generation so no post is uploaded with zero links when linkable posts exist.
 * Also provides word-based guarantee: at least one link every ~200 words.
 * Minimum links = max(10, ceil(words/200), number of H2+H3 headings) unless headingOnly / minTotalLinks: 0.
 *
 * HTML flow: deterministic insert only — adds <a href> tags without OpenRouter rewrites.
 */

export {
  MIN_LINKS_PER_POST,
  WORDS_PER_LINK_TARGET,
  countEligibleHeadingSections,
  countInternalLinksInHtmlContent,
  countInternalLinksInMarkdown,
  insertOneInternalLinkIntoHtml,
  insertOneInternalLinkIntoMarkdown,
  shortAnchorFromPostTitle,
} from "./ensure-links-per-section-helpers";
export type { WordPressPost } from "./ensure-links-per-section-helpers";
export {
  applyLinkTargetsPlanToHtml,
  applyLinkTargetsPlanToHtmlDeterministic,
  ensureAtLeastOneLinkPerSection,
  ensureLinksEvery200Words,
  ensureLinksEvery200WordsForHtml,
  ensureMinimumLinksInHtml,
} from "./ensure-links-per-section-runners";
export type {
  ApplyLinkTargetsPlanDeterministicOptions,
  ApplyLinkTargetsPlanToHtmlOptions,
  EnsureLinksEvery200WordsForHtmlOptions,
  EnsureLinksPerSectionOptions,
  EnsureMinimumLinksInHtmlOptions,
} from "./ensure-links-per-section-runners";
