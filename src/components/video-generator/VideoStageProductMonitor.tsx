import type { Dispatch, SetStateAction } from "react";
import { Film, RefreshCw, Send } from "lucide-react";
import type { OpenRouterAppStreamDelta } from "@/lib/openrouter-app-api";
import { PRODUCT_VIEW_DEFINITIONS } from "@/lib/video-generator/video-product-agent";
import type {
  ProductLockState,
  ProductViewId,
  VideoBrief,
  VideoPlan,
} from "@/lib/video-generator/video-generator-types";
import { VIDEO_ASPECT_BOX_CLASS, type VideoAspect } from "@/lib/video-generator/video-model-defaults";
import { VideoPlanLive } from "./VideoPlanLive";
import { VideoProductViewSplash } from "./VideoProductViewSplash";
import { VideoStudioPlaceholderSplash } from "./VideoStudioPlaceholderSplash";
import { VideoStartComposePanel } from "./VideoStartComposePanel";
import { formatTimecode } from "./video-stage-panel-helpers";
import { cn } from "@/lib/utils";
import { Button, Field } from "@/ui";

type VideoStageProductMonitorProps = {
  isStreamingPlan: boolean;
  planLive?: OpenRouterAppStreamDelta;
  plan: VideoPlan | null;
  showProductGrid: boolean;
  productLock?: ProductLockState;
  aspect: VideoAspect;
  brief?: VideoBrief;
  totalDuration: number;
  boxSizeClass: string;
  productViewDrafts: Record<string, string>;
  setProductViewDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  disabled?: boolean;
  hasSubjectPhotos?: boolean;
  onRegenerateProductView?: (viewId: ProductViewId) => void;
  onReviseProductView?: (viewId: ProductViewId | "all", instruction: string) => void;
  productViewsBatchBusy?: boolean;
  isPreparingSubject?: boolean;
  isPreparingReferences?: boolean;
  isPreparingReferenceVideo?: boolean;
  hasReferenceVideo?: boolean;
  onPromptChange?: (v: string) => void;
  productPhotoCount?: number;
  referenceCount?: number;
  onAddProductFiles?: (files: FileList | File[]) => void;
  onAddReferenceFiles?: (files: FileList | File[]) => void;
  onAddVideoFile?: (file: File) => void;
};

export function VideoStageProductMonitor({
  isStreamingPlan,
  planLive,
  plan,
  showProductGrid,
  productLock,
  aspect,
  brief,
  totalDuration,
  boxSizeClass,
  productViewDrafts,
  setProductViewDrafts,
  disabled = false,
  hasSubjectPhotos = false,
  onRegenerateProductView,
  onReviseProductView,
  productViewsBatchBusy = false,
  isPreparingSubject = false,
  isPreparingReferences = false,
  isPreparingReferenceVideo = false,
  hasReferenceVideo = false,
  onPromptChange,
  productPhotoCount = 0,
  referenceCount = 0,
  onAddProductFiles,
  onAddReferenceFiles,
  onAddVideoFile,
}: VideoStageProductMonitorProps) {
  return (
      <div className="flex min-h-0 flex-1 flex-col bg-black">
        <div className="flex h-10 shrink-0 items-center justify-between bg-ui-field px-4">
          <span className="break-words font-semibold text-white">
            {isStreamingPlan
              ? "Director · Writing Scene Plan"
              : showProductGrid
                ? `Product Lock Turntable · ${productLock?.spec?.name ?? "4 Chained Studio Angles"}`
                : "Studio Monitor"}
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {aspect} · {brief?.resolution ?? "480p"} · 0:00 / {formatTimecode(totalDuration)}
          </span>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black p-3">
          {isStreamingPlan ? (
            planLive?.content || planLive?.reasoning ? (
              <VideoPlanLive live={planLive!} />
            ) : (
              <div className={cn("relative h-full w-full", VIDEO_ASPECT_BOX_CLASS[aspect], boxSizeClass)}>
                <VideoStudioPlaceholderSplash
                  title="Director"
                  subtitle="Writing scene plan…"
                  breathing
                  variant="stage"
                />
              </div>
            )
          ) : showProductGrid && productLock ? (
            <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-2.5">
              {PRODUCT_VIEW_DEFINITIONS.map((def) => {
                const v = productLock.views.find((item) => item.id === def.id);
                const spinning = v?.status === "generating";
                const draftText = productViewDrafts[def.id] ?? "";
                const submitViewPrompt = () => {
                  const trimmed = draftText.trim();
                  if (!trimmed || disabled || spinning || !hasSubjectPhotos || !onReviseProductView) return;
                  onReviseProductView(def.id, trimmed);
                  setProductViewDrafts((prev) => ({ ...prev, [def.id]: "" }));
                };

                return (
                  <div key={def.id} className="group relative flex flex-col overflow-hidden bg-ui-field">
                    <div className="flex h-8 shrink-0 items-center justify-between bg-black/90 px-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-semibold text-white">{def.shortLabel}</span>
                        <span className="break-words text-muted-foreground">{def.chainHint}</span>
                        {v?.revisionNotes && v.revisionNotes.length > 0 ? (
                          <span
                            className="shrink-0 bg-primary/20 px-1.5 text-primary"
                            title={v.revisionNotes.join(" · ")}
                          >
                            {v.revisionNotes.length} edit{v.revisionNotes.length === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                      {onRegenerateProductView ? (
                        <Button
                          variant="run"
                          disabled={disabled || spinning || !hasSubjectPhotos}
                          onClick={() => onRegenerateProductView(def.id)}
                          aria-label={`Regenerate ${def.label}`}
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                          <span>Regenerate</span>
                        </Button>
                      ) : null}
                    </div>

                    <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
                      {v?.imageDataUrl ? (
                        <img
                          src={v.imageDataUrl}
                          alt={def.label}
                          className="absolute inset-0 h-full w-full object-contain"
                        />
                      ) : v?.error ? (
                        <div className="flex max-h-full flex-col gap-1 overflow-y-auto px-4 py-3 text-ui-danger-hover">
                          <p className="font-medium">{v.error}</p>
                        </div>
                      ) : (
                        <VideoProductViewSplash
                          viewId={def.id}
                          label={def.label}
                          shortLabel={def.shortLabel}
                          breathing={spinning || (productViewsBatchBusy && !v?.imageDataUrl)}
                        />
                      )}
                    </div>

                    {/* Per-Picture Natural-Language Prompt Input Bar */}
                    {onReviseProductView ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          submitViewPrompt();
                        }}
                        className="flex h-9 shrink-0 items-center gap-1.5 bg-black px-2"
                      >
                        <Field
                          value={draftText}
                          onChange={(e) =>
                            setProductViewDrafts((prev) => ({ ...prev, [def.id]: e.target.value }))
                          }
                          disabled={disabled || spinning || !hasSubjectPhotos}
                          aria-label={`Prompt AI to change ${def.label}`}
                          placeholder={`Prompt AI to change ${def.shortLabel} (e.g. "match uploaded color", "show full drop")`}
                        />
                        <Button
                          variant="quiet"
                          type="submit"
                          disabled={disabled || spinning || !hasSubjectPhotos || !draftText.trim()}
                          aria-label={`Send prompt for ${def.label}`}
                        >
                          <Send className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </form>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : isPreparingReferenceVideo ? (
            <div
              className={cn(
                "relative flex h-full w-full items-center justify-center overflow-hidden",
                VIDEO_ASPECT_BOX_CLASS[aspect],
                boxSizeClass,
              )}
            >
              <VideoStudioPlaceholderSplash
                title="Neo Pulse"
                subtitle="Preparing reference video…"
                breathing
                variant="stage"
              />
            </div>
          ) : onPromptChange && onAddProductFiles && onAddReferenceFiles && onAddVideoFile ? (
            <div
              className={cn(
                "relative flex flex-col items-center justify-center bg-ui-field/40 p-6",
                VIDEO_ASPECT_BOX_CLASS[aspect],
                boxSizeClass,
              )}
            >
              <VideoStartComposePanel
                variant="stage"
                prompt={brief?.prompt ?? ""}
                onPromptChange={onPromptChange}
                productCount={productPhotoCount}
                referenceCount={referenceCount}
                hasReferenceVideo={hasReferenceVideo}
                disabled={disabled}
                isPreparingSubject={isPreparingSubject}
                isPreparingReferences={isPreparingReferences}
                isPreparingReferenceVideo={isPreparingReferenceVideo}
                onAddProductFiles={onAddProductFiles}
                onAddReferenceFiles={onAddReferenceFiles}
                onAddVideoFile={onAddVideoFile}
              />
            </div>
          ) : (
            <div
              className={cn(
                "relative flex flex-col items-center justify-center gap-3 bg-ui-field/40 p-6 text-center",
                VIDEO_ASPECT_BOX_CLASS[aspect],
                boxSizeClass,
              )}
            >
              <Film className="h-10 w-10 text-primary/80" aria-hidden />
              <p className="font-semibold text-white">Ready to Direct</p>
              <p className="max-w-md text-muted-foreground">
                Add a brief, video, product photos, or references, then use Ask the Director in the top bar.
              </p>
            </div>
          )}
        </div>
      </div>
  );
}
