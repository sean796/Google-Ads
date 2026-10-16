import type { FlowFreeformClarifyQuestion } from "@/lib/flow-freeform/flow-freeform-types";
import type { ManualImageReference } from "@/lib/image-generator/manual-reference-upload";
import type { HeygenVoice, VideoAspect, VideoLengthSeconds, VideoResolution } from "./video-model-defaults";

export type { FlowFreeformClarifyQuestion as VideoClarifyQuestion };

export type ProductViewId = "front_elevation" | "side_elevation" | "three_quarter" | "glazing_detail";

export type ProductViewStatus = "waiting" | "generating" | "done" | "failed";

export type ProductView = {
  id: ProductViewId;
  label: string;
  status: ProductViewStatus;
  imageDataUrl?: string;
  error?: string;
  /** Persistent natural-language prompt instructions applied to this product view. */
  revisionNotes?: string[];
};

export type ProductFaceName = "front long side" | "rear long side" | "left end" | "right end" | "roof" | "base";

/** One face of the product as photographed; `photos` are 1-based indexes into the subject photos, empty when no photo shows it. */
export type ProductFace = {
  face: ProductFaceName;
  photos: number[];
  /** Where in the cited photos this face appears; "" when photos is empty. */
  where: string;
  inventory: string;
};

/** Product survey read from the subject photos: what is on each face and which photo proves it. */
export type ProductSpec = {
  name: string;
  summary: string;
  faces: ProductFace[];
  mustNotChange: string[];
  /** User-supplied natural-language product overrides applied during Product Lock. */
  revisionNotes?: string[];
};

export type ProductLockState = {
  spec: ProductSpec | null;
  views: ProductView[];
  locked: boolean;
};

export type VideoBrief = {
  prompt: string;
  lengthSeconds: VideoLengthSeconds;
  aspect: VideoAspect;
  resolution: VideoResolution;
  references: ManualImageReference[];
  /** Subject harness: the product photos tiled into one sheet, attached first to every agent and storyboard frame. */
  subject: ManualImageReference | null;
  /** Canonical product specification locked in the Product step. */
  productSpec?: ProductSpec | null;
  /** Locked studio view data URLs keyed by ProductViewId. */
  productViews?: Partial<Record<ProductViewId, string>>;
  /** Contact sheet of rendered scene environment plates. */
  environmentHarnessDataUrl?: string;
};

export type VideoTransitionType =
  | "cut"
  | "continue"
  | "dissolve"
  | "fade_black"
  | "fade_white"
  | "wipe_left"
  | "wipe_right"
  | "zoom_in";

export const VIDEO_TRANSITION_OPTIONS: ReadonlyArray<{
  value: VideoTransitionType;
  label: string;
  shortLabel: string;
  hasDuration: boolean;
  defaultSeconds: number;
}> = [
  { value: "dissolve", label: "Cross dissolve", shortLabel: "Dissolve", hasDuration: true, defaultSeconds: 0.7 },
  { value: "fade_black", label: "Fade through black", shortLabel: "Fade black", hasDuration: true, defaultSeconds: 0.8 },
  { value: "fade_white", label: "Fade through white", shortLabel: "Fade white", hasDuration: true, defaultSeconds: 0.7 },
  { value: "wipe_left", label: "Slide left", shortLabel: "Slide L", hasDuration: true, defaultSeconds: 0.6 },
  { value: "wipe_right", label: "Slide right", shortLabel: "Slide R", hasDuration: true, defaultSeconds: 0.6 },
  { value: "zoom_in", label: "Zoom transition", shortLabel: "Zoom", hasDuration: true, defaultSeconds: 0.6 },
  { value: "cut", label: "Hard cut (0s)", shortLabel: "Cut", hasDuration: false, defaultSeconds: 0 },
  { value: "continue", label: "Seamless continue (0s)", shortLabel: "Continue", hasDuration: false, defaultSeconds: 0 },
];

export const VIDEO_TRANSITION_DURATIONS: readonly number[] = [0.5, 0.7, 1.0, 1.2];
export const VIDEO_FADE_DURATIONS: readonly number[] = [0, 0.5, 0.8, 1.2];

export function formatTransitionBadge(transition?: VideoTransition | null): string {
  if (!transition) return "Opens";
  const opt = VIDEO_TRANSITION_OPTIONS.find((o) => o.value === transition.type);
  const short = opt?.shortLabel ?? transition.type;
  return opt?.hasDuration && transition.seconds > 0 ? `${short} ${transition.seconds}s` : short;
}

/**
 * How this scene joins the previous one:
 * - `cut`: 0s hard cut that starts directly from this scene's approved storyboard still.
 * - `continue`: single-take continuation that starts from the previous clip's last frame and targets this scene's storyboard still.
 * - `dissolve` | `fade_black` | `fade_white` | `wipe_left` | `wipe_right` | `zoom_in`: 0.4..1.5s FFmpeg xfade transition.
 */
export type VideoTransition = {
  type: VideoTransitionType;
  /** Transition length in seconds (0 for cut and continue; 0.4..1.5 for xfade transitions). */
  seconds: number;
};

export type VideoScreenDirection = "left_to_right" | "right_to_left";

/** Plan-wide rules every frame and clip must obey. */
export type VideoPlanContinuity = {
  heroSubject: string;
  screenDirection: VideoScreenDirection;
  cameraSide: string;
  palette: string;
  lightArc: string;
};

export type VideoScenePlan = {
  id: string;
  order: number;
  title: string;
  durationSeconds: number;
  /** Director's full scene instructions (what happens, why it matters). */
  sceneInstructions: string;
  /** Shared location identifier (snake_case) so scenes at the same physical site share one anchored Environment Plate. */
  environmentId?: string;
  /** Empty-stage environment description (ground, piers/pad, background walls/trees/mountains, light) without the hero product. */
  environmentPrompt?: string;
  /** Opening still for the storyboard artist. */
  storyboardPrompt: string;
  /** Camera and subject motion over the clip. */
  motionPrompt: string;
  continuityNotes: string;
  /** Voiceover spoken over this scene (plain spoken English). */
  narration: string;
  /** 1-based positions in `VideoBrief.references` this scene's opening frame is drawn from (empty when none). */
  referenceIndexes: number[];
  /** Best canonical studio view angle to anchor product geometry for this scene when a ProductLock is present. */
  productView?: ProductViewId;
  /** Absent on scene 1; required on every later scene. */
  transitionIn?: VideoTransition;
  /** Persistent natural-language revision notes applied to this scene in Pre-Scene Review or Post-Cut. */
  revisionNotes?: string[];
  /** Whether the user approved this scene's simplified brief in the Pre-Scene Plan Review gate. */
  approved?: boolean;
  /** Server-relative path under neo-pulse-video/ when this scene is an uploaded or library video clip rather than an AI-generated clip. */
  customClipFile?: string;
  /** Public URL for immediate playback of an uploaded or library video clip on the timeline. */
  customClipUrl?: string;
};

export type VideoPlan = {
  title: string;
  logline: string;
  continuity: VideoPlanContinuity;
  /** HeyGen Voice 1 voice for the narration track; "none" when the brief did not ask for narration (every scene narration is then ""). */
  voice: HeygenVoice | "none";
  /** Optional fade-in from black at the start of Scene 1 (0..1.5 s). */
  fadeInSeconds?: number;
  /** Optional fade-out to black at the end of the final scene (0..1.5 s). */
  fadeOutSeconds?: number;
  scenes: VideoScenePlan[];
};

export type StoryboardFrameStatus = "waiting" | "generating" | "done" | "failed";

export type StoryboardFrame = {
  sceneId: string;
  status: StoryboardFrameStatus;
  /** Rendered Environment Plate for this scene (ground, foundation piers/floor, surroundings) before compositing the product. */
  environmentDataUrl?: string;
  environmentStatus?: StoryboardFrameStatus;
  imageDataUrl?: string;
  /** Final clip prompt written by the Cinematographer from the finished frame. */
  videoPrompt?: string;
  error?: string;
};

export type VideoRenderSceneStatus = "queued" | "generating" | "done" | "failed";

export type VideoRenderScene = {
  sceneId: string;
  status: VideoRenderSceneStatus;
  clipUrl?: string;
  error?: string;
};

export type VideoRenderStatus = "created" | "rendering" | "stitching" | "done" | "failed";

export type VideoRenderSnapshot = {
  id: string;
  status: VideoRenderStatus;
  scenes: VideoRenderScene[];
  finalUrl?: string;
  error?: string;
};

/** Full serializable project snapshot that can be saved to disk or downloaded as a `.neopulse.json` file to resume at any step. */
export type VideoProjectSnapshot = {
  version: 1;
  id: string;
  name: string;
  updatedAt: string;
  step: "brainstorm" | "brief" | "product" | "questions" | "plan" | "storyboard" | "render";
  maxStep: "brainstorm" | "brief" | "product" | "questions" | "plan" | "storyboard" | "render";
  videoModel: string;
  prompt: string;
  lengthSeconds: VideoLengthSeconds;
  aspect: VideoAspect;
  resolution: VideoResolution;
  references: ManualImageReference[];
  subjectPhotos: ManualImageReference[];
  subject: ManualImageReference | null;
  environmentHarnessDataUrl?: string;
  productLock: ProductLockState;
  questions: VideoClarifyQuestion[] | null;
  answers: Record<string, string>;
  plan: VideoPlan | null;
  frames: StoryboardFrame[];
  render: VideoRenderSnapshot | null;
  selectedSceneId: string | null;
};

export type VideoProjectSummary = {
  id: string;
  name: string;
  updatedAt: string;
  step: VideoProjectSnapshot["step"];
  sceneCount: number;
  renderId?: string;
  finalUrl?: string;
};

export type VideoStoredClip = {
  sceneId: string;
  order: number;
  durationSeconds: number;
  status: VideoRenderSceneStatus;
  clipUrl?: string;
  clipFile?: string;
  frameUrl?: string;
};

export type VideoStoredRenderSummary = {
  id: string;
  status: VideoRenderStatus;
  model: string;
  resolution: string;
  aspect: string;
  createdAt: string;
  finalUrl?: string;
  clips: VideoStoredClip[];
};

