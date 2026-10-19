import { useCallback, useEffect, useState } from "react";
import {
  manualReferenceFromDataUrl,
  prepareVideoStudioReference,
  referenceUploadFiles,
  type ManualImageReference,
} from "@/lib/image-generator/manual-reference-upload";
import { runVideoBrainstorm } from "@/lib/video-generator/video-brainstorm-agent";
import { cutVideoBeats, sampleVideoFrames, type VideoSample } from "@/lib/video-generator/video-brainstorm-api";
import { videoLog, videoLogError, videoTimer } from "@/lib/video-generator/video-log";
import type { BrainstormBrief } from "./useVideoGenerator";

export type BrainstormVideo = { file: File; previewUrl: string };

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Reads the client video as a data URL for the server-side cut-up (`readFileAsDataUrl` accepts images only). */
function readVideoAsDataUrl(file: File): Promise<string> {
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

function beatFileName(index: number, title: string): string {
  return `beat-${String(index + 1).padStart(2, "0")}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`;
}

/** Brainstorming step: notes plus one drop field for product images and a client video; the producer agent fills the Brief. `subjectDataUrl` is the subject harness sheet, attached first. */
export function useVideoBrainstorm(apiKey: string, onBrief: (brief: BrainstormBrief) => void, subjectDataUrl?: string) {
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<ManualImageReference[]>([]);
  const [video, setVideo] = useState<BrainstormVideo | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => () => void (video && URL.revokeObjectURL(video.previewUrl)), [video]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    videoLog("brainstorm", "files added", list.map((f) => ({ name: f.name, type: f.type, bytes: f.size })));
    const clip = list.find((f) => f.type.startsWith("video/"));
    if (clip) setVideo({ file: clip, previewUrl: URL.createObjectURL(clip) });
    const stills = referenceUploadFiles(list);
    if (!stills.length) return;
    setIsPreparing(true);
    setError("");
    try {
      const prepared = await Promise.all(stills.map((f) => prepareVideoStudioReference(f)));
      videoLog("brainstorm", "images prepared", prepared.map((r) => ({ fileName: r.fileName, bytes: r.dataUrl.length })));
      setImages((prev) => [...prev, ...prepared]);
    } catch (e) {
      videoLogError("brainstorm", "image prepare failed", e);
      setError(errorText(e));
    } finally {
      setIsPreparing(false);
    }
  }, []);

  const removeImage = useCallback((id: string) => setImages((prev) => prev.filter((r) => r.id !== id)), []);
  const removeVideo = useCallback(() => setVideo(null), []);

  const canBrainstorm = Boolean(notes.trim() || images.length || video);

  const brainstorm = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) {
      setError("OpenRouter API key is missing. Add it in Dashboard > API Keys.");
      return;
    }
    if (!canBrainstorm) return;
    setError("");
    const elapsed = videoTimer();
    videoLog("brainstorm", "start", { notesChars: notes.length, images: images.length, video: video?.file.name ?? null, subjectHarness: Boolean(subjectDataUrl) });
    try {
      let samples: VideoSample[] = [];
      let sampled: { id: string; durationSeconds: number } | undefined;
      if (video) {
        setBusy("Cutting the video into sample frames");
        videoLog("brainstorm", "reading video file", { name: video.file.name, bytes: video.file.size });
        const result = await sampleVideoFrames({ apiKey: key, fileName: video.file.name, dataUrl: await readVideoAsDataUrl(video.file) });
        samples = result.samples;
        sampled = result;
      }
      setBusy("Producer is writing the brief");
      const result = await runVideoBrainstorm({
        apiKey: key,
        notes,
        subjectDataUrl,
        images: images.map((r) => ({ fileName: r.fileName, dataUrl: r.dataUrl })),
        samples,
        durationSeconds: sampled?.durationSeconds,
      });
      let references: ManualImageReference[] = images;
      if (sampled && result.beats.length) {
        setBusy(`Cutting ${result.beats.length} beat frames and the contact sheet`);
        const cut = await cutVideoBeats({ apiKey: key, id: sampled.id, times: result.beats.map((b) => b.sampleTime) });
        const [sheet, ...beats] = await Promise.all([
          manualReferenceFromDataUrl("contact-sheet.png", cut.sheetDataUrl),
          ...cut.beats.map((b, i) => manualReferenceFromDataUrl(beatFileName(i, result.beats[i].title), b.dataUrl)),
        ]);
        references = [...images, sheet, ...beats];
      }
      videoLog("brainstorm", "brief handed to the generator", {
        seconds: elapsed(),
        lengthSeconds: result.lengthSeconds,
        aspect: result.aspect,
        references: references.map((r) => r.fileName),
        brief: result.brief,
      });
      onBrief({ prompt: result.brief, lengthSeconds: result.lengthSeconds, aspect: result.aspect, references });
    } catch (e) {
      videoLogError("brainstorm", `failed after ${elapsed()} s`, e);
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }, [apiKey, canBrainstorm, images, notes, onBrief, subjectDataUrl, video]);

  return { notes, setNotes, images, video, isPreparing, busy, error, canBrainstorm, addFiles, removeImage, removeVideo, brainstorm };
}
