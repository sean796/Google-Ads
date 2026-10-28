import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { replaceTemplateVariables } from "@/components/integrations/entity-generation/csv/csvGenerator";
import {
  appendMasterInstructionsToSystemPrompt,
  buildSapMasterRulesWorkflowPrefix,
  ensureMasterInstructionsInMemory,
} from "@/lib/master-instructions-storage";
import { BULK_WORDPRESS_POST_TITLE_RULE } from "@/lib/prompt-builders/title-rules";
import { entityTypeFocusWantsNeighbourhoods } from "@/lib/entity-geographic-level";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import { aiRejectBrandOrBlockedTexts } from "@/lib/content-brand-ai-gate";
import { collapseRepeatedPlaceSegmentsInKeyword, serviceKeywordForSapTitle } from "@/lib/local-analysis/entity-sap-row-keyword-fill";
import { buildSapSlugFromKeywordEntity } from "@/lib/sap-slug-from-keyword-entity";
import {
  limitServiceWords,
  SAP_TITLE_MAX_CHARS,
  shortPlaceLabelForSapTitle,
  stripTradingNameFromPhrase,
  tradingNameAppearsInText,
  truncateAtWordBoundary,
  formatSapHeadlineTitleCase,
} from "@/lib/sap-brand-and-brevity";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { extractFirstBalancedJsonValue } from "@/lib/competitor-research/competitor-report-json-parse";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import {
  collectBlockedForEntity,
  titleCollidesWithEntityInventory,
  type EntitySapOccupancy,
} from "@/lib/local-analysis/entity-sap-inventory-collision";

const DEFAULT_ENTITY_TITLE_TEMPLATE = "{keyword} Near {entity}";

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

export type FillSapRowTitlesOptions = {
  apiKey: string;
  model: string;
  siteId?: string;
  siteName: string;
  gridLocations: string[];
  entityTypeFocus?: string[];
  /** Structural pattern e.g. "{keyword} Near {entity}". */
  titleTemplate?: string;
  /** When true, rewrite all rows even if title is already set. */
  forceRewrite?: boolean;
  sapOccupancy?: EntitySapOccupancy;
  onProgress?: (done: number, total: number) => void;
  onRowsUpdate?: (rows: CSVRow[]) => void;
};

/** @deprecated Use {@link fillSapRowTitlesFromOpenRouter} */
export type EntitySapTitleAgentOptions = FillSapRowTitlesOptions;

type TitleAgentResponse = {
  titles?: unknown;
};

type TitleFillRow = {
  keyword: string;
  entity: string;
  path: string;
  blockedTitles?: string[];
};

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordTokens(keyword: string): string[] {
  return normalizeForMatch(keyword)
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function entityRepresentedInTitle(title: string, entity: string): boolean {
  const normTitle = normalizeForMatch(title);
  const segments = entity
    .split(",")
    .map((s) => normalizeForMatch(s))
    .filter(Boolean);
  if (segments.length === 0) return normTitle.length > 0;
  const primary = segments[0]!;
  if (primary && normTitle.includes(primary)) return true;
  return segments.some((seg) => seg.length > 2 && normTitle.includes(seg));
}

/** Validates agent-crafted SAP titles before upload. */
export function isValidEntitySapTitle(
  title: string,
  keyword: string,
  entity: string,
  siteName?: string,
): boolean {
  const t = title.trim();
  if (!t) return false;
  if (t.length > SAP_TITLE_MAX_CHARS) return false;
  if (siteName?.trim() && tradingNameAppearsInText(t, siteName)) return false;
  if (t.includes(":")) return false;
  if (!entityRepresentedInTitle(t, entity)) return false;
  const tokens = keywordTokens(keyword);
  if (tokens.length === 0) return true;
  const normTitle = normalizeForMatch(t);
  const matched = tokens.filter((tok) => normTitle.includes(tok)).length;
  return matched >= Math.min(2, tokens.length);
}

/** Deterministic fallback when the title agent fails validation. */
export function resolveEntitySapTitleFromTemplate(
  keyword: string,
  entity: string,
  titleTemplate: string = DEFAULT_ENTITY_TITLE_TEMPLATE,
  siteName?: string,
): string {
  const template = titleTemplate.trim() || DEFAULT_ENTITY_TITLE_TEMPLATE;
  let kw = serviceKeywordForSapTitle(keyword, entity) || "service area";
  if (siteName?.trim()) {
    kw = stripTradingNameFromPhrase(kw, siteName) || kw;
  }
  kw = limitServiceWords(kw, 4);
  const ent = shortPlaceLabelForSapTitle(entity.trim()) || entity.trim();
  const title = formatSapHeadlineTitleCase(replaceTemplateVariables(template, ent, kw).trim());
  return truncateAtWordBoundary(title, SAP_TITLE_MAX_CHARS);
}

/** Final SAP post title: keep valid agent/CSV title or fall back to template. */
export function resolveEntitySapPostTitle(
  keyword: string,
  entity: string,
  existingTitle?: string,
  titleTemplate?: string,
  siteName?: string,
): string {
  const existing = existingTitle?.trim();
  if (
    existing &&
    isValidEntitySapTitle(existing, keyword, entity, siteName) &&
    /(\bnear\b|\bin\b|\bfor\b)/i.test(existing)
  ) {
    return formatSapHeadlineTitleCase(existing);
  }
  return resolveEntitySapTitleFromTemplate(keyword, entity, titleTemplate, siteName);
}

export const DEFAULT_ENTITY_SAP_TITLE_TEMPLATE = DEFAULT_ENTITY_TITLE_TEMPLATE;

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTitlesBatch(
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
  let titles = titlesFromOpenRouterContent(raw).map((t) =>
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

function applyTitlesAtIndices(out: CSVRow[], indices: number[], titles: string[]): void {
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i]!;
    if (idx < 0 || idx >= out.length) continue;
    out[idx] = { ...out[idx]!, title: titles[i] ?? "" };
  }
}

function applyValidatedOrFallbackTitle(
  out: CSVRow[],
  index: number,
  candidateTitle: string,
  titleTemplate: string,
  siteName: string,
): void {
  const row = out[index]!;
  const keyword = (row.keyword ?? "").trim();
  const entity = (row.entity ?? "").trim();
  const serviceKw = serviceKeywordForSapTitle(keyword, entity);
  const cleaned = truncateAtWordBoundary(candidateTitle.trim(), SAP_TITLE_MAX_CHARS);
  const titled = formatSapHeadlineTitleCase(cleaned);
  if (titled && isValidEntitySapTitle(titled, serviceKw || keyword, entity, siteName)) {
    out[index] = { ...row, title: titled };
    return;
  }
  out[index] = {
    ...row,
    title: resolveEntitySapTitleFromTemplate(keyword, entity, titleTemplate, siteName),
  };
}

function applyTemplateFallbackForIndices(
  out: CSVRow[],
  indices: number[],
  titleTemplate: string,
  siteName: string,
): void {
  for (const i of indices) {
    const row = out[i];
    if (!row) continue;
    out[i] = {
      ...row,
      title: resolveEntitySapTitleFromTemplate(
        (row.keyword ?? "").trim(),
        (row.entity ?? "").trim(),
        titleTemplate,
        siteName,
      ),
    };
  }
}

/** One OpenRouter call for all rows: keywords + entities → titles JSON. */
export async function fillSapRowTitlesFromOpenRouter(
  rows: CSVRow[],
  options: FillSapRowTitlesOptions,
): Promise<CSVRow[]> {
  if (rows.length === 0) return rows;
  const apiKey = options.apiKey.trim();
  const model = options.model.trim();
  const siteId = options.siteId;
  const gridLocations = options.gridLocations;
  const entityTypeFocus = options.entityTypeFocus;
  const titleTemplate = options.titleTemplate?.trim() || DEFAULT_ENTITY_TITLE_TEMPLATE;
  const forceRewrite = options.forceRewrite === true || Boolean(options.titleTemplate?.trim());
  const sapOccupancy = options.sapOccupancy;
  const out = rows.map((r) => ({ ...r }));
  const total = out.length;

  const pendingIndices = out
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => forceRewrite || !row.title?.trim())
    .map(({ index }) => index);

  if (pendingIndices.length === 0) {
    options.onProgress?.(total, total);
    return out;
  }

  if (forceRewrite) {
    for (const i of pendingIndices) {
      out[i] = { ...out[i]!, title: "" };
    }
  }

  const pendingRows = pendingIndices.map((i) => out[i]!);
  let attempt = 0;
  const maxAttempts = 5;

  while (pendingIndices.some((i) => !out[i]!.title?.trim()) && attempt < maxAttempts) {
    attempt++;
    try {
      const titles = await fetchTitlesBatch(
        apiKey,
        model,
        siteId,
        options.siteName,
        pendingRows,
        gridLocations,
        entityTypeFocus,
        titleTemplate,
        sapOccupancy,
      );
      for (let j = 0; j < pendingIndices.length; j++) {
        const idx = pendingIndices[j]!;
        applyValidatedOrFallbackTitle(out, idx, titles[j] ?? "", titleTemplate, options.siteName);
      }

      const titled = pendingIndices
        .map((i) => ({ i, title: out[i]!.title?.trim() ?? "" }))
        .filter((x) => x.title);
      if (titled.length > 0 && options.siteName.trim()) {
        const rejected = await aiRejectBrandOrBlockedTexts({
          apiKey,
          model,
          companyName: options.siteName,
          candidates: titled.map((x) => x.title),
          kind: "title",
        });
        if (rejected.length > 0) {
          const rejectKeys = new Set(
            rejected.map((t) => t.trim().toLowerCase().replace(/\s+/g, " ")),
          );
          for (const { i, title } of titled) {
            const key = title.toLowerCase().replace(/\s+/g, " ");
            if (rejectKeys.has(key)) {
              const row = out[i]!;
              out[i] = {
                ...row,
                title: resolveEntitySapTitleFromTemplate(
                  (row.keyword ?? "").trim(),
                  (row.entity ?? "").trim(),
                  titleTemplate,
                  options.siteName,
                ),
              };
            }
          }
        }
      }
    } catch {
      await delay(Math.min(10_000, 1_000 * attempt));
    }
    options.onRowsUpdate?.(out.map((row) => ({ ...row })));
    options.onProgress?.(
      out.filter((r) => r.title?.trim()).length,
      total,
    );
  }

  const stillBlank = pendingIndices.filter((i) => !out[i]!.title?.trim());
  if (stillBlank.length > 0) {
    applyTemplateFallbackForIndices(out, stillBlank, titleTemplate, options.siteName);
    options.onRowsUpdate?.(out.map((row) => ({ ...row })));
  }

  if (sapOccupancy) {
    const titleRetryIndices: number[] = [];
    for (const i of pendingIndices) {
      const row = out[i];
      if (!row) continue;
      const entity = (row.entity ?? "").trim();
      const title = row.title?.trim() ?? "";
      if (entity && title && titleCollidesWithEntityInventory(title, entity, sapOccupancy)) {
        titleRetryIndices.push(i);
      }
    }
    if (titleRetryIndices.length > 0) {
      for (const i of titleRetryIndices) {
        out[i] = { ...out[i]!, title: "" };
      }
      const retryRows = titleRetryIndices.map((i) => out[i]!);
      try {
        const retryTitles = await fetchTitlesBatch(
          apiKey,
          model,
          siteId,
          options.siteName,
          retryRows,
          gridLocations,
          entityTypeFocus,
          titleTemplate,
          sapOccupancy,
        );
        for (let j = 0; j < titleRetryIndices.length; j++) {
          const idx = titleRetryIndices[j]!;
          applyValidatedOrFallbackTitle(out, idx, retryTitles[j] ?? "", titleTemplate, options.siteName);
        }
      } catch {
        applyTemplateFallbackForIndices(out, titleRetryIndices, titleTemplate, options.siteName);
      }
      options.onRowsUpdate?.(out.map((row) => ({ ...row })));
    }
  }

  options.onProgress?.(total, total);
  return out;
}

/** @deprecated Use {@link fillSapRowTitlesFromOpenRouter} */
export async function rewriteEntitySapTitlesWithOpenRouter(
  rows: CSVRow[],
  options: EntitySapTitleAgentOptions,
): Promise<CSVRow[]> {
  return fillSapRowTitlesFromOpenRouter(rows, options);
}
