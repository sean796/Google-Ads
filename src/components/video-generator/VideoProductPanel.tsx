import { useState } from "react";
import { AlertTriangle, Check, Link2, Loader2, Lock, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MY_SITES_FIELD, MY_SITES_ICON_BTN } from "@/components/hosting/my-sites/my-sites-theme";
import { PRODUCT_VIEW_DEFINITIONS } from "@/lib/video-generator/video-product-agent";
import type { ProductLockState, ProductViewId } from "@/lib/video-generator/video-generator-types";
import { cn } from "@/lib/utils";

type VideoProductPanelProps = {
  product: ProductLockState;
  disabled: boolean;
  hasSubjectPhotos: boolean;
  onRegenerateView: (viewId: ProductViewId) => void;
  onReviseView?: (viewId: ProductViewId | "all", instruction: string) => void;
};

/**
 * Compact Product Lock inspector for the Video Editor Left Sidebar.
 * The 2x2 turntable viewport lives in the Center Stage Monitor; this sidebar pane
 * displays the 4-step turntable dependency chain, per-view prompt inputs, and the extracted Product Bible spec.
 */
export function VideoProductPanel({
  product,
  disabled,
  hasSubjectPhotos,
  onRegenerateView,
  onReviseView,
}: VideoProductPanelProps) {
  const spec = product.spec;
  const [allViewsDraft, setAllViewsDraft] = useState("");
  const [viewDrafts, setViewDrafts] = useState<Record<string, string>>({});

  return (
    <div className="flex flex-col gap-3 text-base">
      {/* Global Product Prompt Input (updates all 4 views) */}
      {onReviseView ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = allViewsDraft.trim();
            if (!trimmed || disabled || !hasSubjectPhotos) return;
            onReviseView("all", trimmed);
            setAllViewsDraft("");
          }}
          className="flex items-center gap-1.5 bg-zinc-900 p-2.5"
        >
          <Input
            value={allViewsDraft}
            onChange={(e) => setAllViewsDraft(e.target.value)}
            disabled={disabled || !hasSubjectPhotos}
            aria-label="Prompt AI to change all 4 product views"
            placeholder="Prompt AI to change all 4 views (e.g. remove wall vent)"
            className={cn(MY_SITES_FIELD, "h-9 flex-1 bg-zinc-950 text-base")}
          />
          <Button
            type="submit"
            variant="ghost"
            className={MY_SITES_ICON_BTN}
            disabled={disabled || !hasSubjectPhotos || !allViewsDraft.trim()}
            aria-label="Apply prompt to all 4 product views"
          >
            <Send className="h-4 w-4" aria-hidden />
          </Button>
        </form>
      ) : null}

      {/* 4-Step Turntable Chain */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-white">Turntable Chain</span>
          {product.locked ? (
            <span className="inline-flex items-center gap-1 bg-primary/15 px-2 py-0.5 font-medium text-primary">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Locked
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Link2 className="h-3.5 w-3.5 text-primary" aria-hidden />
              Sequential
            </span>
          )}
        </div>

        {PRODUCT_VIEW_DEFINITIONS.map((def) => {
          const view = product.views.find((v) => v.id === def.id);
          const status = view?.status ?? "waiting";
          const spinning = status === "generating";
          const done = status === "done" && Boolean(view?.imageDataUrl);
          const failed = status === "failed";
          const draft = viewDrafts[def.id] ?? "";

          return (
            <div
              key={def.id}
              className="flex flex-col gap-1.5 bg-zinc-900 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  {spinning ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-label="Generating" />
                  ) : done ? (
                    <Check className="h-4 w-4 shrink-0 text-primary" aria-label="Ready" />
                  ) : failed ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" aria-label="Failed" />
                  ) : (
                    <span className="h-2 w-2 shrink-0 bg-zinc-600" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{def.shortLabel}</p>
                    <p className="truncate text-muted-foreground">
                      {view?.error ? view.error : def.chainHint}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={disabled || spinning || !hasSubjectPhotos}
                  onClick={() => onRegenerateView(def.id)}
                  title={`Regenerate ${def.label}`}
                  aria-label={`Regenerate ${def.label}`}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center bg-zinc-950 text-muted-foreground transition-colors hover:bg-primary hover:text-black disabled:opacity-40",
                  )}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>

              {onReviseView ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const trimmed = draft.trim();
                    if (!trimmed || disabled || spinning || !hasSubjectPhotos) return;
                    onReviseView(def.id, trimmed);
                    setViewDrafts((prev) => ({ ...prev, [def.id]: "" }));
                  }}
                  className="flex items-center gap-1.5"
                >
                  <Input
                    value={draft}
                    onChange={(e) =>
                      setViewDrafts((prev) => ({ ...prev, [def.id]: e.target.value }))
                    }
                    disabled={disabled || spinning || !hasSubjectPhotos}
                    aria-label={`Prompt AI to change ${def.label}`}
                    placeholder={`Prompt ${def.shortLabel} change`}
                    className={cn(MY_SITES_FIELD, "h-8 flex-1 bg-zinc-950 px-2.5 text-base")}
                  />
                  <Button
                    type="submit"
                    variant="ghost"
                    className={cn(MY_SITES_ICON_BTN, "h-8 w-8")}
                    disabled={disabled || spinning || !hasSubjectPhotos || !draft.trim()}
                    aria-label={`Apply prompt to ${def.label}`}
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Extracted Product Bible Spec */}
      {spec ? (
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold text-white">Product Bible</span>
          <div className="flex flex-col gap-1 bg-zinc-900 p-3">
            <p className="font-semibold text-primary">{spec.name}</p>
            <p className="text-muted-foreground">{spec.summary}</p>
          </div>

          {spec.faces.map((face) => (
            <div key={face.face} className="flex flex-col gap-0.5 bg-zinc-900 px-3 py-2">
              <span className="font-medium capitalize text-white">
                {face.face}
                <span className="ml-2 font-normal text-muted-foreground">
                  {face.photos.length ? `Photo ${face.photos.join(", ")}` : "not in any photo"}
                </span>
              </span>
              <span className="text-muted-foreground">{face.inventory}</span>
            </div>
          ))}

          {spec.mustNotChange.length > 0 ? (
            <div className="flex flex-col gap-1.5 bg-zinc-900 px-3 py-2.5">
              <span className="font-medium text-white">Locked Invariants</span>
              <div className="flex flex-col gap-1">
                {spec.mustNotChange.map((item) => (
                  <div key={item} className="bg-zinc-950 px-2.5 py-1.5 text-muted-foreground">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="bg-zinc-900 p-3 text-muted-foreground">
          {hasSubjectPhotos
            ? "Click Generate product views to survey the photos and render four studio views."
            : "Upload product photos in the Assets tab first."}
        </div>
      )}
    </div>
  );
}
