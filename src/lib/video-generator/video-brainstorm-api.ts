import { getSessionToken } from "@/lib/auth-device";
import { getOpenRouterApiKeyForApp } from "@/lib/openrouter-api-key-resolve";
import { openRouterAppApiHeaders } from "@/lib/openrouter-app-api";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import type { VideoBriefReferenceClip } from "./video-generator-types";
import { videoLog, videoLogError, videoTimer } from "./video-log";

/** Thin client for the server-side video cut-up (ffmpeg runs in PHP). */

export type VideoSample = { time: number; dataUrl: string };

export type VideoLlmSegment = {
  part: number;
  startSec: number;
  endSec: number;
};

export type VideoSamplesResult = {
  id: string;
  durationSeconds: number;
  width: number;
  height: number;
  samples: VideoSample[];
  llmSegments?: VideoLlmSegment[];
  llmSegmentCount?: number;
};

export function referenceClipFromUpload(fileName: string, uploaded: VideoSamplesResult): VideoBriefReferenceClip {
  return {
    fileName,
    durationSeconds: uploaded.durationSeconds,
    serverId: uploaded.id,
    llmSegments: uploaded.llmSegments?.length ? uploaded.llmSegments : undefined,
  };
}

export type VideoBeatsResult = {
  beats: VideoSample[];
  sheetDataUrl: string;
};

/** Legacy JSON base64 upload (small clips only). Prefer uploadReferenceVideoFile. */
export function readVideoFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string" && result.startsWith("data:video/")) resolve(result);
      else reject(new Error(`Could not read video: ${file.name}`));
    };
    reader.onerror = () => reject(new Error(`Could not read video: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function brainstormApi<T>(path: string, body: unknown, apiKey: string): Promise<T> {
  const elapsed = videoTimer();
  const json = JSON.stringify(body);
  videoLog("brainstorm", `POST video/brainstorm/${path}`, { bodyBytes: json.length });
  const response = await fetch(backendApiUrl(`/video/brainstorm/${path}`), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: openRouterAppApiHeaders(apiKey),
    body: json,
  });
  const rawText = await response.text();
  let data: ({ ok?: boolean; error?: string } & Partial<T>) | null = null;
  try {
    data = JSON.parse(rawText);
  } catch {
    const isTooLarge = response.status === 413 || rawText.toLowerCase().includes("too large");
    const msg = isTooLarge
      ? `Payload exceeds server limit (HTTP 413).`
      : `Video API error (HTTP ${response.status})`;
    videoLogError("brainstorm", `POST video/brainstorm/${path} non-JSON response (${response.status})`, rawText.slice(0, 200));
    throw new Error(msg);
  }
  if (!response.ok || !data?.ok) {
    videoLogError("brainstorm", `POST video/brainstorm/${path} failed (${response.status}, ${elapsed()} s)`, data?.error);
    throw new Error(data?.error?.trim() || `Video API error (${response.status})`);
  }
  videoLog("brainstorm", `POST video/brainstorm/${path} ok`, { seconds: elapsed() });
  return data as T;
}

function uploadAuthHeaders(apiKey: string): Headers {
  const headers = new Headers();
  const key = apiKey.trim() || getOpenRouterApiKeyForApp().trim();
  const token = getSessionToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  else if (key) headers.set("Authorization", `Bearer ${key}`);
  if (key) headers.set("X-OpenRouter-Api-Key", key);
  return headers;
}

/** Multipart upload: streams the file to the server without base64 in memory. */
export async function uploadReferenceVideoFile(args: {
  apiKey: string;
  file: File;
  skipSamples?: boolean;
}): Promise<VideoSamplesResult> {
  const elapsed = videoTimer();
  videoLog("brainstorm", "POST video/brainstorm/upload (multipart)", {
    name: args.file.name,
    bytes: args.file.size,
  });
  const form = new FormData();
  form.append("video", args.file, args.file.name);
  if (args.skipSamples) form.append("skipSamples", "1");
  const response = await fetch(backendApiUrl("/video/brainstorm/upload"), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: uploadAuthHeaders(args.apiKey),
    body: form,
  });
  const rawText = await response.text();
  let data: ({ ok?: boolean; error?: string } & Partial<VideoSamplesResult>) | null = null;
  try {
    data = JSON.parse(rawText);
  } catch {
    const isTooLarge = response.status === 413 || rawText.toLowerCase().includes("too large");
    const msg = isTooLarge
      ? `Video file (${(args.file.size / (1024 * 1024)).toFixed(1)} MB) exceeds server upload limit (HTTP 413).`
      : `Video upload error (HTTP ${response.status})`;
    videoLogError("brainstorm", `upload non-JSON response (${response.status}, ${elapsed()} s)`, rawText.slice(0, 200));
    throw new Error(msg);
  }
  if (!response.ok || !data?.ok) {
    videoLogError("brainstorm", `upload failed (${response.status}, ${elapsed()} s)`, data?.error);
    throw new Error(data?.error?.trim() || `Video upload error (${response.status})`);
  }
  videoLog("brainstorm", "upload ok", {
    seconds: elapsed(),
    id: data.id,
    durationSeconds: data.durationSeconds,
    llmSegmentCount: data.llmSegmentCount ?? data.llmSegments?.length ?? 0,
  });
  return data as VideoSamplesResult;
}

/** Tiles the subject photos into one harness sheet on the server; the sheet is attached first to every agent and frame. */
export async function buildSubjectHarness(args: { apiKey: string; images: { fileName: string; dataUrl: string }[] }): Promise<string> {
  const result = await brainstormApi<{ id: string; harnessDataUrl: string }>("subject", { images: args.images }, args.apiKey);
  videoLog("brainstorm", "subject harness received", { id: result.id, photos: args.images.length, bytes: result.harnessDataUrl.length });
  return result.harnessDataUrl;
}

/** Uploads the video; returns one small frame every 2 s unless skipSamples (native LLM video input). */
export async function sampleVideoFrames(args: {
  apiKey: string;
  fileName: string;
  dataUrl: string;
  skipSamples?: boolean;
}): Promise<VideoSamplesResult> {
  const result = await brainstormApi<VideoSamplesResult>(
    "frames",
    { fileName: args.fileName, dataUrl: args.dataUrl, skipSamples: args.skipSamples === true },
    args.apiKey,
  );
  videoLog("brainstorm", "samples received", {
    id: result.id,
    durationSeconds: result.durationSeconds,
    size: `${result.width}x${result.height}`,
    samples: result.samples.map((s) => s.time),
    llmSegmentCount: result.llmSegmentCount ?? result.llmSegments?.length ?? 0,
  });
  return result;
}

/** Cuts full-size stills at `times` (in order) and one contact sheet of them. */
export async function cutVideoBeats(args: { apiKey: string; id: string; times: number[] }): Promise<VideoBeatsResult> {
  const result = await brainstormApi<VideoBeatsResult>(`${encodeURIComponent(args.id)}/beats`, { times: args.times }, args.apiKey);
  videoLog("brainstorm", "beats received", { beats: result.beats.map((b) => b.time), sheetBytes: result.sheetDataUrl.length });
  return result;
}
