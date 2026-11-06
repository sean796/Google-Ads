import { z } from "zod";
import { loadApiKey, streamChatCompletion, type Message } from "@/lib/api";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseModelJson } from "@/lib/model-json";
import { getResearchModel } from "@/lib/optimization-settings-storage";

const GENERIC_BASE_NAMES = new Set([
  "untitled",
  "untitled document",
  "document",
  "new document",
]);

/** Below this, one model pass over the full extract. */
const SINGLE_PASS_CHAR_THRESHOLD = 100_000;
/** Chunk size when document exceeds threshold. */
const CHUNK_TARGET_CHARS = 45_000;
const CHUNK_OVERLAP_CHARS = 2_000;

const SUMMARY_TEMPERATURE = 0.25;
const SUMMARY_MAX_TOKENS = 32_000;
const TOP_P = 0.9;

/**
 * Nested triples: `[subject]` line then predicate<TAB>object lines - avoids repeating long subjects.
 */
const TRIPLE_FORMAT_RULES = `Output format (strict):
- Plain text only. No preamble, no closing commentary, no markdown bullets or "##" headings.
- Nested subject blocks:
  - Start each block with exactly one line: [subject] - entity/topic inside square brackets. Do not use ] inside the subject; use a shorter stable label if needed.
  - Below [subject], emit zero or more lines. Each line is predicate<TAB>object (two TAB-separated fields). That subject applies until the next [subject] line or "# " line.
- predicate: lower_snake_case or short phrase (e.g. version, purpose, includes, prohibits_communication). Never bake the subject into the predicate (wrong: "Promotion includes" - use [Promotion] with predicate includes).
- **No redundant predicates:** Under one [subject], if you would output many lines with the **same** predicate and short parallel items (lists of outcomes, examples, topics, marketing channels, glossary entries, etc.), output **one** line only: predicate<TAB>item1; item2; item3 (join with "; " - semicolon + space). Same for repeated "includes …" style bullets - one includes line with a semicolon-separated list.
- Keep separate lines when predicates differ, or when two same-predicate objects are full distinct rules (long prose, different legal obligations) that must not be collapsed.
- object: usually one line. For merged lists, one line with "; "-separated members. Preserve digits, brand names, dates inside items. If an item must contain "; ", rephrase the item to avoid semicolon.
- Optional section: a line starting with "# " is a topic label only, not a triple. Use sparingly between blocks.
- No TABs inside predicate or object; rephrase instead.
- Do not emit flat three-field lines (subject<TAB>predicate<TAB>object); nested blocks only.
- Do not invent facts. Within one subject block, drop exact duplicate predicate+object lines (after trim) only.
- Reuse the same [subject] string when the source refers to the same entity.
- Brand and naming rules: preserve the full correction verbatim in object (preferred name, discouraged variants, "not X" prohibitions). Never output only a bare brand token when the source states a rule or preference.`;

const SYSTEM_SUMMARIZE = `You convert client instruction documents into nested semantic triples for AI system prompts: each block is [subject] then predicate<TAB>object lines. Capture every distinct rule, constraint, prohibition, tone directive, SEO rule, legal requirement, workflow step, and named entity.

Brand name rules, spelling preferences, and "use X not Y" instructions must keep the complete wording in object fields.

${TRIPLE_FORMAT_RULES}`;

const SYSTEM_MERGE = `You merge partial nested semantic triple documents of the same client instruction file into one document.

${TRIPLE_FORMAT_RULES}
- Merge: for blocks with the same [subject] string (exact match after trim), merge into one block.
- After unioning lines, **collapse same predicate:** if multiple lines share the same predicate, merge into one line predicate<TAB>combined where combined is all objects joined with "; " and duplicate items (trimmed) removed. Then apply list-collapse rules above so you do not leave redundant includes / list predicates as many separate lines.
- When the same requirement appears under different subject labels for the same entity, consolidate under one subject label when obvious.
- Preserve every unique rule, number, brand term, URL pattern, prohibition, and workflow step.
- Order: optional "# " labels when helpful; subjects in logical reading order or alphabetically.`;

/** Below this length, store extracted text verbatim (triple conversion loses one-line rules). */
export const VERBATIM_INSTRUCTION_CHAR_THRESHOLD = 500;

export function shouldStoreInstructionVerbatim(extractedText: string): boolean {
  return extractedText.trim().length <= VERBATIM_INSTRUCTION_CHAR_THRESHOLD;
}

function basenameWithoutExt(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return (dot > 0 ? fileName.slice(0, dot) : fileName).trim();
}

function extensionFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return "txt";
  return fileName.slice(dot + 1).toLowerCase();
}

export function isGenericInstructionFilename(fileName: string): boolean {
  const base = basenameWithoutExt(fileName).toLowerCase();
  if (!base) return true;
  if (GENERIC_BASE_NAMES.has(base)) return true;
  if (base.startsWith("untitled")) return true;
  if (base === "document" || base.startsWith("document copy")) return true;
  return false;
}

function sanitizeDerivedBasename(raw: string): string {
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const SYSTEM_DERIVE_NAME = `You label client instruction documents for a file list. Return JSON only.
Output shape: {"filename": string}

Rules:
- filename: short slug-style base name (2-5 words, lowercase words joined by hyphens). Describe the document topic from the text. No file extension.
- Use concrete topics from the content (service lines, policies, brand facts). Not "instructions" or "document".
- If content is too thin to name, use "client-notes".`;

/** Suggest a display filename from extracted text when the upload name is generic. */
export async function deriveInstructionDocumentName(
  extractedText: string,
  options: { siteId: string; fileName: string },
): Promise<string | null> {
  const apiKey = loadApiKey();
  if (!apiKey?.trim()) return null;
  const model = getResearchModel(options.siteId);
  const snippet = extractedText.trim().slice(0, 12_000);
  if (!snippet) return null;

  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model,
    system: SYSTEM_DERIVE_NAME,
    user: `Original upload name: ${options.fileName}\n\nExtracted text:\n\n${snippet}`,
    maxTokens: 120,
    temperature: 0.2,
    responseFormat: { type: "json_object" },
  });

  const parsed = parseModelJson(
    content,
    z.object({ filename: z.string() }),
    "instruction document name",
  );
  const base = sanitizeDerivedBasename(parsed.filename);
  if (!base) return null;
  return `${base}.${extensionFromFileName(options.fileName)}`;
}

function splitIntoChunks(text: string): string[] {
  const t = text.trim();
  if (t.length <= SINGLE_PASS_CHAR_THRESHOLD) return [t];

  const chunks: string[] = [];
  let start = 0;
  while (start < t.length) {
    let end = Math.min(start + CHUNK_TARGET_CHARS, t.length);
    if (end < t.length) {
      const slice = t.slice(start, end);
      const breakCandidates = [
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf("\n#"),
        slice.lastIndexOf("\n##"),
        slice.lastIndexOf("\n"),
      ].filter((i) => i > CHUNK_TARGET_CHARS * 0.35);
      const br = Math.max(...breakCandidates, -1);
      if (br > 0) end = start + br;
    }
    chunks.push(t.slice(start, end));
    if (end >= t.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP_CHARS);
  }
  return chunks;
}

async function collectCompletion(
  apiKey: string,
  model: string,
  messages: Message[]
): Promise<string> {
  let result = "";
  await streamChatCompletion({
    apiKey,
    model,
    messages,
    temperature: SUMMARY_TEMPERATURE,
    maxTokens: SUMMARY_MAX_TOKENS,
    topP: TOP_P,
    onContentChunk: (chunk) => {
      result += chunk;
    },
  });
  return result.trim();
}

async function summarizeOneExtract(
  apiKey: string,
  model: string,
  fileName: string,
  body: string,
  partLabel: string
): Promise<string> {
  const user = `Source file: ${fileName}
${partLabel}

Extracted text (convert to nested semantic triple blocks only):

${body}`;

  const messages: Message[] = [
    { role: "system", content: SYSTEM_SUMMARIZE },
    { role: "user", content: user },
  ];
  return collectCompletion(apiKey, model, messages);
}

async function mergePartials(
  apiKey: string,
  model: string,
  fileName: string,
  partials: string[]
): Promise<string> {
  const numbered = partials
    .map((p, i) => `=== PARTIAL ${i + 1} OF ${partials.length} ===\n${p}`)
    .join("\n\n");

  const user = `Source file: ${fileName}

The following are nested semantic triple documents from overlapping chunks of the same document. Merge them into one nested triple document per the merge rules.

${numbered}`;

  const messages: Message[] = [
    { role: "system", content: SYSTEM_MERGE },
    { role: "user", content: user },
  ];
  return collectCompletion(apiKey, model, messages);
}

/**
 * Produces nested semantic triples: `[subject]` lines then predicate\\tobject lines per block.
 * Uses per-site research model; does not use appendMasterInstructionsToSystemPrompt.
 */
export async function summarizeInstructionDocumentForMasterPrompt(
  fullText: string,
  options: { siteId: string; fileName: string }
): Promise<string> {
  const apiKey = loadApiKey();
  if (!apiKey?.trim()) {
    throw new Error("OpenRouter API key is missing. Set it in Settings first.");
  }
  const model = getResearchModel(options.siteId);
  const chunks = splitIntoChunks(fullText);

  if (chunks.length === 1) {
    return summarizeOneExtract(
      apiKey,
      model,
      options.fileName,
      chunks[0]!,
      "Full document (single pass)."
    );
  }

  const partials: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const partLabel = `This is part ${i + 1} of ${chunks.length} of the extracted text (chunks overlap; focus on content in this slice only).`;
    partials.push(
      await summarizeOneExtract(apiKey, model, options.fileName, chunks[i]!, partLabel)
    );
  }
  return mergePartials(apiKey, model, options.fileName, partials);
}

const SYSTEM_GBP_CONTEXT = `You convert local business and Google Business Profile source material into nested semantic triples for AI system prompts. Extract every fact present in the source: business name(s), street address, city, region/province/state, country, postal code, phone, email, website URL(s), latitude, longitude, place_id, cid, hours, categories, service areas, JSON-LD addresses, and DataForSEO google_business_info fields. Do not drop fields because DataForSEO returned no match; still triple all NAP and homepage discovery data.

${TRIPLE_FORMAT_RULES}`;

/**
 * Nested triples from GBP / NAP / DataForSEO blob (not client instruction docs).
 */
export async function summarizeGbpContextForMasterPrompt(
  fullText: string,
  options: { siteId: string; fileName: string },
): Promise<string> {
  const apiKey = loadApiKey();
  if (!apiKey?.trim()) {
    throw new Error("OpenRouter API key is missing. Set it in Settings first.");
  }
  const model = getResearchModel(options.siteId);
  const user = `Source file: ${options.fileName}

Local business / GBP / NAP / DataForSEO source (convert all facts to nested semantic triple blocks):

${fullText}`;

  const messages: Message[] = [
    { role: "system", content: SYSTEM_GBP_CONTEXT },
    { role: "user", content: user },
  ];
  return collectCompletion(apiKey, model, messages);
}
