import type { PpcWpPageContext } from "@/lib/ppc/google-ads-types";
import { getNeoPulseMetaProgramBrief } from "@/lib/ppc/load-neo-pulse-meta-program-brief";
import type { MetaAdContextSource, MetaAdRow } from "@/lib/ppc/meta-ads-types";
import { resolveMetaRowContextSource, resolveMetaRowContextUrl } from "@/lib/ppc/meta-ads-types";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { DEFAULT_TEAM_NAME } from "@/lib/teams-types";

export const NEO_PULSE_PRODUCT_URL = "https://neodigital.ca/neo-pulse";
export const NEO_DIGITAL_DEMO_URL = "https://neodigital.ca/";

function neoPulseMetaLandingUrlKey(url: string | null | undefined): string {
  return normalizePageUrlKey((url ?? "").trim());
}

export const NEO_PULSE_META_LANDING_PAGES: readonly PpcWpPageContext[] = [
  {
    url: NEO_PULSE_PRODUCT_URL,
    title: "NEO Pulse app",
    keyword: "NEO Pulse AI content flow manager",
    excerpt: "AI content and flow manager for WordPress.",
    metaDescription: "NEO Pulse turns Search Console signals into action lists tied to WordPress URLs.",
  },
  {
    url: NEO_DIGITAL_DEMO_URL,
    title: "Neo Digital demo",
    keyword: "WordPress SEO agency demo",
    excerpt: "Book a demo with Neo Digital Inc.",
    metaDescription: "WordPress SEO agency workflows with NEO Pulse.",
  },
];

const NEO_PULSE_META_LANDING_URL_KEYS = new Set(
  NEO_PULSE_META_LANDING_PAGES.map((page) => neoPulseMetaLandingUrlKey(page.url)),
);

export function isNeoPulseProductLandingUrl(url: string | null | undefined): boolean {
  return neoPulseMetaLandingUrlKey(url) === neoPulseMetaLandingUrlKey(NEO_PULSE_PRODUCT_URL);
}

export function isNeoPulseMetaStaticLandingUrl(url: string | null | undefined): boolean {
  const key = neoPulseMetaLandingUrlKey(url);
  return Boolean(key) && NEO_PULSE_META_LANDING_URL_KEYS.has(key);
}

export function findNeoPulseMetaStaticLandingPage(
  url: string | null | undefined,
): PpcWpPageContext | undefined {
  const key = neoPulseMetaLandingUrlKey(url);
  if (!key) return undefined;
  return NEO_PULSE_META_LANDING_PAGES.find((page) => neoPulseMetaLandingUrlKey(page.url) === key);
}

export function appendNeoPulseMetaStaticPages(
  pages: PpcWpPageContext[],
  teamName: string | null | undefined,
): PpcWpPageContext[] {
  if (!isNeoDigitalAgencyTeam(teamName)) return pages;
  const seen = new Set(pages.map((page) => neoPulseMetaLandingUrlKey(page.url)));
  const extras = NEO_PULSE_META_LANDING_PAGES.filter(
    (page) => !seen.has(neoPulseMetaLandingUrlKey(page.url)),
  ).map((page) => ({ ...page }));
  return extras.length ? [...extras, ...pages] : pages;
}

export function appendNeoPulseMetaStaticPagesForGenerate(
  pages: PpcWpPageContext[],
  teamName: string | null | undefined,
  landingPageUrl?: string | null,
): PpcWpPageContext[] {
  if (isNeoDigitalAgencyTeam(teamName) || isNeoPulseMetaStaticLandingUrl(landingPageUrl)) {
    return appendNeoPulseMetaStaticPages(pages, "Neo Digital Inc.");
  }
  return pages;
}

/** NEO Pulse product program brief for Meta ad context (static markdown, not codebase). */
export function getNeoPulseProductCodebaseContextBlock(): string {
  return getNeoPulseMetaProgramBrief();
}

export function buildMetaPageContextForGenerate(
  page: PpcWpPageContext | undefined,
  landingPageUrl: string | null | undefined,
): string {
  if (isNeoPulseProductLandingUrl(landingPageUrl) || isNeoPulseProductLandingUrl(page?.url)) {
    return getNeoPulseProductCodebaseContextBlock();
  }
  if (!page) return "No landing page context available.";
  return [
    `URL: ${page.url}`,
    `Title: ${page.title}`,
    page.keyword ? `Keyword: ${page.keyword}` : "",
    page.metaDescription ? `Meta description: ${page.metaDescription}` : "",
    page.excerpt ? `Excerpt: ${page.excerpt.slice(0, 600)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function metaRowHasGenerateInput(
  row: Pick<MetaAdRow, "focusKeyword" | "contextSource" | "contextUrl" | "landingPageUrl">,
): boolean {
  if (row.focusKeyword?.trim()) return true;
  if (resolveMetaRowContextSource(row) === "neo-pulse_app") return true;
  const contextUrl = resolveMetaRowContextUrl(row);
  return /^https?:\/\//i.test(contextUrl);
}

export function metaJobsNeedPageBucket(
  jobs: ReadonlyArray<{
    contextSource?: MetaAdContextSource | null;
    contextUrl?: string | null;
    landingPageUrl?: string | null;
  }>,
): boolean {
  return jobs.some((job) => {
    const source = job.contextSource === "neo-pulse_app" ? "neo-pulse_app" : "custom";
    if (source === "neo-pulse_app") return false;
    const contextUrl = job.contextUrl?.trim() ?? "";
    if (/^https?:\/\//i.test(contextUrl)) return false;
    return !isNeoPulseProductLandingUrl(job.landingPageUrl);
  });
}

export function getNeoPulseMetaPickerPages(): PpcWpPageContext[] {
  return NEO_PULSE_META_LANDING_PAGES.map((page) => ({ ...page }));
}

export function isNeoDigitalAgencyTeam(teamName: string | null | undefined): boolean {
  const normalized = (teamName ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === DEFAULT_TEAM_NAME.trim().toLowerCase() ||
    normalized === "neo digital inc" ||
    normalized.startsWith("neo digital")
  );
}

export function getNeoDigitalAgencyPovContextBlock(): string {
  return [
    "Neo Digital agency ad voice (we provide the service):",
    "Advertiser is Neo Digital Inc, a WordPress SEO and web design agency.",
    "Write in first person: we, our, us. Neo Digital offers help, audits, design, and implementation.",
    "Do NOT write as anonymous tips, courses, or third-party tools.",
    "Bad: Master Elementor design help. Good: We fix Elementor sites, Our Edmonton SEO team.",
    "Bad: We help Edmonton businesses (no outcome). Good: We help Edmonton get found, Edmonton SEO that ranks.",
    "On-image headline max 6 words from agency POV with a clear outcome, e.g. We help Edmonton rank, Our SEO audits fix gaps.",
  ].join("\n");
}

/** Compact NEO Pulse product + Instagram ad rules for Neo Digital harness steps. */
export function getNeoPulseMetaMarketingContextBlock(): string {
  return [
    "NEO Pulse marketing context (Neo Digital agency only):",
    `Product URL: ${NEO_PULSE_PRODUCT_URL}`,
    `Agency demo CTA URL: ${NEO_DIGITAL_DEMO_URL}`,
    "On-image copy limit: one short headline (max 6 words) plus optional 3 to 5 word subline. Body copy and captions live in Meta ad fields only.",
    "Visual style: white or light studio backgrounds, photo-real props and UI vignettes on white, accent #84BC00 as small UI highlight only, no logos.",
    "Funnel examples: BOFU action lists for WordPress SEO, MOFU agency scale, TOFU local search awareness.",
    "Reference: marketing/instagram-ads in the NEO Pulse codebase (feed creatives, minimal on-image text).",
  ].join("\n");
}

export function appendNeoPulseMetaMarketingContext(
  systemPrompt: string,
  teamName: string | null | undefined,
  options?: { contextSource?: MetaAdContextSource | null },
): string {
  if (!isNeoDigitalAgencyTeam(teamName)) return systemPrompt;
  const blocks = [getNeoPulseMetaMarketingContextBlock()];
  const source = options?.contextSource === "neo-pulse_app" ? "neo-pulse_app" : "custom";
  if (source !== "neo-pulse_app") {
    blocks.push(getNeoDigitalAgencyPovContextBlock());
  }
  return `${systemPrompt}\n\n${blocks.join("\n\n")}`;
}
