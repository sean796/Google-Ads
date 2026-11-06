import type { TaskArchiveFileInput } from "@/lib/task-execution-archive";

export type GoogleDriveDeliveryResult = {
  /** Uploaded file (Google Doc) view link. */
  googleDriveWebViewLink?: string;
  googleDriveFileWebViewLink?: string;
  googleDriveFileId?: string;
  googleDriveFileName?: string;
  googleDriveFolderWebViewLink?: string;
  googleDriveFolderLabel?: string;
  googleDriveTargetFolderId?: string;
  googleDriveFoldersCreated?: string[];
  googleDriveError?: string;
  googleDriveSkipped?: boolean;
  googleDriveSkipReason?: string;
};

export type DriveStepStatus = "running" | "done" | "error";

export type ResolvedPrimaryDeliverable = {
  fileName: string;
  content: string;
  mime: string;
  convertToGoogleDoc: boolean;
};


export type ResolvePrimaryDeliverableOptions = {
  executionKind?: string;
  reportOnly?: boolean;
};


export type ResolveDriveUploadDeliverablesInput = {
  archiveFiles?: TaskArchiveFileInput[];
  summaryText: string;
  fileNameHint?: string;
  executionKind?: string;
  siteName?: string;
  compareLabel?: string;
  comparePreset?: "mom" | "yoy";
};


export type ReportingGoogleDriveExecutionKind = "gsc_reporting" | "ads_reporting";
