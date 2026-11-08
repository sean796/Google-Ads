import { useCallback } from "react";
import { saveApiKey as saveRuntimeApiKey } from "../lib/api";
import { WorkspaceApiKeyRow } from "@/components/WorkspaceApiKeyRow";

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
  const handleChange = useCallback(
    (next: string) => {
      setApiKey(next);
      saveRuntimeApiKey(next);
      saveKeyInLocalStorage(next);
    },
    [setApiKey, saveKeyInLocalStorage],
  );

  return (
    <WorkspaceApiKeyRow
      id="openrouter-apiKey"
      title="OpenRouter"
      description={
        <>
          Powers AI generation across the app. Keys from{" "}
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            openrouter.ai
          </a>
          .
        </>
      }
      value={apiKey}
      placeholder="OpenRouter API key"
      onChange={handleChange}
      copyEmptyMessage="Enter an OpenRouter API key to copy."
      copyAriaLabel="Copy OpenRouter API key"
    />
  );
};
