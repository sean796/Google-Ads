import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { usePulseAssistContext } from "@/contexts/pulse-assist-context";
import { loadApiKey } from "@/lib/api";
import { fetchTaskProjects, fetchPulseAssignedTasks } from "@/lib/tasks-api";
import type { TaskProject } from "@/lib/tasks-types";
import type { TeamContextPulseTask } from "@/lib/pulse-assist/types";
import { pulseAssistAck, pulseAssistStreamLive, pulseAssistUndo } from "@/lib/pulse-assist/api";
import { runBuildHarness } from "@/lib/pulse-assist/build-harness";
import { appendResearchMetaToTurn } from "@/lib/platform-data/debug-export";
import { hasAgentsPanel, researchMetaForStorage } from "@/lib/platform-data/agent-panel";
import type { PlatformDataResearchMeta } from "@/lib/platform-data/types";
import {
  cardAssistantText,
  normalizeSubmodeSwitchTopic,
  snapshotCardForHistory,
} from "@/lib/pulse-assist/cards";
import { buildAssistPayload } from "@/lib/pulse-assist/context";
import {
  buildPulseAssistDebugLog,
  downloadPulseAssistDebugLog,
  type PulseAssistDebugLog,
  type PulseAssistDebugTurn,
} from "@/lib/pulse-assist/debug-log";
import {
  clearPulseAssistHistory,
  loadPulseAssistHistory,
  readSubmode,
  readPageContentMode,
  readTargetScope,
  savePulseAssistHistory,
  writePageContentMode,
  writeSubmode,
  writeTargetScope,
} from "@/lib/pulse-assist/storage";
import { turnsFromAssistHistory } from "@/lib/pulse-assist/history";
import { applyStreamEvent, INITIAL_WORKFLOW, isAgentWorkflowEvent, WorkflowPacer } from "@/lib/pulse-assist/stream";
import type {
  AssistCard,
  AssistCardStep,
  AssistHistoryMessage,
  AssistSubmode,
  PageContentMode,
  AssistStreamEvent,
  AssistTargetScope,
} from "@/lib/pulse-assist/types";
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

type Turn =
  | { kind: "user"; text: string }
  | ({ kind: "card"; card: NonNullable<AssistHistoryMessage["card"]> } & PlatformDataResearchMeta)
  | { kind: "ack"; text: string }
  | { kind: "thinking"; title: string; steps: AssistCardStep[] };

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
  const { activeSite, activeSiteId, allSites, canAssist, managerTab, dashboardCluster, generatorSection, researchSection, sitemapMode, contentOptimizerSection, overview, tasks, siteDisplayName } =
    usePulseAssistContext();

  const userId = user?.id ?? 0;
  const openRouterApiKey = loadApiKey();
  const hasOpenRouterKey = Boolean(openRouterApiKey.trim());
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const [taskProjects, setTaskProjects] = useState<TaskProject[]>([]);
  const [pulseAssignedTasks, setPulseAssignedTasks] = useState<TeamContextPulseTask[]>([]);

  useEffect(() => {
    if (!activeTeam?.id) {
      setTaskProjects([]);
      setPulseAssignedTasks([]);
      return;
    }
    let cancelled = false;
    void fetchTaskProjects(activeTeam.id).then((projects) => {
      if (!cancelled) setTaskProjects(projects);
    });
    void fetchPulseAssignedTasks(activeTeam.id).then((tasks) => {
      if (!cancelled) setPulseAssignedTasks(tasks);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTeam?.id]);

  const [submode, setSubmodeState] = useState<AssistSubmode>(() => readSubmode());
  const [pageContentMode, setPageContentModeState] = useState<PageContentMode>(() =>
    readPageContentMode(),
  );
  const [targetScope, setTargetScopeState] = useState<AssistTargetScope>(
    () => defaultTargetScope ?? readTargetScope(),
  );
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<AssistHistoryMessage[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [buildProgress, setBuildProgress] = useState<{ completed: number; total: number; label: string } | null>(null);
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [ticketChatLog, setTicketChatLog] = useState<PulseAssistDebugLog | null>(null);

  const setSubmode = useCallback((next: AssistSubmode) => {
    setSubmodeState(next);
    writeSubmode(next);
  }, []);

  const setPageContentMode = useCallback((next: PageContentMode) => {
    setPageContentModeState(next);
    writePageContentMode(next);
  }, []);

  const setTargetScope = useCallback(
    (next: AssistTargetScope) => {
      const scope = hidePageScope && next === "page" ? "site" : next;
      setTargetScopeState(scope);
      writeTargetScope(scope);
    },
    [hidePageScope],
  );

  useEffect(() => {
    if (!hidePageScope || targetScope === "site") return;
    setTargetScope("site");
  }, [hidePageScope, targetScope, setTargetScope]);

  useEffect(() => {
    const loaded = loadPulseAssistHistory(userId);
    setHistory(loaded);
    setTurns(turnsFromAssistHistory(loaded));
  }, [userId]);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
  }, [turns, loading]);

  const appendAssistantCard = useCallback(
    (card: AssistCard, userMessage: string, meta?: PlatformDataResearchMeta) => {
      const assistantText = cardAssistantText(card);
      const storedMeta = researchMetaForStorage(meta);
      setHistory((prev) => {
        const next = [
          ...prev,
          { role: "user" as const, content: userMessage },
          {
            role: "assistant" as const,
            content: assistantText,
            card: snapshotCardForHistory(card),
            researchMeta: storedMeta,
          },
        ];
        savePulseAssistHistory(userId, next);
        return next;
      });
      setTurns((prev) => [
        ...prev.filter((t) => t.kind !== "thinking" && t.kind !== "ack"),
        appendResearchMetaToTurn({ kind: "card", card }, meta) as Extract<
          PulseAssistDebugTurn,
          { kind: "card" }
        >,
      ]);
    },
    [userId],
  );

  const sendMessage = useCallback(
    async (
      text: string,
      options?: { skipUserBubble?: boolean; submodeOverride?: AssistSubmode },
    ) => {
      const trimmed = text.trim();
      if (!trimmed || !canAssist || !hasOpenRouterKey || loading) return;
      const effectiveSubmode = options?.submodeOverride ?? submode;

      const switchTopic = normalizeSubmodeSwitchTopic(trimmed);
      if (switchTopic) {
        setSubmode(switchTopic);
        setTurns((prev) => [
          ...prev,
          {
            kind: "card",
            card: {
              type: "prompt",
              title: `Switched to ${switchTopic} mode`,
              body: "Use the composer pill or Shift+Tab to change submode anytime.",
            },
          },
        ]);
        return;
      }

      if (!options?.skipUserBubble) {
        setTurns((prev) => [...prev, { kind: "user", text: trimmed }]);
      }
      setInput("");
      setLoading(true);

      const payload = buildAssistPayload({
        site: activeSite,
        siteDisplayName,
        allSites,
        activeSiteId,
        managerTab,
        generatorSection,
        dashboardCluster,
        researchSection,
        sitemapMode,
        contentOptimizerSection,
        sitemapSource: overview.sitemapSource || undefined,
        expandedPageUrl: overview.expandedPageUrl,
        expandedPageTitle: overview.expandedPageTitle,
        postId: overview.postId,
        submode: effectiveSubmode,
        pageContentMode,
        targetScope,
        message: trimmed,
        history,
        team: activeTeam,
        teamMembers: members,
        taskProjects,
        activeTaskProjectId: tasks.activeProjectId,
        activeTaskProjectTitle: tasks.activeProjectTitle,
        pulseAssignedTasks,
      });

      if (effectiveSubmode === "build") {
        setBuildProgress({ completed: 0, total: 3, label: "Build" });
        setTurns((prev) => [
          ...prev,
          {
            kind: "thinking",
            title: "Build",
            steps: [
              { label: "Build checklist", status: "running" },
              { label: "Build blueprint", status: "pending" },
              { label: "Deliverable", status: "pending" },
            ],
          },
        ]);
        await runBuildHarness(activeSite, payload, {
          onProgress: (completed, total, label) => setBuildProgress({ completed, total, label }),
          onStepStatus: (index, status) => {
            setTurns((prev) => {
              const thinking = prev.find((t) => t.kind === "thinking");
              if (!thinking || thinking.kind !== "thinking") return prev;
              const steps = thinking.steps.map((s, i) => (i === index ? { ...s, status } : s));
              return prev.map((t) => (t === thinking ? { ...thinking, steps } : t));
            });
          },
          onPresent: (card) => appendAssistantCard(card, trimmed),
          onError: () => {},
          onDone: () => {
            setLoading(false);
            setBuildProgress(null);
          },
        });
        return;
      }

      const ackRef = { value: 0 };
      let workflow = { ...INITIAL_WORKFLOW };
      let workflowPacer: WorkflowPacer | null = null;

      const syncThinkingTurn = (next: typeof workflow) => {
        workflow = next;
        setTurns((prev) => {
          const hasThinking = prev.some((turn) => turn.kind === "thinking");
          if (!hasThinking) return prev;
          return prev.map((t) =>
            t.kind === "thinking"
              ? { ...t, title: workflow.title, steps: [...workflow.steps] }
              : t,
          );
        });
      };

      const mountProgressUi = (ackText?: string) => {
        setTurns((prev) => {
          const base = prev.filter((turn) => turn.kind !== "ack" && turn.kind !== "thinking");
          const progress: Turn[] = [...base];
          if (ackText) {
            progress.push({ kind: "ack", text: ackText });
          }
          progress.push({
            kind: "thinking",
            title: workflow.title,
            steps: [...workflow.steps],
          });
          return progress;
        });
      };

      const applyWorkflowEvent = (evt: AssistStreamEvent) => {
        if (evt.status === "agent_plan" && evt.agents?.length) {
          workflowPacer?.dispose();
          workflowPacer = new WorkflowPacer(syncThinkingTurn);
          workflowPacer.ingest(evt);
          return;
        }

        if (workflowPacer && isAgentWorkflowEvent(evt)) {
          workflowPacer.ingest(evt);
          return;
        }

        syncThinkingTurn(applyStreamEvent(workflow, evt));
      };

      void pulseAssistAck(activeSite, payload).then((ack) => {
        if (ack.ok && ack.text) {
          ackRef.value = Date.now();
          mountProgressUi(ack.text);
          return;
        }
        mountProgressUi();
      });

      try {
        await pulseAssistStreamLive(
          activeSite,
          payload,
          {
            onEvent: (evt) => {
              if (
                evt.status === "phase" ||
                evt.status === "agent_plan" ||
                evt.status === "action_plan" ||
                evt.status === "agent" ||
                evt.status === "tool" ||
                evt.status === "lead" ||
                evt.status === "searching" ||
                evt.status === "thinking" ||
                evt.status === "formatting"
              ) {
                applyWorkflowEvent(evt);
              }
            },
            onDone: async (evt) => {
              if (workflowPacer) {
                await workflowPacer.waitUntilResultReady();
                workflowPacer.dispose();
                workflowPacer = null;
              }
              const card = evt.card || { type: "error", title: "Empty response", body: "No card returned." };
              appendAssistantCard(card, trimmed, {
                researchedDataToolIds: evt.researchedDataToolIds,
                dataToolClassifierReason: evt.dataToolClassifierReason,
                researchedDataBlock: evt.researchedDataBlock,
                inventorySource: evt.inventorySource,
                acfComplete: evt.acfComplete,
                sliceTeam: evt.sliceTeam,
                leadAgentUsed: evt.leadAgentUsed,
                intentSummary: evt.intentSummary,
                researchArtifacts: evt.researchArtifacts,
                actionPlanTools: evt.actionPlanTools,
                actionExecuted: evt.actionExecuted,
              });
            },
            onError: (msg) => {
              appendAssistantCard({ type: "error", title: "Stream error", body: msg }, trimmed);
            },
          },
          ackRef,
        );
      } catch (err) {
        appendAssistantCard(
          {
            type: "error",
            title: "Request failed",
            body: err instanceof Error ? err.message : "Pulse assist stream failed",
          },
          trimmed,
        );
      } finally {
        setLoading(false);
      }
    },
    [
      activeSite,
      activeSiteId,
      activeTeam,
      allSites,
      appendAssistantCard,
      canAssist,
      contentOptimizerSection,
      dashboardCluster,
      hasOpenRouterKey,
      generatorSection,
      history,
      loading,
      managerTab,
      members,
      overview,
      pageContentMode,
      pulseAssignedTasks,
      researchSection,
      setSubmode,
      siteDisplayName,
      sitemapMode,
      submode,
      targetScope,
      taskProjects,
      tasks,
    ],
  );

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

  const handleUndo = useCallback(
    async (postId: number) => {
      if (!activeSite) return;
      setLoading(true);
      try {
        const card = await pulseAssistUndo(activeSite, postId);
        setTurns((prev) => [...prev, { kind: "card", card }]);
      } catch (err) {
        setTurns((prev) => [
          ...prev,
          {
            kind: "card",
            card: {
              type: "error",
              title: "Undo failed",
              body: err instanceof Error ? err.message : "Could not undo",
            },
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [activeSite],
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
