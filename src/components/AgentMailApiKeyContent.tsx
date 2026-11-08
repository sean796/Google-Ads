import { useCallback, useEffect, useState } from "react";
import { ApiKeyCopyButton } from "@/components/ApiKeyCopyButton";
import { WorkspaceApiKeyRow } from "@/components/WorkspaceApiKeyRow";
import {
  loadAgentMailApiKey,
  loadAgentMailInbox,
  saveAgentMailApiKey,
  saveAgentMailInbox,
} from "@/lib/api";
import { Field } from "@/ui";

export function AgentMailApiKeyContent() {
  const [inbox, setInbox] = useState(() => loadAgentMailInbox());
  const [apiKey, setApiKey] = useState(() => loadAgentMailApiKey());

  useEffect(() => {
    const sync = () => {
      setApiKey(loadAgentMailApiKey());
      setInbox(loadAgentMailInbox());
    };
    sync();
    window.addEventListener("neo-pulse-runtime-keys-hydrated", sync);
    return () => window.removeEventListener("neo-pulse-runtime-keys-hydrated", sync);
  }, []);

  const handleKeyChange = useCallback((next: string) => {
    setApiKey(next);
    saveAgentMailApiKey(next);
  }, []);

  const handleInboxChange = useCallback((next: string) => {
    setInbox(next);
    saveAgentMailInbox(next);
  }, []);

  return (
    <div className="space-y-4">
      <WorkspaceApiKeyRow
        id="agentmail-apiKey"
        title="AgentMail"
        description={
          <>
            Automation and team email delivery. Keys from{" "}
            <a
              href="https://agentmail.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              agentmail.io
            </a>
            .
          </>
        }
        value={apiKey}
        placeholder="AgentMail API key"
        onChange={handleKeyChange}
        copyEmptyMessage="Enter an AgentMail API key to copy."
        copyAriaLabel="Copy AgentMail API key"
      />

      <div className="flex items-center gap-2">
        <div className="min-w-0 max-w-md flex-1">
          <Field
            id="agentmail-inbox"
            type="email"
            size="url"
            value={inbox}
            onChange={(e) => handleInboxChange(e.target.value)}
            aria-label="AgentMail inbox email"
            autoComplete="off"
            placeholder="neo-pulse@agentmail.to"
          />
        </div>
        <ApiKeyCopyButton
          value={inbox}
          emptyMessage="Enter an AgentMail inbox to copy."
          aria-label="Copy AgentMail inbox email"
        />
      </div>
    </div>
  );
}
