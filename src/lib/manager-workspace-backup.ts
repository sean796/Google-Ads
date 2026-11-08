import { collectManagerCloudSettingsSnapshot, type ManagerCloudLlmSlice } from "@/lib/manager-cloud-settings-snapshot";
import { saveManagerSettingsToCloud } from "@/lib/manager-cloud-settings-api";

export type ManagerWorkspaceCredentialSlice = {
  apiKey: string;
  dataForSEOApiKey: string;
  semrushApiKey: string;
  agentMailApiKey: string;
  agentMailInbox: string;
};

export type ManagerWorkspaceBackupArgs = ManagerWorkspaceCredentialSlice & ManagerCloudLlmSlice;

export function buildManagerWorkspaceSnapshot(args: ManagerWorkspaceBackupArgs) {
  return collectManagerCloudSettingsSnapshot(
    {
      "openrouter-api-key": args.apiKey,
      "dataforseo-api-key": args.dataForSEOApiKey,
      "semrush-api-key": args.semrushApiKey,
      "agentmail-api-key": args.agentMailApiKey,
      "agentmail-general-email": args.agentMailInbox,
    },
    {
      selectedModel: args.selectedModel,
      temperature: args.temperature,
      maxTokens: args.maxTokens,
      topP: args.topP,
    },
  );
}

export async function saveManagerWorkspaceBackup(
  args: ManagerWorkspaceBackupArgs,
  teamId?: number | null,
): Promise<{ ok: boolean; error?: string; updatedAt?: string }> {
  const snapshot = buildManagerWorkspaceSnapshot(args);
  return saveManagerSettingsToCloud(snapshot, teamId);
}
