import { errorText, extractAndApplyReferenceVideoBeats } from "@/components/video-generator/video-generator-helpers";
import { useCallback } from "react";
import { hasAttachedReferenceVideo, REFERENCE_VIDEO_SKIP_CLARIFY_QUESTIONS, referenceVideoSkipClarifyAnswers, runVideoDirectorPlan } from "@/lib/video-generator/video-director-agent";
import type { VideoClarifyQuestion } from "@/lib/video-generator/video-generator-types";
import { videoLengthOptionAtLeast } from "@/lib/video-generator/video-model-defaults";
import { videoLog, videoLogError } from "@/lib/video-generator/video-log";
import type { VideoGeneratorState } from "@/components/video-generator/use-video-generator-state";
import type { useVideoStoryboard } from "@/components/video-generator/use-video-storyboard";
import type { useVideoProduct } from "@/components/video-generator/use-video-product";

export function useVideoPlanDraft(
  s: VideoGeneratorState,
  storyboard: ReturnType<typeof useVideoStoryboard>,
  product: ReturnType<typeof useVideoProduct>,
) {
  const { startPlan } = storyboard;
  const { clarify } = product;
  const {
    setStep,
    setMaxStep,
    prompt,
    lengthSeconds,
    setLengthSeconds,
    references,
    setReferences,
    referenceVideo,
    isPreparingReferenceVideo,
    questions,
    answers,
    setAnswers,
    plan,
    setPlan,
    setPlanLive,
    setPlanDrafting,
    frames,
    setFrames,
    setSelectedSceneId,
    setRender,
    setBusy,
    setError,
    canStartStudio,
    brief,
    bumpRun,
    requireApiKey,
  } = s;

const draftPlan = useCallback(
  async (key: string, qs: Pick<VideoClarifyQuestion, "id" | "text">[], ans: Record<string, string>) => {
    bumpRun("drafting a new plan");
    setPlan(null);
    setPlanLive({ reasoning: "", content: "" });
    setPlanDrafting(true);
    setFrames([]);
    setRender(null);
    setSelectedSceneId(null);
    setError("");
    setBusy(
      hasAttachedReferenceVideo(brief)
        ? "Director is watching your reference video and writing the scene plan"
        : "Director is writing the scene plan",
    );
    setStep("plan");
    setMaxStep("plan");
    try {
      const next = await runVideoDirectorPlan({
        apiKey: key,
        brief,
        questions: qs,
        answers: ans,
        onDelta: (d) => setPlanLive((prev) => ({ reasoning: prev.reasoning + d.reasoning, content: prev.content + d.content })),
      });

      // Audit the Director Plan with Decision Model (Liquid d1.1)
      try {
        const { auditVideoPlanWithDecisionAgent } = await import("@/lib/decision-tree/studio-decision-auditor");
        const scenesSummary = next.scenes
          .map((s) => `Scene ${s.order} (${s.durationSeconds}s): ${s.title} - ${s.sceneInstructions} [Narration: ${s.narration || "None"}]`)
          .join("\n");
        const planAudit = await auditVideoPlanWithDecisionAgent({
          planTitle: next.title,
          logline: next.logline,
          scenesSummary,
          apiKey: key,
        });
        next.decisionAudit = planAudit;
        next.decisionAuditJson = JSON.stringify(planAudit);
        videoLog("plan", "Decision Agent (Liquid d1.1) audit completed", {
          verdict: planAudit.verdict,
          pacing: planAudit.pacingFitScore,
          continuity: planAudit.continuityScore,
          storyArc: planAudit.storyArcScore,
          productionReady: planAudit.productionReadyProbability,
        });
      } catch (auditErr) {
        videoLogError("plan", "Decision Agent audit warning", auditErr);
      }

      if (brief.referenceVideo?.serverId && next.scenes.length > 0) {
        setBusy(`Extracting ${next.scenes.length} reference stills from your video`);
        try {
          const { plan: enrichedPlan, newReferences } = await extractAndApplyReferenceVideoBeats({
            apiKey: key,
            serverId: brief.referenceVideo.serverId,
            plan: next,
            durationSeconds: brief.referenceVideo.durationSeconds,
          });
          setReferences((prev) => (prev.length === 0 ? newReferences : prev));
          Object.assign(next, enrichedPlan);
        } catch (cutErr) {
          videoLogError("plan", "failed to extract reference video beats", cutErr);
        }
      }

      const stillsTotal = next.referenceStillsTotalSeconds;
      if (stillsTotal != null && stillsTotal > lengthSeconds) {
        setLengthSeconds(videoLengthOptionAtLeast(stillsTotal));
      }
      await startPlan(key, next);
    } catch (e) {
      videoLogError("plan", "draft failed", e);
      setError(errorText(e));
    } finally {
      setPlanDrafting(false);
      setBusy(null);
    }
  },
  [brief, bumpRun, lengthSeconds, startPlan, setBusy, setError, setFrames, setLengthSeconds, setMaxStep, setPlan, setPlanDrafting, setPlanLive, setReferences, setRender, setSelectedSceneId, setStep],
);

const askQuestions = useCallback(async () => {
  const key = requireApiKey();
  if (!key || !canStartStudio) return;
  if (isPreparingReferenceVideo) {
    setError("Reference video is still uploading. Wait until the center footer shows 1 video.");
    return;
  }
  const wantsLocationFlythrough = /fly[\s-]?through|drone|walk[\s-]?through|showroom tour/i.test(brief.prompt);
  if (wantsLocationFlythrough && !hasAttachedReferenceVideo(brief) && brief.references.length === 0) {
    setError("Upload your location clip with + Video first. The Director must watch the real walkthrough before planning.");
    return;
  }
  if (hasAttachedReferenceVideo(brief)) {
    await draftPlan(key, REFERENCE_VIDEO_SKIP_CLARIFY_QUESTIONS, referenceVideoSkipClarifyAnswers(brief));
    return;
  }
  await clarify(key, brief);
}, [brief, canStartStudio, clarify, draftPlan, isPreparingReferenceVideo, requireApiKey, setError]);

const answerQuestion = useCallback((id: string, value: string) => {
  setAnswers((prev) => ({ ...prev, [id]: value }));
}, [setAnswers]);

const allAnswered = Boolean(questions?.length) && (questions ?? []).every((q) => Boolean(answers[q.id]?.trim()));

const submitAnswers = useCallback(async () => {
  const key = requireApiKey();
  if (!key || !questions || !allAnswered) return;
  await draftPlan(key, questions, answers);
}, [allAnswered, answers, draftPlan, questions, requireApiKey]);

const regeneratePlan = useCallback(async () => {
  const key = requireApiKey();
  if (!key) return;
  await draftPlan(key, questions ?? [], answers);
}, [answers, draftPlan, questions, requireApiKey]);

/** Restores the exact real still frame cut from the reference video or uploaded photo for this scene */
const restoreReferenceFrame = useCallback(
  async (sceneId: string) => {
    if (!plan) return;
    const scene = plan.scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    let refUrl =
      scene.order === 1 && references.length > 0 && !scene.postCutReferenceDataUrl
        ? references[0]?.dataUrl
        : (scene.postCutReferenceDataUrl ?? (scene.referenceIndexes[0] ? references[scene.referenceIndexes[0] - 1]?.dataUrl : undefined));
    if (!refUrl && scene.order === 1 && references.length > 0) {
      refUrl = references[0]?.dataUrl;
    }
    if (!refUrl?.startsWith("data:image/") && brief.referenceVideo?.serverId) {
      const key = requireApiKey();
      if (!key) return;
      setBusy("Extracting frames from reference video");
      try {
        const { plan: enrichedPlan, newReferences } = await extractAndApplyReferenceVideoBeats({
          apiKey: key,
          serverId: brief.referenceVideo.serverId,
          plan,
          durationSeconds: brief.referenceVideo.durationSeconds,
        });
        setReferences((prev) => (prev.length === 0 ? newReferences : prev));
        setPlan(enrichedPlan);
        const matched = enrichedPlan.scenes.find((s) => s.id === sceneId);
        refUrl = matched?.postCutReferenceDataUrl ?? (scene.order === 1 && references[0]?.dataUrl ? references[0].dataUrl : undefined);
      } catch (e) {
        videoLogError("storyboard", "failed to extract reference frame", e);
        setError(errorText(e));
        return;
      } finally {
        setBusy(null);
      }
    }
    if (refUrl?.startsWith("data:image/")) {
      setFrames((prev) =>
        prev.map((f) =>
          f.sceneId === sceneId
            ? { ...f, status: "done", imageDataUrl: refUrl, environmentStatus: "done", environmentDataUrl: refUrl }
            : f,
        ),
      );
    }
  },
  [brief.referenceVideo, plan, references, requireApiKey, setBusy, setError, setFrames, setPlan, setReferences],
);

  return {
    draftPlan,
    askQuestions,
    answerQuestion,
    allAnswered,
    submitAnswers,
    regeneratePlan,
    restoreReferenceFrame,
  };
}
