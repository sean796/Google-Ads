import { useState, useCallback } from "react";
import { ApiKeyCopyButton } from "@/components/ApiKeyCopyButton";
import { notify } from "@/lib/app-notifications";
import {
  NOTIFY_SEMRUSH_API_KEY_CLEARED,
  NOTIFY_SEMRUSH_API_KEY_SAVED_SUCCESSFULLY,
} from "@/lib/notify-messages";
import { saveSemrushApiKey, loadSemrushApiKey } from "../lib/api";
import { DASHBOARD_SETTINGS_FIELD_CLASS } from "@/components/manager/dashboard/dashboard-panel-styles";
import { Button, Field } from "@/ui";

interface SemrushApiKeyContentProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  saveApiKey: (key: string) => void;
}

const INPUT_CLASS = `${DASHBOARD_SETTINGS_FIELD_CLASS} min-w-0 flex-1 h-12`;

export const SemrushApiKeyContent: React.FC<SemrushApiKeyContentProps> = ({
  apiKey,
  setApiKey,
  saveApiKey: saveKeyInLocalStorage,
}) => {
  const [localApiKey, setLocalApiKey] = useState(apiKey || loadSemrushApiKey());

  const handleSave = useCallback(async () => {
    if (localApiKey.trim()) {
      const trimmed = localApiKey.trim();
      saveKeyInLocalStorage(trimmed);
      saveSemrushApiKey(trimmed);
      setApiKey(trimmed);
      notify.success(NOTIFY_SEMRUSH_API_KEY_SAVED_SUCCESSFULLY);
    } else {
      saveKeyInLocalStorage("");
      saveSemrushApiKey("");
      setApiKey("");
      notify.warning(NOTIFY_SEMRUSH_API_KEY_CLEARED);
    }
  }, [localApiKey, setApiKey, saveKeyInLocalStorage]);

  return (
    <div className="space-y-2">
      <p className="font-semibold text-white">Semrush</p>
      <p className="text-base text-white">
        Position Tracking and Analytics use your Semrush{" "}
        <strong className="font-semibold">v3 API key</strong> (Profile, Subscription info, API units). Do not paste MCP
        personal access tokens (semrtkn-pat).{" "}
        <a
          href="https://www.semrush.com/users/edit/api/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          Open API keys
        </a>
        . Saved locally in this browser.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field
          placeholder="Semrush API key"
          id="semrush-apiKey"
          type="password"
          value={localApiKey}
          onChange={(e) => setLocalApiKey(e.target.value)}
          aria-label="Semrush API key"
          autoComplete="off"
        />
        <ApiKeyCopyButton
          value={localApiKey}
          emptyMessage="Enter a Semrush API key to copy."
          aria-label="Copy Semrush API key"
        />
        <Button variant="run" type="button" onClick={handleSave}>
          Save
        </Button>
      </div>
    </div>
  );
};
