import React, { useCallback, useMemo, useState } from "react";
import {
  readStoredEntitySubmode,
  writeStoredEntitySubmode,
  type EntityGeneratorSubmode,
} from "@/components/sap-generator/entity-generator-submode";
import { SapGeneratorContent } from "@/components/sap-generator/SapGeneratorContent";
import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";
import { buildTempLocalAnalysisSite } from "@/lib/temp-local-analysis-site";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { useManagerSeedWorkspace } from "@/contexts/manager-seed-workspace-context";

export type SapGeneratorWorkspaceMode = import("@/contexts/manager-seed-workspace-context").ManagerWorkspaceSeedMode;

export interface SapGeneratorShellProps {
  apiKey: string;
  dataForSEOApiKey: string;
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  flowPurpose?: string;
  activeSection: BlogGeneratorSectionId;
  onSectionChange: (id: BlogGeneratorSectionId) => void;
}

export const SapGeneratorShell: React.FC<SapGeneratorShellProps> = ({
  apiKey,
  dataForSEOApiKey,
  selectedModel,
  temperature,
  maxTokens,
  topP,
  flowPurpose,
  activeSection,
  onSectionChange,
}) => {
  const {
    mode: workspaceMode,
    setMode,
    tempSeedUrl,
    setTempSeedUrl,
    debouncedTempSeed,
    canUseConnected,
    enabledSites,
    connectedSite,
    pickTempFromConnected,
  } = useManagerSeedWorkspace();

  const localAnalysisSite = useMemo(() => {
    if (enabledSites.length === 0) {
      return buildTempLocalAnalysisSite(tempSeedUrl);
    }
    if (workspaceMode === "temp") {
      return buildTempLocalAnalysisSite(tempSeedUrl);
    }
    return connectedSite ?? enabledSites[0];
  }, [enabledSites, workspaceMode, tempSeedUrl, connectedSite]);

  const localAnalysisWorkspaceKey = useMemo(() => {
    if (enabledSites.length === 0) {
      return `temp:${debouncedTempSeed}`;
    }
    if (workspaceMode === "temp") {
      return `temp:${debouncedTempSeed}`;
    }
    const s = connectedSite ?? enabledSites[0];
    return `connected:${s.id}|${getPublicSiteUrl(s)}`;
  }, [enabledSites, workspaceMode, debouncedTempSeed, connectedSite]);

  const [entitySubmode, setEntitySubmodeState] = useState<EntityGeneratorSubmode>(() =>
    readStoredEntitySubmode(),
  );

  const setEntitySubmode = useCallback((mode: EntityGeneratorSubmode) => {
    setEntitySubmodeState(mode);
    writeStoredEntitySubmode(mode);
  }, []);

  return (
    <SapGeneratorContent
      entitySubmode={entitySubmode}
      onEntitySubmodeChange={setEntitySubmode}
      localAnalysisSite={localAnalysisSite}
      localAnalysisWorkspaceKey={localAnalysisWorkspaceKey}
      localAnalysisWorkspace={{
        mode: workspaceMode,
        onModeChange: setMode,
        tempSeedUrl,
        onTempSeedUrlChange: setTempSeedUrl,
        showConnectedToggle: canUseConnected,
        connectedSiteUrl: connectedSite ? getPublicSiteUrl(connectedSite) || null : null,
        onPickTempFromConnected: pickTempFromConnected,
      }}
      activeSection={activeSection}
      onSectionChange={onSectionChange}
      apiKey={apiKey}
      dataForSEOApiKey={dataForSEOApiKey}
      selectedModel={selectedModel}
      temperature={temperature}
      maxTokens={maxTokens}
      topP={topP}
      flowPurpose={flowPurpose}
    />
  );
};
