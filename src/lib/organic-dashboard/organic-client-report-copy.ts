/** Client report / export copy: no em or en dashes; SEO-friendly labels. */

export const CLIENT_REPORT_DELTA_EMPTY = "n/a";

const EM_DASH = /\u2014/g;
const EN_DASH = /\u2013/g;
const UNICODE_DASH = /[\u2010-\u2015\u2212]/g;

export function normalizeClientReportText(value: string): string {
  return value
    .replace(EM_DASH, ", ")
    .replace(EN_DASH, "-")
    .replace(UNICODE_DASH, "-")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function normalizeClientReportPeriodLabel(label: string): string {
  return label.replace(EN_DASH, "-").replace(EM_DASH, "-").replace(/\s*→\s*/g, " vs ").trim();
}

export function formatClientReportPeriodLine(
  showCompare: boolean,
  comparePeriodLabel: string,
  primaryPeriodLabel: string,
): string {
  const primary = normalizeClientReportPeriodLabel(primaryPeriodLabel);
  if (!showCompare) return primary;
  const compare = normalizeClientReportPeriodLabel(comparePeriodLabel);
  return `${compare} vs ${primary}`;
}

export function sanitizeClientReportMetricValue(value: string): string {
  if (value.trim() === "\u2014" || value.trim() === "-") return CLIENT_REPORT_DELTA_EMPTY;
  return normalizeClientReportText(value);
}

export function formatClientReportTopQueryMeta(clicks: string, _periodLabel?: string): string {
  return `${sanitizeClientReportMetricValue(clicks)} clicks`;
}

export function clientReportSemrushKeywordHasTraffic(traffic: string): boolean {
  const t = sanitizeClientReportMetricValue(traffic);
  if (!t || t === CLIENT_REPORT_DELTA_EMPTY || /^n\/a$/i.test(t)) return false;
  if (t === "0") return false;
  return true;
}

export function formatClientReportSemrushKeywordMeta(traffic: string, volume: string): string {
  const trafficLabel = sanitizeClientReportMetricValue(traffic);
  const volumeLabel = sanitizeClientReportMetricValue(volume);
  const trafficMissing =
    !trafficLabel ||
    trafficLabel === CLIENT_REPORT_DELTA_EMPTY ||
    /^n\/a$/i.test(trafficLabel);
  if (trafficMissing) {
    return `vol. ${volumeLabel}`;
  }
  return `${trafficLabel} est. traffic, vol. ${volumeLabel}`;
}

export function formatClientReportCoverTitle(agencyName: string, siteName: string): string {
  return `${agencyName} | Organic performance report | ${siteName}`;
}

export function formatClientReportCoverMonthYear(periodLine: string): string {
  const normalized = normalizeClientReportText(periodLine);
  const targetPeriod = normalized.includes(" vs ") ? normalized.split(" vs ")[1] : normalized;
  const monthMatch = targetPeriod.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i,
  );
  const yearMatch = targetPeriod.match(/\b(20\d{2})\b/);
  if (monthMatch && yearMatch) {
    return `${monthMatch[1].toUpperCase()} ${yearMatch[1]}`;
  }
  if (monthMatch) {
    return monthMatch[1].toUpperCase();
  }
  return targetPeriod.toUpperCase() || "REPORT";
}



function capitalizeTitleToken(token: string): string {
  if (!token) return token;
  const prefix = token.match(/^[^a-zA-Z0-9]*/)?.[0] ?? "";
  const suffix = token.match(/[^a-zA-Z0-9]*$/)?.[0] ?? "";
  const core = token.slice(prefix.length, token.length - suffix.length);
  if (!core) return token;
  if (/^[A-Z0-9]{2,}$/.test(core)) return token;
  return prefix + core.charAt(0).toUpperCase() + core.slice(1).toLowerCase() + suffix;
}

/** Every word capitalized (including short words like by, of). Preserves GA4, GSC, etc. */
export function toExportTitleCase(text: string): string {
  const normalized = normalizeClientReportText(text);
  if (!normalized) return normalized;
  return normalized.split(/(\s+)/).map((part) => (/^\s+$/.test(part) ? part : capitalizeTitleToken(part))).join("");
}

export type OwnerReportCopyEntry = {
  label: string;
  tooltip: string;
};

/** Accordion dropdown labels and tooltips for collapsed narrative boxes and opportunity cards. */
export const CLIENT_REPORT_ACCORDION_COPY = {
  coverInsights: {
    label: "Executive Summary & Key Takeaways",
    tooltip:
      "Plain-English summary of how your website, Google search presence, and customer inquiries performed this period.",
  },
  performanceStory: {
    label: "Website & Search Story",
    tooltip:
      "Quick explanation of how shoppers found your website on Google and interacted with your pages.",
  },
  keywordStory: {
    label: "What Customers Are Searching For",
    tooltip:
      "Summary of the main search terms buyers typed into Google to find your business.",
  },
  opportunityCard: {
    tooltip:
      "Click to open why this growth move matters for bringing in more customers and view the supporting numbers.",
  },
  localMapStory: {
    label: "Neighborhood Map Summary",
    tooltip:
      "Plain-English takeaway on where your business shows up first on Google Maps and where visibility can expand.",
  },
  paidAdsStory: {
    label: "Paid Ads Summary",
    tooltip:
      "Quick overview of how your Google Ads budget turned into website visits and customer inquiries.",
  },
} as const;

const OWNER_SECTION_HEADING_MAP: Record<string, OwnerReportCopyEntry> = {
  "performance summary": {
    label: "GA4",
    tooltip:
      "Monthly breakdown of shoppers visiting your website from Google and the actions they took.",
  },
  "website traffic (ga4) by month": {
    label: "GA4",
    tooltip:
      "People who visited your website from unpaid Google searches and the actions they took each month.",
  },
  "website traffic (ga4)": {
    label: "GA4",
    tooltip:
      "People who visited your website from unpaid Google searches and the actions they took.",
  },
  "search visibility (gsc) by month": {
    label: "Google Search Console",
    tooltip:
      "How many times shoppers saw and clicked your website in Google search results each month.",
  },
  "search visibility (gsc)": {
    label: "Google Search Console",
    tooltip:
      "How many times shoppers saw and clicked your website in Google search results.",
  },
  "semrush estimates": {
    label: "Semrush",
    tooltip:
      "Independent estimate of how many Google searches you rank for and what that traffic would cost to buy in ads.",
  },
  "organic visibility (semrush) by month": {
    label: "Semrush",
    tooltip:
      "Monthly estimate of ranked search terms, monthly visitors, and the ad value of your unpaid traffic.",
  },
  "organic visibility (semrush)": {
    label: "Semrush",
    tooltip:
      "Estimate of ranked search terms, monthly visitors, and the ad value of your unpaid traffic.",
  },
  "sample semrush keywords": {
    label: "Top Ranked Search Terms",
    tooltip:
      "High-value search phrases where your website ranks on Google and brings in shoppers.",
  },
  "keyword performance": {
    label: "Keyword Performance",
    tooltip:
      "The exact words and phrases customers typed into Google before clicking through to your website.",
  },
  highlights: {
    label: "Highlights",
    tooltip:
      "Your strongest performance gains and the best opportunities to bring in more customers next.",
  },
  "local map visibility": {
    label: "Local Map Visibility",
    tooltip:
      "How well your business shows up in the Google Maps pack across neighborhoods around your location.",
  },
  "map pack metrics": {
    label: "Neighborhood Map Scorecard",
    tooltip:
      "Summary of your Google Maps rankings across all tested neighborhood points.",
  },
  "google ads": {
    label: "Google Ads",
    tooltip:
      "Results from your paid Google Ads campaigns, including customer inquiries, cost per lead, and ad spend.",
  },
};

const OWNER_METRIC_LABEL_MAP: Record<string, OwnerReportCopyEntry> = {
  "total users": {
    label: "Total Users",
    tooltip: "Total users who first found your website through Organic Search on Google.",
  },
  "new users": {
    label: "New Users",
    tooltip: "First-time users who discovered your website through Organic Search on Google.",
  },
  "user key event rate": {
    label: "User Key Event Rate",
    tooltip: "Percentage of Organic Search users who completed a key event or lead action.",
  },
  sessions: {
    label: "Website Visits",
    tooltip: "Total visits to your website from people finding you on Google.",
  },
  "organic search sessions": {
    label: "Website Visits",
    tooltip: "Total visits to your website from people finding you on Google.",
  },
  "engaged sessions": {
    label: "Quality Visits",
    tooltip:
      "Visits where shoppers stayed attentively, viewed multiple pages, or took a lead action.",
  },
  "engagement rate": {
    label: "Active Visitor %",
    tooltip:
      "Percentage of visitors who actively browsed your pages or contacted you instead of leaving right away.",
  },
  "avg session duration": {
    label: "Time on Site",
    tooltip: "Average time shoppers spent browsing your website during a visit.",
  },
  "key events": {
    label: "Leads & Quote Actions",
    tooltip:
      "Important customer actions on your website, such as quote requests, form submissions, or phone clicks.",
  },
  "key events (organic search sessions)": {
    label: "Leads & Quote Actions",
    tooltip:
      "Important customer actions on your website from Google visitors, such as quote requests or phone calls.",
  },
  "total clicks": {
    label: "Clicks to Your Website",
    tooltip: "How many times shoppers clicked through to your website from Google.",
  },
  "total clicks (gsc)": {
    label: "Clicks to Your Website",
    tooltip: "How many times shoppers clicked through to your website from Google.",
  },
  clicks: {
    label: "Clicks to Your Website",
    tooltip: "How many times shoppers clicked through to your website.",
  },
  "clicks (google ads)": {
    label: "Ad Clicks",
    tooltip: "How many times shoppers clicked on your paid Google Ads.",
  },
  "total impressions": {
    label: "Times Seen on Google",
    tooltip:
      "How many times your business appeared in Google results when customers searched.",
  },
  "total impressions (gsc)": {
    label: "Times Seen on Google",
    tooltip:
      "How many times your business appeared in Google results when customers searched.",
  },
  impressions: {
    label: "Times Seen on Google",
    tooltip:
      "How many times your business appeared in Google results when customers searched.",
  },
  "average ctr": {
    label: "Click-Through %",
    tooltip:
      "Percentage of people who saw your listing on Google and clicked through to your website.",
  },
  "average ctr (gsc)": {
    label: "Click-Through %",
    tooltip:
      "Percentage of people who saw your listing on Google and clicked through to your website.",
  },
  "average position": {
    label: "Average Google Spot",
    tooltip:
      "Your typical ranking spot on Google (lower numbers are closer to #1 at the top of the page).",
  },
  "average position (gsc)": {
    label: "Average Google Spot",
    tooltip:
      "Your typical ranking spot on Google (lower numbers are closer to #1 at the top of the page).",
  },
  "avg. position": {
    label: "Average Google Spot",
    tooltip:
      "Your typical ranking spot on Google (lower numbers are closer to #1 at the top of the page).",
  },
  keywords: {
    label: "Ranked Search Phrases",
    tooltip:
      "Total number of search terms where your website appears in Google results.",
  },
  "est. organic traffic": {
    label: "Est. Monthly Visitors",
    tooltip: "Estimated monthly website visits coming from your Google rankings.",
  },
  "traffic cost": {
    label: "Ad Value of Free Traffic",
    tooltip:
      "What you would have to pay in Google Ads to buy this same amount of website traffic.",
  },
  "branded traffic": {
    label: "People Searching Your Brand",
    tooltip:
      "Shoppers searching specifically for your company name on Google.",
  },
  "branded traffic (semrush est.)": {
    label: "People Searching Your Brand",
    tooltip:
      "Shoppers searching specifically for your company name on Google.",
  },
  "non-branded traffic": {
    label: "People Searching Products",
    tooltip:
      "Shoppers searching for products and services (like custom blinds or window shades) without typing your business name.",
  },
  "non-branded traffic (semrush est.)": {
    label: "People Searching Products",
    tooltip:
      "Shoppers searching for products and services (like custom blinds or window shades) without typing your business name.",
  },
  "tarp (avg map rank)": {
    label: "Overall Map Ranking Score",
    tooltip:
      "Average ranking spot across the entire neighborhood map grid (1.0 means #1 everywhere; lower numbers are better).",
  },
  "average rank (ranked pins)": {
    label: "Avg. Spot Where Found",
    tooltip:
      "Your average Google Maps ranking spot in neighborhoods where your business appears in the top 20.",
  },
  "rank 1 pins": {
    label: "#1 Spot Neighborhoods",
    tooltip:
      "Percentage of neighborhood map points where your business is the #1 result on Google Maps.",
  },
  "top 3 coverage": {
    label: "Top 3 Map Pack Share",
    tooltip:
      "Percentage of neighborhood map points where your business appears in the top 3 Google Maps results customers see first.",
  },
  "outside top 20": {
    label: "Areas With Room to Grow",
    tooltip:
      "Percentage of outlying neighborhood points where your business is not yet in the top 20 map results.",
  },
  leads: {
    label: "Ad Leads & Inquiries",
    tooltip:
      "Customer calls, quote requests, and form inquiries generated by your paid Google Ads.",
  },
  "leads (google ads)": {
    label: "Ad Leads & Inquiries",
    tooltip:
      "Customer calls, quote requests, and form inquiries generated by your paid Google Ads.",
  },
  "cost per lead": {
    label: "Cost Per Lead",
    tooltip: "Average amount of ad budget spent to bring in each customer lead.",
  },
  "cost per lead (google ads)": {
    label: "Cost Per Lead",
    tooltip: "Average amount of ad budget spent to bring in each customer lead.",
  },
  spend: {
    label: "Ad Spend",
    tooltip: "Total amount invested in Google Ads during this period.",
  },
  "spend (google ads)": {
    label: "Ad Spend",
    tooltip: "Total amount invested in Google Ads during this period.",
  },
  query: {
    label: "Customer Search Term",
    tooltip: "The exact words shoppers typed into Google.",
  },
  metric: {
    label: "What We Measure",
    tooltip: "Business performance indicator tracked for this period.",
  },
  change: {
    label: "Change",
    tooltip: "Percentage growth or shift compared to the earlier period.",
  },
  value: {
    label: "Result",
    tooltip: "Performance total or average for this period.",
  },
  month: {
    label: "Month",
    tooltip: "Calendar month in the reporting window.",
  },
  total: {
    label: "Period Total",
    tooltip: "Combined total or average across the full reporting window.",
  },
};

function normalizeLookupKey(raw: string): string {
  return normalizeClientReportText(raw).toLowerCase();
}

/** Maps technical section/table headings to owner-friendly labels. */
export function formatOwnerReportHeading(raw: string): string {
  const entry = OWNER_SECTION_HEADING_MAP[normalizeLookupKey(raw)];
  return entry ? entry.label : toExportTitleCase(raw);
}

/** Returns hover tooltip text for a section or table heading when defined. */
export function getOwnerReportHeadingTooltip(raw: string): string | undefined {
  return OWNER_SECTION_HEADING_MAP[normalizeLookupKey(raw)]?.tooltip;
}

/** Maps technical metric labels (GA4, GSC, Semrush, Map, Ads) to plain owner language. */
export function formatOwnerReportMetricLabel(raw: string): string {
  const key = normalizeLookupKey(raw);
  const direct = OWNER_METRIC_LABEL_MAP[key];
  if (direct) return direct.label;
  const stripped = key.replace(/\s*\((?:gsc|ga4|google ads|semrush est\.)\)\s*$/i, "").trim();
  const fallback = OWNER_METRIC_LABEL_MAP[stripped];
  if (fallback) return fallback.label;
  return toExportTitleCase(raw);
}

/** Returns plain-English tooltip explanation for a metric label when defined. */
export function getOwnerReportMetricTooltip(raw: string): string | undefined {
  const key = normalizeLookupKey(raw);
  const direct = OWNER_METRIC_LABEL_MAP[key];
  if (direct) return direct.tooltip;
  const stripped = key.replace(/\s*\((?:gsc|ga4|google ads|semrush est\.)\)\s*$/i, "").trim();
  return OWNER_METRIC_LABEL_MAP[stripped]?.tooltip;
}

