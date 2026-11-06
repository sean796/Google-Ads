/** One FAQ pair (question + answer) parsed from JSON-LD or Q:/A: text. */
export type FaqEntry = { question: string; answer: string };

/**
 * Unlabeled run-on FAQ: only Capitalized question leads (What/How/…).
 * Lowercase "how physicians…" mid-answer must never start a new question.
 */
const FAQ_QUESTION_LEAD_RE =
  /\b(What|How|Why|When|Where|Who|Which|Can|Is|Are|Do|Does|Did|Will|Would|Should|Could|If)\s/g;

function findNextFaqQuestionStart(text: string, from: number): number {
  FAQ_QUESTION_LEAD_RE.lastIndex = Math.max(0, from);
  const match = FAQ_QUESTION_LEAD_RE.exec(text);
  return match?.index ?? -1;
}

function parseRunOnFaqByQuestionMark(rawFaq: string): FaqEntry[] {
  const text = rawFaq.replace(/\s+/g, " ").trim();
  if (!text.includes("?")) return [];

  const entries: FaqEntry[] = [];
  let pos = findNextFaqQuestionStart(text, 0);
  if (pos === -1) return [];

  while (pos !== -1 && pos < text.length) {
    const qEnd = text.indexOf("?", pos);
    if (qEnd === -1) break;
    const question = text.slice(pos, qEnd + 1).trim();
    const answerStart = qEnd + 1;
    const nextQ = findNextFaqQuestionStart(text, answerStart);
    const answer = (nextQ === -1 ? text.slice(answerStart) : text.slice(answerStart, nextQ)).trim();
    if (question) entries.push({ question, answer });
    pos = nextQ;
  }

  return entries;
}

function hasQaLabels(raw: string): boolean {
  const t = raw ?? "";
  return /\bQ\s*[:-]/i.test(t) && /\bA\s*[:-]/i.test(t);
}

function stripLeadingQaLabel(text: string): string {
  const t = (text ?? "").trim();
  if (t.length < 2) return t;
  const c0 = t.charAt(0).toUpperCase();
  const c1 = t.charAt(1);
  if ((c0 === "Q" || c0 === "A") && (c1 === ":" || c1 === "-")) {
    return t.slice(2).trim();
  }
  return t;
}

/**
 * Parse explicit Q:/A: labeled FAQ (multiline or inline).
 * Prefer this over word-lead run-on whenever labels are present.
 */
export function parseQaLabeledBlocks(raw: string): FaqEntry[] {
  let work = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!work) return [];

  const firstA = work.search(/\bA\s*[:-]\s*/i);
  const firstQ = work.search(/\bQ\s*[:-]\s*/i);
  if (firstA > 0 && (firstQ === -1 || firstA < firstQ)) {
    work = `Q: ${work}`;
  }

  const re = /\b([QA])\s*[:-]\s*/gi;
  const indices: { role: "Q" | "A"; contentStart: number; start: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(work)) !== null) {
    indices.push({
      role: match[1]!.toUpperCase() as "Q" | "A",
      start: match.index,
      contentStart: match.index + match[0].length,
    });
  }
  if (!indices.length) return [];

  const parts: { role: "Q" | "A"; text: string }[] = [];
  for (let i = 0; i < indices.length; i += 1) {
    const cur = indices[i]!;
    const end = i + 1 < indices.length ? indices[i + 1]!.start : work.length;
    parts.push({ role: cur.role, text: work.slice(cur.contentStart, end).trim() });
  }

  const entries: FaqEntry[] = [];
  let current: FaqEntry | null = null;
  for (const p of parts) {
    if (p.role === "Q") {
      if (current?.question.trim()) entries.push(current);
      current = { question: p.text, answer: "" };
    } else if (!current) {
      current = { question: "", answer: p.text };
    } else {
      current.answer = current.answer ? `${current.answer} ${p.text}`.trim() : p.text;
    }
  }
  if (current?.question.trim()) entries.push(current);

  return entries
    .map((e) => ({
      question: stripLeadingQaLabel(e.question),
      answer: stripLeadingQaLabel(e.answer),
    }))
    .filter((e) => e.question.trim());
}

function parseQaLabeledLines(raw: string): FaqEntry[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const entries: FaqEntry[] = [];
  let current: FaqEntry | null = null;

  for (const line of lines) {
    if (/^Q[:-]/i.test(line)) {
      if (current?.question.trim()) entries.push(current);
      current = { question: line.replace(/^Q[:-]\s*/i, "").trim(), answer: "" };
    } else if (/^A[:-]/i.test(line)) {
      if (!current) {
        current = { question: "", answer: line.replace(/^A[:-]\s*/i, "").trim() };
      } else {
        current.answer = line.replace(/^A[:-]\s*/i, "").trim();
      }
    } else if (current && current.question && !current.answer) {
      current.question = `${current.question} ${line}`.trim();
    } else if (current && current.answer) {
      current.answer = `${current.answer} ${line}`.trim();
    } else {
      current = { question: line, answer: "" };
    }
  }
  if (current?.question.trim()) entries.push(current);

  return entries
    .map((e) => ({
      question: stripLeadingQaLabel(e.question),
      answer: stripLeadingQaLabel(e.answer),
    }))
    .filter((e) => e.question.trim());
}

/** True when FAQPage entities look like answer text bled into the next question name. */
export function faqEntriesHaveBleed(entries: FaqEntry[]): boolean {
  if (!entries.length) return false;
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i]!;
    const q = e.question.trim();
    const a = e.answer.trim();
    if (/\bQ\s*[:-]/i.test(q) && q.search(/\bQ\s*[:-]/i) > 0) return true;
    if (/\bQ\s*[:-]/i.test(a)) return true;
    const next = entries[i + 1];
    if (next) {
      const nq = next.question.trim();
      if (nq.length > 0 && /^[a-z]/.test(nq)) return true;
    }
  }
  return false;
}

/**
 * Repair bled FAQPage entities by flattening name+text in order and re-parsing on Q:/A: labels.
 */
export function repairFaqEntriesFromSchema(entries: FaqEntry[]): FaqEntry[] {
  if (!entries.length) return [];
  if (!faqEntriesHaveBleed(entries)) {
    return entries.map((e) => ({
      question: stripLeadingQaLabel(e.question),
      answer: stripLeadingQaLabel(e.answer),
    }));
  }

  const flat = entries.map((e) => `${e.question} ${e.answer}`).join(" ").replace(/\s+/g, " ").trim();
  const repaired = parseQaLabeledBlocks(flat);
  if (repaired.length >= 1) return repaired;

  const withQ = flat.search(/\bQ\s*[:-]/i) === 0 ? flat : `Q: ${flat}`;
  const again = parseQaLabeledBlocks(withQ);
  return again.length ? again : entries;
}

function extractFaqPageEntries(parsed: unknown): FaqEntry[] {
  const entries: FaqEntry[] = [];
  const maybeArray = Array.isArray(parsed) ? parsed : [parsed];
  for (const node of maybeArray) {
    if (!node || typeof node !== "object") continue;
    const rawType = (node as Record<string, unknown>)["@type"];
    const typeArr = Array.isArray(rawType) ? rawType : [rawType];
    if (!typeArr.includes("FAQPage") || !Array.isArray((node as Record<string, unknown>).mainEntity)) {
      continue;
    }
    for (const q of (node as Record<string, unknown>).mainEntity as object[]) {
      if (!q || typeof q !== "object") continue;
      const qo = q as Record<string, unknown>;
      const question = typeof qo.name === "string" ? qo.name : "";
      let answer = "";
      const accepted = qo.acceptedAnswer;
      if (accepted && typeof accepted === "object") {
        const ao = accepted as Record<string, unknown>;
        if (typeof ao.text === "string") answer = ao.text;
      }
      if (question.trim()) {
        entries.push({ question: question.trim(), answer: answer.trim() });
      }
    }
  }
  return entries;
}

/** Parse FAQ storage into Q/A entries (JSON-LD FAQPage or Q:/A: text). */
export function parseFaqEntries(rawFaq?: string | null): FaqEntry[] {
  if (!rawFaq) return [];
  const trimmed = rawFaq.trim();
  if (!trimmed) return [];

  try {
    let jsonText = trimmed;
    const scriptMatch = jsonText.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (scriptMatch && scriptMatch[1]) {
      jsonText = scriptMatch[1].trim();
    }
    jsonText = jsonText
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'");

    const parsed = JSON.parse(jsonText);
    const extracted = extractFaqPageEntries(parsed);
    if (extracted.length) {
      return repairFaqEntriesFromSchema(extracted);
    }
  } catch {
    // fall through to plain-text parsing
  }

  // Labeled Q:/A: must win before word-lead run-on (avoids "how physicians" splits).
  if (hasQaLabels(trimmed)) {
    const inline = parseQaLabeledBlocks(trimmed);
    if (inline.length) return inline;
    const lined = parseQaLabeledLines(trimmed);
    if (lined.length) return lined;
  }

  const plainParagraphs = parsePlainFaqParagraphs(trimmed);
  if (plainParagraphs.length > 1) return plainParagraphs;

  // Unlabeled legacy only — Capitalized question leads (not mid-answer lowercase how/what).
  if (!hasQaLabels(trimmed)) {
    const runOn = parseRunOnFaqByQuestionMark(trimmed);
    if (runOn.length > 1) return runOn;
    if (runOn.length === 1 && plainParagraphs.length === 0) return runOn;
  }

  if (plainParagraphs.length === 1) return plainParagraphs;

  const lined = parseQaLabeledLines(trimmed);
  if (lined.length) return lined;

  return [];
}

/** Plain FAQ blocks: question line, answer line(s), blank line between pairs. No Q:/A: prefixes. */
function parsePlainFaqParagraphs(rawFaq: string): FaqEntry[] {
  const trimmed = rawFaq.trim();
  if (!trimmed || /^Q[:-]/im.test(trimmed)) return [];

  const blocks = trimmed.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (!blocks.length) return [];

  const entries: FaqEntry[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    entries.push({
      question: lines[0]!,
      answer: lines.slice(1).join(" ").trim(),
    });
  }
  return entries;
}

/** Serialize FAQ pairs as plain question/answer blocks (no Q:/A: labels). */
export function serializeFaqEntriesPlain(entries: FaqEntry[]): string {
  const cleaned = entries
    .map((e) => ({
      question: e.question.trim(),
      answer: e.answer.trim(),
    }))
    .filter((e) => e.question || e.answer);

  if (!cleaned.length) return "";

  return cleaned.map((e) => `${e.question}\n${e.answer}`.trim()).join("\n\n");
}

/**
 * Format FAQ for WordPress ACF `faq` textarea storage.
 * Plain question/answer blocks only (no Q:/A: labels, no JSON-LD script wrappers).
 */
export function faqPlainTextForWpStorage(rawFaq?: string | null): string {
  const trimmed = (rawFaq ?? "").trim();
  if (!trimmed) return "";
  const entries = parseFaqEntries(trimmed);
  if (entries.length) {
    return serializeFaqEntriesPlain(entries);
  }
  return trimmed.replace(/<script[\s\S]*?<\/script>/gi, "").trim();
}

/** Serialize Q/A entries to Q:/A: lines for ACF/meta storage. */
export function serializeFaqEntries(entries: FaqEntry[]): string {
  const cleaned = entries.map((e) => ({
    question: e.question.trim(),
    answer: e.answer.trim(),
  }));

  if (!cleaned.length) return "";

  const lines: string[] = [];
  for (const e of cleaned) {
    lines.push(`Q: ${e.question || ""}`);
    lines.push(`A: ${e.answer || ""}`);
  }
  return lines.join("\n");
}

/**
 * Strip storage labels (Q:/A:) from FAQ text for visible table cells.
 * Drops leading/trailing Q:/A: and recovers a question after mid-string "Q:" bleed.
 */
export function stripFaqQaLabelsForDisplay(text: string, role: "question" | "answer"): string {
  let t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";

  const stripLeadingLabel = (s: string): string => {
    if (s.length < 2) return s;
    const c0 = s.charAt(0).toUpperCase();
    const c1 = s.charAt(1);
    if ((c0 === "Q" || c0 === "A") && (c1 === ":" || c1 === "-")) {
      return s.slice(2).trim();
    }
    return s;
  };

  const stripTrailingLabel = (s: string): string => {
    const upper = s.toUpperCase();
    for (const needle of [" Q:", " A:", " Q-", " A-"] as const) {
      if (upper.endsWith(needle)) return s.slice(0, s.length - needle.length).trim();
    }
    for (const needle of ["Q:", "A:", "Q-", "A-"] as const) {
      if (!upper.endsWith(needle) || s.length <= needle.length) continue;
      return s.slice(0, s.length - needle.length).trim();
    }
    return s;
  };

  t = stripLeadingLabel(t);
  t = stripTrailingLabel(t);

  if (role === "question") {
    const upper = t.toUpperCase();
    let markerAt = -1;
    for (const marker of [" Q:", " Q-"] as const) {
      const idx = upper.lastIndexOf(marker);
      if (idx > 0) markerAt = Math.max(markerAt, idx);
    }
    if (markerAt > 0) {
      t = stripLeadingLabel(t.slice(markerAt).trim());
    }
  }

  t = stripLeadingLabel(t);
  t = stripTrailingLabel(t);
  return t.trim();
}

/** Clean FAQ entries for visible HTML (no Q:/A: labels in cells). */
export function cleanFaqEntriesForDisplay(entries: FaqEntry[]): FaqEntry[] {
  return entries
    .map((e) => ({
      question: stripFaqQaLabelsForDisplay(e.question, "question"),
      answer: stripFaqQaLabelsForDisplay(e.answer, "answer"),
    }))
    .filter((e) => e.question.trim());
}
