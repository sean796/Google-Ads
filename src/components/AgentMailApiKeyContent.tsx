import { useState, useCallback } from "react";
import { ApiKeyCopyButton } from "@/components/ApiKeyCopyButton";
import { notify } from "@/lib/app-notifications";
import {
  NOTIFY_AGENTMAIL_API_KEY_CLEARED,
  NOTIFY_AGENTMAIL_API_KEY_SAVED,
} from "@/lib/notify-messages";
import {
  loadAgentMailApiKey,
  loadAgentMailInbox,
  saveAgentMailApiKey,
  saveAgentMailInbox,
} from "@/lib/api";
import { syncEmailWorkerKeys } from "@/lib/integrations-email-worker-api";
import { DASHBOARD_SETTINGS_FIELD_CLASS } from "@/components/manager/dashboard/dashboard-panel-styles";
import { Button, Field } from "@/ui";

const INPUT_CLASS = `${DASHBOARD_SETTINGS_FIELD_CLASS} min-w-0 flex-1 h-12`;

export function AgentMailApiKeyContent() {
  const [localApiKey, setLocalApiKey] = useState(() => loadAgentMailApiKey());
  const [localInbox, setLocalInbox] = useState(() => loadAgentMailInbox());

  const handleSave = useCallback(() => {
    const apiKey = localApiKey.trim();
    const inbox = localInbox.trim().toLowerCase();

    if (apiKey && inbox) {
      saveAgentMailApiKey(apiKey);
      saveAgentMailInbox(inbox);
      void syncEmailWorkerKeys({
        agentmailApiKey: apiKey,
        agentmailGeneralEmail: inbox,
      });
      notify.success(NOTIFY_AGENTMAIL_API_KEY_SAVED);
      return;
    }

    saveAgentMailApiKey("");
    saveAgentMailInbox("");
    void syncEmailWorkerKeys({
      agentmailApiKey: "",
      agentmailGeneralEmail: "",
    });
    notify.warning(NOTIFY_AGENTMAIL_API_KEY_CLEARED);
  }, [localApiKey, localInbox]);

  return (
    <div className="space-y-2">
      <p className="font-semibold text-white">AgentMail</p>
      <p className="text-base text-white">
        Automation and team email delivery. Keys from{" "}
        <a
          href="https://agentmail.io"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          agentmail.io
        </a>
        . Saved locally and synced to your server.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field
          placeholder="AgentMail API key"
          id="agentmail-apiKey"
          type="password"
          value={localApiKey}
          onChange={(e) => setLocalApiKey(e.target.value)}
          aria-label="AgentMail API key"
          autoComplete="off"
        />
        <ApiKeyCopyButton
          value={localApiKey}
          emptyMessage="Enter an AgentMail API key to copy."
          aria-label="Copy AgentMail API key"
        />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field
          id="agentmail-inbox"
          type="email"
          value={localInbox}
          onChange={(e) => setLocalInbox(e.target.value)}
          aria-label="AgentMail inbox email"
          autoComplete="off"
          placeholder="neo-pulse@agentmail.to"
        />
        <ApiKeyCopyButton
          value={localInbox}
          emptyMessage="Enter an AgentMail inbox email to copy."
          aria-label="Copy AgentMail inbox email"
        />
        <Button variant="run" type="button" onClick={handleSave}>
          Save
        </Button>
      </div>
    </div>
  );
}
