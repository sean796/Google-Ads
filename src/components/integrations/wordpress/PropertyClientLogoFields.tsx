import React, { useCallback, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/app-notifications";
import type { WordPressSite } from "../types";
import { fetchClientSiteLogoUrl } from "@/lib/integrations/client-site-logo";
import { uploadPropertyClientLogo } from "@/lib/integrations/property-client-logo-upload";
import { TASK_FORM_FLAT_CONTROL_CLASS } from "@/components/manager/tasks/TaskFormLayout";

const LOGO_SLOT_CLASS =
  "flex h-16 w-40 shrink-0 items-center justify-center overflow-hidden bg-zinc-900";

const LOGO_DROP_ACCEPT = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

const LOGO_FILE_MAX_BYTES = 3 * 1024 * 1024;

async function readLogoFileAsDataUrl(file: File): Promise<string> {
  if (!LOGO_DROP_ACCEPT.has(file.type)) {
    throw new Error("Use a PNG, JPEG, WebP, GIF, or SVG image.");
  }
  if (file.size > LOGO_FILE_MAX_BYTES) {
    throw new Error("Logo must be 3 MB or smaller.");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result.startsWith("data:image/")) {
        reject(new Error("Could not read that image."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

type PropertyClientLogoFieldsProps = {
  chrome?: "dark" | "light";
  formClientLogoUrl: string;
  onFormClientLogoUrlChange: (value: string) => void;
  formClientLogoBoxTheme?: "black" | "white";
  onFormClientLogoBoxThemeChange?: (theme: "black" | "white") => void;
  siteForFetch: Pick<WordPressSite, "siteUrl" | "productionSiteUrl" | "name">;
  onPatchSite?: (siteId: string, patch: Partial<WordPressSite>) => void;
  patchSiteId?: string | null;
  flat?: boolean;
};

export function PropertyClientLogoFields({
  chrome = "dark",
  formClientLogoUrl,
  onFormClientLogoUrlChange,
  formClientLogoBoxTheme = "black",
  onFormClientLogoBoxThemeChange,
  siteForFetch,
  onPatchSite,
  patchSiteId,
  flat = false,
}: PropertyClientLogoFieldsProps) {
  const [fetching, setFetching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentBoxTheme = formClientLogoBoxTheme;
  const handleSelectBoxTheme = useCallback(
    (theme: "black" | "white") => {
      onFormClientLogoBoxThemeChange?.(theme);
      if (onPatchSite && patchSiteId) {
        onPatchSite(patchSiteId, { clientLogoBoxTheme: theme });
      }
    },
    [onFormClientLogoBoxThemeChange, onPatchSite, patchSiteId],
  );

  const inputClass = flat
    ? TASK_FORM_FLAT_CONTROL_CLASS
    : cn(
        "min-h-10 rounded-none border-0 bg-zinc-900 shadow-none focus-visible:ring-2",
        chrome === "dark"
          ? "h-9 text-white placeholder:text-white/55 focus-visible:ring-white/35"
          : "text-foreground placeholder:text-muted-foreground",
      );

  const applyLogoUrl = useCallback(
    (url: string) => {
      const trimmed = url.trim();
      onFormClientLogoUrlChange(trimmed);
      if (onPatchSite && patchSiteId) {
        onPatchSite(patchSiteId, {
          clientLogoUrl: trimmed || undefined,
          clientLogoSource: trimmed ? "manual" : undefined,
          clientLogoFetchedAt: trimmed ? Date.now() : undefined,
        });
      }
    },
    [onFormClientLogoUrlChange, onPatchSite, patchSiteId],
  );

  const runFetch = useCallback(async () => {
    setFetching(true);
    try {
      const result = await fetchClientSiteLogoUrl(siteForFetch);
      applyLogoUrl(result.logoUrl);
      if (onPatchSite && patchSiteId) {
        onPatchSite(patchSiteId, {
          clientLogoSource: result.source,
        });
      }
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Could not fetch client logo.");
    } finally {
      setFetching(false);
    }
  }, [applyLogoUrl, onPatchSite, patchSiteId, siteForFetch]);

  const commitUrl = useCallback(() => {
    applyLogoUrl(formClientLogoUrl);
  }, [applyLogoUrl, formClientLogoUrl]);

  const clearLogo = useCallback(() => {
    applyLogoUrl("");
  }, [applyLogoUrl]);

  const ingestFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!patchSiteId?.trim()) {
        notify.error("Open a saved property profile before uploading a logo.");
        return;
      }
      setUploading(true);
      try {
        const dataUrl = await readLogoFileAsDataUrl(file);
        const logoUrl = await uploadPropertyClientLogo(patchSiteId, dataUrl);
        applyLogoUrl(logoUrl);
        if (onPatchSite && patchSiteId) {
          onPatchSite(patchSiteId, {
            clientLogoSource: "upload",
          });
        }
      } catch (e) {
        notify.error(e instanceof Error ? e.message : "Could not use that image.");
      } finally {
        setUploading(false);
      }
    },
    [applyLogoUrl, onPatchSite, patchSiteId],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDropActive(false);
      const file = event.dataTransfer.files.item(0);
      void ingestFile(file ?? undefined);
    },
    [ingestFile],
  );

  const onFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.item(0);
      void ingestFile(file ?? undefined);
      event.target.value = "";
    },
    [ingestFile],
  );

  const previewUrl = formClientLogoUrl.trim();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-3">
        <div
          className={cn(
            LOGO_SLOT_CLASS,
            currentBoxTheme === "white" && "bg-white border border-zinc-400",
            dropActive && "ring-2 ring-[#84bd00] ring-offset-0",
          )}
          onDragEnter={(e) => {
            e.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDropActive(false);
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDropActive(true);
          }}
          onDrop={onDrop}
          onClick={() => {
            if (!uploading) fileInputRef.current?.click();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Client logo. Drop an image here or press Enter to choose a file."
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="sr-only"
            tabIndex={-1}
            onChange={onFileInputChange}
          />
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              className="max-h-14 max-w-[9rem] object-contain"
            />
          ) : (
            <span
              className={cn(
                "px-2 text-center text-base",
                currentBoxTheme === "white" ? "text-zinc-500" : "text-muted-foreground",
              )}
            >
              Drop logo here
            </span>
          )}
        </div>
        <div className="flex min-w-[12rem] flex-1 flex-col gap-2">
          <Input
            value={formClientLogoUrl}
            onChange={(e) => onFormClientLogoUrlChange(e.target.value)}
            onBlur={commitUrl}
            placeholder="Client logo URL"
            aria-label="Client logo URL"
            autoComplete="off"
            className={inputClass}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="rounded-none"
              disabled={fetching}
              onClick={() => void runFetch()}
            >
              {fetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Fetch from site
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-none"
              disabled={!previewUrl}
              onClick={clearLogo}
            >
              Clear
            </Button>

            <div className="flex items-center gap-1 pl-1">
              <span className="text-xs text-muted-foreground mr-1">Report Box:</span>
              <button
                type="button"
                onClick={() => handleSelectBoxTheme("black")}
                className={cn(
                  "px-2 py-0.5 text-xs font-semibold rounded-none border transition-colors",
                  currentBoxTheme === "black"
                    ? "bg-zinc-800 text-white border-zinc-600"
                    : "bg-zinc-950/60 text-zinc-400 border-zinc-800 hover:text-white",
                )}
              >
                Black Box
              </button>
              <button
                type="button"
                onClick={() => handleSelectBoxTheme("white")}
                className={cn(
                  "px-2 py-0.5 text-xs font-semibold rounded-none border transition-colors",
                  currentBoxTheme === "white"
                    ? "bg-white text-zinc-950 border-white"
                    : "bg-zinc-950/60 text-zinc-400 border-zinc-800 hover:text-white",
                )}
              >
                White Box
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
