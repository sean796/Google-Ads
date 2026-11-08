import { useCallback } from "react";
import { saveDataForSEOApiKey } from "../lib/api";
import { WorkspaceApiKeyRow } from "@/components/WorkspaceApiKeyRow";

interface DataForSEOApiKeyContentProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  saveApiKey: (key: string) => void;
}

export const DataForSEOApiKeyContent: React.FC<DataForSEOApiKeyContentProps> = ({
  apiKey,
  setApiKey,
  saveApiKey: saveKeyInLocalStorage,
}) => {
  const handleChange = useCallback(
    (next: string) => {
      setApiKey(next);
      saveDataForSEOApiKey(next);
      saveKeyInLocalStorage(next);
    },
    [setApiKey, saveKeyInLocalStorage],
  );

  return (
    <WorkspaceApiKeyRow
      id="dataforseo-apiKey"
      title="DataForSEO"
      description={
        <>
          Keyword research. Paste your DataForSEO API password (account login can live in server{" "}
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
        </>
      }
      value={apiKey}
      placeholder="DataForSEO API key"
      onChange={handleChange}
      copyEmptyMessage="Enter a DataForSEO API key to copy."
      copyAriaLabel="Copy DataForSEO API key"
    />
  );
};
