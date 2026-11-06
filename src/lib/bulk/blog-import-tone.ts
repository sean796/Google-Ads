import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseJsonStrict } from "@/lib/json-repair-utility";
import { getProductionModel } from "@/lib/optimization-settings-storage";
import type { ImportedBlogDraft, ImportedBlogSection } from "./blog-import-parser";
import { parseImportedSectionsJson } from "./bulk-csv-parser";
import type { CSVRow } from "./bulk-csv-parser";

/** AI tone profile for blog-import harness + checklist (stored on CSVRow as JSON). */
export type ImportedBlogToneProfile = {
  register: string;
  sophistication: string;
  voice_traits: string[];
  sentence_rhythm: string;
  vocabulary_notes: string;
  do_not: string[];
  sample_phrases: string[];
};

const TONE_SAMPLE_MAX_CHARS = 6500;

export function buildDraftTextForToneAnalysis(
  title: string,
  sections: ImportedBlogSection[],
): string {
  const parts: string[] = [`Title: ${title.trim()}`];
  for (const s of sections) {
    parts.push(`\n## ${s.h2}\n${s.body.trim()}`);
  }
  const combined = parts.join("\n").trim();
  if (combined.length <= TONE_SAMPLE_MAX_CHARS) return combined;
  return `${combined.slice(0, TONE_SAMPLE_MAX_CHARS)}\n\n[…truncated for tone analysis]`;
}

export function parseImportedToneJson(raw: string | undefined | null): ImportedBlogToneProfile | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  try {
    const parsed = JSON.parse(t) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const register = typeof o.register === "string" ? o.register.trim() : "";
    if (!register) return null;
    const asStrings = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
    return {
      register,
      sophistication: typeof o.sophistication === "string" ? o.sophistication.trim() : "moderate-high",
      voice_traits: asStrings(o.voice_traits),
      sentence_rhythm: typeof o.sentence_rhythm === "string" ? o.sentence_rhythm.trim() : "",
      vocabulary_notes: typeof o.vocabulary_notes === "string" ? o.vocabulary_notes.trim() : "",
      do_not: asStrings(o.do_not),
      sample_phrases: asStrings(o.sample_phrases).slice(0, 8),
    };
  } catch {
    return null;
  }
}

const TONE_SYSTEM = `You are a literary and editorial tone analyst. Read the supplied draft excerpt and return JSON only.

Goal: capture how this author sounds so a rewriter can match voice while applying SEO structure elsewhere in the pipeline.

Rules:
- Describe register, rhythm, and vocabulary honestly (policy, journalistic, academic, conversational expert, etc.).
- sophistication must reflect the draft's level (e.g. "high", "moderate-high", "moderate") — do not assume the audience wants simpler copy.
- voice_traits: 4–8 short phrases (e.g. "data-forward", "cautious hedging", "institutional confidence").
- do_not: include "Do not dumb down or simplify vocabulary below the source level" and any patterns that would betray the source (e.g. clickbait, choppy listicles) unless the source already uses them.
- sample_phrases: 3–6 short phrases or clauses that typify the draft (may paraphrase slightly but keep the same register).

Return JSON:
{
  "register": "string",
  "sophistication": "string",
  "voice_traits": ["string"],
  "sentence_rhythm": "string",
  "vocabulary_notes": "string",
  "do_not": ["string"],
  "sample_phrases": ["string"]
}`;

export async function analyzeImportedBlogTone(args: {
  apiKey: string;
  title: string;
  sections: ImportedBlogSection[];
  model?: string;
  signal?: AbortSignal;
}): Promise<ImportedBlogToneProfile | null> {
  if (!args.apiKey.trim() || args.sections.length === 0) return null;

  const sample = buildDraftTextForToneAnalysis(args.title, args.sections);
  const user = `Analyze tone and voice for this imported blog draft:\n\n${sample}`;

  try {
    const { content } = await callOpenRouterChatCompletion({
      apiKey: args.apiKey,
      model: args.model ?? getProductionModel(),
      system: TONE_SYSTEM,
      user,
      temperature: 0.2,
      maxTokens: 900,
      signal: args.signal,
    });

    const parsed = parseJsonStrict<ImportedBlogToneProfile>(content);
    if (!parsed?.register?.trim()) return null;

    const doNot = Array.isArray(parsed.do_not) ? parsed.do_not.map(String).filter(Boolean) : [];
    if (!doNot.some((d) => /dumb down|simplif/i.test(d))) {
      doNot.push("Do not dumb down, casualize, or reduce sophistication below the source draft.");
    }

    return {
      register: parsed.register.trim(),
      sophistication: (parsed.sophistication || "moderate-high").trim(),
      voice_traits: Array.isArray(parsed.voice_traits)
        ? parsed.voice_traits.map(String).filter(Boolean).slice(0, 10)
        : [],
      sentence_rhythm: (parsed.sentence_rhythm || "").trim(),
      vocabulary_notes: (parsed.vocabulary_notes || "").trim(),
      do_not: doNot.slice(0, 10),
      sample_phrases: Array.isArray(parsed.sample_phrases)
        ? parsed.sample_phrases.map(String).filter(Boolean).slice(0, 8)
        : [],
    };
  } catch (e) {
    console.warn("[Blog Import] Tone analysis failed (non-fatal):", e);
    return null;
  }
}

/** Resolve tone from row JSON or analyze from imported sections. */
export async function resolveImportedBlogToneForRow(args: {
  row: CSVRow;
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<{ profile: ImportedBlogToneProfile | null; toneJson?: string }> {
  const existing = parseImportedToneJson(args.row.imported_tone_json);
  if (existing) return { profile: existing, toneJson: args.row.imported_tone_json };

  const sections = parseImportedSectionsJson(args.row.imported_sections_json);
  if (!sections?.length) return { profile: null };

  const profile = await analyzeImportedBlogTone({
    apiKey: args.apiKey,
    title: args.row.title,
    sections,
    model: args.model,
    signal: args.signal,
  });
  if (!profile) return { profile: null };
  const toneJson = JSON.stringify(profile);
  return { profile, toneJson };
}

export function formatImportedToneForHarnessPrompt(profile: ImportedBlogToneProfile): string {
  const traits = profile.voice_traits.length
    ? profile.voice_traits.map((t) => `- ${t}`).join("\n")
    : "- (match source register)";
  const doNot = profile.do_not.length
    ? profile.do_not.map((t) => `- ${t}`).join("\n")
    : "- Do not dumb down or simplify below the source draft.";
  const samples = profile.sample_phrases.length
    ? profile.sample_phrases.map((p) => `  • "${p}"`).join("\n")
    : "  • (infer from excerpt)";

  return `--- Imported draft: tone & voice (match closely; keep sophistication) ---
Register: ${profile.register}
Sophistication level (maintain, do not reduce): ${profile.sophistication}
Sentence rhythm: ${profile.sentence_rhythm || "Match source — vary length as in the draft."}
Vocabulary: ${profile.vocabulary_notes || "Use the same tier of terms as the source; prefer precise nouns and measured qualifiers."}

Voice traits:
${traits}

Typical phrasing (echo this register, do not copy blindly):
${samples}

Forbidden shifts:
${doNot}

Rewrite for SEO, links, tables/lists, and keyword placement — but the prose must read like the same author at the same level of sophistication, not a generic SEO blog or a simplified summary.`;
}

export function formatImportedToneForChecklistPrompt(profile: ImportedBlogToneProfile): string {
  return `
=== IMPORTED DRAFT — TONE & VOICE (MANDATORY FOR CHECKLIST & BLUEPRINT) ===
${formatImportedToneForHarnessPrompt(profile)}
Each checklist item must tell the writer to match this voice and to **not** reduce sophistication below the source.
=== END TONE & VOICE ===

`;
}

export function getImportedToneFromRow(row: CSVRow): ImportedBlogToneProfile | null {
  return parseImportedToneJson(row.imported_tone_json);
}
