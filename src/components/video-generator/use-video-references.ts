import { errorText, sortReferencesByFileName, type BrainstormBrief } from "@/components/video-generator/video-generator-helpers";
import { useCallback } from "react";
import type { ManualImageReference } from "@/lib/image-generator/manual-reference-upload";
import { manualReferenceFromDataUrl, prepareVideoStudioReference, referenceUploadFiles } from "@/lib/image-generator/manual-reference-upload";
import { buildSubjectHarness, referenceClipFromUpload, uploadReferenceVideoFile } from "@/lib/video-generator/video-brainstorm-api";
import type { VideoBriefReferenceClip } from "@/lib/video-generator/video-generator-types";
import { videoLog, videoLogError } from "@/lib/video-generator/video-log";
import type { VideoGeneratorState } from "@/components/video-generator/use-video-generator-state";

export function useVideoReferences(s: VideoGeneratorState) {
  const {
    prompt,
    setPrompt,
    lengthSeconds,
    setLengthSeconds,
    aspect,
    setAspect,
    references,
    setReferences,
    referenceVideo,
    setReferenceVideo,
    setIsPreparingReferences,
    setIsPreparingReferenceVideo,
    subjectPhotos,
    setSubjectPhotos,
    subject,
    setSubject,
    setIsPreparingSubject,
    setError,
    brief,
    advance,
    requireApiKey,
  } = s;

const addReferenceFiles = useCallback(async (files: FileList | File[]) => {
  const list = referenceUploadFiles(files);
  if (!list.length) {
    setError("Story-beat references must be images, not video. Use a reference video on the Video filter tab.");
    return;
  }
  setIsPreparingReferences(true);
  setError("");
  try {
    const settled = await Promise.allSettled(list.map((f) => prepareVideoStudioReference(f)));
    const prepared = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
    const failed = settled.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    if (!prepared.length) {
      setError(errorText(failed[0]?.reason ?? "Could not read the selected files as images."));
      return;
    }
    setReferences((prev) => sortReferencesByFileName([...prev, ...prepared]));
    if (failed.length) {
      setError(`${prepared.length} reference(s) added. ${failed.length} file(s) could not be read as images.`);
    }
  } catch (e) {
    setError(errorText(e));
  } finally {
    setIsPreparingReferences(false);
  }
}, [setError, setIsPreparingReferences, setReferences]);

const removeReference = useCallback((id: string) => {
  setReferences((prev) => prev.filter((r) => r.id !== id));
}, [setReferences]);

const uploadReferenceVideo = useCallback(
  async (file: File): Promise<VideoBriefReferenceClip> => {
    const key = requireApiKey();
    if (!key) throw new Error("OpenRouter API key is missing. Add it in Dashboard > API Keys.");
    setIsPreparingReferenceVideo(true);
    setError("");
    try {
      const uploaded = await uploadReferenceVideoFile({ apiKey: key, file, skipSamples: true });
      const previewUrl = URL.createObjectURL(file);
      const clip: VideoBriefReferenceClip = { ...referenceClipFromUpload(file.name, uploaded), previewUrl };
      setReferenceVideo((prev) => {
        if (prev?.previewUrl?.startsWith("blob:") && prev.previewUrl !== previewUrl) {
          URL.revokeObjectURL(prev.previewUrl);
        }
        return clip;
      });
      videoLog("generator", "reference video ready for Director", {
        fileName: clip.fileName,
        durationSeconds: clip.durationSeconds,
        serverId: clip.serverId,
        llmParts: clip.llmSegments?.length ?? (clip.dataUrl ? 1 : 0),
      });
      return clip;
    } catch (e) {
      const message = errorText(e);
      setError(message);
      videoLogError("generator", "reference video upload failed", e);
      throw e;
    } finally {
      setIsPreparingReferenceVideo(false);
    }
  },
  [requireApiKey, setError, setIsPreparingReferenceVideo, setReferenceVideo],
);

const removeReferenceVideo = useCallback(() => {
  setReferenceVideo((prev) => {
    if (prev?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(prev.previewUrl);
    return null;
  });
}, [setReferenceVideo]);

/** Removing the harness tile drops every subject photo with it. */
const clearSubject = useCallback(() => {
  setSubjectPhotos([]);
  setSubject(null);
  videoLog("subject", "harness cleared");
}, [setSubject, setSubjectPhotos]);

/** Rebuilds the harness sheet from `photos` on the server; no photos clears it. */
const rebuildSubject = useCallback(
  async (key: string, photos: ManualImageReference[]) => {
    setSubjectPhotos(photos);
    if (!photos.length) {
      clearSubject();
      return;
    }
    setIsPreparingSubject(true);
    setError("");
    try {
      const harnessDataUrl = await buildSubjectHarness({ apiKey: key, images: photos.map((p) => ({ fileName: p.fileName, dataUrl: p.dataUrl })) });
      setSubject(await manualReferenceFromDataUrl("subject-harness.png", harnessDataUrl));
      videoLog("subject", "harness ready", { photos: photos.map((p) => p.fileName) });
    } catch (e) {
      videoLogError("subject", "harness build failed", e);
      setSubject(null);
      setError(errorText(e));
    } finally {
      setIsPreparingSubject(false);
    }
  },
  [clearSubject, setError, setIsPreparingSubject, setSubject, setSubjectPhotos],
);

const addSubjectFiles = useCallback(
  async (files: FileList | File[]) => {
    const key = requireApiKey();
    if (!key) return;
    const list = referenceUploadFiles(files);
    if (!list.length) {
      setError("Product photos must be images, not video.");
      return;
    }
    videoLog("subject", "photos added", list.map((f) => ({ name: f.name, bytes: f.size })));
    setIsPreparingSubject(true);
    setError("");
    let prepared: ManualImageReference[];
    try {
      prepared = await Promise.all(list.map((f) => prepareVideoStudioReference(f)));
    } catch (e) {
      videoLogError("subject", "photo prepare failed", e);
      setError(errorText(e));
      setIsPreparingSubject(false);
      return;
    }
    await rebuildSubject(key, [...subjectPhotos, ...prepared]);
  },
  [rebuildSubject, requireApiKey, subjectPhotos, setError, setIsPreparingSubject],
);

const removeSubjectPhoto = useCallback(
  (id: string) => {
    const key = requireApiKey();
    if (!key) return;
    void rebuildSubject(key, subjectPhotos.filter((p) => p.id !== id));
  },
  [rebuildSubject, requireApiKey, subjectPhotos],
);

/** Brainstorming fills the Brief and opens it. */
const setBriefFromBrainstorm = useCallback(
  (next: BrainstormBrief) => {
    setPrompt(next.prompt);
    setLengthSeconds(next.lengthSeconds);
    setAspect(next.aspect);
    setReferences(sortReferencesByFileName(next.references));
    setReferenceVideo(next.referenceVideo ?? null);
    advance("brief");
  },
  [advance, setAspect, setLengthSeconds, setPrompt, setReferenceVideo, setReferences],
);

/** Renders one scene's empty-stage Environment Plate; resolves to its data URL or undefined on failure/stale run. */

  return {
    addReferenceFiles,
    removeReference,
    uploadReferenceVideo,
    removeReferenceVideo,
    clearSubject,
    rebuildSubject,
    addSubjectFiles,
    removeSubjectPhoto,
    setBriefFromBrainstorm,
  };
}
