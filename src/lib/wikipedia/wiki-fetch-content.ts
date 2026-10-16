import { summarizeContentWithAI, type SummarizationOptions } from "../content-summarizer";
import type { WikipediaChunk, WikipediaFetchOptions } from "./types";
import { getMediaWikiApiUrlWithQuery } from "./mediawiki-api-url";
import { resolveModelForAgentCategory } from "@/lib/openrouter-agent-category-api";

const EXCLUDED_SECTIONS = [
  "References",
  "External links",
  "Further reading",
  "See also",
  "Notes",
  "Bibliography",
  "Sources",
  "Citations",
];

function cleanText(text: string): string {
  return text
    .replace(/\[\d+\]/g, "")
    .replace(/\[citation needed\]/gi, "")
    .replace(/\[who\]/gi, "")
    .replace(/\[when\]/gi, "")
    .replace(/\[where\]/gi, "")
    .replace(/\[clarification needed\]/gi, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function chunkByParagraphs(text: string, minTokens: number = 300, maxTokens: number = 500): string[] {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    const paragraphTokens = Math.ceil(paragraph.length / 4);
    const currentTokens = Math.ceil(currentChunk.length / 4);

    if (currentChunk && currentTokens + paragraphTokens > maxTokens) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  const mergedChunks: string[] = [];
  for (const chunk of chunks) {
    const chunkTokens = Math.ceil(chunk.length / 4);
    if (chunkTokens < minTokens && mergedChunks.length > 0) {
      mergedChunks[mergedChunks.length - 1] += `\n\n${chunk}`;
    } else {
      mergedChunks.push(chunk);
    }
  }

  return mergedChunks.length > 0 ? mergedChunks : [text];
}

async function processWikipediaExtract(
  title: string,
  extract: string,
  url: string,
  revisionId?: number,
  options?: WikipediaFetchOptions
): Promise<WikipediaChunk[]> {
  const chunks: WikipediaChunk[] = [];

  const sections = extract.split(/\n(?==+\s)/);

  if (sections.length > 0) {
    const introMatch = extract.match(/^([^=]+?)(?=\n==|\n$)/s);
    if (introMatch && introMatch[1].trim()) {
      let introText = cleanText(introMatch[1].trim());
      if (introText.length > 50) {
        if (options?.summarizeWithAI && options?.openRouterApiKey && introText.trim().length > 200) {
          try {
            const summarizationOptions: SummarizationOptions = {
              apiKey: options.openRouterApiKey,
              model: resolveModelForAgentCategory("research"),
              temperature: 0.7,
              maxTokens: 4000,
              topP: 0.9,
              onProgress: (message) => {
                options.onSummarizeProgress?.(`Introduction: ${message}`);
              },
            };

            options.onSummarizeProgress?.(`Analyzing introduction section...`);
            const result = await summarizeContentWithAI(introText, summarizationOptions);
            introText = result.summarizedContent;
          } catch (error) {
            console.error(`[Wikipedia API] Error summarizing introduction:`, error);
          }
        }

        chunks.push({
          title,
          section: "Introduction",
          text: introText,
          url,
          revision_id: revisionId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    if (!section) continue;

    const titleMatch = section.match(/^==+\s*(.+?)\s*==+\s*\n?(.*)/s);
    if (!titleMatch) continue;

    const sectionTitle = titleMatch[1].trim();
    let sectionContent = titleMatch[2] || "";

    if (EXCLUDED_SECTIONS.some((excluded) => sectionTitle.toLowerCase().includes(excluded.toLowerCase()))) {
      continue;
    }

    sectionContent = cleanText(sectionContent);

    if (!sectionContent || sectionContent.length < 50) {
      continue;
    }

    const sectionChunks = chunkByParagraphs(sectionContent, 300, 500);

    for (const chunkText of sectionChunks) {
      let finalChunkText = chunkText;

      if (options?.summarizeWithAI && options?.openRouterApiKey && chunkText.trim().length > 200) {
        try {
          const summarizationOptions: SummarizationOptions = {
            apiKey: options.openRouterApiKey,
            model: resolveModelForAgentCategory("research"),
            temperature: 0.7,
            maxTokens: 4000,
            topP: 0.9,
            onProgress: (message) => {
              options.onSummarizeProgress?.(`${sectionTitle}: ${message}`);
            },
          };

          options.onSummarizeProgress?.(`Analyzing section "${sectionTitle}"...`);
          const result = await summarizeContentWithAI(chunkText, summarizationOptions);
          finalChunkText = result.summarizedContent;
        } catch (error) {
          console.error(`[Wikipedia API] Error summarizing chunk in section "${sectionTitle}":`, error);
        }
      }

      chunks.push({
        title,
        section: sectionTitle,
        text: finalChunkText,
        url,
        revision_id: revisionId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  if (chunks.length === 0) {
    const cleanedText = cleanText(extract);
    if (cleanedText.length > 50) {
      const textChunks = chunkByParagraphs(cleanedText, 300, 500);
      for (const chunkText of textChunks) {
        let finalChunkText = chunkText;

        if (options?.summarizeWithAI && options?.openRouterApiKey && chunkText.trim().length > 200) {
          try {
            const summarizationOptions: SummarizationOptions = {
              apiKey: options.openRouterApiKey,
              model: resolveModelForAgentCategory("research"),
              temperature: 0.7,
              maxTokens: 4000,
              topP: 0.9,
              onProgress: (message) => {
                options.onSummarizeProgress?.(`Overview: ${message}`);
              },
            };

            options.onSummarizeProgress?.(`Analyzing overview section...`);
            const result = await summarizeContentWithAI(chunkText, summarizationOptions);
            finalChunkText = result.summarizedContent;
          } catch (error) {
            console.error(`[Wikipedia API] Error summarizing overview chunk:`, error);
          }
        }

        chunks.push({
          title,
          section: "Overview",
          text: finalChunkText,
          url,
          revision_id: revisionId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  return chunks;
}

/**
 * Fetches Wikipedia content for an entity using the extracts API
 */
export async function fetchWikipediaContent(
  entity: string,
  options?: WikipediaFetchOptions,
  retries: number = 3
): Promise<WikipediaChunk[]> {
  if (!entity || !entity.trim()) {
    throw new Error("Entity cannot be empty");
  }

  const entityName = entity.trim();
  console.log("[Wikipedia API] Fetching content for entity:", entityName);

  const params = new URLSearchParams({
    action: "query",
    prop: "extracts",
    explaintext: "1",
    exsectionformat: "wiki",
    titles: entityName,
    redirects: "1",
    format: "json",
    formatversion: "2",
    utf8: "1",
    origin: "*",
  });

  const apiUrl = getMediaWikiApiUrlWithQuery(params);
  console.log("[Wikipedia API] Request URL:", apiUrl);

  let attempts = 0;
  let lastError: Error | null = null;

  while (attempts < retries) {
    try {
      attempts++;
      console.log(`[Wikipedia API] Starting fetch request (attempt ${attempts}/${retries})...`);
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        mode: "cors",
      });

      console.log("[Wikipedia API] Response status:", response.status, response.statusText);

      if (!response.ok) {
        if (response.status >= 500 && attempts < retries) {
          console.warn(`[Wikipedia API] Server error ${response.status}, retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
          continue;
        }

        const errorText = await response.text().catch(() => "Unable to read error response");
        console.error("[Wikipedia API] Error response body:", errorText);
        throw new Error(
          `Wikipedia API HTTP error: ${response.status} ${response.statusText}. ${errorText.substring(0, 200)}`
        );
      }

      const contentType = response.headers.get("content-type");
      console.log("[Wikipedia API] Content-Type:", contentType);

      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("[Wikipedia API] Non-JSON response:", text.substring(0, 500));
        throw new Error(`Expected JSON response but got: ${contentType}. Response: ${text.substring(0, 200)}`);
      }

      const data = await response.json();
      console.log("[Wikipedia API] Response data structure:", {
        hasQuery: !!data.query,
        hasPages: !!data.query?.pages,
        pagesLength: data.query?.pages?.length || 0,
        keys: Object.keys(data),
      });

      if (!data.query) {
        console.error("[Wikipedia API] No query in response:", data);
        throw new Error(
          `Invalid Wikipedia API response: missing 'query' field. Response keys: ${Object.keys(data).join(", ")}`
        );
      }

      if (!data.query.pages || data.query.pages.length === 0) {
        console.error("[Wikipedia API] No pages in query:", data.query);
        throw new Error(`No Wikipedia page found for "${entityName}". Try a different search term.`);
      }

      const page = data.query.pages[0];
      console.log("[Wikipedia API] Page data:", {
        pageId: page.pageid,
        title: page.title,
        missing: page.missing,
        hasExtract: !!page.extract,
        extractLength: page.extract?.length || 0,
      });

      if (page.missing) {
        throw new Error(
          `Wikipedia page not found: "${entityName}". The page may not exist or the name may be incorrect.`
        );
      }

      const title = page.title;
      const extract = page.extract || "";
      const revisionId = page.revisions?.[0]?.revid;

      const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
      console.log("[Wikipedia API] Built Wikipedia URL:", wikiUrl);

      if (!extract) {
        throw new Error(`No content found for "${entityName}". The page exists but has no extractable content.`);
      }

      console.log("[Wikipedia API] Processing extract, length:", extract.length);
      const chunks = await processWikipediaExtract(title, extract, wikiUrl, revisionId, options);
      console.log("[Wikipedia API] Generated", chunks.length, "chunks");

      return chunks;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempts < retries) {
        console.warn(`[Wikipedia API] Fetch error (attempt ${attempts}/${retries}), retrying...`, {
          error: lastError.message,
          entityName,
        });

        if (lastError instanceof TypeError && lastError.message.includes("fetch")) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
          continue;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
        continue;
      }

      console.error("[Wikipedia API] Fetch error details:", {
        error: lastError,
        errorMessage: lastError.message,
        attempts,
      });

      if (lastError instanceof TypeError && lastError.message.includes("fetch")) {
        throw new Error(
          `Network error: Unable to connect to Wikipedia API after ${attempts} attempts. Error: ${lastError.message}`
        );
      }

      if (
        lastError instanceof Error &&
        (lastError.message.includes("CORS") || lastError.message.includes("cross-origin"))
      ) {
        throw new Error(`CORS error: Wikipedia API may not allow requests from this origin. Error: ${lastError.message}`);
      }

      if (lastError instanceof Error) {
        throw new Error(
          `Failed to fetch Wikipedia content for "${entityName}" after ${attempts} attempts: ${lastError.message}`
        );
      }
      throw new Error(`Failed to fetch Wikipedia content for "${entityName}" after ${attempts} attempts: ${String(lastError)}`);
    }
  }

  throw new Error(`Failed to fetch Wikipedia content for "${entityName}" after ${retries} attempts`);
}
