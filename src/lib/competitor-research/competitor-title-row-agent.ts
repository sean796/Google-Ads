import { callOpenRouterJsonObject } from "@/lib/competitor-research/competitor-openrouter-json-object";
import { sanitizeSapPageTitle } from "@/lib/sap-title-pipe-brand";
import type { CompetitorComparisonResult, ConnectedSiteProfile } from "@/lib/competitor-research/types";
import { buildModifierFromComparison } from "@/lib/competitor-research/compare-competitor-agent";

const TITLE_SYSTEM = `You are a dynamic title agent for local SEO comparison pages on the CONNECTED site (pageForSite).

The page sells and represents pageForSite first. competitorEntity is only a reference to compare against, not a solution you are promoting.

Output ONLY valid JSON: {"title":"..."}

Title rules (mandatory):
- Lead with pageForSite (name or clear "our/your local" framing tied to pageForSite) before competitorEntity appears in the title
- Include the focus keyword naturally
- Mention competitorEntity once, after pageForSite, as something to weigh or compare (e.g. "how X compares to Y" with pageForSite as X)
- Prefer framing like "what pageForSite offers" or "choosing keyword with pageForSite" then a short compare clause for competitorEntity
- NEVER lead with "What competitorEntity offers" or put the competitor before pageForSite in the title
- NEVER sound like the competitor's homepage or ad
- Tone: calm, helpful, editorial. pageForSite is the host brand; competitor is context only. No "best", "#1", "better than", "beats", or trash talk
- Forbidden: pipe titles that mirror competitor ads (e.g. "Service in City | Competitor Name")
- No em dash characters
- One line, roughly 8 to 14 words when possible

Use comparisonBrief and positioningNotes for angle (consultation, install, warranty, local service). Vary structure; do not reuse one template every row.`;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const COMPARISON_CUE =
  /\b(compare|comparing|versus|vs\.?|choosing|options|what to know|how .+ stacks|before you choose|side by side|evaluate|weigh|difference|differences|worth knowing)\b/i;

/** Returns a human-readable rejection reason, or null if the title fits comparison-page intent. */
export function validateCompetitorComparisonTitle(
  title: string,
  args: { keyword: string; entity: string; connectedSiteName: string },
): string | null {
  const t = title.trim();
  if (!t) return "Empty title";

  const kw = args.keyword.trim();
  if (kw && !new RegExp(escapeRegex(kw), "i").test(t)) {
    return "Title must include the focus keyword";
  }

  const pipeIdx = t.indexOf(" | ");
  if (pipeIdx > 0) {
    const after = t.slice(pipeIdx + 3).trim().toLowerCase();
    const entityLower = args.entity.trim().toLowerCase();
    if (
      entityLower.length > 2 &&
      (after === entityLower || after.startsWith(entityLower.slice(0, Math.min(14, entityLower.length))))
    ) {
      return "Title looks like a competitor homepage headline (pipe + competitor name), not a comparison page for your site";
    }
  }

  const connected = args.connectedSiteName.trim();
  const hasCue = COMPARISON_CUE.test(t);
  const mentionsConnected =
    connected.length > 2 && new RegExp(escapeRegex(connected), "i").test(t);
  if (!hasCue && !mentionsConnected) {
    return "Title should subtly frame a comparison (choosing, options, compare) or reference the connected site";
  }

  if (/\b(best|#1|better than|superior to|beats|outperforms)\b/i.test(t)) {
    return "Title must not use aggressive superiority claims";
  }

  const entity = args.entity.trim();
  const entityLower = entity.toLowerCase();
  if (entity.length > 2 && entityLower.length > 2) {
    const whatOffers = t.match(/\bwhat\s+(.+?)\s+offers\b/i);
    if (whatOffers) {
      const subject = whatOffers[1].trim().toLowerCase();
      const connectedLower = connected.toLowerCase();
      if (subject.includes(entityLower) && !subject.includes(connectedLower)) {
        return "Title must not lead with what the competitor offers; lead with the connected site";
      }
    }

    if (connected.length > 2) {
      const tLower = t.toLowerCase();
      const connIdx = tLower.indexOf(connected.toLowerCase());
      const entIdx = tLower.indexOf(entityLower);
      if (connIdx >= 0 && entIdx >= 0 && entIdx < connIdx) {
        return "Title must name the connected site before the competitor";
      }
    }
  }

  return null;
}

export function applyCompetitorTitleFormat(
  format: string,
  args: { keyword: string; entity: string; connectedSiteName: string },
): string {
  const keyword = args.keyword.trim();
  const entity = args.entity.trim();
  const connectedSite = args.connectedSiteName.trim();
  return format
    .replace(/\{entity\}/g, entity)
    .replace(/\{keyword\}/g, keyword)
    .replace(/\{connectedSite\}/g, connectedSite)
    .trim();
}

export function suggestCompetitorTitleFormat(keyword: string, connectedSiteName: string): string {
  const trimmed = keyword.trim();
  const site = connectedSiteName.trim();
  if (!trimmed) {
    throw new Error("Keyword is required for competitor title format.");
  }
  if (!site) {
    throw new Error("Connected site name is required for competitor title format.");
  }
  return `Choosing {keyword}: what {connectedSite} offers and how {entity} compares locally`;
}

async function callTitleAgent(args: {
  apiKey: string;
  model: string;
  system: string;
  userPayload: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<string> {
  const parsedRaw = await callOpenRouterJsonObject({
    apiKey: args.apiKey,
    model: args.model,
    system: args.system,
    user: JSON.stringify(args.userPayload),
    maxTokens: 1024,
    temperature: 0.35,
    signal: args.signal,
    allowEmptyOnFailure: true,
  });
  const parsed = (parsedRaw ?? {}) as { title?: unknown };
  return sanitizeSapPageTitle(String(parsed.title ?? "").trim(), String(args.userPayload.pageForSite ?? ""));
}

export async function runCompetitorTitleRowAgent(args: {
  apiKey: string;
  model: string;
  keyword: string;
  entity: string;
  connected: ConnectedSiteProfile;
  comparison: CompetitorComparisonResult;
  suggestedTitleFormat?: string;
  signal?: AbortSignal;
}): Promise<{ title: string; modifier: string }> {
  const keyword = args.keyword.trim();
  if (!keyword) {
    throw new Error("Keyword is required for competitor title row.");
  }

  const comparisonBrief = buildModifierFromComparison(args.comparison);
  const connectedSiteName = args.connected.siteName.trim();
  const format =
    args.suggestedTitleFormat?.trim() ||
    suggestCompetitorTitleFormat(keyword, connectedSiteName);
  const formattedTitle = sanitizeSapPageTitle(
    applyCompetitorTitleFormat(format, {
      keyword,
      entity: args.entity,
      connectedSiteName,
    }),
    connectedSiteName,
  );

  const basePayload = {
    pageForSite: connectedSiteName,
    keyword,
    competitorEntity: args.entity,
    comparisonBrief,
    positioningNotes: args.comparison.positioningNotes.trim() || undefined,
    suggestedPatterns: [
      "Choosing {keyword}: what {pageForSite} offers and how {competitorEntity} compares",
      "{pageForSite} and local {keyword}: weighing {competitorEntity} as an option",
      "{keyword} with {pageForSite}: what to know before comparing {competitorEntity}",
    ],
  };

  let agentTitle = await callTitleAgent({
    apiKey: args.apiKey,
    model: args.model,
    system: TITLE_SYSTEM,
    userPayload: basePayload,
    signal: args.signal,
  });

  let validationError = validateCompetitorComparisonTitle(agentTitle, {
    keyword,
    entity: args.entity,
    connectedSiteName,
  });

  if (validationError) {
    agentTitle = await callTitleAgent({
      apiKey: args.apiKey,
      model: args.model,
      system: TITLE_SYSTEM,
      userPayload: {
        ...basePayload,
        repair: {
          rejectedTitle: agentTitle,
          error: validationError,
        },
      },
      signal: args.signal,
    });
    validationError = validateCompetitorComparisonTitle(agentTitle, {
      keyword,
      entity: args.entity,
      connectedSiteName,
    });
  }

  const title =
    !validationError && agentTitle
      ? agentTitle
      : formattedTitle || agentTitle;

  const finalError = validateCompetitorComparisonTitle(title, {
    keyword,
    entity: args.entity,
    connectedSiteName,
  });
  if (finalError || !title) {
    throw new Error(finalError || "Title agent returned an empty title.");
  }

  return { title, modifier: comparisonBrief };
}
