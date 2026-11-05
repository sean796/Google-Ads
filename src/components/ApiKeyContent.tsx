import { useState, useCallback } from "react";
import { ApiKeyCopyButton } from "@/components/ApiKeyCopyButton";
import { notify } from "@/lib/app-notifications";
import {
  NOTIFY_API_KEY_CLEARED_AI_GENERATION_IS_DISABLE,
  NOTIFY_API_KEY_SAVED_AND_UPDATED_FOR_CURRENT_SE,
} from "@/lib/notify-messages";
import { DASHBOARD_SETTINGS_FIELD_CLASS } from "@/components/manager/dashboard/dashboard-panel-styles";
import { syncOpenRouterToWorkspace } from "@/lib/manager-wordpress-properties-api";
import { Button, Field } from "@/ui";

interface ApiKeyContentProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  saveApiKey: (key: string) => void;
}

const INPUT_CLASS = `${DASHBOARD_SETTINGS_FIELD_CLASS} min-w-0 flex-1 h-12`;

export const ApiKeyContent: React.FC<ApiKeyContentProps> = ({
  apiKey,
  setApiKey,
  saveApiKey: saveKeyInLocalStorage,
}) => {
  const [localApiKey, setLocalApiKey] = useState(apiKey);

  const handleSave = useCallback(() => {
    if (localApiKey.trim()) {
      saveKeyInLocalStorage(localApiKey.trim());
      setApiKey(localApiKey.trim());
      void syncOpenRouterToWorkspace({ openRouterApiKey: localApiKey.trim() });
      notify.success(NOTIFY_API_KEY_SAVED_AND_UPDATED_FOR_CURRENT_SE);
    } else {
      saveKeyInLocalStorage("");
      setApiKey("");
      void syncOpenRouterToWorkspace({ openRouterApiKey: "" });
      notify.warning(NOTIFY_API_KEY_CLEARED_AI_GENERATION_IS_DISABLE);
    }
  }, [localApiKey, setApiKey, saveKeyInLocalStorage]);

  return (
    <div className="space-y-2">
      <p className="font-semibold text-white">OpenRouter</p>
      <p className="text-base text-white">Powers AI generation. Saved locally and synced to your server.</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field
          placeholder="OpenRouter API key"
          id="apiKey"
          type="password"
          value={localApiKey}
          onChange={(e) => setLocalApiKey(e.target.value)}
          aria-label="OpenRouter API key"
          autoComplete="off"
        />
        <ApiKeyCopyButton
          value={localApiKey}
          emptyMessage="Enter an OpenRouter API key to copy."
          aria-label="Copy OpenRouter API key"
        />
        <Button variant="run" type="button" onClick={handleSave}>
          Save
        </Button>
      </div>
    </div>
  );
};
