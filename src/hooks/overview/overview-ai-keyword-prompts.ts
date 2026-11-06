import type { Dispatch, SetStateAction } from "react";
import { normalizeFocusKeywordPhrase } from "@/lib/seo-redirect-csv";
import { pathSlugToFocusHint } from "@/lib/overview/focus-keyword-path-hint";

export type OverviewKeywordRunCompletion = (
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
  maxTokensOverride?: number,
) => Promise<string>;

export type OverviewKeywordPromptDeps = {
  runCompletion: OverviewKeywordRunCompletion;
  setFocusKeywordLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  napSummary?: string;
};

export function createOverviewGscFocusKeywordEnhancer(deps: OverviewKeywordPromptDeps) {
  const { runCompletion, setFocusKeywordLoading, setError } = deps;
  return async (
      url: string,
      gscKeywordBasis: string,
      pageTitle?: string,
      pageMeta?: string,
    ): Promise<string | null> => {
      setFocusKeywordLoading(true);
      setError(null);
      try {
        const safeBasis = (gscKeywordBasis || "").trim();
        const safeTitle = (pageTitle || "").trim();
        const safeMeta = (pageMeta || "").trim();

        const prompt = `You are an SEO specialist optimizing a primary focus keyword.

TASK
Enhance the given GSC keyword into a better SEO / ACF focus keyword for this specific page.

INPUTS
URL: ${url}
Page title: ${safeTitle || "(none)"}
Page meta description: ${safeMeta || "(none)"}
GSC top query (basis): ${safeBasis || "(none)"}

RULES (strict)
- Output ONLY the enhanced focus keyword text. No quotes, no extra words, no punctuation wrappers.
- 2–5 words (never more than 5). If the query implies a comparison (vs, diy, alternative), keep both sides - do not collapse to a single generic head term.
- Remove/ignore all locations/geography (cities, states, countries, neighborhoods) from the output.
- Keep it tightly aligned to the page topic/intent implied by URL/title/meta.
- Do NOT include the brand name or the site name.
- Prefer keeping the core topic from the GSC basis keyword while making it cleaner.

Return only the keyword.`;

        const systemPrompt =
          "You are an expert SEO keyword copywriter. Output only the final keyword phrase.";
        const raw = await runCompletion(systemPrompt, prompt);
        const firstLine = (raw || "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)[0];

        if (!firstLine) return null;

        const unquoted = firstLine.replace(/^["']+|["']+$/g, "").trim();
        const words = unquoted.split(/\s+/).filter(Boolean);
        const short = normalizeFocusKeywordPhrase(words.slice(0, 5).join(" ").trim() || unquoted);
        return short || null;
      } catch (err) {
        setError(err instanceof Error ? err.message : "AI focus keyword enhancement failed.");
        return null;
      } finally {
        setFocusKeywordLoading(false);
      }
    }
}

export function createOverviewFocusKeywordDeriver(deps: OverviewKeywordPromptDeps) {
  const { runCompletion, setFocusKeywordLoading, setError } = deps;
  return async (
      url: string,
      pageTitle?: string,
      pageMeta?: string,
      faq?: string,
      /** Plain text from main page body (e.g. WordPress post content); primary signal when set. */
      pageContentPlainText?: string,
      options?: { skipLoadingState?: boolean; seoResearchBrief?: string },
    ) => {
      const skipLoadingState = options?.skipLoadingState === true;
      if (!skipLoadingState) {
        setFocusKeywordLoading(true);
        setError(null);
      }
      try {
        const safeTitle = (pageTitle || "").trim();
        const safeMeta = (pageMeta || "").trim();
        const safeFaq = (faq || "").trim();
        const bodyTrimmed = (pageContentPlainText || "").trim();
        const hasBody = bodyTrimmed.length >= 80;
        const bodyForPrompt = hasBody ? bodyTrimmed.slice(0, 12000) : "";
        const briefTrimmed =
          typeof options?.seoResearchBrief === "string"
            ? options.seoResearchBrief.trim().slice(0, 24000)
            : "";
        const hasBrief = briefTrimmed.length > 0;
        const pathHint = pathSlugToFocusHint(url);
        const pathBlock =
          pathHint.length > 0
            ? `PRIMARY PAGE-PATH TOPIC (from the URL slug - anchor the keyword here; body/brief refine wording only)
${pathHint}

`
            : "";

        const prompt = `You are an expert SEO keyword copywriter.

TASK
Infer a **short-tail, intent-only** primary SEO / ACF focus keyword - the core topic for this URL.

${pathBlock}When PRIMARY PAGE-PATH TOPIC is present, the keyword **must** stay on that same subject (same page as the slug). Do **not** substitute a different service, city, or generic head term that would force the user to change the URL to match the SEO keyword.

INPUTS (read in this order)
${hasBrief ? `1) SEO research brief (JSON or text - refine wording only; must not override PRIMARY PAGE-PATH TOPIC when that block is present)\n${briefTrimmed}\n\n` : ""}${hasBrief ? "2" : "1"}) Full URL
${url}

${hasBrief ? "3" : "2"}) Page title: ${safeTitle || "(none)"}
${hasBrief ? "4" : "3"}) Page meta description: ${safeMeta || "(none)"}
${hasBrief ? "5" : "4"}) FAQ context (optional): ${safeFaq || "(none)"}
${
  hasBody
    ? `${hasBrief ? "6" : "5"}) PAGE CONTENT (plain text excerpt - confirm topic; still subordinate to PRIMARY PAGE-PATH TOPIC when present)
${bodyForPrompt}
`
    : ""
}

RULES (strict)
- Output ONLY the keyword text. No quotes, no labels, no explanation.
- **Length:** 2–5 words (never more than 5). One head term is not enough when the page compares options or answers "X vs Y" - then include both sides (e.g. "social media agency vs diy", "hiring vs diy marketing"). Use 2–3 words only for simple single-topic pages (e.g. "roller shades installation").
- **Comparisons:** If title, URL, or body signal **versus / vs / or / alternative / DIY** against another option, the keyword must reflect that split - do not reduce to only the first half (e.g. not just "social media agency" when the piece is agency vs DIY).
- **Intent over fluff:** Drop filler like "which", "path", "faster", "your", "brand", "grows" - keep words that carry intent (service, comparison target, diy, etc.).
- **Path alignment:** When PRIMARY PAGE-PATH TOPIC is present, express that topic in natural words (spaces only; use "vs" not hyphens). Do not ignore it in favor of unrelated GSC-style queries.
- Use **spaces between words only** - no hyphens, no underscores (use the word "vs" not a hyphen).
- Geography: omit cities/regions unless they clearly belong to this page's URL path or title; do not add location from body/brief alone if it contradicts PRIMARY PAGE-PATH TOPIC.
- Do NOT include brand names or site names.

Return only the keyword.`;

        const systemPrompt =
          "You output only the final short-tail keyword phrase, nothing else.";
        const raw = await runCompletion(systemPrompt, prompt);
        const firstLine = (raw || "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)[0];
        if (!firstLine) return null;

        const unquoted = firstLine.replace(/^["']+|["']+$/g, "").trim();
        const words = unquoted.split(/\s+/).filter(Boolean);
        const short = normalizeFocusKeywordPhrase(words.slice(0, 5).join(" ").trim() || unquoted);
        return short || null;
      } catch (err) {
        if (!skipLoadingState) {
          setError(err instanceof Error ? err.message : "AI focus keyword derivation failed.");
        }
        return null;
      } finally {
        if (!skipLoadingState) {
          setFocusKeywordLoading(false);
        }
      }
    }
}

export function createOverviewEntityKeywordDeriver(deps: OverviewKeywordPromptDeps) {
  const { runCompletion, setFocusKeywordLoading, setError, napSummary } = deps;
  return async (
      url: string,
      pageTitle?: string,
      pageMeta?: string,
      options?: { skipLoadingState?: boolean },
    ): Promise<string | null> => {
      const skipLoadingState = options?.skipLoadingState === true;
      if (!skipLoadingState) {
        setFocusKeywordLoading(true);
        setError(null);
      }
      try {
        const safeTitle = (pageTitle || "").trim();
        const safeMeta = (pageMeta || "").trim();

        const prompt = `You are a local SEO entity-optimization specialist.

TASK
Generate one local SEO / ACF focus keyword from the page URL, title, meta, and NAP.

INPUTS
URL: ${url}
Page title: ${safeTitle || "(none)"}
Page meta description: ${safeMeta || "(none)"}

Location & NAP context (primary source for city and state/province when ambiguous)
${napSummary || "(none)"}

FORMAT (pick one - never omit a sub-city place when the URL encodes it)
1) Service-area / neighborhood / district pages: when the URL slug or title encodes a named sub-city place (neighborhood, borough, district) distinct from the metro, you MUST include that place in the keyword. Typical shape: [service 1–2 words] [Neighborhood] [City] [2-letter province/state] - e.g. "SEO McCauley Edmonton AB", "Local SEO Garneau Edmonton AB". Do NOT collapse to metro-only when the URL names a specific area.
2) Single-city / no sub-city entity: [service 1–2 words] [city] [2-letter ST] - e.g. "Blinds Bushnell FL", "Window Shades Orlando FL".

RULES (strict)
- Output ONLY the keyword. No quotes, no extra text, no explanation.
- Derive the service/product from the URL slug, title, or meta – pick the most specific term for that page (e.g. "Roller Shades" not just "Window Treatments" if the page is about roller shades).
- Derive neighborhood/district from the URL path/slug first when present (e.g. .../edmonton-seo-mccauley-edmonton/ → McCauley + Edmonton). If the URL clearly identifies a sub-city entity, include it in the keyword; do not output only [service] + metro + ST for those pages.
- Do NOT reuse the same metro-only keyword for many different neighborhood URLs - each row should reflect its distinct place entity when the URL differs by neighborhood.
- ALWAYS end with the 2-letter state or province abbreviation (e.g. FL, AB, CA). Use NAP as the source of truth for region when a place name is ambiguous (e.g. Bellevue could be WA or AB - follow NAP, never guess a US state if NAP is Canada).
- Derive state/province from the URL only when unambiguous (e.g. -fl, -florida → FL); otherwise use NAP.
- Do NOT include zip, "near", "near me", or filler words.
- Do NOT include brand names or the site name.
- Title Case the service and place names; UPPERCASE the state/province abbreviation.
- Up to 6 words.

Return only the keyword.`;

        const systemPrompt =
          "You output only the final local keyword phrase (include neighborhood + city + ST when the URL encodes a sub-city entity; otherwise service + city + ST), nothing else.";
        const raw = await runCompletion(systemPrompt, prompt);
        const firstLine = (raw || "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)[0];
        if (!firstLine) return null;

        const unquoted = firstLine.replace(/^["']+|["']+$/g, "").trim();
        const words = unquoted.split(/\s+/).filter(Boolean);
        const short = normalizeFocusKeywordPhrase(words.slice(0, 6).join(" ").trim() || unquoted);
        return short || null;
      } catch (err) {
        if (!skipLoadingState) {
          setError(err instanceof Error ? err.message : "AI entity keyword derivation failed.");
        }
        return null;
      } finally {
        if (!skipLoadingState) {
          setFocusKeywordLoading(false);
        }
      }
    }
}

export function createOverviewShortTailKeywordDeriver(deps: OverviewKeywordPromptDeps) {
  const { runCompletion, setFocusKeywordLoading, setError } = deps;
  return async (brief: string, pageTitle: string, url: string): Promise<string | null> => {
      setFocusKeywordLoading(true);
      setError(null);
      try {
        const safeUrl = (url || "").trim() || "(none)";
        const safeTitle = (pageTitle || "").trim() || "(none)";
        const briefTrimmed = (brief || "").trim().slice(0, 24000);
        const pathHint = pathSlugToFocusHint(url);
        const pathBlock =
          pathHint.length > 0
            ? `PRIMARY PAGE-PATH TOPIC (from the URL slug - the keyword MUST stay on this subject)
${pathHint}

`
            : "";

        const prompt = `You are an expert SEO keyword copywriter.

TASK
Infer a short-tail (head) primary SEO / ACF focus keyword.

${pathBlock}When PRIMARY PAGE-PATH TOPIC is shown above, that topic is the **anchor**: the keyword must describe the same page as that slug (polish wording; 2–5 words). Do **not** replace it with a different service, city, or generic head term pulled from the SEO brief (e.g. a blog post whose path is about seasonal decluttering must not become an unrelated "city + junk removal" keyword).

INPUTS (use in this order)

1) SEO research brief - refine intent and wording only; it must **not** override PRIMARY PAGE-PATH TOPIC when that block is present
${briefTrimmed || "(none)"}

2) Current page title
${safeTitle}

3) Full page URL
${safeUrl}

RULES (strict)
- Output ONLY the keyword text. No quotes, no labels, no explanation.
- Short-tail: 2–5 words (never more than 5). If the page compares two approaches (vs, DIY, alternative, or), include both sides in the keyword - not just one half.
- Do NOT include brand names or site names.
- Do not paste competitor titles, meta, or PAA text verbatim - synthesize one concise phrase.
- Geography: omit cities/regions **unless** they clearly belong to this page's URL path or title for this URL; never add a metro or service area from the brief alone when it would contradict PRIMARY PAGE-PATH TOPIC.

Return only the keyword.`;

        const systemPrompt =
          "You output only the final short-tail keyword phrase, nothing else.";
        const raw = await runCompletion(systemPrompt, prompt);
        const firstLine = (raw || "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)[0];
        if (!firstLine) return null;

        const unquoted = firstLine.replace(/^["']+|["']+$/g, "").trim();
        const words = unquoted.split(/\s+/).filter(Boolean);
        const short = normalizeFocusKeywordPhrase(words.slice(0, 5).join(" ").trim() || unquoted);
        return short || null;
      } catch (err) {
        setError(err instanceof Error ? err.message : "AI short-tail focus keyword failed.");
        return null;
      } finally {
        setFocusKeywordLoading(false);
      }
    }
}
