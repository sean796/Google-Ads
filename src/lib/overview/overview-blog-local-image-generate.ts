/**
 * Local Image: Wikipedia lead photo (when present) or DFS Google Images →
 * vision pick → AI replicate → disclaimer → WP insert.
 */

import { loadApiKey } from "@/lib/api";
import { generateImage } from "@/lib/image-api";
import { applyAiGeneratedImageDisclaimer } from "@/lib/images/ai-generated-image-disclaimer";
import {
  openRouterVisionChatCompletion,
  parseJsonObjectFromModelText,
  type OpenRouterVisionContentPart,
} from "@/lib/openrouter-vision-chat";
import { getImageModel, getResearchModel } from "@/lib/optimization-settings-storage";
import {
  buildInContentImageFigureHtml,
  inContentImageAltFromFocusKeyword,
  inContentImageFilenameFromFocusKeyword,
  inContentImageTitleFromFocusKeyword,
  insertFigureAfterH2,
} from "@/lib/overview/overview-blog-in-content-image-insert";
import {
  type GoogleImagesSerpItem,
  resolveLocalImagePlaceEntity,
} from "@/lib/overview/overview-local-image-dfs-normalize";
import {
  researchGoogleImageReferences,
} from "@/lib/image-reference-research";
import { analyzeBestSectionForImage } from "@/lib/image-section-analyzer";
import {
  htmlBodyToMarkdownH2Projection,
  resolveForcedH2Section,
} from "@/lib/in-content-image-generator";
import { parseMarkdownSections } from "@/lib/section-parser";
import { uploadWordPressMedia } from "@/lib/wordpress-api";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import {
  isCurrentConnectedSite,
  searchSapCrossSiteInContentImage,
} from "@/lib/overview/sap-cross-site-image-search";
import { fetchWikipediaPageLeadImage } from "@/lib/wikipedia/mediawiki-pageimage";
import type { WordPressSite } from "@/components/integrations/types";

const PLACE_MATCH_MIN = 0.65;
/** Skip only when the place is not recognizable (not an HD bar). */
export const LOCAL_IMAGE_QUALITY_MIN = 0.25;
/** Top N Google Images results sent to vision (not the full SERP). */
export const LOCAL_IMAGE_CANDIDATE_LIMIT = 10;

/** Vision brief for Google Images fallback: community over single-house listing. */
export function buildLocalImageCommunityAcceptanceBrief(entity: string): string {
  const place = (entity ?? "").trim() || "the place";
  return [
    `Prefer a community-scale view of "${place}" (neighbourhood streetscape, park, school, plaza, or public amenity).`,
    `A single private house / MLS listing photo is a weak match unless nothing more community-focused is available.`,
    `Do not reject houses as a category; rank community overview higher when both exist.`,
  ].join(" ");
}

/** Forced Google Images targets when Wikipedia lead is unavailable. */
export function buildLocalImageGoogleForcedTargets(entity: string) {
  return [
    {
      kind: "place" as const,
      query: entity,
      role: "primary place",
      acceptanceBrief: buildLocalImageCommunityAcceptanceBrief(entity),
    },
  ];
}

export function capGoogleImagesCandidates(
  items: GoogleImagesSerpItem[],
  limit: number = LOCAL_IMAGE_CANDIDATE_LIMIT,
): GoogleImagesSerpItem[] {
  return items.slice(0, Math.max(0, limit));
}

export type LocalImagePlacePick = {
  chosenIndex: number;
  why: string;
  placeMatchConfidence: number;
  /** Technical photo quality 0–1 (sharpness, resolution, compression). */
  qualityScore: number;
  visualDescription: string;
};

function normalizeUnitScore(raw: number): number {
  let n = raw;
  if (!Number.isFinite(n)) return NaN;
  if (n > 1 && n <= 10) n = n / 10;
  else if (n > 10) n = 1;
  if (n < 0) n = 0;
  return n;
}

export function parseLocalImagePlacePick(raw: Record<string, unknown>): LocalImagePlacePick {
  const chosenIndex = Number(raw.chosenIndex);
  let placeMatchConfidence = Number(raw.placeMatchConfidence);
  let qualityScore = Number(raw.qualityScore);
  const why = String(raw.why ?? "").trim();
  const visualDescription = String(raw.visualDescription ?? "").trim();
  if (!Number.isFinite(chosenIndex) || chosenIndex < 0) {
    throw new Error("Vision pick missing chosenIndex");
  }
  if (!Number.isFinite(placeMatchConfidence)) {
    throw new Error("Vision pick missing placeMatchConfidence");
  }
  placeMatchConfidence = normalizeUnitScore(placeMatchConfidence);
  if (!Number.isFinite(qualityScore)) {
    // Older/partial replies: assume decent if place match is strong.
    qualityScore = placeMatchConfidence >= PLACE_MATCH_MIN ? 0.7 : 0.3;
  } else {
    qualityScore = normalizeUnitScore(qualityScore);
  }
  if (!Number.isFinite(qualityScore)) {
    throw new Error("Vision pick missing qualityScore");
  }
  if (!visualDescription) {
    throw new Error("Vision pick missing visualDescription");
  }
  return {
    chosenIndex: Math.floor(chosenIndex),
    why,
    placeMatchConfidence,
    qualityScore,
    visualDescription,
  };
}

/** Read a JSON number field from truncated model text (numeric scan only). */
function readNumberFieldFromPartialJson(text: string, key: string): number | null {
  const needle = `"${key}"`;
  const i = text.indexOf(needle);
  if (i < 0) return null;
  let j = i + needle.length;
  while (
    j < text.length &&
    (text[j] === " " || text[j] === ":" || text[j] === "\n" || text[j] === "\t" || text[j] === "\r")
  ) {
    j += 1;
  }
  let numStr = "";
  if (text[j] === "-") {
    numStr = "-";
    j += 1;
  }
  while (j < text.length) {
    const ch = text[j]!;
    if ((ch >= "0" && ch <= "9") || ch === ".") {
      numStr += ch;
      j += 1;
      continue;
    }
    break;
  }
  const n = Number(numStr);
  return Number.isFinite(n) ? n : null;
}

/**
 * When vision truncates mid-JSON, recover chosenIndex (+ optional confidence).
 * Proven failure mode: incomplete object without closing brace.
 */
export function recoverLocalImagePickFromPartialText(text: string): LocalImagePlacePick | null {
  const chosenIndex = readNumberFieldFromPartialJson(text, "chosenIndex");
  if (chosenIndex === null || chosenIndex < 0) return null;
  let placeMatchConfidence = readNumberFieldFromPartialJson(text, "placeMatchConfidence");
  if (placeMatchConfidence === null) placeMatchConfidence = 0.85;
  placeMatchConfidence = normalizeUnitScore(placeMatchConfidence);
  let qualityScore = readNumberFieldFromPartialJson(text, "qualityScore");
  if (qualityScore === null) qualityScore = 0.7;
  qualityScore = normalizeUnitScore(qualityScore);
  return {
    chosenIndex: Math.floor(chosenIndex),
    why: "partial vision reply",
    placeMatchConfidence,
    qualityScore,
    visualDescription: "Faithful replicate of the chosen reference photograph. Do not embellish or alter.",
  };
}

export function assertPlaceMatchOrThrow(pick: LocalImagePlacePick): void {
  if (pick.placeMatchConfidence < PLACE_MATCH_MIN) {
    throw new Error(
      `No Google Image confidently depicts this place (confidence ${pick.placeMatchConfidence}). Try a clearer entity name.`,
    );
  }
}

export function assertImageQualityOrThrow(pick: LocalImagePlacePick): void {
  if (pick.qualityScore < LOCAL_IMAGE_QUALITY_MIN) {
    throw new Error(
      `Place image is not recognizable enough (quality ${pick.qualityScore}). Skipping.`,
    );
  }
}

/**
 * Geometric upscale / size gate via sharp on the server.
 * Does not invent detail — Lanczos resample only. Rejects tiny sources.
 */
export async function prepareLocalImageDataUrl(dataUrl: string): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  upscaled: boolean;
}> {
  const res = await fetch(backendApiUrl("/images/prepare-local-image"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    dataUrl?: string;
    width?: number;
    height?: number;
    upscaled?: boolean;
    error?: string;
    rejectReason?: string;
  };
  if (!res.ok || typeof data.dataUrl !== "string" || !data.dataUrl.startsWith("data:image/")) {
    const reason = (data.rejectReason || data.error || `prepare failed (${res.status})`).trim();
    throw new Error(reason);
  }
  return {
    dataUrl: data.dataUrl,
    width: Number(data.width) || 0,
    height: Number(data.height) || 0,
    upscaled: Boolean(data.upscaled),
  };
}

async function fetchGoogleImagesForEntity(
  keyword: string,
): Promise<GoogleImagesSerpItem[]> {
  const res = await fetch(backendApiUrl("/dataforseo/google-images"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      keyword,
      location_name: "United States",
      language_code: "en",
      depth: LOCAL_IMAGE_CANDIDATE_LIMIT,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    items?: GoogleImagesSerpItem[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `Google Images search failed (${res.status})`);
  }
  const items = capGoogleImagesCandidates(
    Array.isArray(data.items) ? data.items : [],
  );
  if (!items.length) {
    throw new Error(`No Google Images results for "${keyword}"`);
  }
  return items;
}

async function prefetchImageDataUrl(imageUrl: string, referer?: string): Promise<string | null> {
  try {
    const res = await fetch(backendApiUrl("/images/fetch-data-url"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: imageUrl,
        referer: (referer || "").trim() || "https://www.google.com/",
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      dataUrl?: string;
      error?: string;
    };
    if (!res.ok || typeof data.dataUrl !== "string" || !data.dataUrl.startsWith("data:image/")) {
      return null;
    }
    return data.dataUrl;
  } catch {
    return null;
  }
}

type LocalImageReference = {
  dataUrl: string;
  imageUrl: string;
  sourceUrl?: string;
  visualDescription: string;
};

/**
 * Short vision gate: Wikipedia lead must be a usable place photograph (not map/logo/diagram).
 */
export async function isUsableWikipediaPlacePhotograph(params: {
  apiKey: string;
  model: string;
  entity: string;
  dataUrl: string;
}): Promise<{ usable: boolean; visualDescription: string }> {
  const rawText = await openRouterVisionChatCompletion({
    apiKey: params.apiKey,
    model: params.model,
    messages: [
      {
        role: "system",
        content:
          "You judge whether an image is a usable outdoor or community photograph of a named place. Return only compact valid JSON.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Place entity: "${params.entity}"

Is this a usable photograph of the place or community (streetscape, park, amenity, neighbourhood view)? Maps, logos, diagrams, flags, and abstract graphics are not usable.

Return compact JSON only:
{"usable":true,"visualDescription":"short scene notes under 80 chars"}`,
          },
          { type: "image_url", image_url: { url: params.dataUrl } },
        ],
      },
    ],
    temperature: 0,
    maxTokens: 1024,
  });
  const parsed = parseJsonObjectFromModelText(rawText);
  const usable = parsed.usable === true || parsed.usable === "true";
  const visualDescription = String(parsed.visualDescription ?? "").trim() || "Wikipedia place photo";
  return { usable, visualDescription };
}

async function tryWikipediaLocalImageReference(params: {
  apiKey: string;
  model: string;
  entity: string;
}): Promise<LocalImageReference | null> {
  const lead = await fetchWikipediaPageLeadImage(params.entity);
  if (!lead) return null;
  const dataUrl = await prefetchImageDataUrl(lead.imageUrl, lead.pageUrl);
  if (!dataUrl) return null;
  const gate = await isUsableWikipediaPlacePhotograph({
    apiKey: params.apiKey,
    model: params.model,
    entity: params.entity,
    dataUrl,
  });
  if (!gate.usable) return null;
  return {
    dataUrl,
    imageUrl: lead.imageUrl,
    sourceUrl: lead.pageUrl,
    visualDescription: gate.visualDescription,
  };
}

async function pickBestPlaceImage(params: {
  apiKey: string;
  model: string;
  entity: string;
  candidates: GoogleImagesSerpItem[];
}): Promise<{ pick: LocalImagePlacePick; item: GoogleImagesSerpItem; dataUrl: string }> {
  const capped = capGoogleImagesCandidates(params.candidates);
  const usable: Array<{ item: GoogleImagesSerpItem; dataUrl: string }> = [];
  for (const item of capped) {
    const dataUrl = await prefetchImageDataUrl(item.image_url, item.source_url);
    if (dataUrl) usable.push({ item, dataUrl });
  }
  if (!usable.length) {
    throw new Error("None of the top Google Images could be loaded for vision ranking");
  }

  const metaLines = usable
    .map(
      (c, i) =>
        `[${i}] title=${JSON.stringify(c.item.title)} alt=${JSON.stringify(c.item.alt)} source=${JSON.stringify(c.item.source_url)} image=${JSON.stringify(c.item.image_url)}`,
    )
    .join("\n");

  const parts: OpenRouterVisionContentPart[] = [
    {
      type: "text",
      text: `Place entity (geographic only): "${params.entity}"

Candidates:
${metaLines}

Pick the single best photo of THIS PLACE. Reject product shots, retail shops, Blind Magic, logos, maps, people.

Also score recognizability (not HD). qualityScore = can you make out the place in the photo?
- 0.7–1.0: clear enough to recognize the place
- 0.25–0.7: soft or small but still recognizable — OK for local images
- below 0.25: mush / unreadable / cannot make out the subject — we will skip

Prefer clearer shots when available. Do not reject merely for being non-HD, compressed, or a bit soft.

Return compact JSON only (keep why under 40 chars, visualDescription under 80 chars):
{"chosenIndex":0,"why":"short","placeMatchConfidence":0.0,"qualityScore":0.0,"visualDescription":"short scene notes"}
placeMatchConfidence and qualityScore are 0 to 1.`,
    },
  ];
  for (let i = 0; i < usable.length; i += 1) {
    parts.push({ type: "text", text: `Candidate image [${i}]:` });
    parts.push({
      type: "image_url",
      image_url: { url: usable[i]!.dataUrl },
    });
  }

  const rawText = await openRouterVisionChatCompletion({
    apiKey: params.apiKey,
    model: params.model,
    messages: [
      {
        role: "system",
        content:
          "You are a local place-photo analyst. Match the geographic place entity only. Score recognizability, not HD polish. Soft but readable local photos are fine. Return only compact valid JSON.",
      },
      { role: "user", content: parts },
    ],
    temperature: 0.2,
    maxTokens: 4000,
  });

  let parsedObj: Record<string, unknown> = {};
  let pick: LocalImagePlacePick;
  try {
    parsedObj = parseJsonObjectFromModelText(rawText);
    pick = parseLocalImagePlacePick(parsedObj);
  } catch (parseErr) {
    const recovered = recoverLocalImagePickFromPartialText(rawText);
    if (!recovered) throw parseErr;
    pick = recovered;
  }
  assertPlaceMatchOrThrow(pick);
  assertImageQualityOrThrow(pick);
  if (pick.chosenIndex < 0 || pick.chosenIndex >= usable.length) {
    throw new Error(`Vision chosenIndex ${pick.chosenIndex} out of range`);
  }
  const chosen = usable[pick.chosenIndex]!;
  return { pick, item: chosen.item, dataUrl: chosen.dataUrl };
}

async function imageBase64FromGenerateResult(imageResult: {
  imageBase64?: string;
  imageUrl?: string;
}): Promise<string> {
  if (imageResult.imageBase64) {
    const s = imageResult.imageBase64;
    return s.includes(",") ? s.split(",")[1]! : s;
  }
  if (imageResult.imageUrl) {
    const imageResponse = await fetch(imageResult.imageUrl);
    const imageBlob = await imageResponse.blob();
    const reader = new FileReader();
    return new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const base64 = base64String.includes(",")
          ? base64String.split(",")[1]!
          : base64String;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(imageBlob);
    });
  }
  throw new Error("No image data available");
}

export type GenerateLocalInContentImageOptions = {
  html: string;
  site: WordPressSite;
  /** Place entity already resolved; if empty, derived from pageUrl + flowTitle. */
  entity?: string;
  pageUrl?: string;
  focusKeyword?: string;
  flowTitle?: string;
  forcedSectionHeader?: string;
  apiKey?: string;
  model?: string;
  /** Connected Integration sites for Find Local Image (cross-site reuse). */
  peerSites?: WordPressSite[];
  /**
   * Both modes search peer SAP caches first (other connected sites).
   * `find` = reuse only (error if no peer image).
   * `generate` = reuse peer hit, else Wikipedia/Google Images + AI replicate. Default.
   */
  localImageMode?: "find" | "generate";
  /**
   * Fired as soon as same-city peer library CSVs are built (before prefetch / DFS / AI).
   * Used to host Downloads in Details during Generate.
   */
  onPeerLibrariesReady?: (
    files: Array<{ name: string; content: string; mimeType: string }>,
  ) => void;
  /** Fired when peer sites to scrape are known (eligible, then market) — before crawl. */
  onPeerPlanReady?: (
    peers: Array<{ name: string; siteUrl: string }>,
  ) => void;
  /** Fired after each peer CSV is built during the crawl. */
  onPeerCsvReady?: (file: {
    name: string;
    content: string;
    mimeType: string;
  }) => void;
  /** Live Looking / Found / Generating micro-status for Details + progress band. */
  onLocalImagePhase?: (info: {
    phase: "looking" | "found" | "not_found" | "reusing" | "generating";
    detail?: string;
  }) => void;
};

export type GenerateLocalInContentImageResult = {
  html: string;
  imageUrl: string;
  mediaId?: number;
  alt: string;
  sectionHeader: string;
  entity: string;
  /** Remote image file URL from Google Images (never WP / data:). */
  referenceImageUrl: string;
  /** Publisher page URL from Google Images when available. */
  referenceSourceUrl?: string;
  visualDescription: string;
  /** Peer SAP site that contributed the reused in-content image. */
  sharedFromSiteName?: string;
  sharedFromPageUrl?: string;
  reusedFromCrossSite?: boolean;
  /** One CSV per same-city peer SAP library (for Details downloads). */
  peerCsvFiles?: Array<{ name: string; content: string; mimeType: string }>;
};

function base64FromDataUrl(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  if (i < 0) throw new Error("Invalid image data URL");
  return dataUrl.slice(i + 1);
}

/** Skip CTA / chrome headings when auto-placing Local Image near the top of the body. */
export function isWeakLocalImageHeading(header: string): boolean {
  const h = (header ?? "").trim().toLowerCase();
  if (!h) return true;
  if (h === "overview") return true;
  const weakPrefixes = [
    "book a",
    "book your",
    "contact",
    "hours",
    "quick links",
    "more areas",
    "faq",
    "frequently asked",
  ];
  for (const p of weakPrefixes) {
    if (h === p || h.startsWith(p)) return true;
  }
  return false;
}

/**
 * Prefer the first strong body H2 after Overview (else first strong H2).
 * Local place photos are easy to miss when AI buries them mid-article.
 */
export function pickEarlyLocalImageSectionHeader(
  sections: Array<{ header: string }>,
): string {
  let seenOverview = false;
  for (const s of sections) {
    const h = (s.header ?? "").trim();
    if (!h) continue;
    if (h.toLowerCase() === "overview") {
      seenOverview = true;
      continue;
    }
    if (seenOverview && !isWeakLocalImageHeading(h)) return h;
  }
  for (const s of sections) {
    const h = (s.header ?? "").trim();
    if (h && !isWeakLocalImageHeading(h)) return h;
  }
  return (sections[0]?.header ?? "").trim();
}

async function resolveSectionHeaderForLocalImage(params: {
  html: string;
  entity: string;
  focusKeyword: string;
  flowTitle?: string;
  forcedSectionHeader?: string;
  apiKey: string;
  researchModel: string;
}): Promise<string> {
  const markdownProjection = htmlBodyToMarkdownH2Projection(params.html);
  if (!markdownProjection.includes("## ")) {
    throw new Error("No H2 sections found in the content");
  }
  const sections = parseMarkdownSections(markdownProjection);
  const forced = (params.forcedSectionHeader ?? "").trim();
  if (forced) {
    return resolveForcedH2Section(sections, forced).header;
  }
  const early = pickEarlyLocalImageSectionHeader(sections);
  if (early) {
    return early;
  }
  return analyzeBestSectionForImage(
    markdownProjection,
    "photo",
    params.flowTitle || params.entity,
    `Local place photography for ${params.entity}`,
    undefined,
    params.apiKey,
    params.researchModel,
  );
}

export async function generateLocalInContentImageFromHtml(
  options: GenerateLocalInContentImageOptions,
): Promise<GenerateLocalInContentImageResult> {
  const apiKey = options.apiKey || loadApiKey();
  if (!apiKey?.trim()) {
    throw new Error("OpenRouter API key not found. Please set it in settings.");
  }

  const entity =
    (options.entity || "").trim() ||
    (await resolveLocalImagePlaceEntity({
      url: options.pageUrl,
      title: options.flowTitle,
      apiKey,
    }));

  const html = (options.html ?? "").trim();
  if (!html) throw new Error("No HTML body for Local Image");

  const researchModel = options.model || getResearchModel();
  const focusKeyword = (options.focusKeyword ?? "").trim() || entity;
  const localImageMode = options.localImageMode === "find" ? "find" : "generate";
  // Never search the site we are writing to — local images live on other connected sites.
  const peerSites = (options.peerSites ?? []).filter(
    (s) => !isCurrentConnectedSite(s, options.site),
  );

  const emitPhase = (info: {
    phase: "looking" | "found" | "not_found" | "reusing" | "generating";
    detail?: string;
  }) => {
    options.onLocalImagePhase?.(info);
  };

  // #region agent log
  fetch('http://127.0.0.1:7781/ingest/50ee427b-23ed-4bec-99ab-67b267c19331',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8ae1ef'},body:JSON.stringify({sessionId:'8ae1ef',runId:'pre-fix',hypothesisId:'A',location:'overview-blog-local-image-generate.ts:peer-gate',message:'Generate Local peer gate before search',data:{localImageMode,entity:String(entity||'').slice(0,120),incomingPeerCount:(options.peerSites??[]).length,filteredPeerCount:peerSites.length,peerNames:peerSites.slice(0,12).map((s)=>(s.name||s.siteUrl||'').slice(0,40)),hasApiKey:Boolean(apiKey?.trim()),willSearchPeers:peerSites.length>0},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  // Search OTHER connected SAP sites (all same-city peers; first image hit for reuse).
  if (peerSites.length) {
    emitPhase({
      phase: "looking",
      detail: "Looking for image on city peers",
    });
  }
  const peerSearch = peerSites.length
    ? await searchSapCrossSiteInContentImage({
        sites: peerSites,
        placeEntity: entity,
        apiKey,
        model: researchModel,
        excludePageUrl: options.pageUrl,
        excludeSite: options.site,
        onPeerPlanReady: options.onPeerPlanReady,
        onPeerCsvReady: options.onPeerCsvReady,
      })
    : { hit: null, peerCsvFiles: [] };
  const crossHit = peerSearch.hit;
  const peerCsvFiles = peerSearch.peerCsvFiles;
  if (peerCsvFiles.length) {
    options.onPeerLibrariesReady?.(peerCsvFiles);
  }

  // #region agent log
  fetch('http://127.0.0.1:7781/ingest/50ee427b-23ed-4bec-99ab-67b267c19331',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8ae1ef'},body:JSON.stringify({sessionId:'8ae1ef',runId:'pre-fix',hypothesisId:'E',location:'overview-blog-local-image-generate.ts:peer-result',message:'Peer search finished',data:{entity:String(entity||'').slice(0,120),found:Boolean(crossHit),sourceSiteName:crossHit?.sourceSiteName??null,sourcePageUrl:(crossHit?.sourcePageUrl||'').slice(0,120),imageUrlHost:(crossHit?.imageUrl||'').slice(0,80),peerCsvCount:peerCsvFiles.length,willFallThroughToDfs:!crossHit&&localImageMode!=='find'},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  if (crossHit) {
    emitPhase({
      phase: "found",
      detail: `Found on ${crossHit.sourceSiteName}`,
    });
    const dataUrl = await prefetchImageDataUrl(crossHit.imageUrl);
    // #region agent log
    fetch('http://127.0.0.1:7781/ingest/50ee427b-23ed-4bec-99ab-67b267c19331',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8ae1ef'},body:JSON.stringify({sessionId:'8ae1ef',runId:'pre-fix',hypothesisId:'F',location:'overview-blog-local-image-generate.ts:prefetch',message:'Peer hit prefetch result',data:{entity:String(entity||'').slice(0,120),sourceSiteName:crossHit.sourceSiteName,prefetchOk:Boolean(dataUrl),imageUrlHost:(crossHit.imageUrl||'').slice(0,100),willThrowOnFail:!dataUrl},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!dataUrl) {
      emitPhase({
        phase: "not_found",
        detail: "Peer image found but download failed",
      });
      throw new Error(`Could not download shared Local Image for "${entity}"`);
    }
    emitPhase({
      phase: "reusing",
      detail: "Uploading peer image",
    });
    let preparedDataUrl = dataUrl;
    try {
      const prepared = await prepareLocalImageDataUrl(dataUrl);
      preparedDataUrl = prepared.dataUrl;
    } catch {
      preparedDataUrl = dataUrl;
    }
    const sectionHeader = await resolveSectionHeaderForLocalImage({
      html,
      entity,
      focusKeyword,
      flowTitle: options.flowTitle,
      forcedSectionHeader: options.forcedSectionHeader,
      apiKey,
      researchModel,
    });
    // Connected-site media meta only (never keep peer alt/title).
    const altText = inContentImageAltFromFocusKeyword(focusKeyword, sectionHeader);
    const mediaTitle = inContentImageTitleFromFocusKeyword(focusKeyword, sectionHeader);
    const imageFileName = inContentImageFilenameFromFocusKeyword(focusKeyword);
    const uploadResult = await uploadWordPressMedia(
      options.site.siteUrl,
      options.site.username,
      options.site.appPassword,
      base64FromDataUrl(preparedDataUrl),
      imageFileName,
      mediaTitle,
      altText,
    );
    if (!uploadResult.success || !uploadResult.url) {
      throw new Error(
        uploadResult.error || "Failed to upload shared Local Image to WordPress",
      );
    }
    const htmlFigure = buildInContentImageFigureHtml({
      imageUrl: uploadResult.url,
      alt: altText,
      mediaId: uploadResult.mediaId,
    });
    return {
      html: insertFigureAfterH2(html, sectionHeader, htmlFigure),
      imageUrl: uploadResult.url,
      mediaId: uploadResult.mediaId,
      alt: altText,
      sectionHeader,
      entity,
      referenceImageUrl: crossHit.imageUrl,
      referenceSourceUrl: crossHit.sourcePageUrl,
      visualDescription: `Shared from ${crossHit.sourceSiteName}`,
      sharedFromSiteName: crossHit.sourceSiteName,
      sharedFromPageUrl: crossHit.sourcePageUrl,
      reusedFromCrossSite: true,
      peerCsvFiles,
    };
  } else if (peerSites.length) {
    emitPhase({
      phase: "not_found",
      detail: "Not found on peers",
    });
  }

  if (localImageMode === "find") {
    const err = new Error(`No shared Local Image found for "${entity}"`) as Error & {
      peerCsvFiles?: typeof peerCsvFiles;
    };
    err.peerCsvFiles = peerCsvFiles;
    throw err;
  }

  emitPhase({
    phase: "looking",
    detail: "Looking on Wikipedia",
  });
  let ref: LocalImageReference | null = null;
  try {
    ref = await tryWikipediaLocalImageReference({
      apiKey,
      model: researchModel,
      entity,
    });
  } catch {
    ref = null;
  }

  if (ref) {
    emitPhase({
      phase: "found",
      detail: "Found on Wikipedia",
    });
  } else {
    emitPhase({
      phase: "not_found",
      detail: "Not found on Wikipedia",
    });
    // #region agent log
    fetch('http://127.0.0.1:7781/ingest/50ee427b-23ed-4bec-99ab-67b267c19331',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8ae1ef'},body:JSON.stringify({sessionId:'8ae1ef',runId:'pre-fix',hypothesisId:'E',location:'overview-blog-local-image-generate.ts:dfs-start',message:'Falling through to DataForSEO Google Images',data:{entity:String(entity||'').slice(0,120),localImageMode},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    emitPhase({
      phase: "looking",
      detail: "Looking on Google Images",
    });
    const research = await researchGoogleImageReferences({
      apiKey,
      model: researchModel,
      context: {
        title: options.flowTitle,
        purpose: `Local place photograph of ${entity}`,
        sectionHeader: entity,
      },
      forcedTargets: buildLocalImageGoogleForcedTargets(entity),
      requireReferences: true,
    });
    const picked = research.references[0];
    if (!picked) {
      emitPhase({
        phase: "not_found",
        detail: "Not found on Google Images",
      });
      throw new Error(`No image references found for "${entity}"`);
    }
    emitPhase({
      phase: "found",
      detail: `Found on Google Images`,
    });
    ref = {
      dataUrl: picked.dataUrl,
      imageUrl: picked.imageUrl,
      sourceUrl: picked.sourceUrl,
      visualDescription: picked.visualDescription,
    };
  }

  emitPhase({
    phase: "generating",
    detail: "Generating image",
  });

  const referenceDataUrl = ref.dataUrl;

  const prompt = [
    `Replicate the attached reference photograph as a faithful visual copy.`,
    `Place: "${entity}".`,
    `Visual notes (for matching only, do not invent beyond the reference): ${ref.visualDescription}`,
    "CRITICAL RULES:",
    "- Do not embellish, stylize, enhance, restyle, color-grade, or alter the image in any way.",
    "- Do not add, remove, or invent objects, buildings, signs, people, animals, text, logos, or watermarks.",
    "- Match composition, architecture, materials, lighting, and viewpoint from the reference exactly.",
    "- Keep the image sharp and clear without inventing new detail that is not in the reference.",
    "- No Blind Magic, Hunter Douglas storefronts, retail shops, or product displays unless they are literally in the reference.",
  ].join(" ");

  const imageResult = await generateImage({
    apiKey,
    prompt,
    model: getImageModel(options.site?.id),
    aspectRatio: "16:9",
    referenceImageDataUrl: referenceDataUrl,
  });
  if (imageResult.error) throw new Error(imageResult.error);

  let imageBase64 = await imageBase64FromGenerateResult(imageResult);
  imageBase64 = await applyAiGeneratedImageDisclaimer(imageBase64);

  const sectionHeader = await resolveSectionHeaderForLocalImage({
    html,
    entity,
    focusKeyword,
    flowTitle: options.flowTitle,
    forcedSectionHeader: options.forcedSectionHeader,
    apiKey,
    researchModel,
  });

  const altText = inContentImageAltFromFocusKeyword(focusKeyword, sectionHeader);
  const mediaTitle = inContentImageTitleFromFocusKeyword(focusKeyword, sectionHeader);
  const imageFileName = inContentImageFilenameFromFocusKeyword(focusKeyword);

  const uploadResult = await uploadWordPressMedia(
    options.site.siteUrl,
    options.site.username,
    options.site.appPassword,
    imageBase64,
    imageFileName,
    mediaTitle,
    altText,
  );
  if (!uploadResult.success || !uploadResult.url) {
    throw new Error(uploadResult.error || "Failed to upload Local Image to WordPress");
  }

  const htmlFigure = buildInContentImageFigureHtml({
    imageUrl: uploadResult.url,
    alt: altText,
    mediaId: uploadResult.mediaId,
  });
  const updatedHtml = insertFigureAfterH2(html, sectionHeader, htmlFigure);

  const referenceImageUrl = ref.imageUrl;
  const referenceSourceUrl = ref.sourceUrl;

  return {
    html: updatedHtml,
    imageUrl: uploadResult.url,
    mediaId: uploadResult.mediaId,
    alt: altText,
    sectionHeader,
    entity,
    referenceImageUrl,
    referenceSourceUrl,
    visualDescription: ref.visualDescription,
    reusedFromCrossSite: false,
    peerCsvFiles,
  };
}
