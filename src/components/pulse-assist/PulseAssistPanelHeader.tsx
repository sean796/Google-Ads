import { CircleHelp, Download, Trash2 } from "lucide-react";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import type { AssistTargetScope } from "@/lib/pulse-assist/types";
import { PulseAssistBrandTitle } from "./PulseAssistBrandTitle";
import { Button } from "@/ui";

type PulseAssistPanelHeaderProps = {
  targetScope: AssistTargetScope;
  onTargetScopeChange: (scope: AssistTargetScope) => void;
  onCreateTicket: () => void;
  onDownloadDebug: () => void;
  onClearHistory: () => void;
  hidePageScope?: boolean;
};

export function PulseAssistPanelHeader({
  targetScope,
  onTargetScopeChange,
  onCreateTicket,
  onDownloadDebug,
  onClearHistory,
  hidePageScope = false,
}: PulseAssistPanelHeaderProps) {
  const scopeOptions = hidePageScope ? (["site"] as const) : (["page", "site"] as const);

  return (
    <div className="pulse-assist-panel-header">
      <div className="pulse-assist-panel-header__row">
        <PulseAssistBrandTitle
          stacked={false}
          markSize={20}
          className="pulse-assist-panel-header__title shrink-0"
        />
        <div className="pulse-assist-panel-header__scope" role="group" aria-label="Assist scope">
          {scopeOptions.map((scope) => (
            <WorkspacePill
              key={scope}
              label={scope === "page" ? "Page" : "Site"}
              active={targetScope === scope}
              square
              onClick={() => onTargetScopeChange(scope)}
            />
          ))}
        </div>
        <div className="pulse-assist-panel-header__actions">
          <Button
            size="icon" icon={CircleHelp}
            variant="quiet"
            onClick={onCreateTicket}
            aria-label="Create a ticket"
          ></Button>
          <Button
            size="icon" icon={Download}
            variant="quiet"
            onClick={onDownloadDebug}
            aria-label="Download debug log"
          ></Button>
          <Button
            size="icon" icon={Trash2}
            variant="quiet"
            onClick={onClearHistory}
            aria-label="Clear chat history"
          ></Button>
        </div>
      </div>
    </div>
  );
}
