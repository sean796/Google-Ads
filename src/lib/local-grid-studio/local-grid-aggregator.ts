import type {
  LocalGridAggregatedView,
  LocalGridBusinessIdentity,
  LocalGridCategoryBenchmark,
  LocalGridCompetitorRow,
  LocalGridEvaluatedPin,
  LocalGridPinBucket,
  LocalGridPointResult,
  LocalGridRankSummary,
  LocalGridSerpItem,
} from "./local-grid-types";

export function normalizeDomainHost(urlOrHost: string | undefined | null): string {
  const raw = (urlOrHost ?? "").trim().toLowerCase();
  if (!raw) return "";
  const stripped = raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]?.trim() ?? "";
  return stripped;
}

export function normalizeBusinessText(value: string | undefined | null): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildCanonicalBusinessKey(item: {
  placeId?: string;
  cid?: string;
  googlePlaceId?: string;
  websiteUrl?: string;
  business?: string;
  address?: string;
}): string {
  const cid = (item.cid ?? "").trim();
  if (cid) return `cid:${cid}`;
  const placeId = (item.placeId ?? "").trim();
  if (placeId) return `pid:${placeId}`;
  const gPlace = (item.googlePlaceId ?? "").trim();
  if (gPlace) return `gpid:${gPlace}`;
  const biz = normalizeBusinessText(item.business);
  const addr = normalizeBusinessText(item.address);
  if (biz && addr) return `ba:${biz}::${addr}`;
  const host = normalizeDomainHost(item.websiteUrl);
  if (biz && host) return `bh:${biz}::${host}`;
  return `name:${biz || "unknown"}`;
}

export function classifyPinBucket(rank: number | null): LocalGridPinBucket {
  if (rank == null || !Number.isFinite(rank) || rank > 20 || rank < 1) return "out";
  if (rank === 1) return "rank1";
  if (rank <= 3) return "high";
  if (rank <= 10) return "med";
  return "low";
}

export function doesSerpItemMatchTarget(
  item: LocalGridSerpItem,
  target: LocalGridBusinessIdentity,
): boolean {
  const tCid = (target.cid || target.placeId || "").trim();
  const iCid = (item.cid || item.placeId || "").trim();
  if (tCid && iCid && tCid === iCid) {
    return true;
  }

  const tGpid = (target.googlePlaceId || "").trim();
  const iGpid = (item.googlePlaceId || "").trim();
  if (tGpid && iGpid && tGpid === iGpid) {
    return true;
  }

  const tName = normalizeBusinessText(target.business);
  const iName = normalizeBusinessText(item.business);
  const tHost = normalizeDomainHost(target.websiteUrl);
  const iHost = normalizeDomainHost(item.websiteUrl);

  if (tName && iName && tName === iName) {
    const tAddr = normalizeBusinessText(target.address);
    const iAddr = normalizeBusinessText(item.address);
    if (!tAddr || !iAddr || tAddr === iAddr || iAddr.includes(tAddr) || tAddr.includes(iAddr)) {
      return true;
    }
  }

  if (tHost && iHost && tHost === iHost) {
    return true;
  }

  return false;
}

export function computeRankSummaryFromEvaluatedPins(
  pins: Array<{ targetRank: number | null }>,
): LocalGridRankSummary {
  const totalPoints = pins.length;
  if (totalPoints === 0) {
    return {
      totalPoints: 0,
      rankedPoints: 0,
      avgRank: 21,
      tarp: 21,
      highCount: 0,
      medCount: 0,
      lowCount: 0,
      outCount: 0,
      highPct: 0,
      medPct: 0,
      lowPct: 0,
      outPct: 0,
    };
  }

  let highCount = 0;
  let medCount = 0;
  let lowCount = 0;
  let outCount = 0;
  let sumRanked = 0;
  let sumTarp = 0;

  for (const pin of pins) {
    const r = pin.targetRank;
    if (r == null || !Number.isFinite(r) || r > 20 || r < 1) {
      outCount++;
      sumTarp += 21;
    } else {
      sumRanked += r;
      sumTarp += r;
      if (r <= 3) highCount++;
      else if (r <= 10) medCount++;
      else lowCount++;
    }
  }

  const rankedPoints = highCount + medCount + lowCount;
  const tarp = Number((sumTarp / totalPoints).toFixed(2));
  const avgRank = rankedPoints > 0 ? tarp : 21;

  const highPct = Math.round((highCount / totalPoints) * 100);
  const medPct = Math.round((medCount / totalPoints) * 100);
  const lowPct = Math.round((lowCount / totalPoints) * 100);
  const outPct = Math.max(0, 100 - highPct - medPct - lowPct);

  return {
    totalPoints,
    rankedPoints,
    avgRank,
    tarp,
    highCount,
    medCount,
    lowCount,
    outCount,
    highPct,
    medPct,
    lowPct,
    outPct,
  };
}

/**
 * Evaluate all pins, competitors, and category/review benchmarks for the active target business.
 */
export function aggregateLocalGridScan(
  points: LocalGridPointResult[],
  activeBusiness: LocalGridBusinessIdentity,
): LocalGridAggregatedView {
  const evaluatedPins: LocalGridEvaluatedPin[] = points.map((pt) => {
    const matchedItem = pt.items.find((item) => doesSerpItemMatchTarget(item, activeBusiness)) ?? null;
    const targetRank = matchedItem ? matchedItem.rank : null;
    return {
      ...pt,
      targetRank,
      bucket: classifyPinBucket(targetRank),
      matchedItem,
    };
  });

  const summary = computeRankSummaryFromEvaluatedPins(evaluatedPins);

  const byKey = new Map<
    string,
    {
      identity: LocalGridBusinessIdentity;
      ranksByPointId: Map<string, number>;
    }
  >();

  for (const pt of points) {
    for (const item of pt.items) {
      if (!item.business.trim()) continue;
      const key = buildCanonicalBusinessKey(item);
      let entry = byKey.get(key);
      if (!entry) {
        entry = {
          identity: {
            key,
            business: item.business,
            address: item.address,
            placeId: item.placeId,
            cid: item.cid ?? item.placeId,
            googlePlaceId: item.googlePlaceId,
            websiteUrl: item.websiteUrl,
            primaryCategory: item.primaryCategory,
            secondaryCategories: item.secondaryCategories,
            rating: item.rating,
            reviews: item.reviews,
            latitude: item.itemLat ?? null,
            longitude: item.itemLng ?? null,
          },
          ranksByPointId: new Map(),
        };
        byKey.set(key, entry);
      } else {
        if (!entry.identity.websiteUrl && item.websiteUrl) entry.identity.websiteUrl = item.websiteUrl;
        if (!entry.identity.primaryCategory && item.primaryCategory) {
          entry.identity.primaryCategory = item.primaryCategory;
        }
        if (entry.identity.rating == null && item.rating != null) entry.identity.rating = item.rating;
        if (entry.identity.reviews == null && item.reviews != null) entry.identity.reviews = item.reviews;
      }

      const prevRank = entry.ranksByPointId.get(pt.pointId);
      if (prevRank == null || item.rank < prevRank) {
        entry.ranksByPointId.set(pt.pointId, item.rank);
      }
    }
  }

  const competitors: LocalGridCompetitorRow[] = [];
  for (const { identity, ranksByPointId } of byKey.values()) {
    const pinRanks = points.map((pt) => ({
      targetRank: ranksByPointId.get(pt.pointId) ?? null,
    }));
    const compSummary = computeRankSummaryFromEvaluatedPins(pinRanks);
    const rankedVals = [...ranksByPointId.values()];
    const bestRank = rankedVals.length > 0 ? Math.min(...rankedVals) : 21;
    const worstRank = rankedVals.length > 0 ? Math.max(...rankedVals) : 21;
    const shareOfVoicePct =
      points.length > 0 ? Number(((compSummary.highCount / points.length) * 100).toFixed(1)) : 0;

    competitors.push({
      ...identity,
      summary: compSummary,
      bestRank,
      worstRank,
      shareOfVoicePct,
    });
  }

  competitors.sort(
    (a, b) =>
      a.summary.tarp - b.summary.tarp ||
      b.summary.highCount - a.summary.highCount ||
      a.summary.avgRank - b.summary.avgRank ||
      a.business.localeCompare(b.business),
  );

  const catMap = new Map<
    string,
    { count: number; top3Hits: number; ratings: number[]; reviews: number[] }
  >();
  let totalTop3Slots = 0;

  for (const comp of competitors) {
    const cat = comp.primaryCategory.trim() || "Uncategorized";
    const bucket = catMap.get(cat) ?? { count: 0, top3Hits: 0, ratings: [], reviews: [] };
    bucket.count += 1;
    bucket.top3Hits += comp.summary.highCount;
    totalTop3Slots += comp.summary.highCount;
    if (comp.rating != null && Number.isFinite(comp.rating)) bucket.ratings.push(comp.rating);
    if (comp.reviews != null && Number.isFinite(comp.reviews)) bucket.reviews.push(comp.reviews);
    catMap.set(cat, bucket);
  }

  const categoryBenchmarks: LocalGridCategoryBenchmark[] = [...catMap.entries()]
    .map(([category, data]) => ({
      category,
      businessCount: data.count,
      top3SharePct:
        totalTop3Slots > 0 ? Number(((data.top3Hits / totalTop3Slots) * 100).toFixed(1)) : 0,
      avgRating:
        data.ratings.length > 0
          ? Number((data.ratings.reduce((s, n) => s + n, 0) / data.ratings.length).toFixed(2))
          : null,
      avgReviews:
        data.reviews.length > 0
          ? Math.round(data.reviews.reduce((s, n) => s + n, 0) / data.reviews.length)
          : null,
    }))
    .sort((a, b) => b.top3SharePct - a.top3SharePct || b.businessCount - a.businessCount);

  const top3Competitors = competitors.slice(0, 3);
  const top3Reviews = top3Competitors
    .map((c) => c.reviews)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const top3Ratings = top3Competitors
    .map((c) => c.rating)
    .filter((v): v is number => v != null && Number.isFinite(v));

  return {
    activeBusiness,
    summary,
    evaluatedPins,
    competitors,
    categoryBenchmarks,
    top3AvgReviews:
      top3Reviews.length > 0
        ? Math.round(top3Reviews.reduce((a, b) => a + b, 0) / top3Reviews.length)
        : 0,
    top3AvgRating:
      top3Ratings.length > 0
        ? Number((top3Ratings.reduce((a, b) => a + b, 0) / top3Ratings.length).toFixed(2))
        : 0,
  };
}
