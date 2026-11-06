import { errorText } from "@/components/video-generator/video-generator-helpers";
import { useCallback } from "react";
import type { ManualImageReference } from "@/lib/image-generator/manual-reference-upload";
import { manualReferenceFromDataUrl } from "@/lib/image-generator/manual-reference-upload";
import { buildSubjectHarness } from "@/lib/video-generator/video-brainstorm-api";
import { runVideoDirectorClarify } from "@/lib/video-generator/video-director-agent";
import type { ProductLockState, ProductViewId, VideoBrief } from "@/lib/video-generator/video-generator-types";
import { generateProductView, surveyProduct } from "@/lib/video-generator/video-product-agent";
import { videoLog, videoLogError } from "@/lib/video-generator/video-log";
import type { VideoGeneratorState } from "@/components/video-generator/use-video-generator-state";

export function useVideoProduct(s: VideoGeneratorState) {
  const {
    imageModel,
    step,
    setStep,
    setMaxStep,
    prompt,
    aspect,
    subjectPhotos,
    subject,
    setSubject,
    questions,
    setQuestions,
    setAnswers,
    setPlan,
    setFrames,
    setSelectedSceneId,
    setRender,
    setBusy,
    error,
    setError,
    productLock,
    setProductLock,
    brief,
    bumpRun,
    requireApiKey,
  } = s;

const patchProductView = useCallback((viewId: ProductViewId, patch: Partial<ProductLockState["views"][number]>) => {
  setProductLock((prev) => ({
    ...prev,
    views: prev.views.map((v) => (v.id === viewId ? { ...v, ...patch } : v)),
  }));
}, [setProductLock]);

const generateProductViews = useCallback(
  async (viewIds?: ProductViewId[]) => {
    const key = requireApiKey();
    if (!key || !subjectPhotos.length) return;
    setError("");
    setBusy("Surveying the product in your photos");
    try {
      let spec = productLock.spec;
      if (!spec || !viewIds?.length) {
        const surveyed = await surveyProduct({ apiKey: key, briefPrompt: prompt, subjectPhotos });
        spec = productLock.spec?.revisionNotes?.length
          ? { ...surveyed, revisionNotes: productLock.spec.revisionNotes }
          : surveyed;
        setProductLock((prev) => ({ ...prev, spec }));
      }
      const targets = viewIds?.length ? productLock.views.filter((v) => viewIds.includes(v.id)) : productLock.views;
      const lockedSpec = spec;
      setBusy(`Rendering ${targets.length} product view${targets.length === 1 ? "" : "s"}`);

      let masterFrontDataUrl = productLock.views.find((v) => v.id === "front_elevation")?.imageDataUrl;
      const frontTarget = targets.find((v) => v.id === "front_elevation");
      const restTargets = targets.filter((v) => v.id !== "front_elevation");

      for (const v of targets) {
        patchProductView(v.id, { status: "generating", error: undefined, imageDataUrl: undefined });
      }

      if (frontTarget) {
        try {
          masterFrontDataUrl = await generateProductView({
            apiKey: key,
            imageModel,
            spec: lockedSpec,
            viewId: "front_elevation",
            aspectRatio: aspect,
            subjectPhotos,
            revisionNotes: frontTarget.revisionNotes,
          });
          patchProductView("front_elevation", { status: "done", imageDataUrl: masterFrontDataUrl });
        } catch (e) {
          patchProductView("front_elevation", { status: "failed", error: errorText(e) });
        }
      }

      await Promise.all(
        restTargets.map(async (view) => {
          try {
            const dataUrl = await generateProductView({
              apiKey: key,
              imageModel,
              spec: lockedSpec,
              viewId: view.id,
              aspectRatio: aspect,
              subjectPhotos,
              masterFrontDataUrl,
              revisionNotes: view.revisionNotes,
            });
            patchProductView(view.id, { status: "done", imageDataUrl: dataUrl });
          } catch (e) {
            patchProductView(view.id, {
              status: "failed",
              error: errorText(e),
            });
          }
        }),
      );
    } catch (e) {
      videoLogError("product", "generate failed", e);
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  },
  [aspect, imageModel, patchProductView, productLock.spec, productLock.views, prompt, requireApiKey, subjectPhotos, setBusy, setError, setProductLock],
);

const regenerateProductView = useCallback(
  (viewId: ProductViewId) => {
    void generateProductViews([viewId]);
  },
  [generateProductViews],
);

/** Applies a natural-language prompt to a single product view (or all 4 views when viewId is omitted) and redraws immediately. */
const reviseProductView = useCallback(
  async (viewId: ProductViewId | "all", instruction: string) => {
    const key = requireApiKey();
    const text = instruction.trim();
    if (!key || !subjectPhotos.length || !text) return;
    setError("");
    try {
      let spec = productLock.spec;
      if (!spec) {
        setBusy("Surveying the product in your photos");
        spec = await surveyProduct({ apiKey: key, briefPrompt: prompt, subjectPhotos });
      }

      if (viewId === "all") {
        const nextSpec = {
          ...spec,
          revisionNotes: [...(spec.revisionNotes ?? []), text],
        };
        const previousUrls = new Map(
          productLock.views.filter((v) => v.imageDataUrl).map((v) => [v.id, v.imageDataUrl as string]),
        );
        const nextViews = productLock.views.map((v) => ({
          ...v,
          status: "generating" as const,
          error: undefined,
          revisionNotes: [...(v.revisionNotes ?? []), text],
        }));
        setProductLock({ spec: nextSpec, views: nextViews, locked: false });
        setBusy(`Updating all 4 product views ("${text}")`);

        let masterFrontDataUrl = previousUrls.get("front_elevation");
        const frontNotes = nextViews.find((v) => v.id === "front_elevation")?.revisionNotes;
        try {
          masterFrontDataUrl = await generateProductView({
            apiKey: key,
            imageModel,
            spec: nextSpec,
            viewId: "front_elevation",
            aspectRatio: aspect,
            subjectPhotos,
            currentViewDataUrl: previousUrls.get("front_elevation"),
            revisionNotes: frontNotes,
          });
          patchProductView("front_elevation", { status: "done", imageDataUrl: masterFrontDataUrl });
        } catch (e) {
          patchProductView("front_elevation", { status: "failed", error: errorText(e) });
        }

        await Promise.all(
          nextViews
            .filter((v) => v.id !== "front_elevation")
            .map(async (view) => {
              try {
                const dataUrl = await generateProductView({
                  apiKey: key,
                  imageModel,
                  spec: nextSpec,
                  viewId: view.id,
                  aspectRatio: aspect,
                  subjectPhotos,
                  masterFrontDataUrl,
                  currentViewDataUrl: previousUrls.get(view.id),
                  revisionNotes: view.revisionNotes,
                });
                patchProductView(view.id, { status: "done", imageDataUrl: dataUrl });
              } catch (e) {
                patchProductView(view.id, { status: "failed", error: errorText(e) });
              }
            }),
        );
        return;
      }

      const target = productLock.views.find((v) => v.id === viewId);
      if (!target) return;
      const currentViewDataUrl = target.imageDataUrl;
      const nextViewNotes = [...(target.revisionNotes ?? []), text];
      const nextSpec = {
        ...spec,
        revisionNotes: [...(spec.revisionNotes ?? []), `${target.label}: ${text}`],
      };
      setProductLock((prev) => ({
        spec: nextSpec,
        locked: false,
        views: prev.views.map((v) =>
          v.id === viewId
            ? { ...v, status: "generating", error: undefined, revisionNotes: nextViewNotes }
            : v,
        ),
      }));
      setBusy(`Updating ${target.label} ("${text}")`);
      const masterFrontDataUrl =
        viewId === "front_elevation"
          ? undefined
          : productLock.views.find((v) => v.id === "front_elevation")?.imageDataUrl;
      const dataUrl = await generateProductView({
        apiKey: key,
        imageModel,
        spec: nextSpec,
        viewId,
        aspectRatio: aspect,
        subjectPhotos,
        masterFrontDataUrl,
        currentViewDataUrl,
        revisionNotes: nextViewNotes,
      });
      patchProductView(viewId, { status: "done", imageDataUrl: dataUrl });
    } catch (e) {
      videoLogError("product", "revise view failed", e);
      if (viewId !== "all") {
        patchProductView(viewId, { status: "failed", error: errorText(e) });
      }
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  },
  [aspect, imageModel, patchProductView, productLock.spec, productLock.views, prompt, requireApiKey, subjectPhotos, setBusy, setError, setProductLock],
);

const productReadyToLock =
  productLock.views.length > 0 && productLock.views.every((v) => v.status === "done" && v.imageDataUrl);

/** Clears every step after the Brief and asks the Director's questions for `currentBrief`. */
const clarify = useCallback(
  async (key: string, currentBrief: VideoBrief) => {
    bumpRun("asking the Director's questions");
    setQuestions(null);
    setAnswers({});
    setPlan(null);
    setFrames([]);
    setRender(null);
    setSelectedSceneId(null);
    setError("");
    setBusy("Director is reading the brief");
    setStep("questions");
    setMaxStep("questions");
    try {
      const result = await runVideoDirectorClarify({ apiKey: key, brief: currentBrief });
      setQuestions(result.questions);
    } catch (e) {
      videoLogError("clarify", "failed", e);
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  },
  [bumpRun, setAnswers, setBusy, setError, setFrames, setMaxStep, setPlan, setQuestions, setRender, setSelectedSceneId, setStep],
);

/** The four clean studio renders become the subject harness the Director and Storyboard receive (stripping snowy/multi-unit yard backgrounds); then the Director is asked. */
const lockProduct = useCallback(async () => {
  const key = requireApiKey();
  if (!key || !productReadyToLock) return;
  setError("");
  setBusy("Building the locked 1:1 studio product harness");
  let locked: ManualImageReference;
  try {
    const renders = productLock.views.map((v, i) => ({
      fileName: `product-lock-${String(i + 1).padStart(2, "0")}-${v.id}.png`,
      dataUrl: v.imageDataUrl as string,
    }));
    const harnessDataUrl = await buildSubjectHarness({ apiKey: key, images: renders });
    locked = await manualReferenceFromDataUrl("subject-harness.png", harnessDataUrl);
    setSubject(locked);
    setProductLock((prev) => ({ ...prev, locked: true }));
    videoLog("product", "locked", { views: renders.map((r) => r.fileName) });
  } catch (e) {
    videoLogError("product", "lock failed", e);
    setError(errorText(e));
    setBusy(null);
    return;
  }
  await clarify(key, { ...brief, subject: locked });
}, [brief, clarify, productLock.views, productReadyToLock, requireApiKey, setBusy, setError, setProductLock, setSubject]);

  return {
    patchProductView,
    generateProductViews,
    regenerateProductView,
    reviseProductView,
    clarify,
    lockProduct,
    productReadyToLock,
  };
}
