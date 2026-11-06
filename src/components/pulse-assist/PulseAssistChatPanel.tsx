import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { usePulseAssistContext } from "@/contexts/pulse-assist-context";
import { loadApiKey } from "@/lib/api";
import { appendResearchMetaToTurn } from "@/lib/platform-data/debug-export";
import { hasAgentsPanel } from "@/lib/platform-data/agent-panel";
import { readSubmode } from "@/lib/pulse-assist/storage";
import { clearPulseAssistHistory } from "@/lib/pulse-assist/storage";
import {
  buildPulseAssistDebugLog,
  downloadPulseAssistDebugLog,
  type PulseAssistDebugLog,
  type PulseAssistDebugTurn,
} from "@/lib/pulse-assist/debug-log";
import type { AssistTargetScope } from "@/lib/pulse-assist/types";
import { BACKEND_STARTERS, SUBMODE_GREETING } from "@/lib/pulse-assist/types";
import { NEO_PULSE_ASSIST_LABEL } from "./PulseAssistBrandTitle";
import { PulseAssistComposer } from "./PulseAssistComposer";
import { PulseAssistPanelHeader } from "./PulseAssistPanelHeader";
import {
  PulseAssistAckBubble,
  PulseAssistCard,
  PulseAssistUserBubble,
} from "./PulseAssistCard";
import { PulseAssistThinkingCard } from "./PulseAssistThinkingCard";
import { PulseAssistAgentsAccordion } from "./PulseAssistAgentsAccordion";
import { CreateSupportTicketDialog } from "./CreateSupportTicketDialog";
import { Button } from "@/ui";
import { usePulseAssistChatPanelController } from "./use-pulse-assist-chat-panel-controller";

export function PulseAssistChatPanel({
  sidebarOpen = false,
  hidePageScope = false,
  defaultTargetScope,
}: {
  sidebarOpen?: boolean;
  hidePageScope?: boolean;
  defaultTargetScope?: AssistTargetScope;
}) {
  const { user } = useAuth();
  const { activeTeam, members } = useTeam();
  const context = usePulseAssistContext();
  const { activeSite, activeSiteId, allSites, managerTab, generatorSection, overview, siteDisplayName } =
    context;

  const userId = user?.id ?? 0;
  const openRouterApiKey = loadApiKey();
  const hasOpenRouterKey = Boolean(openRouterApiKey.trim());
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [ticketChatLog, setTicketChatLog] = useState<PulseAssistDebugLog | null>(null);

  const {
    submode,
    setSubmode,
    pageContentMode,
    setPageContentMode,
    targetScope,
    setTargetScope,
    input,
    setInput,
    history,
    setHistory,
    turns,
    setTurns,
    loading,
    buildProgress,
    sendMessage,
    handleUndo,
  } = usePulseAssistChatPanelController({
    userId,
    hidePageScope,
    defaultTargetScope,
    canAssist: context.canAssist,
    hasOpenRouterKey,
    context,
    activeTeam,
    members,
  });
  const { canAssist } = context;

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
  }, [turns, loading]);

  const handleSubmodeSwitchFromCard = useCallback(
    (raw: string) => {
      const next = raw === "ask" || raw === "plan" || raw === "build" ? raw : readSubmode();
      const prevSubmode = submode;
      setSubmode(next);
      if (next === "build" && prevSubmode !== "build") {
        const lastUser = [...history].reverse().find((m) => m.role === "user");
        if (lastUser?.content) {
          void sendMessage(lastUser.content, { skipUserBubble: true, submodeOverride: next });
        }
      }
    },
    [history, sendMessage, setSubmode, submode],
  );

  const handleDownloadDebug = useCallback(() => {
    const debugTurns: PulseAssistDebugTurn[] = turns.map((turn) => {
      if (turn.kind === "user") return { kind: "user", text: turn.text };
      if (turn.kind === "ack") return { kind: "ack", text: turn.text };
      if (turn.kind === "thinking") return { kind: "thinking", title: turn.title, steps: turn.steps };
      return appendResearchMetaToTurn(
        { kind: "card", card: turn.card },
        {
          researchedDataToolIds: turn.researchedDataToolIds,
          dataToolClassifierReason: turn.dataToolClassifierReason,
          researchedDataBlock: turn.researchedDataBlock,
          inventorySource: turn.inventorySource,
          acfComplete: turn.acfComplete,
          sliceTeam: turn.sliceTeam,
          leadAgentUsed: turn.leadAgentUsed,
          intentSummary: turn.intentSummary,
          researchArtifacts: turn.researchArtifacts,
        },
      ) as PulseAssistDebugTurn;
    });
    const log = buildPulseAssistDebugLog({
      userId,
      submode,
      targetScope,
      managerTab,
      generatorSection,
      overview,
      activeSite,
      siteDisplayName,
      allSites,
      activeSiteId,
      history,
      turns: debugTurns,
    });
    downloadPulseAssistDebugLog(log);
  }, [
    turns,
    userId,
    submode,
    targetScope,
    managerTab,
    generatorSection,
    overview,
    activeSite,
    siteDisplayName,
    allSites,
    activeSiteId,
    history,
  ]);


  const handleCreateTicket = useCallback(() => {
    const debugTurns: PulseAssistDebugTurn[] = turns.map((turn) => {
      if (turn.kind === "user") return { kind: "user", text: turn.text };
      if (turn.kind === "ack") return { kind: "ack", text: turn.text };
      if (turn.kind === "thinking") return { kind: "thinking", title: turn.title, steps: turn.steps };
      return appendResearchMetaToTurn(
        { kind: "card", card: turn.card },
        {
          researchedDataToolIds: turn.researchedDataToolIds,
          dataToolClassifierReason: turn.dataToolClassifierReason,
          researchedDataBlock: turn.researchedDataBlock,
          inventorySource: turn.inventorySource,
          acfComplete: turn.acfComplete,
          sliceTeam: turn.sliceTeam,
          leadAgentUsed: turn.leadAgentUsed,
          intentSummary: turn.intentSummary,
          researchArtifacts: turn.researchArtifacts,
        },
      ) as PulseAssistDebugTurn;
    });
    setTicketChatLog(
      buildPulseAssistDebugLog({
        userId,
        submode,
        targetScope,
        managerTab,
        generatorSection,
        overview,
        activeSite,
        siteDisplayName,
        allSites,
        activeSiteId,
        history,
        turns: debugTurns,
      }),
    );
    setTicketDialogOpen(true);
  }, [
    turns,
    userId,
    submode,
    targetScope,
    managerTab,
    generatorSection,
    overview,
    activeSite,
    siteDisplayName,
    allSites,
    activeSiteId,
    history,
  ]);


  if (!canAssist) {
    return (
      <div className="pulse-assist-empty">
        <p className="text-base text-muted-foreground">Sign in to use {NEO_PULSE_ASSIST_LABEL}.</p>
      </div>
    );
  }

  if (!hasOpenRouterKey) {
    return (
      <div className="pulse-assist-empty">
        <p className="text-base text-muted-foreground">
          Add your OpenRouter API key in Dashboard → API Keys.
        </p>
      </div>
    );
  }

  return (
    <>
      <CreateSupportTicketDialog
        open={ticketDialogOpen}
        onOpenChange={setTicketDialogOpen}
        chatLog={ticketChatLog}
      />

      <div className="fcw-body pulse-assist-body">
      <PulseAssistPanelHeader
        targetScope={targetScope}
        onTargetScopeChange={setTargetScope}
        hidePageScope={hidePageScope}
        onCreateTicket={handleCreateTicket}
        onDownloadDebug={handleDownloadDebug}
        onClearHistory={() => {
          clearPulseAssistHistory(userId);
          setHistory([]);
          setTurns([]);
        }}
      />

      {buildProgress ? (
        <div className="fcw-harness-progress">
          <div className="fcw-harness-progress__label">{buildProgress.label}</div>
          <div className="fcw-harness-progress__track">
            <div
              className="fcw-harness-progress__fill"
              style={{ width: `${(buildProgress.completed / buildProgress.total) * 100}%` }}
            />
          </div>
        </div>
      ) : null}

      <div ref={messagesScrollRef} className="fcw-messages pulse-assist-messages">
        {turns.length === 0 ? (
          <div className="fcw-empty">
            <div className="fcw-empty__sub">{SUBMODE_GREETING[submode]}</div>
            <div className="fcw-starters">
              {BACKEND_STARTERS.map((starter) => (
                <Button
                  variant="quiet"
                  key={starter}
                  onClick={() => void sendMessage(starter)}
                  disabled={loading}
                >
                  {starter}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {turns.map((turn, i) => {
          if (turn.kind === "user") return <PulseAssistUserBubble key={`u-${i}`} text={turn.text} />;
          if (turn.kind === "ack") return <PulseAssistAckBubble key={`a-${i}`} text={turn.text} />;
          if (turn.kind === "thinking") {
            return (
              <div key={`t-${i}`} className="fcw-msg fcw-msg--assistant">
                <PulseAssistThinkingCard title={turn.title} steps={turn.steps} />
              </div>
            );
          }
          return (
            <div key={`c-${i}`} className="fcw-msg fcw-msg--assistant">
              <PulseAssistCard
                card={turn.card}
                onSubmodeSwitch={handleSubmodeSwitchFromCard}
                onTopicClick={(topic) => void sendMessage(topic)}
                onUndo={(postId) => void handleUndo(postId)}
              />
              {hasAgentsPanel(turn) ? <PulseAssistAgentsAccordion meta={turn} /> : null}
            </div>
          );
        })}
      </div>

      <PulseAssistComposer
        value={input}
        onChange={setInput}
        submode={submode}
        onSubmodeChange={setSubmode}
        pageContentMode={pageContentMode}
        onPageContentModeChange={setPageContentMode}
        onSend={() => void sendMessage(input)}
        disabled={loading}
        autoFocus={sidebarOpen}
      />
      </div>
    </>
  );
}
