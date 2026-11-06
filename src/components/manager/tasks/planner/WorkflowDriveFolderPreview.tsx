import React, { useEffect, useState } from "react";
import {
  formatGoogleDriveFolderUrl,
  parseGoogleDriveFolderId,
} from "@/lib/google-drive/google-drive-folder-presets";
import {
  googleDriveFolderIsConfigured,
  resolveGoogleDriveFolder,
} from "@/lib/google-drive/resolve-google-drive-folder";
import type { TaskExecutionPayload } from "@/lib/tasks-types";

type WorkflowDriveFolderPreviewState = {
  label: string;
  webViewLink: string;
  loading: boolean;
  error: string;
};

export function WorkflowDriveFolderPreview({
  payload,
  siteName,
  siteUrl,
  executionKind,
  connected,
  disabled,
}: {
  payload: TaskExecutionPayload;
  siteName: string;
  siteUrl: string;
  executionKind?: string;
  connected: boolean;
  disabled: boolean;
}): React.ReactElement | null {
  const [preview, setPreview] = useState<WorkflowDriveFolderPreviewState>({
    label: "",
    webViewLink: "",
    loading: false,
    error: "",
  });

  const storedFolderId = parseGoogleDriveFolderId(String(payload.googleDriveTargetFolderId ?? ""));
  const storedLabel = String(payload.googleDriveFolderLabel ?? "").trim();
  const storedLink = storedFolderId ? formatGoogleDriveFolderUrl(storedFolderId) : "";

  useEffect(() => {
    if (disabled || !connected) {
      setPreview({ label: "", webViewLink: "", loading: false, error: "" });
      return;
    }
    const trimmedSite = siteName.trim();
    if (!trimmedSite) {
      setPreview({ label: "", webViewLink: "", loading: false, error: "" });
      return;
    }
    if (!googleDriveFolderIsConfigured(payload, trimmedSite)) {
      setPreview({ label: "", webViewLink: "", loading: false, error: "" });
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setPreview((current) => ({ ...current, loading: true, error: "" }));
      resolveGoogleDriveFolder({
        contract: { ...payload, saveToGoogleDrive: true },
        siteName: trimmedSite,
        siteUrl: siteUrl.trim() || undefined,
        executionKind,
      })
        .then((resolved) => {
          if (cancelled) return;
          if (!resolved?.folderId) {
            setPreview({ label: "", webViewLink: "", loading: false, error: "Could not resolve folder." });
            return;
          }
          setPreview({
            label: resolved.label.trim(),
            webViewLink: resolved.webViewLink?.trim() || formatGoogleDriveFolderUrl(resolved.folderId),
            loading: false,
            error: "",
          });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const message = err instanceof Error ? err.message.trim() : "Could not resolve folder.";
          setPreview({ label: "", webViewLink: "", loading: false, error: message });
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    connected,
    disabled,
    executionKind,
    payload,
    payload.googleDriveFolderMonth,
    payload.googleDriveFolderPath,
    payload.googleDriveFolderPathManual,
    payload.googleDriveFolderSource,
    payload.googleDriveFolderYear,
    payload.googleDrivePresetKey,
    payload.googleDriveFolderId,
    payload.googleDriveFolderVariable,
    payload.saveToGoogleDrive,
    siteName,
    siteUrl,
  ]);

  const link = preview.webViewLink || storedLink;
  const label = preview.label || storedLabel;

  if (!connected) return null;

  if (preview.loading && !link) {
    return <p className="min-w-0 break-words text-base text-muted-foreground">Resolving folder</p>;
  }

  if (preview.error && !link) {
    return (
      <p className="min-w-0 break-words text-base text-semantic-warning" title={preview.error}>
        {preview.error}
      </p>
    );
  }

  if (!siteName.trim()) {
    return <p className="min-w-0 break-words text-base text-muted-foreground">Select a client to preview the folder.</p>;
  }

  if (!link) return null;

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="min-w-0 break-words text-base text-primary underline-offset-2 hover:underline"
      title={label || link}
    >
      {label || "Open folder"}
    </a>
  );
}

