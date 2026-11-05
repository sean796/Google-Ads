import React, { useCallback, useRef, useState } from "react";
import { ActionButton, Button, Field, Pill, FileInput } from "@/ui";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/app-notifications";
import type { WordPressSite } from "../types";
import { fetchClientSiteLogoUrl } from "@/lib/integrations/client-site-logo";
import { uploadPropertyClientLogo } from "@/lib/integrations/property-client-logo-upload";
const LOGO_SLOT_CLASS =
  "flex h-16 w-40 shrink-0 items-center justify-center overflow-hidden bg-ui-field";

const FETCH_STATES = ["Fetch from site", "Fetching"] as const;

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
  formClientLogoUrl: string;
  onFormClientLogoUrlChange: (value: string) => void;
  formClientLogoBoxTheme?: "black" | "white";
  onFormClientLogoBoxThemeChange?: (theme: "black" | "white") => void;
  siteForFetch: Pick<WordPressSite, "siteUrl" | "productionSiteUrl" | "name">;
  onPatchSite?: (siteId: string, patch: Partial<WordPressSite>) => void;
  patchSiteId?: string | null;
};

export function PropertyClientLogoFields({
  formClientLogoUrl,
  onFormClientLogoUrlChange,
  formClientLogoBoxTheme = "black",
  onFormClientLogoBoxThemeChange,
  siteForFetch,
  onPatchSite,
  patchSiteId,
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
            currentBoxTheme === "white" && "bg-white",
            dropActive && "ring-2 ring-primary ring-offset-0",
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
          <FileInput
            ref={fileInputRef}
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            tabIndex={-1}
            onChange={onFileInputChange}
          />
          {uploading ? (
            <span className="px-2 text-center text-base text-muted-foreground">Uploading</span>
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
                currentBoxTheme === "white" ? "text-black/60" : "text-muted-foreground",
              )}
            >
              Drop logo here
            </span>
          )}
        </div>
        <div className="flex min-w-[12rem] flex-1 flex-col gap-2">
          <Field
            value={formClientLogoUrl}
            onChange={(e) => onFormClientLogoUrlChange(e.target.value)}
            onBlur={commitUrl}
            placeholder="Client logo URL"
            autoComplete="off"
          />
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              variant="tool"
              states={FETCH_STATES}
              state={fetching ? "Fetching" : "Fetch from site"}
              disabled={fetching}
              onClick={() => void runFetch()}
            />
            <Button disabled={!previewUrl} onClick={clearLogo}>
              Clear
            </Button>
            <span className="pl-1 text-base text-muted-foreground">Report Box:</span>
            <Pill square label="Black Box" active={currentBoxTheme === "black"} onClick={() => handleSelectBoxTheme("black")} />
            <Pill square label="White Box" active={currentBoxTheme === "white"} onClick={() => handleSelectBoxTheme("white")} />
          </div>
        </div>
      </div>
    </div>
  );
}