import { useEffect, useState } from "react";
import { loadDataForSEOApiKey, loadSemrushApiKey } from "@/lib/api";
import { hydrateRuntimeApiKeysFromCloud } from "@/components/integrations/storage";

export function useManagerWorkspaceApiKeys() {
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
    void hydrateRuntimeApiKeysFromCloud().then(() => {
      if (!live) return;
      setDataForSEOApiKey(loadDataForSEOApiKey());
      setSemrushApiKey(loadSemrushApiKey());
    });
    return () => {
      live = false;
    };
  }, []);
  return { dataForSEOApiKey, setDataForSEOApiKey, semrushApiKey, setSemrushApiKey };
}
