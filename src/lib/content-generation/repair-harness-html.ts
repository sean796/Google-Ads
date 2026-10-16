import { stripHtmlTagsForSentenceCheck } from "@/lib/bulk/harness-section-complete-sentences";
import {
  repairHarnessLinkLeaks,
  type RepairHarnessLinkLeaksOptions,
} from "@/lib/content-generation/harness-link-leak-repair";

function plainParagraphText(innerHtml: string): string {
  return stripHtmlTagsForSentenceCheck(innerHtml).replace(/\s+/g, " ").trim();
}

/** Fix img tags broken by markdown conversion (e.g. `/ style=`). */
export function repairMalformedImgTags(html: string): string {
  let s = html;
  s = s.replace(/<img([^>]*?)\/\s+style=/gi, "<img$1 style=");
  s = s.replace(/<img([^>]*?)\s+\/\s*(style=)/gi, "<img$1 $2");
  s = s.replace(/<img([^>]*?)\s+\/\s*>/gi, "<img$1>");
  return s;
}

/** Remove orphan bracket fragments and banned "Related reading:" link tails. */
export function stripOrphanBracketArtifacts(html: string): string {
  let s = html;
  s = s.replace(
    /\s*Related reading:\s*(?:<a\b[^>]*>[\s\S]*?<\/a>|\[[^\]]+\]\([^)]+\)|[^.<]+)\.?/gi,
    "",
  );
  s = s.replace(/\s+\]\./g, ".");
  s = s.replace(/\s+\[\./g, ".");
  s = s.replace(/\s+\](?=[,.;:!?])/g, "");
  return s;
}

/** Drop consecutive duplicate paragraphs (often introduced by `<br>` repeats). */
export function removeDuplicateParagraphBlocks(html: string): string {
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let lastPlain = "";
  let out = "";
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const full = m[0];
    const inner = m[1];
    const plain = plainParagraphText(inner);
    out += html.slice(lastIndex, m.index);
    if (plain && plain === lastPlain) {
      lastIndex = m.index + full.length;
      continue;
    }
    out += full;
    lastPlain = plain;
    lastIndex = m.index + full.length;
  }
  out += html.slice(lastIndex);
  return out;
}

/** Remove `<br>` immediately before duplicate prose that matches the prior paragraph. */
export function removeBrPrefixedDuplicateParagraphs(html: string): string {
  let s = html;
  s = s.replace(
    /(<p[^>]*>[\s\S]*?<\/p>)\s*<br\s*\/?>\s*([\s\S]*?)(?=<(?:p|h2|table|div|figure)\b|$)/gi,
    (match, prevP, afterBr) => {
      const prevPlain = plainParagraphText(prevP);
      const afterPlain = plainParagraphText(afterBr);
      if (!prevPlain || !afterPlain) return match;
      if (prevPlain === afterPlain || afterPlain.startsWith(prevPlain)) {
        return prevP;
      }
      return match;
    },
  );
  return s;
}

/** Close or remove an unclosed trailing `<p>` tag. */
export function repairUnclosedTrailingParagraph(html: string): string {
  let s = html.trim();
  const lower = s.toLowerCase();
  const lastOpenP = lower.lastIndexOf("<p");
  const lastCloseP = lower.lastIndexOf("</p>");
  if (lastOpenP <= lastCloseP) return s;

  const tail = s.slice(lastOpenP);
  const plain = plainParagraphText(tail);
  if (plain && /[.!?]["']?\s*$/.test(plain)) {
    return `${s}</p>`;
  }
  return s.slice(0, lastOpenP).trimEnd();
}

/** Unwrap nested <a><a>...</a></a> (duplicate wiki / scroll wraps). */
export function unwrapNestedAnchorTags(html: string): string {
  return html.replace(
    /<a\b([^>]*)>\s*<a\b([^>]*)>([\s\S]*?)<\/a>\s*<\/a>/gi,
    "<a$2>$3</a>",
  );
}

export function repairHarnessHtmlForUpload(
  html: string,
  linkLeakOpts?: RepairHarnessLinkLeaksOptions,
): string {
  if (!html?.trim()) return html;
  let s = html;
  s = repairHarnessLinkLeaks(s, linkLeakOpts);
  s = unwrapNestedAnchorTags(s);
  s = repairMalformedImgTags(s);
  s = stripOrphanBracketArtifacts(s);
  s = removeBrPrefixedDuplicateParagraphs(s);
  s = removeDuplicateParagraphBlocks(s);
  s = repairUnclosedTrailingParagraph(s);
  s = repairHarnessLinkLeaks(s, linkLeakOpts);
  return s;
}
