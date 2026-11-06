import { useCallback } from "react";

import { notify } from "@/lib/app-notifications";
import { NOTIFY_FAILED_TO_GENERATE_TITLE_SUGGESTION, NOTIFY_NO_ENTITIES_AVAILABLE_FOR_TITLE_SUGGESTI, NOTIFY_NO_ENTITIES_TO_GENERATE_CSV_FROM, NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED_PLEASE_SE, NOTIFY_TITLE_TEMPLATE_SUGGESTED, notifyCsvTemplateWithXEntitiesDownloaded, notifyFailedToGenerateTitleSuggestionX } from "@/lib/notify-messages";
import { loadApiKey, streamChatCompletion } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { EntityGenerationState } from "@/components/integrations/use-entity-generation-state";

export function useEntityCsvTemplate(s: EntityGenerationState) {
  const {
    generatedEntities,
    pendingEntitySite,
    pendingEntitySitemap,
    setCsvTemplateDialogOpen,
    csvTitleFormat,
    setCsvTitleFormat,
    csvKeyword,
    csvFeaturedImage,
    csvOptionalModifier,
    setIsGeneratingTitleSuggestion,
  } = s;

const generateAITitleSuggestion = useCallback(async () => {
  if (!pendingEntitySite || !pendingEntitySitemap) return;
  
  const entities = generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`];
  if (!entities || entities.length === 0) {
    notify.error(NOTIFY_NO_ENTITIES_AVAILABLE_FOR_TITLE_SUGGESTI);
    return;
  }

  const apiKey = loadApiKey();
  if (!apiKey || !apiKey.trim()) {
    notify.error(NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED_PLEASE_SE);
    return;
  }

  setIsGeneratingTitleSuggestion(true);
  
  try {
    const model = getResearchModel();
    const siteName = pendingEntitySite.name || 'Service';
    const sampleEntities = entities.slice(0, 5).join(', ');
    
    const systemPrompt = `You are an expert SEO content strategist. Your task is to suggest an optimal title template for bulk blog post generation.

The title template should:
- Use variables: {entity}, {keyword}
- ALWAYS include the word "Near" before {entity}
- NEVER include the site/business name in the template
- Be SEO-friendly and natural
- Work well for local business content

Respond with ONLY the title template, nothing else. Do not include explanations, markdown, or code blocks.`;

    const userPrompt = `Generate a title template for local SEO blog posts.

Sample entities: ${sampleEntities}
Total entities: ${entities.length}

CRITICAL REQUIREMENTS:
1. MUST include "Near" before {entity} (e.g., "Near {entity}")
2. MUST NOT include the site/business name "${siteName}"
3. Can optionally use {keyword} variable
4. Must be optimized for local SEO

Examples of good templates:
- "{keyword} Near {entity}"
- "Services Near {entity}"
- "Near {entity}"

Generate the best title template (must include "Near" and must NOT include "${siteName}"):`;

    let suggestedTemplate = '';
    
    await streamChatCompletion({
      apiKey,
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      temperature: 0.7,
      maxTokens: 100,
      topP: 0.9,
      onContentChunk: (chunk) => {
        suggestedTemplate += chunk;
      }
    });

    // Clean up the response - remove markdown, quotes, etc.
    suggestedTemplate = suggestedTemplate
      .trim()
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/^```[\w]*\n?|\n?```$/g, '') // Remove code blocks
      .trim();

    if (suggestedTemplate) {
      setCsvTitleFormat(suggestedTemplate);
      notify.success(NOTIFY_TITLE_TEMPLATE_SUGGESTED);
    } else {
      notify.error(NOTIFY_FAILED_TO_GENERATE_TITLE_SUGGESTION);
    }
  } catch (error) {
    console.error('[Title Suggestion] Error:', error);
    notify.error(notifyFailedToGenerateTitleSuggestionX(error instanceof Error ? error.message : 'Unknown error'));
  } finally {
    setIsGeneratingTitleSuggestion(false);
  }
}, [pendingEntitySite, pendingEntitySitemap, generatedEntities, setCsvTitleFormat, setIsGeneratingTitleSuggestion]);

const replaceTemplateVariables = useCallback((
  template: string,
  entity: string,
  keyword: string = ''
): string => {
  let result = template;
  result = result.replace(/{entity}/g, entity);
  result = result.replace(/{keyword}/g, keyword);
  return result;
}, []);

// Generate CSV template from entities
const generateCSVTemplate = useCallback(() => {
  if (!pendingEntitySite || !pendingEntitySitemap) return;
  
  const entities = generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`] || [];
  if (entities.length === 0) {
    notify.error(NOTIFY_NO_ENTITIES_TO_GENERATE_CSV_FROM);
    return;
  }

  // Generate CSV rows
  const csvRows = entities.map((entity) => {
    const title = csvTitleFormat 
      ? replaceTemplateVariables(csvTitleFormat, entity, csvKeyword)
      : entity;
    
    return {
      keyword: csvKeyword || '',
      entity: entity,
      title: title,
      optionalModifier: csvOptionalModifier || '',
      featuredImage: csvFeaturedImage
    };
  });

  // Convert to CSV
  const headers = ['keyword', 'entity', 'title', 'optionalModifier', 'featuredImage'];
  const csvContent = [
    headers.join(','),
    ...csvRows.map(row => [
      row.keyword ? `"${row.keyword.replace(/"/g, '""')}"` : '',
      `"${row.entity.replace(/"/g, '""')}"`,
      `"${row.title.replace(/"/g, '""')}"`,
      row.optionalModifier ? `"${row.optionalModifier.replace(/"/g, '""')}"` : '',
      row.featuredImage
    ].join(','))
  ].join('\n');

  // Create download
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `entities-template-${pendingEntitySite.name.replace(/\s+/g, '-')}-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  notify.success(notifyCsvTemplateWithXEntitiesDownloaded(entities.length));
  setCsvTemplateDialogOpen(false);
}, [pendingEntitySite, pendingEntitySitemap, generatedEntities, csvTitleFormat, csvKeyword, csvOptionalModifier, csvFeaturedImage, replaceTemplateVariables, setCsvTemplateDialogOpen]);

  return {
    generateAITitleSuggestion,
    replaceTemplateVariables,
    generateCSVTemplate,
  };
}
