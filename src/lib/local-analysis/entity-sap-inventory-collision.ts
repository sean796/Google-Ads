/**
 * Detect SAP entity page collisions against live inventory (published + scheduled)
 * and resolve duplicates via OpenRouter keyword variation.
 */

import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import {
  normalizeSapKeywordWithPlaceSuffix,
} from "@/lib/local-analysis/entity-sap-row-keyword-fill";
import { buildEntityAdGroupSections } from "@/lib/local-analysis/sap-entity-ad-groups";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import {
  aiRejectBrandOrBlockedTexts,
} from "@/lib/content-brand-ai-gate";
import {
  GLOBAL_BLOCKED_TOPIC_PROMPT_BLOCK,
} from "@/lib/content-topic-blocklist";
import { isOffensiveGscQuery } from "@/lib/gsc-offensive-word-blocklist";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import {
  collectBlockedForEntity,
  entityKeywordPairKey,
  entityKey,
  findEntitySapRowCollision,
  normalizeTitleKey,
  pickGscKeywordForEntityRow,
  reserveEntitySapSlug,
  type EntitySapBlockedForEntity,
  type EntitySapOccupancy,
  type EntitySapRowCollision,
} from "./entity-sap-inventory-occupancy";
export {
  buildEntitySapOccupancy,
  collectBlockedForEntity,
  entityKeywordPairKey,
  findEntitySapRowCollision,
  parseEntityFromSapTitle,
  predictedEntitySapTitle,
  reserveEntitySapSlug,
  type EntitySapBlockedForEntity,
  type EntitySapExistingPage,
  type EntitySapOccupancy,
  type EntitySapRowCollision,
} from "./entity-sap-inventory-occupancy";
const MAX_COLLISION_RESOLVE_ATTEMPTS = 3;

const VARIATION_KEYWORD_SYSTEM = `You assign one alternate focus keyword for a **service-area (SAP) landing page** when the proposed keyword would duplicate an existing page for the same place.

Return **only** valid JSON: {"keyword":"..."}

Rules:
- **2–3 word** service / product phrase only. Do **not** append city, neighbourhood, or province — code appends the entity afterward.
- Must differ from \`blockedKeywords\` and must not produce the same intent as \`collidingKeyword\`.
- Base on unused \`gscKeywords\` first; otherwise invent a distinct product/service angle for the dealer's industry.
- **NEVER** use the site's own trading name from \`siteName\` as the keyword.
${GLOBAL_BLOCKED_TOPIC_PROMPT_BLOCK}
No markdown outside JSON.`;

async function postOpenRouterJson(args: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  temperature: number;
}): Promise<string> {
  const res = await postOpenRouterAppChatFetch( {
    method: "POST",
    headers: openRouterWebAppHeaders(args.apiKey),
    body: JSON.stringify({
      model: args.model,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      temperature: args.temperature,
      response_format: { type: "json_object" },
      stream: false,
    }),
  });
  const j = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!res.ok) return "";
  const content = j.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

async function inventAlternateKeywordViaOpenRouter(args: {
  apiKey: string;
  model: string;
  siteName: string;
  siteUrl: string;
  entity: string;
  collidingKeyword: string;
  collision: EntitySapRowCollision;
  blocked: EntitySapBlockedForEntity;
  gscKeywords: string[];
  seedKeywords: string[];
  gridLocations: string[];
  temperature: number;
}): Promise<string | null> {
  const user = JSON.stringify({
    siteName: args.siteName,
    siteUrl: args.siteUrl,
    entity: args.entity,
    collidingKeyword: args.collidingKeyword,
    collisionKind: args.collision.kind,
    existingPage: args.collision.existing,
    blockedKeywords: args.blocked.keywords,
    blockedSlugs: args.blocked.slugs,
    blockedTitles: args.blocked.titles,
    existingSapPagesForEntity: args.blocked.existingPages.map((p) => ({
      title: p.title,
      keyword: p.keyword,
      slug: p.slug,
    })),
    gscKeywords: args.gscKeywords,
    seedKeywords: args.seedKeywords,
    gridLocations: args.gridLocations,
  });
  const raw = await postOpenRouterJson({
    apiKey: args.apiKey,
    model: args.model,
    system: VARIATION_KEYWORD_SYSTEM,
    user,
    temperature: args.temperature,
  });
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as { keyword?: unknown };
    const base = String(parsed.keyword ?? "").trim();
    if (!base || isOffensiveGscQuery(base)) return null;
    const normalized = normalizeSapKeywordWithPlaceSuffix(
      base,
      args.entity,
      args.gridLocations,
    );
    if (!normalized || isOffensiveGscQuery(normalized)) return null;
    return normalized;
  } catch {
    return null;
  }
}

export type ResolveEntitySapRowCollisionsArgs = {
  apiKey: string;
  model: string;
  siteName: string;
  siteUrl: string;
  rows: CSVRow[];
  occupancy: EntitySapOccupancy;
  gscKeywords: string[];
  seedKeywords: string[];
  gridLocations: string[];
  titleTemplate?: string;
  reservedSlugsInRun?: Set<string>;
  temperature?: number;
};

/** Reassign keywords for rows that still collide with inventory. Uniqueness is per ad group only. */
export async function resolveEntitySapRowCollisionsViaOpenRouter(
  args: ResolveEntitySapRowCollisionsArgs,
): Promise<CSVRow[]> {
  const {
    apiKey,
    model,
    siteName,
    siteUrl,
    rows,
    occupancy,
    gscKeywords,
    seedKeywords,
    gridLocations,
    titleTemplate,
    temperature = 0.45,
  } = args;
  const out = rows.map((r) => ({ ...r }));
  const sections = buildEntityAdGroupSections(out);

  for (const section of sections) {
    const reservedInGroup = new Set<string>();
    const usedInGroup = new Set<string>();

    for (const globalIdx of section.rowIndices) {
      const row = out[globalIdx]!;
      const entity = normalizeEntityHintCommaLabel((row.entity ?? section.entity).trim());
      let currentKeyword = (row.keyword ?? "").trim();
      if (!entity) continue;

      if (currentKeyword) {
        const pairKey = entityKeywordPairKey(currentKeyword, entity);
        if (pairKey) usedInGroup.add(pairKey);
        reserveEntitySapSlug(reservedInGroup, currentKeyword, entity);
      }

      if (!currentKeyword) {
        const picked = pickGscKeywordForEntityRow({
          entity,
          gscKeywords,
          gridLocations,
          usedInGroup,
          occupancy,
          reservedInGroup,
          titleTemplate,
        });
        if (picked) {
          currentKeyword = picked;
          out[globalIdx] = { ...row, keyword: currentKeyword };
          const pairKey = entityKeywordPairKey(currentKeyword, entity);
          if (pairKey) usedInGroup.add(pairKey);
          reserveEntitySapSlug(reservedInGroup, currentKeyword, entity);
        }
        continue;
      }

      let collision = findEntitySapRowCollision(
        { keyword: currentKeyword, entity, titleTemplate },
        occupancy,
        reservedInGroup,
      );
      if (!collision) continue;

      const blocked = collectBlockedForEntity(occupancy, entity);
      const collidingPairKey = entityKeywordPairKey(currentKeyword, entity);
      if (collidingPairKey) usedInGroup.delete(collidingPairKey);

      const gscAlternate = pickGscKeywordForEntityRow({
        entity,
        gscKeywords,
        gridLocations,
        usedInGroup,
        occupancy,
        reservedInGroup,
        titleTemplate,
      });
      if (gscAlternate) {
        currentKeyword = gscAlternate;
        collision = findEntitySapRowCollision(
          { keyword: currentKeyword, entity, titleTemplate },
          occupancy,
          reservedInGroup,
        );
      }

      for (let attempt = 0; attempt < MAX_COLLISION_RESOLVE_ATTEMPTS && collision; attempt++) {
        const alternate = await inventAlternateKeywordViaOpenRouter({
          apiKey,
          model,
          siteName,
          siteUrl,
          entity,
          collidingKeyword: currentKeyword,
          collision,
          blocked,
          gscKeywords,
          seedKeywords,
          gridLocations,
          temperature: Math.min(temperature + 0.1 * attempt, 0.75),
        });
        if (!alternate) continue;

        const rejected = await aiRejectBrandOrBlockedTexts({
          apiKey,
          model,
          companyName: siteName,
          candidates: [alternate],
          kind: "keyword",
        });
        if (rejected.length > 0) continue;

        currentKeyword = alternate;
        collision = findEntitySapRowCollision(
          { keyword: currentKeyword, entity, titleTemplate },
          occupancy,
          reservedInGroup,
        );
      }

      if (collision) {
        const fallback = pickGscKeywordForEntityRow({
          entity,
          gscKeywords,
          gridLocations,
          usedInGroup,
          occupancy,
          reservedInGroup,
          titleTemplate,
          skipInventoryCollision: true,
        });
        if (fallback) {
          currentKeyword = fallback;
          collision = null;
        }
      }

      out[globalIdx] = { ...row, keyword: currentKeyword };
      const resolvedPairKey = entityKeywordPairKey(currentKeyword, entity);
      if (resolvedPairKey) usedInGroup.add(resolvedPairKey);
      reserveEntitySapSlug(reservedInGroup, currentKeyword, entity);
    }
  }

  return out;
}

export function titleCollidesWithEntityInventory(
  title: string,
  entity: string,
  occupancy: EntitySapOccupancy,
): boolean {
  const key = normalizeTitleKey(title);
  if (!key) return false;
  const pages = occupancy.byEntity.get(entityKey(entity)) ?? [];
  return pages.some((p) => normalizeTitleKey(p.title) === key);
}
