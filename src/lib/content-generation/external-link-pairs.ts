/**
 * External link placeholders: harness writes [[EXTERNAL:url|anchor]], code emits <a href>.
 */

export type ExternalLinkPair = { url: string; anchor: string };

export const EXTERNAL_LINK_PLACEHOLDER_RE =
  /\[\[EXTERNAL:([^|\]]+)\|([^\]]+)\]\]/g;

export const EXTERNAL_LINK_BARE_PLACEHOLDER_RE = /\[\[EXTERNAL\]\]/g;

const EXTERNAL_SEMRUSH_FEATURE_RE =
  /\[EXTERNAL_SEMRUSH\]:\s*href=(https?:\/\/[^\s|]+)\s*\|\s*anchor=([^\]]+)/i;

const LLM_AUDIT_AUTHORITY_FEATURE_RE =
  /\[LLM_AUDIT_AUTHORITY_LINK\]:\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i;

export function normalizeUrlKey(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

export function normalizeAnchorKey(anchor: string): string {
  return anchor.trim().replace(/\s+/g, " ").toLowerCase();
}

export function pairKey(url: string, anchor: string): string {
  return `${normalizeUrlKey(url)}|${normalizeAnchorKey(anchor)}`;
}

export function parseExternalSemrushPairsFromAgents(
  agents: Array<{ features?: string[] }>,
): ExternalLinkPair[] {
  const out: ExternalLinkPair[] = [];
  const seen = new Set<string>();
  for (const agent of agents) {
    for (const feature of agent.features ?? []) {
      const m = feature.match(EXTERNAL_SEMRUSH_FEATURE_RE);
      if (!m) continue;
      const url = m[1]!.trim();
      const anchor = m[2]!.trim();
      if (!url || !anchor) continue;
      const key = pairKey(url, anchor);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ url, anchor });
    }
  }
  return out;
}

export function parseLlmAuditAuthorityPairsFromAgents(
  agents: Array<{ features?: string[] }>,
): ExternalLinkPair[] {
  const out: ExternalLinkPair[] = [];
  const seen = new Set<string>();
  for (const agent of agents) {
    for (const feature of agent.features ?? []) {
      const m = feature.match(LLM_AUDIT_AUTHORITY_FEATURE_RE);
      if (!m) continue;
      const anchor = m[1]!.trim();
      const url = m[2]!.trim();
      if (!url || !anchor) continue;
      const key = pairKey(url, anchor);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ url, anchor });
    }
  }
  return out;
}

export function mergeExternalLinkPairs(...groups: ExternalLinkPair[][]): ExternalLinkPair[] {
  const seen = new Set<string>();
  const out: ExternalLinkPair[] = [];
  for (const group of groups) {
    for (const pair of group) {
      const key = pairKey(pair.url, pair.anchor);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pair);
    }
  }
  return out;
}

/** Row-only allowlist: modifier_links_json + imported_links_json + LLM audit authority links. */
export function buildRowExplicitExternalAllowlist(opts: {
  modifierExternalLinks?: Array<{ url: string; anchorText: string }>;
  importedDraftLinks?: Array<{ url: string; anchorText: string }>;
  llmAuditAuthorityLinks?: Array<{ url: string; anchorText: string }>;
}): ExternalLinkPair[] {
  const seen = new Set<string>();
  const out: ExternalLinkPair[] = [];
  const add = (url: string, anchor: string) => {
    const u = url.trim();
    const a = anchor.trim();
    if (!u || !a) return;
    const key = pairKey(u, a);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url: u, anchor: a });
  };
  for (const link of opts.modifierExternalLinks ?? []) {
    add(link.url, link.anchorText);
  }
  for (const link of opts.importedDraftLinks ?? []) {
    add(link.url, link.anchorText);
  }
  for (const link of opts.llmAuditAuthorityLinks ?? []) {
    add(link.url, link.anchorText);
  }
  return out;
}

export function externalUrlsFromPairs(pairs: ExternalLinkPair[]): string[] {
  return pairs.map((pair) => pair.url.trim()).filter(Boolean);
}

/** @deprecated Bulk upload uses buildRowExplicitExternalAllowlist only. */
export function buildAllowedExternalPairs(
  agents: Array<{ features?: string[] }>,
  modifierLinks: Array<{ url: string; anchorText: string }> = [],
): ExternalLinkPair[] {
  return buildRowExplicitExternalAllowlist({ modifierExternalLinks: modifierLinks });
}
