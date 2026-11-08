import { useEffect, useState } from "react";
import { useTeam } from "@/contexts/TeamContext";
import { loadApiKey, loadDataForSEOApiKey, loadSemrushApiKey } from "@/lib/api";
import { hydrateRuntimeApiKeysFromCloud } from "@/components/integrations/storage";

export function useManagerWorkspaceApiKeys(setOpenRouterApiKey?: (key: string) => void) {
  const { activeTeam } = useTeam();
  const teamId = activeTeam?.id;
  const [dataForSEOApiKey, setDataForSEOApiKey] = useState<string>(() => loadDataForSEOApiKey());
  const [semrushApiKey, setSemrushApiKey] = useState<string>(() => {
    try {
      return loadSemrushApiKey();
    } catch {
      return "";
    }
  });
  useEffect(() => {
    let live = true;
    const syncFromRuntime = () => {
      if (!live) return;
      setOpenRouterApiKey?.(loadApiKey());
      setDataForSEOApiKey(loadDataForSEOApiKey());
      setSemrushApiKey(loadSemrushApiKey());
    };
    void hydrateRuntimeApiKeysFromCloud(teamId).then(syncFromRuntime);
    window.addEventListener("neo-pulse-runtime-keys-hydrated", syncFromRuntime);
    return () => {
      live = false;
      window.removeEventListener("neo-pulse-runtime-keys-hydrated", syncFromRuntime);
    };
  }, [teamId, setOpenRouterApiKey]);
  return { dataForSEOApiKey, setDataForSEOApiKey, semrushApiKey, setSemrushApiKey };
}
