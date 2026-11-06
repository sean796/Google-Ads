import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import {
  appendMasterInstructionsToSystemPrompt,
  buildSapMasterRulesWorkflowPrefix,
  ensureMasterInstructionsInMemory,
} from "@/lib/master-instructions-storage";
import { BULK_WORDPRESS_POST_TITLE_RULE } from "@/lib/prompt-builders/title-rules";
import { entityTypeFocusWantsNeighbourhoods } from "@/lib/entity-geographic-level";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import { collapseRepeatedPlaceSegmentsInKeyword, serviceKeywordForSapTitle } from "@/lib/local-analysis/entity-sap-row-keyword-fill";
import { buildSapSlugFromKeywordEntity } from "@/lib/sap-slug-from-keyword-entity";
import {
  limitServiceWords,
  SAP_TITLE_MAX_CHARS,
  shortPlaceLabelForSapTitle,
  stripTradingNameFromPhrase,
  truncateAtWordBoundary,
  formatSapHeadlineTitleCase,
} from "@/lib/sap-brand-and-brevity";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { extractFirstBalancedJsonValue } from "@/lib/competitor-research/competitor-report-json-parse";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import {
  collectBlockedForEntity,
  type EntitySapOccupancy,
} from "@/lib/local-analysis/entity-sap-inventory-collision";
import {
  DEFAULT_ENTITY_TITLE_TEMPLATE,
  resolveEntitySapTitleFromTemplate,
} from "@/lib/local-analysis/entity-sap-title-validation";

const SAP_TITLE_AGENT_SYSTEM = `You are a **local SEO title agent** for **transactional service-area (SAP) landing pages** — product/service pages for customers ready to buy or book, **not** blog posts.

Output **only** valid JSON: {"titles":["..."]} with **exactly one** title per input row in \`rows[]\`, same order.

**Grid constraint (mandatory):** Each title must use a place consistent with \`gridLocations\` (parsed cities from the grid CSV). Forbidden: provinces, states, or cities not in those locations.

Each input row has:
- \`keyword\` — **service-only** focus phrase (product/service words; **no** city or neighbourhood — place is in \`entity\`)
- \`entity\` — neighbourhood or district place label
- \`path\` — URL path context only

When \`titleTemplate\` is provided, weave the service \`keyword\` and \`entity\` place with **Near**, **in**, or **for**. Craft natural Title Case headlines — do **not** repeat place tokens already in \`entity\` inside the service phrase.

**Title rules (per row):**
- One natural **commercial SAP headline**: product or service offer + place (not the connected site's company name).
- **Forbidden:** blog angles (guides, levels, opacity, comparisons, competitors, how-to, educational framing).
- **Forbidden:** leading with or centering the connected site's own trading name (fuzzy / word-reorder: "Blind Magic" ↔ "Magic Blinds"). Product-line brands the dealer sells (Hunter Douglas, Alta) are allowed when they fit the keyword. Use product/service wording for generic rows.
- Include the **entity** place label in the headline.
- Place in the title must reflect the **neighbourhood, district, or landmark** from \`entity\` — not a numbered street, avenue, or route token.
- **Forbidden in titles:** civic numbers, patterns like \`2 St\`, \`130 Ave NW\`, or bare address fragments. When \`entity\` names a community or landmark, use that label; do not substitute a street from \`gridLocations\`.
- **Do not** repeat the city when the neighbourhood or district name already contains it (e.g. \`West Edmonton, AB\` not \`West Edmonton, Edmonton, AB\`).
- Connect service and place with **"Near"**, **"in"**, or **"for"** (prefer the connector shown in \`titleTemplate\` when provided).
- **Forbidden:** colons, pipe suffixes, brand/site name, em dash, duplicating the keyword then repeating it after a colon.
- Vary phrasing across rows in the batch.
- **Length (mandatory):** One short headline, **at most ${SAP_TITLE_MAX_CHARS} characters** total. Use a **2–4 word** service phrase plus a compact place label. Forbidden: long keyword dumps, full landmark addresses, or repeating every word from the focus keyword.
- **Compact place:** Prefer neighbourhood or landmark plus city only (drop province codes from the visible title when the city is already named).

${BULK_WORDPRESS_POST_TITLE_RULE}`;

type TitleAgentResponse = {
  titles?: unknown;
};

type TitleFillRow = {
  keyword: string;
  entity: string;
  path: string;
  blockedTitles?: string[];
};

function titlesFromOpenRouterContent(raw: string): string[] {
  const parseTitles = (text: string): string[] => {
    try {
      const parsed = JSON.parse(text) as TitleAgentResponse;
      if (!Array.isArray(parsed.titles)) return [];
      return parsed.titles.map((t) => String(t ?? "").trim());
    } catch {
      return [];
    }
  };
  const trimmed = raw.trim();
  let titles = parseTitles(trimmed);
  if (titles.length === 0 && trimmed) {
    const sub = extractFirstBalancedJsonValue(trimmed);
    if (sub) titles = parseTitles(sub);
  }
  return titles;
}

function sapRowPath(row: CSVRow): string {
  const slug =
    row.target_slug?.trim() || buildSapSlugFromKeywordEntity(row.keyword, row.entity ?? "");
  return slug ? `/${slug}/` : "";
}

function buildTitleFillPayload(
  rows: CSVRow[],
  siteName: string,
  sapOccupancy?: EntitySapOccupancy,
): TitleFillRow[] {
  return rows.map((row) => {
    const entity = normalizeEntityHintCommaLabel(row.entity ?? "");
    const blocked =
      sapOccupancy && entity ? collectBlockedForEntity(sapOccupancy, entity).titles : [];
    let keyword = serviceKeywordForSapTitle((row.keyword ?? "").trim(), entity);
    if (siteName.trim()) {
      keyword = stripTradingNameFromPhrase(keyword, siteName) || keyword;
    }
    keyword = limitServiceWords(keyword, 4);
    return {
      keyword,
      entity: shortPlaceLabelForSapTitle(entity) || entity,
      path: sapRowPath(row),
      ...(blocked.length > 0 ? { blockedTitles: blocked } : {}),
    };
  });
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


export async function fetchTitlesBatch(
  apiKey: string,
  model: string,
  siteId: string | undefined,
  siteName: string,
  rows: CSVRow[],
  gridLocations: string[],
  entityTypeFocus: string[] | undefined,
  titleTemplate: string | undefined,
  sapOccupancy: EntitySapOccupancy | undefined,
): Promise<string[]> {
  if (rows.length === 0) return [];
  await ensureMasterInstructionsInMemory(siteId);
  const payload = buildTitleFillPayload(rows, siteName, sapOccupancy);
  const neighbourhoodRule = entityTypeFocusWantsNeighbourhoods(entityTypeFocus)
    ? " Entity focus is neighbourhoods only — never use street names in any title."
    : "";
  const hasBlockedTitles = payload.some((p) => (p.blockedTitles?.length ?? 0) > 0);
  const blockedTitleRule = hasBlockedTitles
    ? " Each row may include blockedTitles: do not reuse any blocked title string for that row's entity (case-insensitive)."
    : "";
  const systemForModel = appendMasterInstructionsToSystemPrompt(
    `${buildSapMasterRulesWorkflowPrefix(siteId ?? null)}${SAP_TITLE_AGENT_SYSTEM}${neighbourhoodRule}${blockedTitleRule}`,
    siteId ?? null,
  );

  const templateRule = titleTemplate?.trim()
    ? `Each title must follow the structural pattern: ${titleTemplate.trim()} — keyword + place connected with Near, in, or for. No colons.`
    : undefined;

  const response = await postOpenRouterAppChatFetch( {
    method: "POST",
    headers: openRouterWebAppHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemForModel },
        {
          role: "user",
          content: JSON.stringify({
            siteName,
            rows: payload,
            gridLocations,
            titleTemplate: titleTemplate?.trim() || DEFAULT_ENTITY_TITLE_TEMPLATE,
            titlePatternRule: templateRule,
            titleBan: `Never put "${siteName}" or any trading-name token from it (including acronyms like KWB or LLP) in any title. Max ${SAP_TITLE_MAX_CHARS} characters per title.`,
          }),
        },
      ],
      temperature: 0.35,
      max_tokens: Math.min(16384, Math.max(2048, rows.length * 160)),
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `Title agent failed (${response.status})${errText ? `: ${errText.slice(0, 200)}` : ""}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  const template = titleTemplate?.trim() || DEFAULT_ENTITY_TITLE_TEMPLATE;
  const titles = titlesFromOpenRouterContent(raw).map((t) =>
    truncateAtWordBoundary(
      formatSapHeadlineTitleCase(collapseRepeatedPlaceSegmentsInKeyword(t)),
      SAP_TITLE_MAX_CHARS,
    ),
  );
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    let title = titles[i]?.trim() ?? "";
    if (!title) {
      title = resolveEntitySapTitleFromTemplate(
        row.keyword ?? "",
        row.entity ?? "",
        template,
        siteName,
      );
    }
    titles[i] = title;
  }
  return titles.slice(0, rows.length);
}

