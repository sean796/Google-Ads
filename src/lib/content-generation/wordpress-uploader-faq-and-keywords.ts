/**
 * FAQ schema and keyword inference helpers for the WordPress uploader.
 */

import { logger } from "@/lib/logger";
import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import { parseFaqEntries, type FaqEntry } from "@/lib/faq-entries";

type SetWordPressUploadProgress = (progress: { step: string; progress: number; message?: string }) => void;

/**
 * When no primary keyword is available, infer one from title, meta, and PROMPT MODIFIER using Open Router.
 * The PROMPT MODIFIER (when present) is the source of truth; keyword is derived from it.
 */
async function inferKeywordForKeywordFocus(
  title: string,
  excerpt: string | undefined,
  url: string,
  siteId: string,
  metaDescription?: string,
  promptModifier?: string
): Promise<string> {
  const cleanTitle = (title || "").replace(/<[^>]+>/g, "").trim();
  const excerptText = (excerpt || "").replace(/<[^>]+>/g, "").trim().substring(0, 300);
  const metaText = (metaDescription || excerptText || "").trim().substring(0, 300);
  const modifierText = (promptModifier || "").trim().substring(0, 500);
  if (!cleanTitle && !metaText && !modifierText) return "";

  try {
    const openRouterApiKey = loadApiKey();
    if (!openRouterApiKey?.trim()) return "";

    const researchModel = getResearchModel(siteId);
    const parts: string[] = [];
    if (modifierText) parts.push(`PROMPT MODIFIER (read first - defines what to prioritize): "${modifierText}"`);
    parts.push(`Page Title: "${cleanTitle || "(none)"}"`, `Page URL: "${url}"`);
    if (metaText) parts.push(`Meta description (use as context for the page topic): "${metaText}"`);

    const response = await postOpenRouterAppChatFetch( {
      method: "POST",
      headers: openRouterWebAppHeaders(openRouterApiKey),
      body: JSON.stringify({
        model: researchModel,
        messages: [
          {
            role: "user",
            content: `The PROMPT MODIFIER (when provided above) is the SOURCE OF TRUTH for what this company/site specializes in. Your keyword MUST be derived from and consistent with it.

${parts.join("\n")}

RULES:
- If a PROMPT MODIFIER is provided above, it is the SOURCE OF TRUTH. Derive the primary keyword from it. IGNORE the page title, FAQ, or any other page content that suggests a different topic. The modifier overrides everything.
- If no PROMPT MODIFIER is provided, use the meta description as the primary signal for the site's business, then the title. The keyword must reflect what the modifier or meta says the company does.
- Return a 2-5 word keyword phrase that matches the source of truth (modifier first, then meta).

Return ONLY the keyword phrase, nothing else. No quotes, no explanation.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 30,
      }),
    });

    if (!response.ok) return "";

    const data = await response.json();
    const aiKeyword = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!aiKeyword || aiKeyword.length < 2) return "";

    const cleaned = aiKeyword.replace(/^["']|["']$/g, "").trim().substring(0, 80);
    return cleaned.length >= 3 ? cleaned : "";
  } catch (error) {
    logger.warn("[WordPress Uploader] Failed to infer keyword for keyword_focus:", error);
    return "";
  }
}



/**
 * FAQ JSON-LD script from explicit Q/A pairs. Only entries with a real stored
 * answer are emitted. Returns "" when no entry has a real answer, so callers
 * omit FAQPage schema instead of publishing invented answers.
 */
export function buildFAQSchemaScriptFromEntries(
  entries: FaqEntry[],
  _primaryKeyword: string,
  _entity: string | undefined,
  _siteUrl: string,
  _napLocations?: Array<{ city: string; state: string }>
): string {
  const faqItems = entries
    .map((entry) => {
      const cleanQuestion = String(entry.question || "").trim();
      const answerText = String(entry.answer || "").trim();
      if (!cleanQuestion || !answerText) return null;
      return {
        "@type": "Question",
        name: cleanQuestion,
        acceptedAnswer: {
          "@type": "Answer",
          text: answerText,
        },
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (!faqItems.length) return "";

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems,
  };
  const jsonString = JSON.stringify(faqSchema);
  return `<script type="application/ld+json">${jsonString}</script>`;
}

export function buildFaqSchemaForUpdatedPost(args: {
  faqSchemaOverrideTrimmed: string;
  generateFaqSchema: boolean;
  bulkFaqMinimum4: boolean;
  prefetchedFaqRaw: string;
  primaryKeyword: string;
  entity: string | undefined;
  siteUrl: string;
  napLocations: Array<{ city: string; state: string }>;
  setProgress: SetWordPressUploadProgress;
}): { faqSchema: string; skipFaqWrites: boolean } {
  const { faqSchemaOverrideTrimmed, generateFaqSchema, bulkFaqMinimum4, prefetchedFaqRaw, primaryKeyword, entity, siteUrl, napLocations, setProgress } = args;
        let faqSchema = '';
        let skipFaqWrites = false;
        const runFaqBlock =
          generateFaqSchema || bulkFaqMinimum4 || Boolean(faqSchemaOverrideTrimmed);

        if (runFaqBlock) {
          if (faqSchemaOverrideTrimmed) {
            faqSchema = faqSchemaOverrideTrimmed;
            setProgress({
              step: 'Applying FAQ Schema...',
              progress: 93,
              message: 'Writing optimized FAQ schema to ACF...',
            });
          } else {
          setProgress({
            step: 'Creating FAQ Schema...',
            progress: 93,
            message: bulkFaqMinimum4
              ? 'Checking stored FAQ answers...'
              : 'Building FAQ schema from stored answers...',
          });

          try {
            if (bulkFaqMinimum4) {
              const existingEntries = parseFaqEntries(prefetchedFaqRaw);
              if (existingEntries.length >= 4) {
                faqSchema = '';
                skipFaqWrites = true;
              } else {
                faqSchema = buildFAQSchemaScriptFromEntries(existingEntries, primaryKeyword, entity, siteUrl, napLocations);
                if (faqSchema) {
                  /* schema built, nothing else to do */
                } else {
                  setProgress({ step: 'Creating FAQ Schema...', progress: 93, message: 'FAQ schema omitted: no stored FAQ answers for this post.' });
                  logger.warn('[WordPress Uploader] FAQ schema omitted: no stored FAQ answers.');
                }
              }
            } else if (generateFaqSchema) {
              const storedEntries = parseFaqEntries(prefetchedFaqRaw);
              faqSchema = buildFAQSchemaScriptFromEntries(storedEntries, primaryKeyword, entity, siteUrl, napLocations);
              if (faqSchema) {
                /* schema built, nothing else to do */
              } else {
                setProgress({ step: 'Creating FAQ Schema...', progress: 93, message: 'FAQ schema omitted: no stored FAQ answers for this post.' });
                logger.warn('[WordPress Uploader] FAQ schema omitted: no stored FAQ answers.');
              }
            }
          } catch (faqError) {
            logger.warn('[WordPress Uploader] Failed to generate FAQ schema:', faqError);
          }
          }
        }
  return { faqSchema, skipFaqWrites };
}

export function buildFaqSchemaForDraftPost(args: {
  faqSchemaOverrideTrimmed: string;
  generateFaqSchema: boolean;
  bulkFaqMinimum4: boolean;
  prefetchedFaqRaw: string;
  primaryKeyword: string;
  entity: string | undefined;
  siteUrl: string;
  napLocations: Array<{ city: string; state: string }>;
  setProgress: SetWordPressUploadProgress;
}): { faqSchema: string; skipFaqWrites: boolean } {
  const { faqSchemaOverrideTrimmed, generateFaqSchema, bulkFaqMinimum4, prefetchedFaqRaw, primaryKeyword, entity, siteUrl, napLocations: napLocationsDraft, setProgress } = args;
        let faqSchemaDraft = '';
        let skipFaqWritesDraft = false;
        const runFaqBlockDraft =
          generateFaqSchema || bulkFaqMinimum4 || Boolean(faqSchemaOverrideTrimmed);

        if (runFaqBlockDraft) {
          if (faqSchemaOverrideTrimmed) {
            faqSchemaDraft = faqSchemaOverrideTrimmed;
            setProgress({
              step: 'Applying FAQ Schema...',
              progress: 93,
              message: 'Writing optimized FAQ schema to ACF...',
            });
          } else {
          setProgress({
            step: 'Creating FAQ Schema...',
            progress: 93,
            message: bulkFaqMinimum4 ? 'Checking stored FAQ answers...' : 'Building FAQ schema from stored answers...',
          });
          try {
            if (bulkFaqMinimum4) {
              const existingEntries = parseFaqEntries(prefetchedFaqRaw);
              if (existingEntries.length >= 4) {
                faqSchemaDraft = '';
                skipFaqWritesDraft = true;
              } else {
                faqSchemaDraft = buildFAQSchemaScriptFromEntries(existingEntries, primaryKeyword, entity, siteUrl, napLocationsDraft);
                if (!faqSchemaDraft) {
                  setProgress({ step: 'Creating FAQ Schema...', progress: 93, message: 'FAQ schema omitted: no stored FAQ answers for this post.' });
                }
              }
            } else if (generateFaqSchema) {
              const storedEntries = parseFaqEntries(prefetchedFaqRaw);
              faqSchemaDraft = buildFAQSchemaScriptFromEntries(storedEntries, primaryKeyword, entity, siteUrl, napLocationsDraft);
              if (!faqSchemaDraft) {
                setProgress({ step: 'Creating FAQ Schema...', progress: 93, message: 'FAQ schema omitted: no stored FAQ answers for this post.' });
              }
            }
          } catch {
            // FAQ schema omitted on failure; never invent answers.
          }
          }
        }
  return { faqSchema: faqSchemaDraft, skipFaqWrites: skipFaqWritesDraft };
}
