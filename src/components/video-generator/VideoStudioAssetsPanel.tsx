import { useRef } from "react";
import {
  Image as ImageIcon,
  Trash2,
  Video as VideoIcon,
} from "lucide-react";
import { IMAGE_REFERENCE_ACCEPT, referenceUploadFiles } from "@/lib/image-generator/manual-reference-upload";
import { VideoStartComposePanel } from "./VideoStartComposePanel";
import { Button, FileInput, RowButton } from "@/ui";
import type { VideoStudioAssetsPanelProps } from "./video-studio-left-dock-types";

export function VideoStudioAssetsPanel(props: VideoStudioAssetsPanelProps) {
  const {
    brief,
    working,
    assetFilter,
    onAssetFilterChange,
    filteredTiles,
    subjectPhotos,
    isPreparingSubject,
    isPreparingReferences,
    isPreparingReferenceVideo,
    isPreparingBrainstorm,
    onPromptChange,
    onAddSubjectFiles,
    onAddReferenceFiles,
    onUploadReferenceVideo,
    onAddBrainstormFiles,
  } = props;
  const mediaInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
              <VideoStartComposePanel
                variant="drawer"
                prompt={brief.prompt}
                onPromptChange={onPromptChange}
                productCount={subjectPhotos.length}
                referenceCount={brief.references.length}
                hasReferenceVideo={Boolean(brief.referenceVideo)}
                disabled={working}
                isPreparingSubject={isPreparingSubject}
                isPreparingReferences={isPreparingReferences}
                isPreparingReferenceVideo={isPreparingReferenceVideo}
                onAddProductFiles={onAddSubjectFiles}
                onAddReferenceFiles={onAddReferenceFiles}
                onAddVideoFile={(file) => void onUploadReferenceVideo(file)}
              />
              <FileInput
                ref={mediaInputRef}
                accept={`${IMAGE_REFERENCE_ACCEPT},video/*`}
                multiple
                onChange={(e) => {
                  const list = e.target.files ? Array.from(e.target.files) : [];
                  if (list.length) {
                    const clip = list.find((f) => f.type.startsWith("video/"));
                    if (clip) {
                      onAddBrainstormFiles(list);
                      void onUploadReferenceVideo(clip);
                    } else if (assetFilter === "product") {
                      onAddSubjectFiles(referenceUploadFiles(list));
                    } else {
                      onAddReferenceFiles(referenceUploadFiles(list));
                    }
                  }
                  e.target.value = "";
                }}
              />

              <div className="flex gap-1.5 bg-ui-field p-1.5">
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "product", label: "Product" },
                    { id: "references", label: "Refs" },
                    { id: "video", label: "Video" },
                  ] as const
                ).map((pill) => (
                  <Button
                    pressed={assetFilter === pill.id}
                    variant="quiet"
                    key={pill.id}
                    onClick={() => onAssetFilterChange(pill.id)}
                  >
                    {pill.label}
                  </Button>
                ))}
              </div>

              {filteredTiles.length === 0 ? (
                <RowButton
                  type="button"
                  disabled={
                    working || isPreparingSubject || isPreparingReferences || isPreparingBrainstorm || isPreparingReferenceVideo
                  }
                  onClick={() => mediaInputRef.current?.click()}
                >
                  <ImageIcon className="h-6 w-6 text-primary/80" aria-hidden />
                  <p>Drop product photos, story beats, or reference video here, or click to browse.</p>
                </RowButton>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredTiles.map((tile) => (
                    <div key={tile.id} className="group flex flex-col bg-ui-field">
                      <div className="relative aspect-video w-full overflow-hidden bg-black">
                        {tile.kind === "video" ? (
                          <video
                            src={tile.src}
                            muted
                            playsInline
                            preload="metadata"
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <img
                            src={tile.src}
                            alt={tile.name}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        )}
                        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 bg-black/85 px-2 py-0.5 text-base text-white">
                          {tile.kind === "video" ? (
                            <VideoIcon className="h-3.5 w-3.5 text-primary" aria-hidden />
                          ) : (
                            <ImageIcon className="h-3.5 w-3.5 text-primary" aria-hidden />
                          )}
                          {tile.badge}
                        </span>
                        {tile.onRemove ? (
                          <Button
                            size="icon" icon={Trash2}
                            variant="danger"
                            disabled={working}
                            onClick={tile.onRemove}
                            aria-label={`Remove ${tile.name}`}
                          ></Button>
                        ) : null}
                      </div>
                      <p className="break-words px-2.5 py-1.5 text-base text-foreground" title={tile.name}>
                        {tile.name}
                      </p>
                    </div>
                  ))}
                </div>
              )}
    </>
  );
}
