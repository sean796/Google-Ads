export function splitDeckSentences(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    buf += c;
    if (c !== "." && c !== "!" && c !== "?") continue;
    const prev = text[i - 1] ?? "";
    const next = text[i + 1];
    if (c === "." && /\d/.test(prev) && next != null && /\d/.test(next)) continue;
    if (next != null && next !== " " && next !== "\n" && i !== text.length - 1) continue;
    const trimmed = buf.trim();
    if (trimmed) out.push(trimmed);
    buf = "";
    while (text[i + 1] === " ") i++;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out.length > 0 ? out : [text.trim()];
}

export function plainDeckText(raw: string): string {
  return raw
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .replace(/#+\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strips leading bullet markers (e.g. •, -, *, 1.) from takeaway lines so that
 * custom list rendering or standard list markers don't result in duplicate or misaligned bullets.
 */
export function cleanTakeawayBulletText(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  let text = raw.trim();
  let prev = "";
  while (text !== prev) {
    prev = text;
    text = text
      .replace(/^[•\u2022\u2023\u25E6\u2043\u2219]\s*/, "")
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .trim();
  }
  return text;
}

/** Model narrative fields: keep **bold** markers; no grammar or keyword rewriting. */
export function deckNarrativeText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

const CLIENT_REPORT_NARRATIVE_CHUNK_CHARS = 340;

/** Split long model paragraphs into shorter blocks for client report readability. */
export function expandClientReportNarrativeParagraphs(
  paragraphs: readonly string[],
  maxItems: number,
): string[] {
  if (maxItems < 1) return [];
  const out: string[] = [];

  for (const paragraph of paragraphs) {
    if (out.length >= maxItems) break;
    const text = paragraph.trim();
    if (!text) continue;

    if (text.length <= CLIENT_REPORT_NARRATIVE_CHUNK_CHARS) {
      out.push(text);
      continue;
    }

    const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
    if (sentences.length <= 1) {
      out.push(text);
      continue;
    }

    let chunk = "";
    for (const sentence of sentences) {
      const next = chunk ? `${chunk} ${sentence}` : sentence;
      if (next.length > CLIENT_REPORT_NARRATIVE_CHUNK_CHARS && chunk) {
        out.push(chunk.trim());
        chunk = sentence;
        if (out.length >= maxItems) break;
      } else {
        chunk = next;
      }
    }
    if (out.length < maxItems && chunk.trim()) {
      out.push(chunk.trim());
    }
  }

  return out.slice(0, maxItems);
}

/** @deprecated use plainDeckText */
export const plainTextSummary = plainDeckText;

export function parseDeckCountDisplay(value: string): number {
  const t = value.trim().replace(/,/g, "");
  if (t.endsWith("K") || t.endsWith("k")) {
    const n = Number.parseFloat(t.slice(0, -1));
    return Number.isFinite(n) ? n * 1_000 : 0;
  }
  if (t.endsWith("M") || t.endsWith("m")) {
    const n = Number.parseFloat(t.slice(0, -1));
    return Number.isFinite(n) ? n * 1_000_000 : 0;
  }
  const n = Number.parseFloat(t.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
