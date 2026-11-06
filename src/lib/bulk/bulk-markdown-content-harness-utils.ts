import type { AgentConfig } from '@/types/agent-config';

export function agentHasIllustrativeFeature(agent: AgentConfig): boolean {
  return (
    agent.features?.some(
      (f) => typeof f === "string" && f.toLowerCase().trim().startsWith("[illustrative]"),
    ) ?? false
  );
}


/** Last-line / last-paragraph © or "All rights reserved" blocks (model hallucination). */
export function stripTrailingCopyrightBoilerplate(content: string): string {
  let s = content.trimEnd();
  const htmlPs = [
    /<p[^>]*>\s*(?:©|&(?:copy|#169);)\s*\d{2,4}\s*[^<]{0,160}<\/p>\s*$/i,
    /<p[^>]*>\s*Copyright\s*(?:©|&(?:copy|#169);)?\s*\d{2,4}[^<]{0,220}<\/p>\s*$/i,
    /<p[^>]*>[^<]{0,240}All rights reserved\.?\s*<\/p>\s*$/i,
  ];
  const mdLines = [
    /\n(?:©|Copyright)\s*(?:©)?\s*\d{2,4}[^\n]{0,200}\s*$/i,
    /\n[^\n]{0,240}All rights reserved\.?\s*$/i,
  ];
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const re of htmlPs) {
      const n = s.replace(re, "");
      if (n !== s) {
        s = n.trimEnd();
        changed = true;
      }
    }
    for (const re of mdLines) {
      const n = s.replace(re, "");
      if (n !== s) {
        s = n.trimEnd();
        changed = true;
      }
    }
    if (!changed) break;
  }
  return s;
}


export function isCompletionTruncatedByTokenLimit(finishReason?: string): boolean {
  if (typeof finishReason !== 'string' || !finishReason.trim()) return false;
  const lo = finishReason.trim().toLowerCase().replace(/-/g, '_');
  if (lo === 'length' || lo === 'max_tokens' || lo === 'max_output_tokens') return true;
  if (lo.includes('max_tokens') || lo.includes('length_limit')) return true;
  return false;
}
