/**
 * External research module - currently disabled.
 * Types are kept so existing imports don't break.
 */

export interface CheckedExternalLink {
  url: string;
  title: string;
  domain: string;
  pageContent: string;
  relevanceNote: string;
}

export interface ExternalResearchResult {
  keyword: string;
  llmScrapeAnswer: string;
  checkedLinks: CheckedExternalLink[];
  extractionLog: string[];
}

export async function performExternalResearch(
  _keyword: string,
  _locationName: string,
  _languageCode: string,
  _options: Record<string, unknown> = {}
): Promise<ExternalResearchResult> {
  return { keyword: _keyword, llmScrapeAnswer: '', checkedLinks: [], extractionLog: [] };
}
