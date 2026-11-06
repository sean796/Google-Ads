import { useCallback, useEffect, useState } from "react";
import type { usePulseAssistContext } from "@/contexts/pulse-assist-context";
import type { useTeam } from "@/contexts/TeamContext";
import { fetchTaskProjects, fetchPulseAssignedTasks } from "@/lib/tasks-api";
import type { TaskProject } from "@/lib/tasks-types";
import type { TeamContextPulseTask } from "@/lib/pulse-assist/types";
import { pulseAssistAck, pulseAssistStreamLive, pulseAssistUndo } from "@/lib/pulse-assist/api";
import { runBuildHarness } from "@/lib/pulse-assist/build-harness";
import { appendResearchMetaToTurn } from "@/lib/platform-data/debug-export";
import { researchMetaForStorage } from "@/lib/platform-data/agent-panel";
import type { PlatformDataResearchMeta } from "@/lib/platform-data/types";
import {
  cardAssistantText,
  normalizeSubmodeSwitchTopic,
  snapshotCardForHistory,
} from "@/lib/pulse-assist/cards";
import { buildAssistPayload } from "@/lib/pulse-assist/context";
import {
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
  AssistHistoryMessage,
  AssistSubmode,
  PageContentMode,
  AssistStreamEvent,
  AssistTargetScope,
} from "@/lib/pulse-assist/types";
import type { PulseAssistDebugTurn } from "@/lib/pulse-assist/debug-log";
import type { Turn } from "./pulse-assist-chat-panel-types";

type UsePulseAssistChatPanelControllerArgs = {
  userId: number;
  hidePageScope: boolean;
  defaultTargetScope?: AssistTargetScope;
  canAssist: boolean;
  hasOpenRouterKey: boolean;
  context: ReturnType<typeof usePulseAssistContext>;
  activeTeam: ReturnType<typeof useTeam>["activeTeam"];
  members: ReturnType<typeof useTeam>["members"];
};

export function usePulseAssistChatPanelController(args: UsePulseAssistChatPanelControllerArgs) {
  const { userId, hidePageScope, defaultTargetScope, canAssist, hasOpenRouterKey, context, activeTeam, members } = args;
  const { activeSite, activeSiteId, allSites, managerTab, dashboardCluster, generatorSection, researchSection, sitemapMode, contentOptimizerSection, overview, tasks, siteDisplayName } =
    context;

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
  return {
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
    setLoading,
    buildProgress,
    sendMessage,
    handleUndo,
  };
}
