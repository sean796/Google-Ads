import { useState, useCallback } from "react";
import { ApiKeyCopyButton } from "@/components/ApiKeyCopyButton";
import { notify } from "@/lib/app-notifications";
import {
  NOTIFY_API_KEY_CLEARED_AI_GENERATION_IS_DISABLE,
  NOTIFY_API_KEY_SAVED_AND_UPDATED_FOR_CURRENT_SE,
} from "@/lib/notify-messages";
import { saveApiKey as saveRuntimeApiKey, loadApiKey } from "../lib/api";
import { Button, Field } from "@/ui";

interface ApiKeyContentProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  saveApiKey: (key: string) => void;
}

export const ApiKeyContent: React.FC<ApiKeyContentProps> = ({
  apiKey,
  setApiKey,
  saveApiKey: saveKeyInLocalStorage,
}) => {
  const [localApiKey, setLocalApiKey] = useState(apiKey || loadApiKey());

  // Register as you type: the runtime key store is what generation reads,
  // so a typed key must land there immediately, not only on Save. Saving
  // to the workspace backup (top of this panel) then persists it.
  const handleChange = useCallback(
    (next: string) => {
      setLocalApiKey(next);
      setApiKey(next);
      saveRuntimeApiKey(next);
    },
    [setApiKey],
  );

  const handleSave = useCallback(() => {
    if (localApiKey.trim()) {
      const trimmed = localApiKey.trim();
      saveKeyInLocalStorage(trimmed);
      saveRuntimeApiKey(trimmed);
      setApiKey(trimmed);
      notify.success(NOTIFY_API_KEY_SAVED_AND_UPDATED_FOR_CURRENT_SE);
    } else {
      saveKeyInLocalStorage("");
      saveRuntimeApiKey("");
      setApiKey("");
      notify.warning(NOTIFY_API_KEY_CLEARED_AI_GENERATION_IS_DISABLE);
    }
  }, [localApiKey, setApiKey, saveKeyInLocalStorage]);

  return (
    <div className="space-y-2">
      <p className="font-semibold text-white">OpenRouter</p>
      <p className="text-base text-white">
        Powers AI generation across the app. Paste your OpenRouter API key. Keys from{" "}
        <a
          href="https://openrouter.ai/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          openrouter.ai
        </a>
        . Saved for this session and to your workspace backup.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field
          placeholder="OpenRouter API key"
          id="openrouter-apiKey"
          type="password"
          value={localApiKey}
          onChange={(e) => handleChange(e.target.value)}
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
