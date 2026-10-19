import type { ImageReferenceProvenance } from "@/components/generator/image/image-generator-types";
import type { ImageReferenceResult } from "@/lib/image-reference-research";
import { prepareLocalImageDataUrl } from "@/lib/overview/overview-blog-local-image-generate";

export type ManualImageReference = ImageReferenceResult & {
  /** Stable key for UI list (filename + upload time). */
  id: string;
  fileName: string;
};

const IMAGE_UPLOAD_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "png",
  "webp",
]);

/** Windows and some browsers leave `file.type` empty; accept common photo extensions too. */
export function isImageUploadFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  return IMAGE_UPLOAD_EXTENSIONS.has(ext);
}

export function filterImageUploadFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter(isImageUploadFile);
}

/** File picker accept string for story-beat and reference uploads. */
export const IMAGE_REFERENCE_ACCEPT =
  "image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.heic,.heif,.avif";

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string" && result.startsWith("data:image/")) {
        resolve(result);
        return;
      }
      reject(new Error(`Could not read image: ${file.name}`));
    };
    reader.onerror = () => reject(new Error(`Could not read image: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function buildManualImageReference(fileName: string, dataUrl: string): ManualImageReference {
  const id = `${fileName}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    fileName,
    dataUrl,
    imageUrl: "",
    query: "manual upload",
    kind: "other",
    layer: "foreground",
    why: "User-provided reference",
    visualDescription: "User-uploaded reference photo",
    fitScore: 1,
    qualityScore: 1,
    useFromImage: ["Match subject identity, materials, and setting cues from this photo."],
    ignoreFromImage: ["Watermarks, UI chrome, and photo borders."],
  };
}

export async function prepareManualReference(file: File): Promise<ManualImageReference> {
  return manualReferenceFromDataUrl(file.name, await readFileAsDataUrl(file));
}

/** Video Studio uploads: always keep readable browser pixels (WebP, JPEG, PNG, etc.); server normalize is optional. */
export async function prepareVideoStudioReference(file: File): Promise<ManualImageReference> {
  const rawDataUrl = await readFileAsDataUrl(file);
  try {
    const prepared = await prepareLocalImageDataUrl(rawDataUrl);
    return buildManualImageReference(file.name, prepared.dataUrl);
  } catch {
    return buildManualImageReference(file.name, rawDataUrl);
  }
}

/** Non-video files from a picker or drop (any type the browser can read as an image). */
export function referenceUploadFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter((f) => !f.type.startsWith("video/"));
}

/** Size-gates `rawDataUrl` on the server and wraps it as a manual reference (uploads and server-cut video frames alike). */
export async function manualReferenceFromDataUrl(fileName: string, rawDataUrl: string): Promise<ManualImageReference> {
  const prepared = await prepareLocalImageDataUrl(rawDataUrl);
  return buildManualImageReference(fileName, prepared.dataUrl);
}

export function manualReferencesToProvenance(
  refs: ManualImageReference[],
): ImageReferenceProvenance {
  return {
    mode: refs.length ? "grounded" : "abstract",
    queries: refs.length ? ["manual upload"] : [],
    references: refs.map((r) => ({
      imageUrl: r.imageUrl,
      sourceUrl: r.fileName,
      query: r.query,
      kind: r.kind,
      layer: r.layer,
      why: r.why,
      previewDataUrl: r.dataUrl,
      useFromImage: r.useFromImage,
      ignoreFromImage: r.ignoreFromImage,
    })),
  };
}

export function stripManualReferenceIds(refs: ManualImageReference[]): ImageReferenceResult[] {
  return refs.map(({ id: _id, fileName: _fileName, ...rest }) => rest);
}
