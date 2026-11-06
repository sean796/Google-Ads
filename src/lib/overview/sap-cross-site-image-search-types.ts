import type { WordPressSite } from "@/components/integrations/types";

export type SapCrossSiteImageHit = {
  imageUrl: string;
  alt?: string;
  sourceSiteName: string;
  sourceSiteUrl: string;
  sourcePageUrl: string;
  /** Higher = better place match (exact slug/title preferred). */
  score: number;
};

export type SapPeerLibraryCsvFile = {
  name: string;
  content: string;
  mimeType: string;
};

export type SapCrossSiteImageSearchResult = {
  hit: SapCrossSiteImageHit | null;
  peerCsvFiles: SapPeerLibraryCsvFile[];
};

export type SapPeerEntityEntry = {
  siteId: string;
  siteName: string;
  siteUrl: string;
  collection: string;
  pageUrl: string;
  id: number;
  title: string;
  slug: string;
  keyword: string;
  /** Cached body HTML when known (warm cache or prior content fetch). */
  contentHtml?: string;
  /** Cached body image when already extracted from contentHtml. */
  imageUrl?: string;
  imageAlt?: string;
};

export type SapPeerEntityIndex = {
  cacheKey: string;
  builtAt: number;
  sitesInOrder: WordPressSite[];
  entriesBySiteId: Map<string, SapPeerEntityEntry[]>;
  entryCount: number;
};


export type SapPlaceMatchResult = {
  match: boolean;
  /** 3 = exact slug/title/url; 2 = full entity contained; 1 = all place tokens present. */
  score: number;
};
