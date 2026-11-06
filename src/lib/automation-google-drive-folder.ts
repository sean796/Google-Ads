import {
  formatGoogleDriveFolderUrl,
  parseGoogleDriveFolderId,
  suggestPresetForSiteName,
} from "@/lib/google-drive/google-drive-folder-presets";
import {
  driveFolderBelongsToClient,
  resolveWorkflowDriveFolderPath,
} from "@/lib/google-drive/google-drive-folder-hierarchy";
import {
  resolveGoogleDriveFolderWithFallback,
  type ResolveGoogleDriveFolderContext,
  type ResolvedGoogleDriveFolder,
} from "@/lib/google-drive/resolve-google-drive-folder";
import type { TaskExecutionClientRunContract } from "@/lib/tasks-types";

export function normalizeWorkflowDriveContract(
  contract: TaskExecutionClientRunContract | Record<string, unknown>,
  executionKind?: string,
): TaskExecutionClientRunContract {
  const typed = contract as TaskExecutionClientRunContract;
  return {
    ...typed,
    saveToGoogleDrive: true,
    googleDriveFolderSource: "path",
    googleDriveFolderPath: resolveWorkflowDriveFolderPath(typed, executionKind),
    googleDriveFolderId: "",
    googleDrivePresetKey: "",
    googleDriveTargetFolderId: "",
  };
}

export function readConfiguredGoogleDriveTargetFolder(
  contract: TaskExecutionClientRunContract | Record<string, unknown>,
  siteName?: string,
): ResolvedGoogleDriveFolder | null {
  const typed = contract as TaskExecutionClientRunContract;
  const source = String(typed.googleDriveFolderSource ?? "").trim();
  if (source !== "manual") return null;
  const targetId = parseGoogleDriveFolderId(String(typed.googleDriveTargetFolderId ?? ""));
  if (!targetId) return null;
  const label = String(typed.googleDriveFolderLabel ?? "").trim() || "Google Drive folder";
  const want = String(siteName ?? "").trim();
  if (want && !driveFolderBelongsToClient(label, want)) return null;
  return {
    folderId: targetId,
    label,
    webViewLink: formatGoogleDriveFolderUrl(targetId),
  };
}

export async function resolveGoogleDriveTargetFolder(args: {
  contract: TaskExecutionClientRunContract | Record<string, unknown>;
  siteName?: string;
  siteUrl?: string;
  executionKind?: string;
  context?: ResolveGoogleDriveFolderContext;
}): Promise<ResolvedGoogleDriveFolder | null> {
  const enriched = enrichGoogleDriveContractFromSite(
    args.contract,
    args.siteName ?? "",
    args.siteUrl,
  );
  const configured = readConfiguredGoogleDriveTargetFolder(enriched, args.siteName);
  if (configured) return configured;
  return resolveGoogleDriveFolderWithFallback({
    contract: enriched,
    siteName: args.siteName,
    siteUrl: args.siteUrl,
    executionKind: args.executionKind,
    context: args.context,
  });
}

export function enrichGoogleDriveContractFromSite(
  contract: TaskExecutionClientRunContract | Record<string, unknown>,
  siteName: string,
  siteUrl?: string,
): TaskExecutionClientRunContract {
  const typed = contract as TaskExecutionClientRunContract;
  if (typed.saveToGoogleDrive !== true) return typed;

  const suggested = suggestPresetForSiteName(siteName, siteUrl);
  if (!suggested) return typed;

  const source = String(typed.googleDriveFolderSource ?? "manual").trim();
  const patch: Partial<TaskExecutionClientRunContract> = {};

  if (!String(typed.googleDrivePresetKey ?? "").trim()) {
    patch.googleDrivePresetKey = suggested.id;
    patch.googleDriveFolderLabel = suggested.label;
  }

  if (source === "path" || source === "client_root") {
    if (!String(typed.googleDriveFolderPath ?? "").trim()) {
      patch.googleDriveFolderPath = "reporting";
    }
    return { ...typed, ...patch };
  }

  if (!String(typed.googleDriveFolderId ?? "").trim()) {
    patch.googleDriveFolderId = suggested.folderId;
  }
  return { ...typed, ...patch };
}
