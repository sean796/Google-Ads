import {
  cleanTakeawayBulletText,
  deckNarrativeText,
  plainDeckText,
  splitDeckSentences,
} from "@/lib/organic-dashboard/organic-client-report-deck-text";
import type {
  DeckOpportunityComparisonRow,
  SanitizedDeckOpportunity,
} from "@/lib/organic-dashboard/organic-client-report-deck-opportunity";

export function sanitizeDeckOpportunity(row: {
  rank: number;
  label: string;
  why: string;
  comparisonRows?: DeckOpportunityComparisonRow[];
  metrics?: string;
  action?: string;
  evidence?: string[];
}): SanitizedDeckOpportunity {
  return {
    rank: row.rank,
    label: stripNonExistentOmissionClauses(plainDeckText(row.label)),
    why: stripNonExistentOmissionClauses(deckNarrativeText(row.why)),
    comparisonRows: row.comparisonRows ?? [],
    metrics: stripNonExistentOmissionClauses(plainDeckText(row.metrics ?? "")),
    action: stripNonExistentOmissionClauses(plainDeckText(row.action ?? "")),
    evidence: row.evidence
      ?.map((e) => stripNonExistentOmissionClauses(plainDeckText(e)))
      .filter((e) => Boolean(e) && !isNonExistentSectionOmissionStatement(e)),
  };
}

/**
 * Strips negative disclaimers / preamble clauses that report on things that do not exist,
 * such as absent comparison periods, missing key events, or zero conversions, while
 * preserving the valuable business insights that follow.
 *
 * Example:
 * "With no comparison period and no key events, the immediate opportunity for KWB lies in converting..."
 * -> "The immediate opportunity for KWB lies in converting..."
 */
export function stripNonExistentOmissionClauses(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  let text = raw.trim();
  if (!text) return "";

  if (isNonExistentSectionOmissionStatement(text)) {
    return "";
  }

  // 1. Starting preamble clauses about missing comparison period and/or missing key events/conversions
  const leadingPatterns = [
    // "With no comparison period and no key events, " / "Without a comparison period or conversions, "
    /^(?:with\s+)?(?:no|without(?:\s+a)?)\s+(?:comparison|prior|baseline|previous)\s+period(?:s)?(?:\s+(?:and|or|,)\s+(?:with\s+)?(?:no|zero|0)\s+(?:key\s+events?|conversions?))?,?\s*/i,
    // "With no key events and no comparison period, " / "Without key events or comparison period, "
    /^(?:with\s+)?(?:no|without(?:\s+a)?)\s+(?:key\s+events?|conversions?)(?:\s+(?:and|or|,)\s+(?:with\s+)?(?:no|zero|0)\s+(?:comparison|prior|baseline|previous)\s+period(?:s)?)?,?\s*/i,
    // "In the absence of a comparison period, " / "Given the lack of key events, "
    /^(?:in\s+the\s+absence\s+of|given\s+the\s+lack\s+of|since\s+there\s+is\s+no|as\s+there\s+is\s+no)\s+(?:(?:a\s+)?(?:comparison|prior|baseline|previous)\s+period(?:s)?|(?:key\s+events?|conversions?))[^,]*?,?\s*/i,
    // "Without a comparison period, " / "With no comparison period, "
    /^(?:without\s+a\s+comparison\s+period|with\s+no\s+comparison\s+period),?\s*/i,
    // "With no key events, " / "Without key events recorded, "
    /^(?:without\s+(?:key\s+events?|conversions?)(?:\s+recorded)?|with\s+no\s+(?:key\s+events?|conversions?)),?\s*/i,
  ];

  for (const pat of leadingPatterns) {
    if (pat.test(text)) {
      text = text.replace(pat, "").trim();
      break;
    }
  }

  // 2. Trailing/appended omission clauses (e.g. ", while recording no key events", ", with no key events reported")
  const trailingPatterns = [
    /,?\s*(?:while|and|although|despite)?\s*(?:recording|registering|tracking|logging|reporting|having)\s+(?:no|zero|0)\s+(?:key\s+events?|conversions?)[^.!?]*(?=[.!?]|$)/i,
    /,?\s*(?:while|and|although)\s+no\s+(?:key\s+events?|conversions?)\s+(?:were|are|have\s+been)\s+(?:recorded|tracked|registered|reported)[^.!?]*(?=[.!?]|$)/i,
    /,?\s*(?:with|having)\s+(?:no|zero|0)\s+(?:key\s+events?|conversions?)[^.!?]*(?=[.!?]|$)/i,
    /,?\s*(?:with|as\s+there\s+is|since\s+there\s+is)\s+no\s+(?:comparison|prior|baseline)\s+period[^.!?]*(?=[.!?]|$)/i,
    /,?\s*with\s+zero\s+(?:key\s+events?|conversions?)[^.!?]*(?=[.!?]|$)/i,
  ];

  for (const pat of trailingPatterns) {
    if (pat.test(text)) {
      text = text.replace(pat, "").trim();
    }
  }

  // 3. Clean up formatting
  text = text.replace(/^[,;:\s]+/, "").trim();
  text = text.replace(/[,;:\s]+(?=[.!?]|$)/, "").trim();

  // If text starts with lowercase letter after clause stripping, capitalize it
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  if (isNonExistentSectionOmissionStatement(text)) {
    return "";
  }

  return text;
}

/**
 * Detects negative disclaimer sentences stating that a channel, section, comparison period,
 * or metric (such as key events/conversions) has no data, was not reported, is omitted,
 * or is unavailable.
 * Reports should only focus on sections and data that exist.
 */
export function isNonExistentSectionOmissionStatement(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  if (!t) return false;

  const brandedSemrushAbsence =
    /\bno\s+branded\s+search\s+totals?\s+(?:were|are|was)\s+available\b/i.test(t) ||
    /\bbranded\s+demand\s+cannot\s+be\s+(?:confirmed|verified|measured)\b/i.test(t) ||
    /\bcannot\s+be\s+confirmed\s+from\s+semrush\b/i.test(t) ||
    (/\bsemrush\b/i.test(t) &&
      /\b(?:not|no|cannot|can't)\s+[^.]{0,140}(?:available|confirmed|verified|alone)\b/i.test(t));
  if (brandedSemrushAbsence) {
    return true;
  }

  // 1. Channel omission statements (Google Ads, Semrush, Local Map, etc.)
  const channel =
    /(?:google\s+ads|paid\s+search|semrush|local\s+grid|local\s+map|map\s+pack|local\s+falcon|tarp)/i;
  if (channel.test(t)) {
    const noChannelPattern =
      /\bno\s+(?:google\s+ads|paid\s+search|semrush|local\s+grid|local\s+map|map\s+pack|local\s+falcon|data\s+for\s+google\s+ads)[^.]*?(?:available|reported|recorded|supplied|provided|found|configured|tracked|data|figures?|totals?|metrics?|results?|included|active|inquiries|leads)/i;

    const channelNegativePattern =
      /\b(?:google\s+ads|paid\s+search|semrush|local\s+grid|local\s+map|map\s+pack|local\s+falcon)[^.]*?(?:(?:(?:is|was|are|were|has\s+been)\s+)?(?:omitted|unavailable|not\s+configured|not\s+available|not\s+connected|not\s+reported|not\s+tracked|not\s+supplied|not\s+provided|not\s+active|excluded)|returned\s+no\s+data|contained\s+no|is\s+omitted|omitted\s+from\s+this\s+report|was\s+not\s+recorded|were\s+not\s+recorded)/i;

    const omittedPattern =
      /(?:omitted\s+from\s+this\s+report|(?:not|no)\s+(?:data|metrics|figures|totals)\s+(?:are|is|were|was)?\s*(?:available|reported|found|supplied|provided)\s+for\s+(?:google\s+ads|paid\s+search|semrush|local\s+map|local\s+grid))/i;

    if (noChannelPattern.test(t) || channelNegativePattern.test(t) || omittedPattern.test(t)) {
      return true;
    }
  }

  // 2. Comparison period omission statements
  const comparisonOmission =
    /\b(?:no|without(?:\s+a)?)\s+(?:comparison|prior|baseline|historical)\s+(?:period|data)(?:s)?\s+(?:is|was|are|were)?\s*(?:available|provided|selected|recorded|tracked|configured|present|included|exists?)\b/i;
  const comparisonUnavailable =
    /\b(?:comparison|prior|baseline)\s+period\s+(?:is|was)\s+(?:not\s+available|unavailable|omitted|missing|not\s+provided)\b/i;
  const standaloneNoCompare =
    /^(?:with\s+no|without\s+a)\s+(?:comparison|prior|baseline)\s+period(?:,?\s*(?:trend|period-over-period|growth|comparison)[^.]*?)?[.!?]?$/i;

  if (
    comparisonOmission.test(t) ||
    comparisonUnavailable.test(t) ||
    standaloneNoCompare.test(t)
  ) {
    return true;
  }

  // 3. Key events / Conversions omission statements (disclaimers about 0 or unrecorded conversions)
  const noKeyEventsRecorded =
    /\bno\s+(?:key\s+events?|conversions?)\s+(?:were|are|have\s+been)\s+(?:recorded|tracked|registered|reported|logged)\b/i;
  const keyEventsZero =
    /\b(?:key\s+events?|conversions?)(?:\s+attributed\s+to[^,.]*?)?\s+(?:registered\s+at\s+zero|were\s+zero|at\s+zero|were\s+not\s+(?:recorded|tracked))\b/i;
  const noConversionsTracked =
    /\bno\s+conversions\s+(?:were|are)\s+tracked\b/i;
  const conversionTrackingAttention =
    /\bconversion\s+tracking\s+(?:or\s+landing\s+page\s+alignment\s+)?may\s+need\s+attention\b/i;
  const conversionTrackingInactive =
    /\b(?:conversion\s+tracking|key\s+event\s+tracking)\s+(?:is|was)\s+(?:not\s+configured|not\s+set\s+up|inactive|missing)\b/i;
  const recordedNoKeyEvents =
    /\b(?:recorded|registered|tracked|had)\s+(?:no|zero|0)\s+(?:key\s+events?|conversions?)\b/i;

  if (
    noKeyEventsRecorded.test(t) ||
    keyEventsZero.test(t) ||
    noConversionsTracked.test(t) ||
    conversionTrackingAttention.test(t) ||
    conversionTrackingInactive.test(t) ||
    recordedNoKeyEvents.test(t)
  ) {
    return true;
  }

  return false;
}

export type SectionExistenceFilterOptions = {
  siteName?: string;
  hasGoogleAds?: boolean;
  hasSemrush?: boolean;
  hasLocalGrid?: boolean;
};

/** Filters out negative omission disclaimers as well as references to channels that do not exist in the report. */
export function filterHighlightsTakeaways(
  takeaways: string[],
  options?: SectionExistenceFilterOptions,
): string[] {
  return takeaways
    .map((line) => {
      if (typeof line !== "string") return "";
      const cleaned = cleanTakeawayBulletText(line);
      return stripNonExistentOmissionClauses(cleaned);
    })
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (isNonExistentSectionOmissionStatement(t)) return false;

      if (options?.hasGoogleAds === false && /(?:google\s+ads|paid\s+search)/i.test(t)) {
        return false;
      }
      if (options?.hasSemrush === false && /semrush/i.test(t)) {
        return false;
      }
      if (
        options?.hasLocalGrid === false &&
        /(?:local\s+grid|local\s+map|map\s+pack|local\s+falcon|tarp)/i.test(t)
      ) {
        return false;
      }
      return true;
    });
}

/** Cleans executive summary text by stripping negative disclaimers and non-existent section references. */
export function sanitizeExecutiveSummaryText(
  summary: string,
  options?: SectionExistenceFilterOptions,
): string {
  const cleaned = plainDeckText(summary);
  if (!cleaned) return "";

  const sentences = splitDeckSentences(cleaned);
  const remaining = sentences
    .map((sentence) => stripNonExistentOmissionClauses(sentence))
    .filter((sentence) => {
      const s = sentence.trim();
      if (!s) return false;
      if (isNonExistentSectionOmissionStatement(s)) return false;
      if (options?.hasGoogleAds === false && /(?:google\s+ads|paid\s+search)/i.test(s)) {
        return false;
      }
      if (options?.hasSemrush === false && /semrush/i.test(s)) {
        return false;
      }
      if (
        options?.hasLocalGrid === false &&
        /(?:local\s+grid|local\s+map|map\s+pack|local\s+falcon|tarp)/i.test(s)
      ) {
        return false;
      }
      return true;
    });

  if (remaining.length > 0) {
    return remaining.join(" ");
  }

  const name = options?.siteName?.trim() || "Organic";
  return `${name} search performance summary across active channels.`;
}

/** Split legacy single-block executive copy into headline + bullets for deck hero. */
export function deriveKeyTakeawaysFromSummary(summary: string): {
  headline: string;
  takeaways: string[];
} {
  const cleaned = plainDeckText(summary);
  if (!cleaned) {
    return {
      headline: "Organic performance summary",
      takeaways: [
        "Website traffic and search visibility metrics are in the performance summary below.",
        "Traffic figures use GA4; search visibility uses Google Search Console.",
      ],
    };
  }
  const sentences = splitDeckSentences(cleaned)
    .map((s) => cleanTakeawayBulletText(stripNonExistentOmissionClauses(s)))
    .filter((s) => s.length > 0 && !isNonExistentSectionOmissionStatement(s));
  if (sentences.length >= 3) {
    return { headline: sentences[0]!, takeaways: sentences.slice(1, 5) };
  }
  if (sentences.length === 2) {
    return { headline: sentences[0]!, takeaways: [sentences[1]!] };
  }
  if (sentences.length === 1) {
    return {
      headline: sentences[0]!,
      takeaways: [
        "See the performance summary below for website traffic and search visibility details.",
        "Opportunity cards highlight queries and themes worth acting on next.",
      ],
    };
  }
  return {
    headline: "Organic performance summary",
    takeaways: [
      "See the performance summary below for website traffic and search visibility changes.",
      "Opportunity cards highlight queries and themes worth acting on next.",
    ],
  };
}
