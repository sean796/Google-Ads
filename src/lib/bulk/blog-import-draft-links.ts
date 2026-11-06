import type { ImportedBlogSection } from "@/lib/bulk/blog-import-parser";

export type ImportedDraftLink = {
  url: string;
  anchorText: string;
  h2?: string;
};

const ABSOLUTE_URL_RE = /^https?:\/\//i;

export function normalizeImportedDraftUrl(href: string): string | null {
  const raw = href.trim();
  if (!raw || raw.startsWith("#") || /^javascript:/i.test(raw)) return null;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (ABSOLUTE_URL_RE.test(raw)) return raw;
  return null;
}

export function dedupeImportedDraftLinks(links: ImportedDraftLink[]): ImportedDraftLink[] {
  const seen = new Set<string>();
  const out: ImportedDraftLink[] = [];
  for (const link of links) {
    const key = `${link.url}\0${link.anchorText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
  }
  return out;
}

export function extractImportedDraftLinksFromHtml(html: string, h2?: string): ImportedDraftLink[] {
  const links: ImportedDraftLink[] = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const url = normalizeImportedDraftUrl(match[1] ?? "");
    if (!url) continue;
    const anchorText = stripTags(match[2] ?? "").replace(/\s+/g, " ").trim();
    if (!anchorText) continue;
    links.push({ url, anchorText, ...(h2 ? { h2 } : {}) });
  }
  return links;
}

export function extractImportedDraftLinksFromMarkdown(text: string, h2?: string): ImportedDraftLink[] {
  const links: ImportedDraftLink[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const url = normalizeImportedDraftUrl(match[2] ?? "");
    if (!url) continue;
    const anchorText = match[1]?.trim() ?? "";
    if (!anchorText) continue;
    links.push({ url, anchorText, ...(h2 ? { h2 } : {}) });
  }
  return links;
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Preserve `<a href>` as markdown `[text](url)` then strip remaining HTML. */
export function htmlFragmentToBodyWithMarkdownLinks(html: string, maxChars = 800): string {
  let s = html.replace(/\r\n/g, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/p>/gi, "\n");
  s = s.replace(/<\/li>/gi, "\n");
  s = s.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const url = normalizeImportedDraftUrl(href);
    const text = stripTags(inner);
    if (!url || !text) return text || stripTags(inner);
    return `[${text}](${url})`;
  });
  s = stripTags(s)
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars).trim()}…`;
}

export function collectImportedDraftLinksFromSource(args: {
  markdown?: string;
  html?: string;
}): ImportedDraftLink[] {
  return dedupeImportedDraftLinks([
    ...(args.markdown?.trim() ? extractImportedDraftLinksFromMarkdown(args.markdown) : []),
    ...(args.html?.trim() ? extractImportedDraftLinksFromHtml(args.html) : []),
  ]);
}

/** Unique hrefs for the row Links editor (one URL per piece). */
export function importedDraftLinkUrls(links: ImportedDraftLink[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const link of links) {
    const key = link.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link.url);
  }
  return out;
}

export function collectImportedDraftLinksFromSections(
  sections: ImportedBlogSection[],
): ImportedDraftLink[] {
  const links: ImportedDraftLink[] = [];
  for (const section of sections) {
    links.push(...extractImportedDraftLinksFromMarkdown(section.body, section.h2));
  }
  return dedupeImportedDraftLinks(links);
}

export function formatImportedDraftLinksForPrompt(links: ImportedDraftLink[]): string {
  if (links.length === 0) return "";
  const lines = links.map((link, i) => {
    const where = link.h2 ? ` (section: ${link.h2})` : "";
    return `${i + 1}. [${link.anchorText}](${link.url})${where}`;
  });
  return `
=== IMPORTED DRAFT LINKS (MANDATORY — COPY EXACTLY) ===
These links appeared in the user's source draft. Every link MUST appear in the final article using the **exact** URL and **exact** anchor text below. Use markdown \`[anchor](url)\`. Include **all** of them — internal and external. Do not substitute, shorten, or omit any href.

${lines.join("\n")}

Checklist: each matching H2 item MUST include \`[IMPORTED_DRAFT_LINK]\` with the exact markdown for its link(s).
Blueprint: each matching agent MUST include \`[IMPORTED_DRAFT_LINK]\` in features with the exact markdown.
=== END IMPORTED DRAFT LINKS ===
`;
}

export function injectImportedLinksIntoChecklist(
  checklist: string[],
  links: ImportedDraftLink[],
): string[] {
  if (links.length === 0) return checklist;
  const next = [...checklist];
  for (const link of links) {
    const line = `[IMPORTED_DRAFT_LINK]: Include exact markdown [${link.anchorText}](${link.url}) in body copy${link.h2 ? ` under H2 "${link.h2}"` : ""}`;
    if (link.h2) {
      const idx = next.findIndex((item) => item.toLowerCase().includes(link.h2!.toLowerCase()));
      if (idx >= 0) {
        next[idx] = `${next[idx]}\n${line}`;
        continue;
      }
    }
    next.push(line);
  }
  return next;
}

export function injectImportedLinksIntoBlueprintAgents<T extends { title?: string; features?: string[] }>(
  agents: T[],
  links: ImportedDraftLink[],
): T[] {
  if (links.length === 0) return agents;
  return agents.map((agent) => {
    const features = Array.isArray(agent.features) ? [...agent.features] : [];
    const titleNorm = (agent.title ?? "").trim().toLowerCase();
    for (const link of links) {
      const belongs =
        !link.h2 ||
        titleNorm.includes(link.h2.toLowerCase()) ||
        link.h2.toLowerCase().includes(titleNorm);
      if (!belongs && link.h2) continue;
      const feature = `[IMPORTED_DRAFT_LINK]: [${link.anchorText}](${link.url})`;
      if (features.some((f) => f.includes(link.url))) continue;
      features.push(feature);
    }
    return { ...agent, features };
  });
}
