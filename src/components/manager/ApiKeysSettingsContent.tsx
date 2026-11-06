import { Key } from "lucide-react";
import { ApiKeyContent } from "@/components/ApiKeyContent";
import { DataForSEOApiKeyContent } from "@/components/DataForSEOApiKeyContent";
import { SemrushApiKeyContent } from "@/components/SemrushApiKeyContent";
import { AgentMailApiKeyContent } from "@/components/AgentMailApiKeyContent";
import { ResidentialProxySettingsContent } from "@/components/manager/ResidentialProxySettingsContent";
import { ManagerCloudSettingsCard } from "@/components/manager/ManagerCloudSettingsCard";
import {
  DASHBOARD_SETTINGS_GROUP_CLASS,
  DASHBOARD_SETTINGS_PANEL_CLASS,
} from "@/components/manager/dashboard/dashboard-panel-styles";

export type ApiKeysSettingsContentProps = {
  apiKey: string;
  setApiKey: (key: string) => void;
  saveApiKey: (key: string) => void;
  dataForSEOApiKey: string;
  setDataForSEOApiKey: (key: string) => void;
  saveDataForSEOApiKey: (key: string) => void;
  semrushApiKey: string;
  setSemrushApiKey: (key: string) => void;
  saveSemrushApiKey: (key: string) => void;
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
};

export function ApiKeysSettingsContent({
  apiKey,
  setApiKey,
  saveApiKey,
  dataForSEOApiKey,
  setDataForSEOApiKey,
  saveDataForSEOApiKey,
  semrushApiKey,
  setSemrushApiKey,
  saveSemrushApiKey,
  selectedModel,
  temperature,
  maxTokens,
  topP,
}: ApiKeysSettingsContentProps) {
  return (
    <div className={`${DASHBOARD_SETTINGS_PANEL_CLASS} space-y-4 text-white`}>
      <div className="flex items-center gap-2">
        <Key className="h-5 w-5 text-white" aria-hidden />
        <h2 className="text-base font-semibold text-white">API Keys</h2>
      </div>

      <ManagerCloudSettingsCard
        apiKey={apiKey}
        dataForSEOApiKey={dataForSEOApiKey}
        semrushApiKey={semrushApiKey}
        selectedModel={selectedModel}
        temperature={temperature}
        maxTokens={maxTokens}
        topP={topP}
      />

      <div className={DASHBOARD_SETTINGS_GROUP_CLASS}>
        <p className="font-semibold text-white">Service keys</p>
        <div className="space-y-6">
          <ApiKeyContent apiKey={apiKey} setApiKey={setApiKey} saveApiKey={saveApiKey} />
          <DataForSEOApiKeyContent
            apiKey={dataForSEOApiKey}
            setApiKey={setDataForSEOApiKey}
            saveApiKey={saveDataForSEOApiKey}
          />
          <SemrushApiKeyContent
            apiKey={semrushApiKey}
            setApiKey={setSemrushApiKey}
            saveApiKey={saveSemrushApiKey}
          />
          <AgentMailApiKeyContent />
          <ResidentialProxySettingsContent />
        </div>
      </div>
    </div>
  );
}
