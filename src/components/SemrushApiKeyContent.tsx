import { useCallback } from "react";
import { saveSemrushApiKey } from "../lib/api";
import { WorkspaceApiKeyRow } from "@/components/WorkspaceApiKeyRow";

interface SemrushApiKeyContentProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  saveApiKey: (key: string) => void;
}

export const SemrushApiKeyContent: React.FC<SemrushApiKeyContentProps> = ({
  apiKey,
  setApiKey,
  saveApiKey: saveKeyInLocalStorage,
}) => {
  const handleChange = useCallback(
    (next: string) => {
      setApiKey(next);
      saveSemrushApiKey(next);
      saveKeyInLocalStorage(next);
    },
    [setApiKey, saveKeyInLocalStorage],
  );

  return (
    <WorkspaceApiKeyRow
      id="semrush-apiKey"
      title="Semrush"
      description={
        <>
          Position Tracking and Analytics use your Semrush{" "}
          <strong className="font-semibold">v3 API key</strong>. Do not paste MCP tokens (semrtkn-pat).{" "}
          <a
            href="https://www.semrush.com/users/edit/api/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            Open API keys
          </a>
          .
        </>
      }
      value={apiKey}
      placeholder="Semrush API key"
      onChange={handleChange}
      copyEmptyMessage="Enter a Semrush API key to copy."
      copyAriaLabel="Copy Semrush API key"
    />
  );
};
