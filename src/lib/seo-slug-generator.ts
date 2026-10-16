/**
 * SEO Slug Generator
 * Generates short, keyword-focused URL slugs for new WordPress posts (never for updates).
 * AI-only: Gemini via OpenRouter; empty string when API key missing or request fails (no deterministic slug fallback).
 */

import { loadApiKey } from "@/lib/api";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import { resolveModelForAgentCategory } from "@/lib/openrouter-agent-category-api";
const SLUG_MAX_LENGTH = 80;

/**
 * Sanitize a slug to WordPress-safe format: lowercase, [a-z0-9-]+
 */
function sanitizeSlug(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  const sanitized = lower
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized.length > SLUG_MAX_LENGTH
    ? sanitized.substring(0, SLUG_MAX_LENGTH).replace(/-$/, "")
    : sanitized;
}

/** True if this comma-segment is metro/CBSA noise for slugging (not a street or neighborhood name). */
function isMetroNoiseSegment(segment: string): boolean {
  const s = segment.trim();
  if (!s) return true;
  const lower = s.toLowerCase();
  if (/\bmetropolitan\s+area\b/i.test(lower)) return true;
  if (/^metro(\s+area)?$/i.test(lower)) return true;
  if (/^greater\s+[\w\s]+\s+area$/i.test(s)) return true;
  return false;
}

/**
 * Strip metro/CBSA noise and redundant segments from a comma-separated place string before AI slugging.
 * Exported for tests.
 */
export function normalizeLocationForSeoSlug(raw: string): string {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const kept: string[] = [];
  for (const p of parts) {
    if (isMetroNoiseSegment(p)) continue;
    kept.push(p);
  }
  return kept.join(", ").trim();
}

/**
 * If title contains "…: Place, City" after a colon, use full geo string so slugs include city level.
 * (Requires ":" so commas elsewhere in the title are not treated as geo.)
 */
function geoHintFromTitle(title: string): string | null {
  const t = (title || "").trim();
  const colonIdx = t.indexOf(":");
  if (colonIdx < 0) return null;
  const segment = t.slice(colonIdx + 1).trim();
  if (!segment.includes(",")) return null;
  const parts = segment.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return parts.join(", ");
}

/**
 * Prefer entity; if entity is neighborhood-only but title lists "Neighborhood, City", use title hint.
 */
function resolveLocationForSlug(title: string, entity?: string | null): string | null {
  const hint = geoHintFromTitle(title);
  const e = entity?.trim();
  if (!e || e === "N/A") {
    return hint ? normalizeLocationForSeoSlug(hint) : null;
  }
  let combined: string;
  if (e.includes(",")) {
    combined = e;
  } else if (hint) {
    const el = e.toLowerCase();
    if (hint.toLowerCase().includes(el) || hint.split(",").some((p) => p.trim().toLowerCase().startsWith(el))) {
      combined = hint;
    } else {
      combined = e;
    }
  } else {
    combined = e;
  }
  const n = normalizeLocationForSeoSlug(combined);
  return n.length > 0 ? n : null;
}

/**
 * Generate a short, SEO-optimal URL slug for a NEW post only (SAP / local pages).
 * Blog posts use fillBlogRowSlugFromOpenRouter at Ideas time; do not call this for national blog rows.
 * Do not use when updating an existing post (preserve original slug).
 */
export async function generateSEOSlug(
  title: string,
  primaryKeyword: string,
  entity?: string | null,
  apiKey?: string | null
): Promise<string> {
  const keyword = (primaryKeyword || "").trim();
  if (!keyword) return "";

  const key = (apiKey ?? loadApiKey())?.trim();
  if (!key) return "";

  const location = resolveLocationForSlug(title, entity);

  const locationBlock =
    location && location.trim() && location !== "N/A"
      ? `Location (comma-separated place): ${location.trim()}`
      : "No location — keyword-only slug (no city or neighborhood tokens).";

  const slugUserPrompt = `Generate a bare-minimum-intent URL slug for a local SEO service-area page.

Title: "${(title || "").trim().substring(0, 200)}"
Primary keyword: "${keyword}"
${locationBlock}

**Slug rules (mandatory):**
- Return **only** the slug: lowercase, **hyphen-separated** \`[a-z0-9-]\`, no quotes or explanation.
- **Every word** in the slug must be separated by a hyphen. Never concatenate words into one token (forbidden: \`hunterdouglas\`).
- **Minimum intent:** the fewest **intent-bearing** tokens from the keyword plus location. Only nouns, verbs, adjectives, and place names that carry search meaning may appear.
- **Known abbreviations (always, not optional):** when a token has a **widely recognized short form** used in local URLs — postal/civic, trade and profession shorthand, medical, scheduling — **always** output the short form. **Never** keep the long spelling when a real shorthand exists. Normalize morphological variants of the same trade (noun vs adjective forms) to **one** consistent shorthand. When no real short form exists, keep the full word. **Never** clip place names or invent letter-soup.
- **Place names:** spell neighborhood and city names in full. Region as 2-letter code when present. At most one hyperlocal token, one city, one region code.
- **No duplicated** hyphen tokens. No metro/CBSA-style geographic noise.
- Target **≤8 hyphen segments** and **≤${SLUG_MAX_LENGTH} characters**.
- **Glue words — delete, never keep:** Prepositions, articles, conjunctions, and other short connector or filler words from the title or keyword must be **omitted entirely** from the slug. Do not hyphenate them. Do not abbreviate them. If a token only links other words and adds no search intent, it does not belong in the URL.`;

  try {
    const response = await postOpenRouterAppChatFetch( {
      method: "POST",
      headers: openRouterWebAppHeaders(key),
      body: JSON.stringify({
        model: resolveModelForAgentCategory("meta"),
        messages: [
          {
            role: "system",
            content:
              "You are a local SEO URL slug specialist. Output one minimum-intent slug. Delete glue words. When a recognized URL shorthand exists for a token, always use it — never optionally keep the long form. Normalize trade noun/adjective pairs to the same shorthand. Spell place names in full. No invented truncations. No JSON, markdown, or commentary.",
          },
          { role: "user", content: slugUserPrompt },
        ],
        temperature: 0,
        max_tokens: 60,
      }),
    });

    if (!response.ok) return "";

    const data = await response.json();
    const raw = (data.choices?.[0]?.message?.content ?? "").trim().replace(/^["']|["']$/g, "").trim();
    if (!raw) return "";

    const slug = sanitizeSlug(raw);
    return slug.length >= 2 ? slug : "";
  } catch {
    return "";
  }
}
