import { prosePlainText } from "@/lib/elementor-page-content/extract-text-editor-prose";
import {
  computeRevisionChanged,
  revisionPlainFromHtml,
} from "@/lib/overview/studio-doc-revisions-store";

/** Optimize / Auto SEO body copy: full rewrite, never minimal polish. */
export const AISEO_FULL_REWRITE_SYSTEM_RULE =
  "When optimizing or rewriting this content: perform a FULL rewrite of all prose. Forbidden: minimal polish, light touch-ups, or copying sentences verbatim. Rephrase every paragraph while keeping the same facts, coverage, HTML structure rules, and locked links.";

export const AISEO_FULL_REWRITE_BODY_OUTPUT_CONTRACT =
  "OUTPUT CONTRACT (mandatory): bodyHtml plain text must differ from the input. Verbatim or near-verbatim copy is invalid.";

export const AISEO_FULL_REWRITE_HEADING_OUTPUT_CONTRACT =
  "OUTPUT CONTRACT (mandatory): title plain text must differ from the current heading.";

export function assertAiseoBodyRewriteChanged(beforeHtml: string, afterHtml: string): void {
  const beforePlain = revisionPlainFromHtml(beforeHtml);
  const afterPlain = revisionPlainFromHtml(afterHtml);
  if (!computeRevisionChanged(beforePlain, afterPlain)) {
    throw new Error(
      "Optimize returned identical plain text. Full rewrite required; minimal polish is not allowed.",
    );
  }
}

export function assertAiseoHeadingRewriteChanged(beforeTitle: string, afterTitle: string): void {
  const before = beforeTitle.replace(/\s+/g, " ").trim().toLowerCase();
  const after = afterTitle.replace(/\s+/g, " ").trim().toLowerCase();
  if (!before || !after || before === after) {
    throw new Error(
      "Heading optimize returned the same title. Provide a distinct heading aligned to search intent.",
    );
  }
}

export function assertAiseoBodyPlainChanged(beforePlain: string, afterPlain: string): void {
  if (!prosePlainText(afterPlain).trim()) {
    throw new Error("Optimize returned empty body text.");
  }
  if (!computeRevisionChanged(revisionPlainFromHtml(beforePlain), revisionPlainFromHtml(afterPlain))) {
    throw new Error(
      "Optimize returned identical plain text. Full rewrite required; minimal polish is not allowed.",
    );
  }
}
