import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import type { PpcCampaignRow } from "@/lib/ppc/google-ads-types";
import { resolvePpcRowCampaignName } from "@/lib/ppc/google-ads-types";
import {
  assertGoogleAdsPushBatch,
  collectGoogleAdsPublishRows,
  collectGoogleAdsSyncRows,
  type GoogleAdsPublishCampaignBody,
  type GoogleAdsSyncCampaignBody,
} from "@/lib/ppc/google-ads-publish-request";
import {
  createPpcPublishProgress,
  patchPpcGenerateStep,
  ppcPublishStepId,
  type PpcGenerateProgressState,
} from "@/lib/ppc/google-ads-progress-types";

export type GoogleAdsPublishCampaignResult = {
  campaignId: string;
};

export async function postGoogleAdsPublishCampaign(
  body: GoogleAdsPublishCampaignBody,
): Promise<GoogleAdsPublishCampaignResult> {
  const res = await fetch(backendApiUrl("/google-ads/publish-campaign"), {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    campaignId?: string;
    error?: string;
  };
  const campaignId = typeof data.campaignId === "string" ? data.campaignId.trim() : "";
  if (!res.ok || data.success !== true || !campaignId) {
    throw new Error(typeof data.error === "string" && data.error.trim() ? data.error : "Google Ads publish failed.");
  }
  return { campaignId };
}

export async function postGoogleAdsSyncCampaign(body: GoogleAdsSyncCampaignBody): Promise<void> {
  const res = await fetch(backendApiUrl("/google-ads/sync-campaign"), {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
  };
  if (!res.ok || data.success !== true) {
    throw new Error(typeof data.error === "string" && data.error.trim() ? data.error : "Google Ads sync failed.");
  }
}

export async function publishPpcGoogleCampaigns(options: {
  customerId: string | undefined;
  rows: PpcCampaignRow[];
  onProgress: (progress: PpcGenerateProgressState) => void;
  onRowPublished: (rowId: string, campaignId: string) => void;
  onRowError: (rowId: string, message: string) => void;
}): Promise<void> {
  const createRows = collectGoogleAdsPublishRows(options.rows);
  const syncRows = collectGoogleAdsSyncRows(options.rows);
  const { create: createBodies, sync: syncBodies } = assertGoogleAdsPushBatch(options.customerId, options.rows);

  const stepLabels = [
    ...createRows.map((row) => {
      const name = resolvePpcRowCampaignName(row).trim();
      return name ? `Publish ${name}` : "Publish campaign";
    }),
    ...syncRows.map((row) => {
      const name = resolvePpcRowCampaignName(row).trim();
      return name ? `Sync ${name}` : "Sync campaign";
    }),
  ];

  let progress = createPpcPublishProgress(stepLabels);
  options.onProgress(progress);

  let stepIndex = 0;

  for (let index = 0; index < createRows.length; index += 1) {
    const row = createRows[index]!;
    const body = createBodies[index]!;
    const stepId = ppcPublishStepId(stepIndex);
    progress = patchPpcGenerateStep(progress, stepId, "running");
    options.onProgress(progress);
    try {
      const result = await postGoogleAdsPublishCampaign(body);
      options.onRowPublished(row.id, result.campaignId);
      progress = patchPpcGenerateStep(progress, stepId, "done");
      options.onProgress(progress);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google Ads publish failed.";
      options.onRowError(row.id, message);
      progress = patchPpcGenerateStep(progress, stepId, "error", message);
      options.onProgress(progress);
      return;
    }
    stepIndex += 1;
  }

  for (let index = 0; index < syncRows.length; index += 1) {
    const row = syncRows[index]!;
    const body = syncBodies[index]!;
    const stepId = ppcPublishStepId(stepIndex);
    progress = patchPpcGenerateStep(progress, stepId, "running");
    options.onProgress(progress);
    try {
      await postGoogleAdsSyncCampaign(body);
      progress = patchPpcGenerateStep(progress, stepId, "done");
      options.onProgress(progress);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google Ads sync failed.";
      options.onRowError(row.id, message);
      progress = patchPpcGenerateStep(progress, stepId, "error", message);
      options.onProgress(progress);
      return;
    }
    stepIndex += 1;
  }
}
