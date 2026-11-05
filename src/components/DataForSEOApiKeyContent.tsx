import { useState, useCallback } from "react";
import { ApiKeyCopyButton } from "@/components/ApiKeyCopyButton";
import { notify } from "@/lib/app-notifications";
import {
  NOTIFY_DATAFORSEO_API_KEY_CLEARED,
  NOTIFY_DATAFORSEO_API_KEY_SAVED_SUCCESSFULLY,
} from "@/lib/notify-messages";
import { saveDataForSEOApiKey, loadDataForSEOApiKey } from "../lib/api";
import { DASHBOARD_SETTINGS_FIELD_CLASS } from "@/components/manager/dashboard/dashboard-panel-styles";
import { Button, Field } from "@/ui";

interface DataForSEOApiKeyContentProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  saveApiKey: (key: string) => void;
}

const INPUT_CLASS = `${DASHBOARD_SETTINGS_FIELD_CLASS} min-w-0 flex-1 h-12`;

export const DataForSEOApiKeyContent: React.FC<DataForSEOApiKeyContentProps> = ({
  apiKey,
  setApiKey,
  saveApiKey: saveKeyInLocalStorage,
}) => {
  const [localApiKey, setLocalApiKey] = useState(apiKey || loadDataForSEOApiKey());

  const handleSave = useCallback(() => {
    if (localApiKey.trim()) {
      saveKeyInLocalStorage(localApiKey.trim());
      saveDataForSEOApiKey(localApiKey.trim());
      setApiKey(localApiKey.trim());
      notify.success(NOTIFY_DATAFORSEO_API_KEY_SAVED_SUCCESSFULLY);
    } else {
      saveKeyInLocalStorage("");
      saveDataForSEOApiKey("");
      setApiKey("");
      notify.warning(NOTIFY_DATAFORSEO_API_KEY_CLEARED);
    }
  }, [localApiKey, setApiKey, saveKeyInLocalStorage]);

  return (
    <div className="space-y-2">
      <p className="font-semibold text-white">DataForSEO</p>
      <p className="text-base text-white">
        Keyword research. Paste your DataForSEO API password (account login lives in server{" "}
        <span className="font-mono text-muted-foreground">.env</span>). Keys from{" "}
        <a
          href="https://dataforseo.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          dataforseo.com
        </a>
        .
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field
          placeholder="DataForSEO API key"
          id="dataforseo-apiKey"
          type="password"
          value={localApiKey}
          onChange={(e) => setLocalApiKey(e.target.value)}
          aria-label="DataForSEO API key"
          autoComplete="off"
        />
        <ApiKeyCopyButton
          value={localApiKey}
          emptyMessage="Enter a DataForSEO API key to copy."
          aria-label="Copy DataForSEO API key"
        />
        <Button variant="run" type="button" onClick={handleSave}>
          Save
        </Button>
      </div>
    </div>
  );
};
