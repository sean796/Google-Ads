import { useCallback, useRef, useState } from "react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ANSWER_THE_QUESTIONS_THEN_CONTINUE, NOTIFY_ENTER_A_GOAL_PROMPT_FIRST, NOTIFY_GOAL_PROMPT_UPDATED, NOTIFY_NO_CLARIFICATION_NEEDED_RUN_OUTLINE_OR_F, NOTIFY_SET_YOUR_OPENROUTER_API_KEY_IN_THE_MANAG, notifyOutlineReadyXSections } from "@/lib/notify-messages";
import { checkAborted } from "@/lib/agent-generation-helpers";
import {
  buildPlanMarkdownDoc,
  runFlowFreeformClarify,
  runFlowFreeformEnhanceGoalPrompt,
  runFlowFreeformOutline,
} from "@/lib/flow-freeform/flow-freeform-pipeline";
import type { SetGen, UseFlowFreeformGenerationArgs } from "@/hooks/flow-freeform-generation-types";

export function useFlowFreeformPlanningActions({
  apiKey,
  selectedModel,
  flowPurpose,
  userGoalPrompt,
  clarificationAnswers,
  activeKnowledgeBaseText,
  resolveFlowTitleForGeneration,
  setClarificationQuestions,
  setSections,
  setSectionBodies,
  currentAbortController,
  setIsGenerating,
  setGenerationResult,
  setUserGoalPrompt,
}: {
  apiKey: string;
  selectedModel: string;
  flowPurpose: string;
  userGoalPrompt: string;
  clarificationAnswers: Record<string, string>;
  activeKnowledgeBaseText: string;
  resolveFlowTitleForGeneration: (opts: { signal?: AbortSignal; h2Fallback?: string | null }) => Promise<string>;
  setClarificationQuestions: UseFlowFreeformGenerationArgs["setClarificationQuestions"];
  setSections: UseFlowFreeformGenerationArgs["setSections"];
  setSectionBodies: UseFlowFreeformGenerationArgs["setSectionBodies"];
  currentAbortController: UseFlowFreeformGenerationArgs["currentAbortController"];
  setIsGenerating: UseFlowFreeformGenerationArgs["setIsGenerating"];
  setGenerationResult: SetGen;
  setUserGoalPrompt: UseFlowFreeformGenerationArgs["setUserGoalPrompt"];
}) {
  const [isClarifying, setIsClarifying] = useState(false);
  const kbRef = useRef(activeKnowledgeBaseText);
  kbRef.current = activeKnowledgeBaseText;
  const runClarifyOnly = useCallback(async () => {
    if (!apiKey.trim()) {
      notify.error(NOTIFY_SET_YOUR_OPENROUTER_API_KEY_IN_THE_MANAG);
      return;
    }
    if (!userGoalPrompt.trim()) {
      notify.error(NOTIFY_ENTER_A_GOAL_PROMPT_FIRST);
      return;
    }
    const kb = kbRef.current;
    const c = new AbortController();
    currentAbortController.current = c;
    setIsClarifying(true);
    try {
      const resolvedTitle = await resolveFlowTitleForGeneration({ signal: c.signal });
      const r = await runFlowFreeformClarify({
        apiKey,
        model: selectedModel,
        flowTitle: resolvedTitle,
        flowPurpose,
        userGoalPrompt,
        kbText: kb,
        signal: c.signal,
      });
      checkAborted(c.signal);
      setClarificationQuestions(r.questions.length ? r.questions : null);
      if (r.questions.length === 0) {
        notify.success(NOTIFY_NO_CLARIFICATION_NEEDED_RUN_OUTLINE_OR_F);
      } else {
        notify.info(NOTIFY_ANSWER_THE_QUESTIONS_THEN_CONTINUE);
      }
    } catch (e) {
      if ((e as Error).message !== "Aborted") {
        notify.error((e as Error).message || "Clarify failed");
      }
    } finally {
      setIsClarifying(false);
      currentAbortController.current = null;
    }
  }, [
    apiKey,
    selectedModel,
    flowPurpose,
    userGoalPrompt,
    resolveFlowTitleForGeneration,
    setClarificationQuestions,
    currentAbortController,
  ]);

  const runEnhanceGoalPrompt = useCallback(async (opts?: { silent?: boolean }): Promise<boolean> => {
    if (!apiKey.trim()) {
      notify.error(NOTIFY_SET_YOUR_OPENROUTER_API_KEY_IN_THE_MANAG);
      return false;
    }
    if (!userGoalPrompt.trim()) {
      if (!opts?.silent) notify.error(NOTIFY_ENTER_A_GOAL_PROMPT_FIRST);
      return false;
    }
    const c = new AbortController();
    currentAbortController.current = c;
    setIsGenerating(true);
    setGenerationResult((prev) => ({ ...prev, currentStage: "planning" }));
    try {
      const resolvedTitle = await resolveFlowTitleForGeneration({ signal: c.signal });
      const enhanced = await runFlowFreeformEnhanceGoalPrompt({
        apiKey,
        model: selectedModel,
        flowTitle: resolvedTitle,
        userGoalPrompt,
        clarificationAnswers,
        kbText: kbRef.current,
        signal: c.signal,
      });
      checkAborted(c.signal);
      const next = enhanced.trim() || userGoalPrompt;
      setUserGoalPrompt(next);
      setGenerationResult((prev) => ({ ...prev, currentStage: "idle" }));
      if (!opts?.silent) {
        notify.success(NOTIFY_GOAL_PROMPT_UPDATED);
      }
      return true;
    } catch (e) {
      if ((e as Error).message !== "Aborted") {
        notify.error((e as Error).message || "Enhance failed");
        setGenerationResult((prev) => ({ ...prev, currentStage: "error", final: String(e) }));
      }
      return false;
    } finally {
      setIsGenerating(false);
      currentAbortController.current = null;
    }
  }, [
    apiKey,
    selectedModel,
    userGoalPrompt,
    clarificationAnswers,
    resolveFlowTitleForGeneration,
    setUserGoalPrompt,
    currentAbortController,
    setIsGenerating,
    setGenerationResult,
  ]);

  const runOutlineOnly = useCallback(async () => {
    if (!apiKey.trim()) {
      notify.error(NOTIFY_SET_YOUR_OPENROUTER_API_KEY_IN_THE_MANAG);
      return;
    }
    if (!userGoalPrompt.trim()) {
      notify.error(NOTIFY_ENTER_A_GOAL_PROMPT_FIRST);
      return;
    }
    const kb = kbRef.current;
    const c = new AbortController();
    currentAbortController.current = c;
    setIsGenerating(true);
    setGenerationResult((prev) => ({ ...prev, currentStage: "planning" }));
    try {
      const resolvedTitle = await resolveFlowTitleForGeneration({ signal: c.signal });
      const plans = await runFlowFreeformOutline({
        apiKey,
        model: selectedModel,
        flowTitle: resolvedTitle,
        flowPurpose,
        userGoalPrompt,
        clarificationAnswers,
        kbText: kb,
        signal: c.signal,
      });
      checkAborted(c.signal);
      setSections(plans);
      setSectionBodies({});
      const planMd = buildPlanMarkdownDoc(plans);
      setGenerationResult({
        plan: planMd,
        draft: "",
        final: "",
        currentStage: "idle",
        isGenerating: false,
      });
      notify.success(notifyOutlineReadyXSections(plans.length));
    } catch (e) {
      if ((e as Error).message !== "Aborted") {
        notify.error((e as Error).message || "Outline failed");
        setGenerationResult((prev) => ({ ...prev, currentStage: "error", final: String(e) }));
      }
    } finally {
      setIsGenerating(false);
      currentAbortController.current = null;
    }
  }, [
    apiKey,
    selectedModel,
    flowPurpose,
    userGoalPrompt,
    clarificationAnswers,
    resolveFlowTitleForGeneration,
    setSections,
    setSectionBodies,
    currentAbortController,
    setIsGenerating,
    setGenerationResult,
  ]);

  return {
    runClarifyOnly,
    runEnhanceGoalPrompt,
    runOutlineOnly,
    isClarifying,
  };
}
