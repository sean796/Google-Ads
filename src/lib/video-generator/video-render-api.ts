import { openRouterAppApiHeaders } from "@/lib/openrouter-app-api";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import type {
  VideoProjectSnapshot,
  VideoProjectSummary,
  VideoRenderSnapshot,
  VideoStoredRenderSummary,
  VideoTransition,
} from "./video-generator-types";
import type { HeygenVoice, VideoAspect, VideoResolution } from "./video-model-defaults";
import { videoLog, videoLogError, videoTimer } from "./video-log";

/** Thin client for the server-side render, project storage, local clips inventory, and ZIP export (all run in PHP). */

async function videoApi<T>(path: string, init: { method: "GET" | "POST" | "DELETE"; body?: unknown; apiKey?: string }): Promise<T> {
  const elapsed = videoTimer();
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  videoLog("render", `${init.method} video/${path}`, { bodyBytes: body?.length ?? 0 });
  const response = await fetch(backendApiUrl(`/video/${path}`), {
    method: init.method,
    credentials: "include",
    cache: "no-store",
    headers: openRouterAppApiHeaders(init.apiKey),
    body,
  });
  const data = (await response.json()) as { ok?: boolean; error?: string } & T;
  if (!response.ok || !data.ok) {
    videoLogError("render", `${init.method} video/${path} failed (${response.status}, ${elapsed()} s)`, data.error);
    throw new Error(data.error?.trim() || `Video API error (${response.status})`);
  }
  videoLog("render", `${init.method} video/${path} ok`, { seconds: elapsed() });
  return data;
}

export type CreateVideoRenderScene = {
  id: string;
  order: number;
  durationSeconds: number;
  videoPrompt: string;
  narration: string;
  transitionIn?: VideoTransition;
  customClipFile?: string;
};

export async function createVideoRender(args: {
  apiKey: string;
  model: string;
  resolution: VideoResolution;
  aspectRatio: VideoAspect;
  voiceModel: string;
  /** "none" renders without a narration track. */
  voice: HeygenVoice | "none";
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  scenes: CreateVideoRenderScene[];
}): Promise<string> {
  const { apiKey, ...body } = args;
  videoLog("render", "submit", {
    model: body.model,
    resolution: body.resolution,
    aspectRatio: body.aspectRatio,
    voice: body.voice,
    fadeInSeconds: body.fadeInSeconds ?? 0,
    fadeOutSeconds: body.fadeOutSeconds ?? 0,
    scenes: body.scenes.map((s) => ({ order: s.order, durationSeconds: s.durationSeconds, join: s.transitionIn?.type ?? "open", videoPrompt: s.videoPrompt })),
  });
  const data = await videoApi<{ id: string }>("render", { method: "POST", body, apiKey });
  videoLog("render", "job created", { renderId: data.id });
  return data.id;
}

export async function uploadVideoRenderFrame(args: {
  apiKey: string;
  renderId: string;
  sceneId: string;
  dataUrl: string;
}): Promise<void> {
  await videoApi(`render/${encodeURIComponent(args.renderId)}/frame`, {
    method: "POST",
    body: { sceneId: args.sceneId, dataUrl: args.dataUrl },
    apiKey: args.apiKey,
  });
}

export async function startVideoRender(args: { apiKey: string; renderId: string }): Promise<VideoRenderSnapshot> {
  const data = await videoApi<{ render: VideoRenderSnapshot }>(`render/${encodeURIComponent(args.renderId)}/start`, {
    method: "POST",
    body: {},
    apiKey: args.apiKey,
  });
  return data.render;
}

export async function fetchVideoRender(args: { apiKey: string; renderId: string }): Promise<VideoRenderSnapshot> {
  const data = await videoApi<{ render: VideoRenderSnapshot }>(`render/${encodeURIComponent(args.renderId)}`, {
    method: "GET",
    apiKey: args.apiKey,
  });
  videoLog("render", `poll ${args.renderId}`, data.render);
  return data.render;
}

/** Non-destructively re-render a single scene clip (and re-stitch final.mp4 when complete) while keeping all other scene clips. */
export async function rerenderVideoScene(args: {
  apiKey: string;
  renderId: string;
  sceneId: string;
  dataUrl?: string;
  videoPrompt?: string;
  narration?: string;
  transitionIn?: VideoTransition;
}): Promise<VideoRenderSnapshot> {
  const { apiKey, renderId, sceneId, ...body } = args;
  const data = await videoApi<{ render: VideoRenderSnapshot }>(
    `render/${encodeURIComponent(args.renderId)}/scene/${encodeURIComponent(sceneId)}/rerender`,
    {
      method: "POST",
      body,
      apiKey,
    },
  );
  return data.render;
}

/** Re-run final FFmpeg stitch across already-rendered scene clips (and any newly added custom clips) without re-buying OpenRouter video clips. */
export async function restitchVideoRender(args: {
  apiKey: string;
  renderId: string;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  scenes?: Array<{
    id: string;
    order?: number;
    durationSeconds?: number;
    transitionIn?: VideoTransition;
    customClipFile?: string;
  }>;
}): Promise<VideoRenderSnapshot> {
  const { apiKey, renderId, ...body } = args;
  const data = await videoApi<{ render: VideoRenderSnapshot }>(
    `render/${encodeURIComponent(args.renderId)}/restitch`,
    {
      method: "POST",
      body,
      apiKey,
    },
  );
  return data.render;
}

/** Uploads a user video clip to `{uploads}/neo-pulse-video/user-clips/`, probes its duration, and extracts a thumbnail frame for the timeline. */
export async function uploadTimelineVideoClip(args: {
  apiKey?: string;
  fileName: string;
  dataUrl: string;
}): Promise<{
  clipFile: string;
  clipUrl: string;
  thumbnailDataUrl: string;
  durationSeconds: number;
}> {
  const data = await videoApi<{
    clipFile: string;
    clipUrl: string;
    thumbnailDataUrl: string;
    durationSeconds: number;
  }>("clips/upload", {
    method: "POST",
    body: { fileName: args.fileName, dataUrl: args.dataUrl },
    apiKey: args.apiKey,
  });
  return {
    clipFile: data.clipFile,
    clipUrl: data.clipUrl,
    thumbnailDataUrl: data.thumbnailDataUrl,
    durationSeconds: data.durationSeconds,
  };
}

/** Lists saved projects and local renders/clips stored on the server disk. */
export async function listVideoProjects(args: { apiKey?: string } = {}): Promise<{
  projects: VideoProjectSummary[];
  renders: VideoStoredRenderSummary[];
}> {
  const data = await videoApi<{
    projects: VideoProjectSummary[];
    renders: VideoStoredRenderSummary[];
  }>("projects", {
    method: "GET",
    apiKey: args.apiKey,
  });
  return { projects: data.projects ?? [], renders: data.renders ?? [] };
}

/** Saves a full VideoProjectSnapshot to the server's projects directory. */
export async function saveVideoProject(args: {
  apiKey?: string;
  project: VideoProjectSnapshot;
}): Promise<VideoProjectSummary> {
  const data = await videoApi<{ summary: VideoProjectSummary }>("projects", {
    method: "POST",
    body: { project: args.project },
    apiKey: args.apiKey,
  });
  return data.summary;
}

/** Loads a full VideoProjectSnapshot from the server's projects directory. */
export async function loadVideoProject(args: {
  apiKey?: string;
  projectId: string;
}): Promise<VideoProjectSnapshot> {
  const data = await videoApi<{ project: VideoProjectSnapshot }>(
    `projects/${encodeURIComponent(args.projectId)}`,
    {
      method: "GET",
      apiKey: args.apiKey,
    },
  );
  return parseVideoProjectJson(data.project);
}

/** Deletes a saved project from the server's projects directory. */
export async function deleteVideoProject(args: {
  apiKey?: string;
  projectId: string;
}): Promise<void> {
  await videoApi(`projects/${encodeURIComponent(args.projectId)}`, {
    method: "DELETE",
    apiKey: args.apiKey,
  });
}

/** Builds a ZIP archive on the server containing `final.mp4`, individual `clips/scene-XX.mp4` files, keyframes, environment plates, product views, and `project.json`, returning its download URL. */
export async function exportVideoProjectZip(args: {
  apiKey?: string;
  project: VideoProjectSnapshot;
}): Promise<{ zipUrl: string; fileName: string }> {
  const data = await videoApi<{ zipUrl: string; fileName: string }>("export-zip", {
    method: "POST",
    body: { project: args.project },
    apiKey: args.apiKey,
  });
  return { zipUrl: data.zipUrl, fileName: data.fileName };
}

export function serializeVideoProjectJson(project: VideoProjectSnapshot): string {
  return JSON.stringify(project, null, 2);
}

export function parseVideoProjectJson(raw: unknown): VideoProjectSnapshot {
  const obj = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>;
  if (!obj || typeof obj !== "object") {
    throw new Error("Invalid project JSON: expected an object.");
  }
  if (obj.version !== 1) {
    throw new Error(`Unsupported project JSON version: ${String(obj.version ?? "missing")}.`);
  }
  const id = String(obj.id ?? "").trim();
  const name = String(obj.name ?? "").trim();
  if (!id || !name) {
    throw new Error("Project JSON is missing id or name.");
  }
  const productLock = obj.productLock as VideoProjectSnapshot["productLock"] | undefined;
  if (!productLock || !Array.isArray(productLock.views)) {
    throw new Error("Project JSON is missing productLock.views.");
  }
  return {
    version: 1,
    id,
    name,
    updatedAt: String(obj.updatedAt ?? new Date().toISOString()),
    step: (obj.step as VideoProjectSnapshot["step"]) ?? "brief",
    maxStep: (obj.maxStep as VideoProjectSnapshot["maxStep"]) ?? "brief",
    videoModel: String(obj.videoModel ?? ""),
    prompt: String(obj.prompt ?? ""),
    lengthSeconds: Number(obj.lengthSeconds ?? 30) as VideoProjectSnapshot["lengthSeconds"],
    aspect: (obj.aspect as VideoProjectSnapshot["aspect"]) ?? "16:9",
    resolution: (obj.resolution as VideoProjectSnapshot["resolution"]) ?? "720p",
    references: Array.isArray(obj.references) ? (obj.references as VideoProjectSnapshot["references"]) : [],
    subjectPhotos: Array.isArray(obj.subjectPhotos) ? (obj.subjectPhotos as VideoProjectSnapshot["subjectPhotos"]) : [],
    subject: (obj.subject as VideoProjectSnapshot["subject"]) ?? null,
    environmentHarnessDataUrl:
      typeof obj.environmentHarnessDataUrl === "string" ? obj.environmentHarnessDataUrl : undefined,
    productLock,
    questions: Array.isArray(obj.questions) ? (obj.questions as VideoProjectSnapshot["questions"]) : null,
    answers:
      obj.answers && typeof obj.answers === "object"
        ? (obj.answers as Record<string, string>)
        : {},
    plan: (obj.plan as VideoProjectSnapshot["plan"]) ?? null,
    frames: Array.isArray(obj.frames) ? (obj.frames as VideoProjectSnapshot["frames"]) : [],
    render: (obj.render as VideoProjectSnapshot["render"]) ?? null,
    selectedSceneId: typeof obj.selectedSceneId === "string" ? obj.selectedSceneId : null,
  };
}
