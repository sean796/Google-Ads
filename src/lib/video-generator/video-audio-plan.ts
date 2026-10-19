/** How the final MP4 handles music under picture (render pipeline hooks in later). */
export type VideoBackingTrackMode = "none" | "generated" | "upload_later";

export type VideoPlanAudio = {
  backingTrack: VideoBackingTrackMode;
  /** Mood and genre brief for AI backing track when backingTrack is "generated". */
  backingTrackPrompt?: string;
};

export const VIDEO_AUDIO_CLARIFY_QUESTION_ID = "audio_generation";

export function formatVideoPlanAudioSummary(audio: VideoPlanAudio | undefined): string {
  if (!audio || audio.backingTrack === "none") {
    return "Silent (no backing track)";
  }
  if (audio.backingTrack === "upload_later") {
    return "User will upload music";
  }
  const mood = audio.backingTrackPrompt?.trim();
  return mood ? `AI backing track: ${mood}` : "AI backing track (prompt pending)";
}

export function parseVideoPlanAudio(raw: unknown): VideoPlanAudio | undefined {
  if (raw === undefined || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  const mode = String(o.backingTrack ?? "none").trim() as VideoBackingTrackMode;
  if (mode !== "none" && mode !== "generated" && mode !== "upload_later") {
    throw new Error('Director plan audio.backingTrack must be "none", "generated", or "upload_later".');
  }
  const backingTrackPrompt =
    typeof o.backingTrackPrompt === "string" ? o.backingTrackPrompt.trim() : undefined;
  if (mode === "generated" && !backingTrackPrompt) {
    throw new Error("Director plan audio.backingTrackPrompt is required when backingTrack is generated.");
  }
  if (mode !== "generated" && backingTrackPrompt) {
    return { backingTrack: mode, backingTrackPrompt: undefined };
  }
  return { backingTrack: mode, ...(backingTrackPrompt ? { backingTrackPrompt } : {}) };
}
