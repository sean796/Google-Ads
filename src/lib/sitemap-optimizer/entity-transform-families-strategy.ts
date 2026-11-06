import { urlPathTail } from "@/lib/sitemap-optimizer/build-cluster-catalog-payload";
import {
  entityNeighborhoodFromPathTail,
  entityRedirectGroupingKey,
  titleCaseSlugToken,
} from "@/lib/sitemap-optimizer/entity-redirect-grouping-key";
import { entityCompressPlaceLabelsForMembers } from "@/lib/sitemap-optimizer/entity-compress-geo-split";
import {
  familyHasCompleteAiStrategy,
  type EntityRedirectFamily,
} from "@/lib/sitemap-optimizer/entity-redirect-plan-parse";
import {
  isPlaceholderKeyword,
  isPlaceholderSapEntity,
  isPlaceholderStrategyField,
} from "@/lib/sitemap-optimizer/entity-strategy-placeholders";
import type { SitemapOptimizerPostRow } from "@/lib/sitemap-optimizer/types";

function realPlaceEntityFromCatalog(
  pillar: SitemapOptimizerPostRow | undefined,
  placeLabels: readonly string[],
): string {
  const fromNeighborhood = entityNeighborhoodFromPathTail(pillar?.url ?? "");
  if (fromNeighborhood?.trim()) {
    return titleCaseSlugToken(fromNeighborhood);
  }
  if (placeLabels[0]?.trim()) return placeLabels[0]!.trim();
  if (pillar?.title?.trim()) return pillar.title.trim();
  const tail = pillar ? urlPathTail(pillar.url) : "";
  if (tail) return titleCaseSlugToken(entityRedirectGroupingKey(tail));
  return "";
}

function realKeywordFromCatalog(
  family: EntityRedirectFamily,
  pillar: SitemapOptimizerPostRow | undefined,
  members: readonly SitemapOptimizerPostRow[],
  placeLabels: readonly string[],
): string {
  const candidates = [
    family.recommendedPrimaryKeyword?.trim(),
    pillar?.keyword?.trim(),
    members.find((m) => m.keyword.trim())?.keyword.trim(),
  ].filter((v): v is string => Boolean(v) && !isPlaceholderKeyword(v));
  if (candidates[0]) return candidates[0];
  const place = placeLabels[0] ?? "";
  const title = (pillar?.title ?? members[0]?.title ?? "").trim();
  if (title && !isPlaceholderStrategyField(title)) return title.slice(0, 60);
  if (place) return place;
  return "";
}


export function fillFamilyStrategyFromPillar(
  family: EntityRedirectFamily,
  rowById: ReadonlyMap<string, SitemapOptimizerPostRow>,
): EntityRedirectFamily {
  const pillar = rowById.get(family.destinationPostId);
  const members = family.sourcePostIds
    .map((id) => rowById.get(id))
    .filter((r): r is SitemapOptimizerPostRow => r != null);
  const placeLabels = entityCompressPlaceLabelsForMembers(family.sourcePostIds, rowById);
  const alsoCovers =
    placeLabels.length > 0 ? `Also covers: ${placeLabels.join(", ")}.` : "";
  const realEntity = realPlaceEntityFromCatalog(pillar, placeLabels);
  const realKeyword = realKeywordFromCatalog(family, pillar, members, placeLabels);

  let working: EntityRedirectFamily = { ...family };

  if (isPlaceholderSapEntity(working.sapEntity)) {
    working = { ...working, sapEntity: realEntity || working.sapEntity };
  }
  if (isPlaceholderKeyword(working.recommendedPrimaryKeyword)) {
    working = { ...working, recommendedPrimaryKeyword: realKeyword };
  }
  if (isPlaceholderStrategyField(working.sapModifier)) {
    working = {
      ...working,
      sapModifier:
        `Consolidate ${members.length} legacy service-area URL(s) into one local landing page. ${alsoCovers}`.trim(),
    };
  }
  if (isPlaceholderStrategyField(working.recommendedTitle)) {
    working = {
      ...working,
      recommendedTitle: pillar?.title?.trim() || members[0]?.title?.trim() || realKeyword,
    };
  }
  if (isPlaceholderStrategyField(working.recommendedMeta)) {
    const meta = pillar?.meta?.trim() || `Local ${realKeyword} coverage for your service area.`;
    working = {
      ...working,
      recommendedMeta: meta.length <= 160 ? meta : `${meta.slice(0, 157).trim()}...`,
    };
  }
  if (isPlaceholderStrategyField(working.rationale)) {
    working = {
      ...working,
      rationale: "Replacement brief filled from pillar catalog.",
    };
  }

  if (familyHasCompleteAiStrategy(working)) {
    return ensurePlaceMentionsOnFamily(working, placeLabels, alsoCovers, realEntity);
  }

  const keyword = isPlaceholderKeyword(working.recommendedPrimaryKeyword)
    ? realKeyword
    : working.recommendedPrimaryKeyword!.trim();
  const title =
    working.recommendedTitle?.trim() && !isPlaceholderStrategyField(working.recommendedTitle)
      ? working.recommendedTitle.trim()
      : pillar?.title?.trim() || members[0]?.title?.trim() || keyword;
  const metaRaw =
    working.recommendedMeta?.trim() && !isPlaceholderStrategyField(working.recommendedMeta)
      ? working.recommendedMeta.trim()
      : pillar?.meta?.trim() || `Local ${keyword} coverage for your service area.`;
  const sapEntity =
    working.sapEntity?.trim() && !isPlaceholderSapEntity(working.sapEntity)
      ? working.sapEntity.trim()
      : realEntity;
  let sapModifier =
    working.sapModifier?.trim() && !isPlaceholderStrategyField(working.sapModifier)
      ? working.sapModifier.trim()
      : `Consolidate ${members.length} legacy service-area URL(s) into one local landing page.`;
  if (alsoCovers && !placeLabels.every((p) => sapModifier.toLowerCase().includes(p.toLowerCase()))) {
    sapModifier = `${sapModifier} ${alsoCovers}`.trim();
  }
  let combinedOutline = working.combinedOutline?.length ? [...working.combinedOutline] : [];
  const outlineMentionsPlaces = placeLabels.every((p) =>
    combinedOutline.some((line) => line.toLowerCase().includes(p.toLowerCase())),
  );
  if (alsoCovers && !outlineMentionsPlaces && !combinedOutline.some((line) => /also covers:/i.test(line))) {
    combinedOutline = [...combinedOutline, alsoCovers];
  }
  const whatToKeepFromEach =
    working.whatToKeepFromEach?.length &&
    working.whatToKeepFromEach.length >= working.sourcePostIds.length
      ? working.whatToKeepFromEach
      : members.map((m) => {
          const place = entityCompressPlaceLabelsForMembers([m.postId], rowById)[0];
          return {
            url: m.url,
            title: m.title || m.postId,
            bullets: [
              place ? `Local angle for ${place}` : null,
              m.meta?.trim() || m.title || m.url,
            ].filter(Boolean) as string[],
          };
        });

  return {
    ...working,
    rationale:
      working.rationale.trim() && !isPlaceholderStrategyField(working.rationale)
        ? working.rationale.trim()
        : "Replacement brief filled from pillar catalog.",
    recommendedPrimaryKeyword: keyword,
    recommendedTitle: title,
    recommendedMeta: metaRaw.length <= 160 ? metaRaw : `${metaRaw.slice(0, 157).trim()}...`,
    sapEntity,
    sapModifier,
    combinedOutline,
    whatToKeepFromEach,
  };
}

function ensurePlaceMentionsOnFamily(
  family: EntityRedirectFamily,
  placeLabels: readonly string[],
  alsoCovers: string,
  realEntity: string,
): EntityRedirectFamily {
  let sapEntity = family.sapEntity?.trim() || "";
  if (isPlaceholderSapEntity(sapEntity) && realEntity) sapEntity = realEntity;

  let sapModifier = family.sapModifier?.trim() || "";
  if (isPlaceholderStrategyField(sapModifier)) {
    sapModifier = `Consolidate ${family.sourcePostIds.length} legacy service-area URL(s) into one local landing page. ${alsoCovers}`.trim();
  } else if (alsoCovers && placeLabels.length > 0) {
    const missingInModifier = placeLabels.filter(
      (p) => !sapModifier.toLowerCase().includes(p.toLowerCase()),
    );
    if (missingInModifier.length) {
      sapModifier = `${sapModifier} Also covers: ${missingInModifier.join(", ")}.`.trim();
    }
  }

  let combinedOutline = [...(family.combinedOutline ?? [])];
  if (placeLabels.length > 0) {
    const outlineHasPlaces = placeLabels.every((p) =>
      combinedOutline.some((line) => line.toLowerCase().includes(p.toLowerCase())),
    );
    if (!outlineHasPlaces && alsoCovers && !combinedOutline.some((line) => /also covers:/i.test(line))) {
      combinedOutline = [...combinedOutline, alsoCovers];
    }
  }

  let recommendedPrimaryKeyword = family.recommendedPrimaryKeyword?.trim() || "";
  if (isPlaceholderKeyword(recommendedPrimaryKeyword)) {
    recommendedPrimaryKeyword = realEntity || "";
  }

  return {
    ...family,
    sapEntity,
    sapModifier,
    combinedOutline,
    recommendedPrimaryKeyword,
  };
}
