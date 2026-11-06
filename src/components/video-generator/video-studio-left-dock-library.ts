import type { ManualImageReference } from "@/lib/image-generator/manual-reference-upload";
import type {
  ProductLockState,
  VideoBrief,
} from "@/lib/video-generator/video-generator-types";
import type { LibraryTile } from "./video-studio-left-dock-types";

type BuildVideoStudioLibraryTilesArgs = {
  brief: VideoBrief;
  subjectPhotos: ManualImageReference[];
  productLock: ProductLockState;
  brainstormImages: ManualImageReference[];
  brainstormVideo: { file: File; previewUrl: string } | null;
  onClearSubject: () => void;
  onRemoveSubjectPhoto: (id: string) => void;
  onRemoveReference: (id: string) => void;
  onRemoveBrainstormImage: (id: string) => void;
  onRemoveReferenceVideo: () => void;
  onRemoveBrainstormVideo: () => void;
};

export function buildVideoStudioLibraryTiles(args: BuildVideoStudioLibraryTilesArgs): LibraryTile[] {
  const {
    brief,
    subjectPhotos,
    productLock,
    brainstormImages,
    brainstormVideo,
    onClearSubject,
    onRemoveSubjectPhoto,
    onRemoveReference,
    onRemoveBrainstormImage,
    onRemoveReferenceVideo,
    onRemoveBrainstormVideo,
  } = args;

  return [
    ...(brief.subject
      ? [
          {
            id: `harness-${brief.subject.id}`,
            name: brief.subject.fileName,
            badge: "Product Harness",
            category: "product" as const,
            kind: "image" as const,
            src: brief.subject.dataUrl,
            onRemove: onClearSubject,
          },
        ]
      : []),
    ...(brief.environmentHarnessDataUrl
      ? [
          {
            id: "env-harness-sheet",
            name: "environment-harness.png",
            badge: "Env Harness",
            category: "references" as const,
            kind: "image" as const,
            src: brief.environmentHarnessDataUrl,
          },
        ]
      : []),
    ...subjectPhotos.map((p) => ({
      id: `subj-${p.id}`,
      name: p.fileName,
      badge: "Product",
      category: "product" as const,
      kind: "image" as const,
      src: p.dataUrl,
      onRemove: () => onRemoveSubjectPhoto(p.id),
    })),
    ...productLock.views
      .filter((v) => v.imageDataUrl)
      .map((v) => ({
        id: `view-${v.id}`,
        name: v.label,
        badge: "3D View",
        category: "product" as const,
        kind: "image" as const,
        src: v.imageDataUrl as string,
      })),
    ...brief.references.map((r, i) => ({
      id: `ref-${r.id}`,
      name: r.fileName,
      badge: `Image ${i + 1}`,
      category: "references" as const,
      kind: "image" as const,
      src: r.dataUrl,
      onRemove: () => onRemoveReference(r.id),
    })),
    ...brainstormImages.map((r) => ({
      id: `bimg-${r.id}`,
      name: r.fileName,
      badge: "Beat ref",
      category: "references" as const,
      kind: "image" as const,
      src: r.dataUrl,
      onRemove: () => onRemoveBrainstormImage(r.id),
    })),
    ...(brief.referenceVideo
      ? [
          {
            id: "director-video",
            name: brief.referenceVideo.fileName,
            badge:
              brief.referenceVideo.llmSegments && brief.referenceVideo.llmSegments.length > 1
                ? `Director · ${brief.referenceVideo.llmSegments.length} parts`
                : "Director clip",
            category: "video" as const,
            kind: "video" as const,
            src: brief.referenceVideo.previewUrl ?? "",
            onRemove: () => {
              onRemoveReferenceVideo();
              onRemoveBrainstormVideo();
            },
          },
        ]
      : brainstormVideo
        ? [
            {
              id: "bvideo-source",
              name: brainstormVideo.file.name,
              badge: "Video",
              category: "video" as const,
              kind: "video" as const,
              src: brainstormVideo.previewUrl,
              onRemove: onRemoveBrainstormVideo,
            },
          ]
        : []),
  ];
}
