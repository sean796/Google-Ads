import type { PageGscQueryRow, PageGscResultLike } from "@/lib/content-optimization/seo-research-brief-for-optimize";

export interface ContentComparison {
  originalTitle: string;
  newTitle: string;
  originalExcerpt: string;
  newExcerpt: string;
  originalContent: string; // markdown or HTML
  newContent: string; // markdown
  originalHtml?: string;
  newHtml?: string;
  /** Prior ACF `seo_extra_text` / `extra_text` (markdown or plain). */
  originalExtraText?: string;
  /** New ACF extra block written this run (markdown). */
  newExtraText?: string;
  primaryKeyword: string;
  clusterKeywords?: string[];
  selectedKeyword: {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  };
  gscResult?: PageGscResultLike | unknown;
  seoResearchRaw?: string;
  faqEntries?: Array<{ question: string; answer?: string }>;
  blueprintResult?: {
    agents?: Array<{ title?: unknown; purpose?: unknown; description?: unknown }>;
  };
  updateMode: "update" | "draft";
  url: string;
  siteId?: string | null;
  siteUrl?: string;
  apiKey?: string;
}

export interface H2SectionDiffRow {
  h2: string;
  status: "added" | "rewritten" | "retained";
  beforeWords: number;
  afterWords: number;
  purpose?: string;
}

export interface LinkAnchorPair {
  url: string;
  anchor: string;
  isInternal: boolean;
}

export interface ImplementationReportDeterministicDiff {
  originalWordCount: number;
  newWordCount: number;
  wordCountDiff: number;
  wordCountPercent: string;
  originalCharCount: number;
  newCharCount: number;
  charCountDiff: number;
  originalH2s: Array<{ h2: string; words: number }>;
  newH2s: Array<{ h2: string; words: number }>;
  removedH2s: Array<{ h2: string; words: number }>;
  sectionDiffs: H2SectionDiffRow[];
  addedInternalLinks: LinkAnchorPair[];
  removedInternalLinks: LinkAnchorPair[];
  retainedInternalLinks: LinkAnchorPair[];
  addedExternalLinks: LinkAnchorPair[];
  removedExternalLinks: LinkAnchorPair[];
  originalKeywordCount: number;
  newKeywordCount: number;
  originalDensity: string;
  newDensity: string;
  gscQueries: PageGscQueryRow[];
  semrushOrganicKeywords: string[];
  semrushPhraseRelatedKeywords: string[];
  semrushExternalUrls: string[];
  serpCompetitors: Array<{ domain?: string; title?: string; url?: string }>;
  serpPaaQuestions: string[];
}

export interface ImplementationReportSectionRationale {
  h2: string;
  status: "added" | "rewritten" | "retained";
  whatChanged: string;
  whyChanged: string;
  dataSignalsUsed: string;
}

export interface ImplementationReportReasoning {
  executiveSummary: string;
  whyOptimized: string;
  gscAndSemrushStrategy: string;
  sectionRationale: ImplementationReportSectionRationale[];
  bossHighlights: string[];
}
