import { formatGoogleDriveFolderUrl } from "@/lib/google-drive/google-drive-folder-presets";
import type { GoogleDriveFolderSource, TaskExecutionPayload } from "@/lib/tasks-types";

export const CUSTOM_FOLDER = "custom";

export type DriveFolderVariableOption = {
  key: string;
  label: string;
};

export type AutomationGoogleDriveFieldsProps = {
  payload: TaskExecutionPayload;
  disabled?: boolean;
  siteName?: string;
  siteUrl?: string;
  executionKind?: string;
  layout?: "stack" | "workflow";
  inferredFolderPath?: string;
  folderVariableOptions?: DriveFolderVariableOption[];
  onChange: (patch: Partial<TaskExecutionPayload>) => void;
};

export const FOLDER_SOURCE_OPTIONS: { value: GoogleDriveFolderSource; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "client_root", label: "Client folder" },
  { value: "path", label: "Path" },
  { value: "variable", label: "Variable" },
];

export function folderPathFromPayload(payload: TaskExecutionPayload): string {
  const folderId = String(payload.googleDriveFolderId ?? "").trim();
  if (!folderId) return "";
  return formatGoogleDriveFolderUrl(folderId) || folderId;
}

export function resolveFolderSource(payload: TaskExecutionPayload): GoogleDriveFolderSource {
  const source = payload.googleDriveFolderSource;
  if (source === "client_root" || source === "path" || source === "variable") return source;
  return "manual";
}

