export type RowStatus =
  | "idle"
  | "scraping"
  | "uploading"
  | "ai-title"
  | "ai-meta"
  | "ai-url"
  | "ai-focus-kw"
  | "ai-faq"
  | "ai-headers"
  | "ai-links"
  | "ai-wikipedia-link"
  | "ai-answer"
  | "ai-overview"
  | "ai-scenario"
  | "ai-in-content-image"
  | "content-cleanup"
  | "research-faq"
  | "error";

export interface OverviewRow {
  url: string;
  title: string;
  /** On-page H1 when extracted from post body (list display). */
  pageHeading?: string;
  metaDescription: string;
  aiTitle: string;
  aiMeta: string;
  status: RowStatus;
  focusKeyword?: string;
  faq?: string;
  /** WordPress body HTML when hydrated (e.g. CSV export prefetch). Usually unset in the grid. */
  postContent?: string;
  dateModifier?: string;
  /** ACF `seo_research` - AI brief after Research (DFS + GSC + Semrush) */
  seoResearch?: string;
  /** Server-persisted markdown filename under /api/overview/seo-brief/:filename */
  briefFileName?: string | null;
  researchFileName?: string | null;
  gscQuickWinsCsvFilename?: string | null;
  semrushJsonFilename?: string | null;
  semrushAuditJsonFilename?: string | null;
  semrushAuditFixChecklist?: string | null;
  postId?: number | null;
  postType?: string | null;
  wpStatus?: string;
  wpDateGmt?: string;
  schemaJson?: string;
  aiSuggestedPath?: string;
  /** Live URL before a verified slug change (for NEO Pulse redirect redirect CSV). */
  slugRedirectSourceUrl?: string;
  /** Content audit JSON `{neoPulseContentAuditV1:{issues:[{title,rationale,rationaleAspects,...,htmlReference,...}]}}` or legacy markdown bullets */
  contentAnalyzeBulletsMarkdown?: string;
  contentAnalyzeRanAtIso?: string;
  contentAnalyzeFixRanAtIso?: string;
  /** H2 heading texts (inventory or after Headers optimization). */
  blogH2List?: string[];
  /** Phase-1 plan JSON from Headers AISEO run. */
  blogH2PlanJson?: string;
  /** Post body HTML after H2-only apply (upload via WordPress bulk PUT). */
  postContentOptimized?: string;
  blogHeadersRanAtIso?: string;
  /** Internal links (inventory or after Links optimization). */
  blogLinkList?: Array<{ href: string; anchor: string }>;
  blogLinksPlanJson?: string;
  blogLinksRanAtIso?: string;
  /** Staged Wikipedia targets (separate from internal Links). */
  blogWikiLinkList?: Array<{ href: string; anchor: string }>;
  blogWikiLinksRanAtIso?: string;
  /** One-line Wikipedia harness result for grid row display. */
  blogWikiLinkSummary?: string;
  /** In-content image staged after AISEO Images run. */
  blogInContentImageUrl?: string;
  blogInContentImageAlt?: string;
  blogInContentImageSection?: string;
  blogInContentImageMediaId?: number | null;
  blogInContentImageRanAtIso?: string;
  /** Original Google Images URL used as Local Image replicate reference. */
  blogInContentImageReferenceUrl?: string;
  /** Host page URL from Google Images (publisher page for authenticity). */
  blogInContentImageReferenceSourceUrl?: string;
  /** Peer SAP site name when Local Image was reused cross-site. */
  blogInContentImageSharedFromSiteName?: string;
  /** Peer SAP page URL that held the reused in-content image. */
  blogInContentImageSharedFromPageUrl?: string;
  /** H2 to place the in-content image under; unset = auto best heading. */
  blogInContentImageTargetHeading?: string;
  /** photo = section photo; local = DFS Google Images replicate (SAP only). */
  blogInContentImageKind?: "photo" | "local";
  /** html = post_content harness; elementor = _elementor_data on WordPress pages. */
  contentFormat?: "html" | "elementor";
  /** Staged Elementor JSON string for optimize/upload. */
  elementorDataJson?: string;
  /** Design breakdown from runDesignBreakdownAgent. */
  elementorDesignBreakdown?: string;
  /** Top-level Elementor band headings for the Headers stripe. */
  elementorSectionHeaders?: Array<{ id: string; title: string; depth: number; bodyText?: string; bodyHtml?: string }>;
  /** Per-section optimize keywords keyed by Elementor band id. */
  elementorSectionKeywords?: Record<string, string>;
  /** Whether Answer/Overview/Scenario slots exist in Elementor widgets. */
  elementorHarnessSlots?: { answer?: boolean; overview?: boolean; scenario?: boolean };
}
