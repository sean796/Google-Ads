import type { AgentConfig } from '@/types/agent-config';
import type { FlowFreeformSectionPlan } from "@/lib/flow-freeform/flow-freeform-types";
import type { KeywordData } from '../keyword-types';
import type { CSVRow } from './bulk-csv-parser';
import type { BulkProcessingOptions } from '../bulk-auto-generate';
import { ensureBlogHarnessSummaryFirst } from '@/lib/bulk/blog-harness-summary-agent';
import { buildFocusedArticlePurpose } from '@/lib/content-generation/article-length-policy';
import { getBlogModel } from '@/lib/optimization-settings-storage';
import type { AIDrivenACFContext } from '@/lib/content-generation/ai-driven-acf-reader';
import { mergeOptimizerInstructions } from "@/lib/prompt-builders/system-user";
import { resolveAgentsForBulk } from "./bulk-blueprint-agents";
export { resolveAgentsForBulk } from "./bulk-blueprint-agents";
export {
  generateMarkdownContentHarnessed,
  type HarnessPromptEnv,
  stripTrailingCopyrightBoilerplate,
} from "./bulk-markdown-content-harness";

export async function generateMarkdownContent(
  blueprint: { title?: string; purpose?: string; agents: AgentConfig[] },
  row: CSVRow,
  keywordData: KeywordData,
  knowledgeFiles: Array<{ name: string; content: string }>,
  activeKnowledgeBaseText: string,
  options: BulkProcessingOptions,
  connectedSite?: { name: string; siteUrl: string },
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>,
  siteSummary?: string,
  semrushKeywordsContext?: string,
  semrushScatterContext?: string,
  semrushExternalUrls?: string[],
): Promise<string> {
  void knowledgeFiles;
  void activeKnowledgeBaseText;
  const { buildSystemPrompt, buildUserPrompt, generateSectionsPrompt } = await import('../prompt-builders');
  const { streamGeneration } = await import('../api');

  const knowledgeBaseContext = "";

  const bp = blueprint as {
    agents?: AgentConfig[];
    blueprintVersion?: number;
    flowFreeform?: { sections: FlowFreeformSectionPlan[] };
  };
  const agentsForBulk = ensureBlogHarnessSummaryFirst(resolveAgentsForBulk(bp));
  const sectionsPrompt = generateSectionsPrompt(agentsForBulk, "html");

  const entity =
    row.entity &&
    row.entity.trim() &&
    row.entity.trim() !== "N/A"
      ? row.entity.trim()
      : undefined;

  const acfContext: AIDrivenACFContext = {
    promptModifier: mergeOptimizerInstructions(options.optionalPrompt, row.prompt_modifier),
    keywordFocus: row.keyword_focus?.trim() || undefined,
    serviceArea: row.service_area_fields?.trim() || undefined,
  };

  const portfolioBlocked = options.portfolioBlockedHosts;

  const systemPrompt = await buildSystemPrompt(
    knowledgeBaseContext,
    options.openRouterApiKey,
    connectedSite,
    wordPressPosts,
    undefined,
    entity,
    undefined,
    undefined,
    siteSummary,
    semrushExternalUrls,
    portfolioBlocked,
    undefined,
  );
  const userPrompt = buildUserPrompt(
    blueprint.title || row.title,
    blueprint.purpose || buildFocusedArticlePurpose(keywordData.keyword),
    sectionsPrompt,
    connectedSite,
    entity,
    acfContext,
    !!wordPressPosts?.length,
    undefined,
    undefined,
    semrushKeywordsContext,
    semrushScatterContext,
    semrushExternalUrls,
    portfolioBlocked,
  );

  let fullContent = '';
  try {
    const safeMaxTokens = Math.min(options.maxTokens || 16000, 16000);

    const blogModel = getBlogModel();
    await streamGeneration({
      apiKey: options.openRouterApiKey,
      model: blogModel,
      systemPrompt,
      userPrompt,
      temperature: options.temperature || 1.0,
      maxTokens: safeMaxTokens,
      topP: options.topP || 0.9,
      onContentChunk: (chunk) => {
        fullContent += chunk;
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('400')) {
      if (errorMessage.includes('invalid_api_key') || errorMessage.includes('Invalid API key')) {
        throw new Error(`OpenRouter API key is invalid or expired. Please check your API key in settings.`);
      }
      if (errorMessage.includes('model') || errorMessage.includes('not found')) {
        throw new Error(`Model "${getBlogModel()}" is not available. Please try a different model.`);
      }
      if (errorMessage.includes('rate_limit') || errorMessage.includes('quota')) {
        throw new Error(`OpenRouter rate limit or quota exceeded. Please check your account credits.`);
      }
      if (errorMessage.includes('too large') || errorMessage.includes('token')) {
        throw new Error(`Request too large. The prompt or context is exceeding OpenRouter limits. Try reducing the knowledge base content.`);
      }
    }

    throw new Error(`Markdown generation stream failed: ${errorMessage}`);
  }

  if (!fullContent || fullContent.trim().length === 0) {
    throw new Error('Markdown generation returned empty content - stream completed but no content was generated');
  }

  if (fullContent.trim().length < 100) {
    throw new Error(`Markdown generation returned insufficient content (only ${fullContent.trim().length} characters). Expected at least 100 characters.`);
  }

  const { stripTrailingCopyrightBoilerplate } = await import("./bulk-markdown-content-harness");
  return stripTrailingCopyrightBoilerplate(fullContent);
}

export { stitchHarnessSections } from './bulk-harness-outline';

/**
 * Resolve the English Wikipedia URL for an entity (knowledge file or API check).
 */
export async function resolveEntityWikipediaUrl(
  entity: string | undefined,
  knowledgeFiles: Array<{ name: string; content: string }>,
  /** When set (e.g. from Local analysis), skip lookup and use this URL. */
  preResolvedUrl?: string
): Promise<string | undefined> {
  if (preResolvedUrl?.trim()) return preResolvedUrl.trim();
  if (!entity?.trim()) return undefined;
  const rowEntity = entity.trim();
  const wikipediaFile = knowledgeFiles.find(
    (file) =>
      file.name.toLowerCase().includes('wikipedia') &&
      file.name.toLowerCase().includes(rowEntity.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_'))
  );
  let wikipediaUrl: string | undefined;
  if (wikipediaFile) {
    const urlMatch = wikipediaFile.content.match(/https?:\/\/en\.wikipedia\.org\/wiki\/[^\s,]+/);
    if (urlMatch) {
      wikipediaUrl = urlMatch[0];
    }
  }
  if (!wikipediaUrl) {
    const { resolveEntityWikipediaMediaWiki } = await import("../wikipedia/resolve-entity-wikipedia-mediawiki");
    const hit = await resolveEntityWikipediaMediaWiki(rowEntity);
    if (hit?.url) {
      wikipediaUrl = hit.url;
    }
  }
  return wikipediaUrl;
}

function wikiTitleFromEnUrl(url: string): string {
  try {
    const seg = new URL(url).pathname.split("/").pop() ?? "";
    return decodeURIComponent(seg.replace(/_/g, " ")).trim();
  } catch {
    return "";
  }
}

/**
 * Add entity Wikipedia links to markdown content
 */

export async function addEntityLinksToContent(
  markdownContent: string,
  row: { entity?: string; wikipedia_url?: string; wikipedia_title?: string },
  rowIndex: number,
  knowledgeFiles: Array<{ name: string; content: string }>,
  options: BulkProcessingOptions,
  onProgress?: (rowIndex: number, totalRows: number, status: string) => void
): Promise<string> {
  if (!options.useEntitySitemapTemplate) {
    return markdownContent;
  }
  // Add entity Wikipedia link and local links if entity exists
  if (row.entity && row.entity.trim()) {
    try {
      const localLinks: Array<{ text: string; url: string }> = [];
      let wikipediaUrl = row.wikipedia_url?.trim();
      let wikiPageTitle = row.wikipedia_title?.trim();

      if (!wikipediaUrl) {
        wikipediaUrl = await resolveEntityWikipediaUrl(
          row.entity,
          knowledgeFiles,
          row.wikipedia_url,
        );
      }
      if (wikipediaUrl && !wikiPageTitle) {
        wikiPageTitle = wikiTitleFromEnUrl(wikipediaUrl) || row.entity.trim();
      }

      if (!wikipediaUrl || !wikiPageTitle) {
        onProgress?.(
          rowIndex,
          0,
          `No Wikipedia link for "${row.entity.trim()}" - continuing without entity wiki links`,
        );
        return markdownContent;
      }

      // Extract local links from Wikipedia content using Wikipedia API
      if (row.entity) {
        try {
          const { getLinksFromWikipediaPage, checkWikipediaPageExists } = await import('../wikipedia-api');
          
          // First verify the entity page exists (use resolved title when Local analysis passed it)
          const entityCheck = await checkWikipediaPageExists(wikiPageTitle);
          if (!entityCheck.exists) {
            console.warn(`[Bulk Generator] Entity "${wikiPageTitle}" does not exist on Wikipedia, skipping link extraction`);
          } else {
            // Get links from the Wikipedia page for the entity (with retry)
            let linkedEntities: string[] = [];
            let retries = 3;
            while (retries > 0) {
              try {
                linkedEntities = await getLinksFromWikipediaPage(wikiPageTitle, { 
                  limit: 100,
                  filterNamespaces: true 
                });
                break; // Success
              } catch (error) {
                retries--;
                if (retries === 0) {
                  console.warn(`[Bulk Generator] Failed to get links from Wikipedia after retries:`, error);
                } else {
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
                }
              }
            }
            
            // Filter and validate entities to get local/related links
            // Prioritize geographic entities (cities, neighborhoods, districts, etc.)
            const geographicKeywords = ['city', 'town', 'neighborhood', 'district', 'county', 'area', 'region', 'beach', 'island', 'park'];
            const relevantEntities = linkedEntities
              .filter(entity => {
                const lower = entity.toLowerCase();
                // Exclude the main entity itself
                if (lower === row.entity!.toLowerCase()) return false;
                // Filter out very short or very long names
                if (entity.length < 3 || entity.length > 50) return false;
                // Prioritize entities that might be geographic (optional - don't filter too strictly)
                return true;
              })
              .slice(0, 10); // Limit to 10 potential links
            
            // Verify and create links for relevant entities (batch check for efficiency)
            const { validateEntitiesExist } = await import('../wikipedia-api');
            const validationResults = await validateEntitiesExist(relevantEntities);
            
            for (const result of validationResults) {
              if (result.exists && result.url) {
                localLinks.push({
                  text: result.entity,
                  url: result.url,
                });
                // Limit to 5 links max
                if (localLinks.length >= 5) break;
              }
            }
          }
        } catch (error) {
          console.warn('[Bulk Generator] Error extracting local links from Wikipedia:', error);
          // Continue without local links - don't fail the entire generation
        }
      }
      
      // Add entity link to content (HTML format so no markdown leaks to WordPress)
      if (wikipediaUrl) {
        const safeUrl = wikipediaUrl.replace(/"/g, '&quot;').replace(/&/g, '&amp;');
        const safeEntity = row.entity.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const entityLink = `<a href="${safeUrl}">${safeEntity}</a>`;
        const entityEscaped = row.entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const entityRegex = new RegExp(`\\b${entityEscaped}\\b`, 'i');

        const linkEntityInFirstTitleLine = (md: string): string =>
          md.replace(/^((?:#+\s+))([^\n]+)/m, (full, prefix, rest) =>
            entityRegex.test(rest) ? prefix + rest.replace(entityRegex, entityLink) : full
          );

        // Find the first paragraph (content before first ## heading, excluding # title)
        const firstParagraphMatch = markdownContent.match(/^(?:#+\s+[^\n]+\n+)?([^#]+?)(?=\n##|\n#\s|$)/s);

        if (firstParagraphMatch) {
          let firstParagraph = firstParagraphMatch[1];
          const entityInParagraph = entityRegex.test(firstParagraph);
          const titleLine = markdownContent.match(/^#+\s+[^\n]+/m)?.[0] ?? '';
          const entityInTitle = titleLine.length > 0 && entityRegex.test(titleLine);
          const trimmedFirst = firstParagraph.trim();

          let applyParagraphReplace = false;

          if (entityInParagraph) {
            firstParagraph = firstParagraph.replace(entityRegex, entityLink);
            applyParagraphReplace = true;
          } else if (trimmedFirst) {
            // Entity not in opener but intro text exists: lead with linked name + em dash (never a line that is only the entity)
            firstParagraph = `${entityLink} - ${trimmedFirst}`;
            applyParagraphReplace = true;
          } else if (entityInTitle) {
            // H1 already names the entity; intro is empty - link the name in the title only (no standalone entity line)
            markdownContent = linkEntityInFirstTitleLine(markdownContent);
          } else if (entityRegex.test(markdownContent)) {
            markdownContent = markdownContent.replace(entityRegex, entityLink);
          }

          if (applyParagraphReplace) {
            markdownContent = markdownContent.replace(
              /^(?:#+\s+[^\n]+\n+)?([^#]+?)(?=\n##|\n#\s|$)/s,
              (match) => {
                const titleMatch = match.match(/^(#+\s+[^\n]+\n+)/);
                return (titleMatch ? titleMatch[1] : '') + firstParagraph;
              }
            );
          }
        } else if (entityRegex.test(markdownContent)) {
          markdownContent = markdownContent.replace(entityRegex, entityLink);
        }
        
        // Local Recommendation / What We Offer H2s come from the SAP blueprint
        // (via blog-template-builder.ts), so we don't need to add it here
        onProgress?.(rowIndex, 0, `Added Wikipedia links for ${row.entity}${localLinks.length > 0 ? ` with ${localLinks.length} knowledge graph entity links` : ''}`);
      }
    } catch (error) {
      console.error('Error adding Wikipedia links:', error);
      onProgress?.(
        rowIndex,
        0,
        `Wikipedia link step failed for "${row.entity?.trim() ?? "entity"}" - continuing without entity wiki links`,
      );
      return markdownContent;
    }
  }

  return markdownContent;
}


