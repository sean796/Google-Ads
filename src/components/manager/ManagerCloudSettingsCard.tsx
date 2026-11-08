import { useCallback, useEffect, useState } from "react";
import { CloudUpload, CloudDownload } from "lucide-react";
import { notify } from "@/lib/app-notifications";
import {
  NOTIFY_SIGN_IN_TO_LOAD_SETTINGS_FROM_THE_CLOUD,
  NOTIFY_SIGN_IN_TO_SAVE_SETTINGS_TO_THE_CLOUD,
  notifyRestoredXKeysFromCloudReloading,
} from "@/lib/notify-messages";
import { useAuth } from "@/contexts/AuthContext";
import { DASHBOARD_SETTINGS_GROUP_CLASS } from "@/components/manager/dashboard/dashboard-panel-styles";
import { applyManagerCloudSnapshotToLocalStorage } from "@/lib/manager-cloud-settings-snapshot";
import { hydrateRuntimeApiKeys } from "@/lib/api";
import {
  getManagerCloudSettingsStatus,
  loadManagerSettingsFromCloud,
} from "@/lib/manager-cloud-settings-api";
import { loadAgentMailApiKey, loadAgentMailInbox } from "@/lib/api";
import { saveManagerWorkspaceBackup } from "@/lib/manager-workspace-backup";
import { Button } from "@/ui";

export type ManagerCloudSettingsCardProps = {
  apiKey: string;
  dataForSEOApiKey: string;
  semrushApiKey: string;
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
};

export function ManagerCloudSettingsCard({
  apiKey,
  dataForSEOApiKey,
  semrushApiKey,
  selectedModel,
  temperature,
  maxTokens,
  topP,
}: ManagerCloudSettingsCardProps) {
  const { user, activeTeam } = useAuth();
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getManagerCloudSettingsStatus>> | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const s = await getManagerCloudSettingsStatus();
    setStatus(s);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSaveToCloud = useCallback(async () => {
    if (!user) {
      notify.error(NOTIFY_SIGN_IN_TO_SAVE_SETTINGS_TO_THE_CLOUD);
      return;
    }
    setSaving(true);
    try {
      const r = await saveManagerWorkspaceBackup(
        {
          apiKey,
          dataForSEOApiKey,
          semrushApiKey,
          agentMailApiKey: loadAgentMailApiKey(),
          agentMailInbox: loadAgentMailInbox(),
          selectedModel,
          temperature,
          maxTokens,
          topP,
        },
        activeTeam?.id,
      );
      if (!r.ok) {
        notify.error(r.error || "Workspace save failed");
        return;
      }
      notify.success(
        r.updatedAt
          ? `Settings saved to workspace (${new Date(r.updatedAt).toLocaleString()})`
          : "Settings saved to workspace",
      );
    } finally {
      setSaving(false);
    }
  }, [user, apiKey, dataForSEOApiKey, semrushApiKey, selectedModel, temperature, maxTokens, topP, activeTeam?.id]);

  const handleLoadFromCloud = useCallback(async () => {
    if (!user) {
      notify.error(NOTIFY_SIGN_IN_TO_LOAD_SETTINGS_FROM_THE_CLOUD);
      return;
    }
    if (!window.confirm("Replace local settings with the last workspace backup? The page will reload.")) {
      return;
    }
    setLoading(true);
    try {
      const r = await loadManagerSettingsFromCloud(activeTeam?.id);
      if (!r.ok || !r.snapshot) {
        notify.error(r.error || "No workspace backup found");
        return;
      }
      hydrateRuntimeApiKeys(r.snapshot.keys);
      const applied = applyManagerCloudSnapshotToLocalStorage(r.snapshot);
      if (applied.error) {
        notify.error(applied.error);
        return;
      }
      notify.success(notifyRestoredXKeysFromCloudReloading(applied.keyCount));
      window.setTimeout(() => window.location.reload(), 400);
    } finally {
      setLoading(false);
    }
  }, [user, activeTeam?.id]);

  const disabled = !user || !status?.ok;
  const host = status?.urlHost;

  return (
    <div className={DASHBOARD_SETTINGS_GROUP_CLASS}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className="font-semibold text-white">Workspace backup</p>
          <p className="text-base text-white">
            Back up API keys, properties, model defaults, and master rules to workspace storage on the API server
            {host ? (
              <>
                {" "}
                (<span className="font-mono">{host}</span>)
              </>
            ) : null}
            .
          </p>
          {!user ? <p className="text-base text-semantic-warning-foreground">Sign in to use workspace backup.</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            disabled={disabled || saving}
            onClick={() => void handleSaveToCloud()}
          >
            <CloudUpload className="h-4 w-4" aria-hidden />
            {saving ? "Saving…" : "Save to workspace"}
          </Button>
          <Button
            type="button"
            disabled={disabled || loading}
            onClick={() => void handleLoadFromCloud()}
          >
            <CloudDownload className="h-4 w-4" aria-hidden />
            {loading ? "Loading…" : "Load from workspace"}
          </Button>
        </div>
      </div>
    </div>
  );
}
