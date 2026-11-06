import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { applyManagerCloudSnapshotToLocalStorage } from "@/lib/manager-cloud-settings-snapshot";
import { loadManagerSettingsFromCloud } from "@/lib/manager-cloud-settings-api";
import { hydrateRuntimeApiKeys } from "@/lib/api";

export function MobileTeamWorkspaceHydrate(): null {
  const { user } = useAuth();
  const { activeTeam } = useTeam();

  useEffect(() => {
    const teamId = activeTeam?.id;
    if (!user || !teamId) return;

    let cancelled = false;
    void loadManagerSettingsFromCloud(teamId).then((result) => {
      if (cancelled || !result.ok || !result.snapshot) return;
      hydrateRuntimeApiKeys(result.snapshot.keys);
      applyManagerCloudSnapshotToLocalStorage(result.snapshot);
    });

    return () => {
      cancelled = true;
    };
  }, [activeTeam?.id, user]);

  return null;
}
