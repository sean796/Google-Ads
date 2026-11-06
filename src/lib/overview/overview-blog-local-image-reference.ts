import {
  openRouterVisionChatCompletion,
  parseJsonObjectFromModelText,
  type OpenRouterVisionContentPart,
} from "@/lib/openrouter-vision-chat";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { fetchWikipediaPageLeadImage } from "@/lib/wikipedia/mediawiki-pageimage";
import type { GoogleImagesSerpItem } from "@/lib/overview/overview-local-image-dfs-normalize";
import {
  assertImageQualityOrThrow,
  assertPlaceMatchOrThrow,
  capGoogleImagesCandidates,
  LOCAL_IMAGE_CANDIDATE_LIMIT,
  parseLocalImagePlacePick,
  recoverLocalImagePickFromPartialText,
  type LocalImagePlacePick,
} from "@/lib/overview/overview-blog-local-image-pick";

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
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
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

export async function fetchGoogleImagesForEntity(
  keyword: string,
): Promise<GoogleImagesSerpItem[]> {
  const res = await fetch(backendApiUrl("/dataforseo/google-images"), {
    method: "POST",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
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

export async function prefetchImageDataUrl(imageUrl: string, referer?: string): Promise<string | null> {
  try {
    const res = await fetch(backendApiUrl("/images/fetch-data-url"), {
      method: "POST",
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
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

export type LocalImageReference = {
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

export async function tryWikipediaLocalImageReference(params: {
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

export async function pickBestPlaceImage(params: {
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

export async function imageBase64FromGenerateResult(imageResult: {
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
