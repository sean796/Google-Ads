import { useState, useEffect, useMemo, useCallback } from "react";
import { getSavedPrompts, savePrompt as savePromptToStorage, type SavedPrompt } from "@/lib/image-prompt-shortcuts";
import { notify } from "@/lib/app-notifications";
import {
  NOTIFY_FAILED_TO_COPY_IMAGE_TO_CLIPBOARD,
  NOTIFY_FAILED_TO_DOWNLOAD_IMAGE,
  NOTIFY_IMAGE_CHECKLIST_GENERATED,
  NOTIFY_IMAGE_COPIED_TO_CLIPBOARD,
  NOTIFY_IMAGE_DOWNLOADED_SUCCESSFULLY,
  NOTIFY_IMAGE_GENERATED_SUCCESSFULLY,
  NOTIFY_NOTHING_TO_SAVE,
  NOTIFY_PLEASE_SET_YOUR_OPENROUTER_API_KEY_IN_SE,
  NOTIFY_PROMPT_INSERTED,
  NOTIFY_PROMPT_SAVED,
  notifyChecklistGenerationFailedX,
  notifyImageGenerationFailedX,
  notifyImageGenerationFailedX2,
} from "@/lib/notify-messages";
import { DEFAULT_IMAGE_MODEL } from "@/lib/image-model-defaults";
import { getImageModel } from "@/lib/optimization-settings-storage";
import { resolveModelForAgentCategory } from "@/lib/openrouter-agent-category-api";
import { parseMarkdownSections } from "@/lib/section-parser";
import { generateSEOImageFilename, sanitizeImageFilename } from "@/lib/image-filename-generator";
import { runImageChecklist } from "@/lib/image-generator/run-image-checklist";
import { runFeaturedImage } from "@/lib/image-generator/run-featured-image";
import { downloadImage, copyImageToClipboard } from "@/components/OutputManager/image-utils";
import type { ImageChecklistItem } from "@/lib/image-checklist-builder";
import type { ImageSourceMode } from "@/lib/image-generator/image-generator-options";
import {
  prepareManualReference,
  type ManualImageReference,
} from "@/lib/image-generator/manual-reference-upload";
import type {
  ImageGeneratorInputProps,
  UseImageGeneratorResult,
} from "@/components/generator/image/image-generator-types";

export function useImageGenerator({
  apiKey = "",
  flowTitle = "",
  flowPurpose = "",
  agents = [],
  finalOutput = "",
  selectedModel = resolveModelForAgentCategory("research"),
  temperature = 1.57,
  maxTokens = 5000000,
  topP = 0.9,
  onImageStateChange,
}: ImageGeneratorInputProps): UseImageGeneratorResult {
  const [userPrompt, setUserPrompt] = useState("");
  const [imageSourceMode, setImageSourceMode] = useState<ImageSourceMode>("featured");
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [includeText, setIncludeText] = useState(false);
  const [includePeople, setIncludePeople] = useState(false);
  const [includeAnimals, setIncludeAnimals] = useState(false);
  const [includeCars, setIncludeCars] = useState(false);
  const [isInfographic, setIsInfographic] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<UseImageGeneratorResult["aspectRatio"]>("1:1");
  const [style, setStyle] = useState<UseImageGeneratorResult["style"]>("professional");
  const [colorScheme, setColorScheme] = useState<UseImageGeneratorResult["colorScheme"]>("vibrant");
  const [colorForeground, setColorForeground] = useState("");
  const [colorBackground, setColorBackground] = useState("");
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [generatedImageBase64, setGeneratedImageBase64] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingChecklist, setIsGeneratingChecklist] = useState(false);
  const [imageChecklist, setImageChecklist] = useState<ImageChecklistItem[]>([]);
  const [hasGeneratedChecklist, setHasGeneratedChecklist] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceResearch, setReferenceResearch] = useState<
    UseImageGeneratorResult["referenceResearch"]
  >(null);
  const [imageModel, setImageModel] = useState(() => getImageModel() || DEFAULT_IMAGE_MODEL);
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveDialogName, setSaveDialogName] = useState("");
  const [manualReferences, setManualReferences] = useState<ManualImageReference[]>([]);
  const [isPreparingReferences, setIsPreparingReferences] = useState(false);

  const availableSections = useMemo(() => {
    if (!finalOutput) return [];
    return parseMarkdownSections(finalOutput);
  }, [finalOutput]);

  const options = useMemo(
    () => ({
      userPrompt,
      imageSourceMode,
      selectedSection,
      includeText,
      includePeople,
      includeAnimals,
      includeCars,
      isInfographic,
      aspectRatio,
      style,
      colorScheme,
      colorForeground,
      colorBackground,
      imageModel,
      manualReferences,
    }),
    [
      userPrompt,
      imageSourceMode,
      selectedSection,
      includeText,
      includePeople,
      includeAnimals,
      includeCars,
      isInfographic,
      aspectRatio,
      style,
      colorScheme,
      colorForeground,
      colorBackground,
      imageModel,
      manualReferences,
    ],
  );

  const runContext = useMemo(
    () => ({
      apiKey,
      flowTitle,
      flowPurpose,
      agents,
      finalOutput,
      selectedModel,
      temperature,
      maxTokens,
      topP,
      availableSections,
    }),
    [apiKey, flowTitle, flowPurpose, agents, finalOutput, selectedModel, temperature, maxTokens, topP, availableSections],
  );

  const imageDisplayUrl = previewImageUrl || generatedImageUrl || generatedImageBase64;
  const hasApiKey = Boolean(apiKey);

  useEffect(() => {
    setSavedPrompts(getSavedPrompts());
  }, []);

  useEffect(() => {
    if (imageSourceMode === "featured" || imageSourceMode === "solo") {
      setSelectedSection(null);
    }
  }, [imageSourceMode]);

  useEffect(() => {
    onImageStateChange?.({
      generatedImageUrl,
      generatedImageBase64,
      previewImageUrl,
      selectedSection: imageSourceMode === "section" ? selectedSection : null,
    });
  }, [generatedImageUrl, generatedImageBase64, previewImageUrl, imageSourceMode, selectedSection, onImageStateChange]);

  useEffect(() => {
    return () => {
      if (previewImageUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewImageUrl);
      }
    };
  }, [previewImageUrl]);

  const handleInsertShortcut = useCallback((content: string) => {
    setUserPrompt((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${content}` : content));
    notify.success(NOTIFY_PROMPT_INSERTED);
  }, []);

  const handleSaveCurrent = useCallback(() => {
    if (!userPrompt.trim()) {
      notify.error(NOTIFY_NOTHING_TO_SAVE);
      return;
    }
    setSaveDialogName("");
    setSaveDialogOpen(true);
  }, [userPrompt]);

  const handleConfirmSave = useCallback(() => {
    const name = saveDialogName.trim() || "Custom prompt";
    savePromptToStorage({ id: crypto.randomUUID(), name, content: userPrompt.trim() });
    setSavedPrompts(getSavedPrompts());
    setSaveDialogOpen(false);
    setSaveDialogName("");
    notify.success(NOTIFY_PROMPT_SAVED);
  }, [saveDialogName, userPrompt]);

  const handleGenerateChecklist = useCallback(async (): Promise<ImageChecklistItem[]> => {
    if (!apiKey) {
      notify.error(NOTIFY_PLEASE_SET_YOUR_OPENROUTER_API_KEY_IN_SE);
      return [];
    }
    if (imageSourceMode === "solo") {
      return [];
    }

    setIsGeneratingChecklist(true);
    setError(null);
    setImageChecklist([]);

    try {
      const parsed = await runImageChecklist(options, runContext);
      setImageChecklist(parsed);
      setHasGeneratedChecklist(true);
      notify.success(NOTIFY_IMAGE_CHECKLIST_GENERATED);
      return parsed;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate checklist";
      setError(errorMessage);
      notify.error(notifyChecklistGenerationFailedX(errorMessage));
      return [];
    } finally {
      setIsGeneratingChecklist(false);
    }
  }, [apiKey, imageSourceMode, options, runContext]);

  const handleGenerateImage = useCallback(async () => {
    if (!apiKey) {
      notify.error(NOTIFY_PLEASE_SET_YOUR_OPENROUTER_API_KEY_IN_SE);
      return;
    }

    if (imageSourceMode === "solo" && !userPrompt.trim()) {
      setError("Enter a keyword for Solo mode");
      return;
    }

    let checklist = imageChecklist;
    if (imageSourceMode !== "solo" && (!hasGeneratedChecklist || checklist.length === 0)) {
      checklist = await handleGenerateChecklist();
      if (checklist.length === 0) {
        checklist = [
          {
            title: "Physical scene plausibility",
            description:
              "Photoreal scene with correct install context: window treatments in a window frame, not on bare wall.",
          },
        ];
        setImageChecklist(checklist);
      }
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedImageUrl(null);
    setGeneratedImageBase64(null);
    setReferenceResearch(null);

    try {
      const result = await runFeaturedImage(
        options,
        runContext,
        imageSourceMode === "solo" ? [] : checklist,
      );
      if (result.referenceResearch) {
        setReferenceResearch(result.referenceResearch);
      }
      if (result.error) {
        setError(result.error);
        notify.error(notifyImageGenerationFailedX(result.error));
        return;
      }

      setGeneratedImageUrl(result.imageUrl);
      setGeneratedImageBase64(result.imageBase64);
      setPreviewImageUrl(result.previewUrl);
      notify.success(NOTIFY_IMAGE_GENERATED_SUCCESSFULLY);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate image";
      setError(errorMessage);
      notify.error(notifyImageGenerationFailedX2(errorMessage));
    } finally {
      setIsGenerating(false);
    }
  }, [
    apiKey,
    imageChecklist,
    hasGeneratedChecklist,
    handleGenerateChecklist,
    options,
    runContext,
    imageSourceMode,
    userPrompt,
  ]);

  const handleDownload = useCallback(async () => {
    try {
      let filename: string;
      if (imageSourceMode === "solo") {
        const base = sanitizeImageFilename(userPrompt.trim() || "solo-image");
        filename = `${base || "solo-image"}.png`;
      } else if (imageSourceMode === "section" && selectedSection) {
        filename = await generateSEOImageFilename(selectedSection, apiKey, selectedModel, "section");
      } else {
        filename = await generateSEOImageFilename(flowTitle || "featured-image", apiKey, selectedModel, "featured");
      }

      await downloadImage(generatedImageUrl || undefined, generatedImageBase64 || undefined, filename);
      notify.success(NOTIFY_IMAGE_DOWNLOADED_SUCCESSFULLY);
    } catch (err) {
      notify.error(NOTIFY_FAILED_TO_DOWNLOAD_IMAGE);
      console.error("Download error:", err);
    }
  }, [
    apiKey,
    flowTitle,
    generatedImageBase64,
    generatedImageUrl,
    imageSourceMode,
    selectedModel,
    selectedSection,
    userPrompt,
  ]);

  const handlePreviewError = useCallback(() => {
    setError("Failed to display generated image");
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await copyImageToClipboard(generatedImageUrl || undefined, generatedImageBase64 || undefined);
      notify.success(NOTIFY_IMAGE_COPIED_TO_CLIPBOARD);
    } catch (err) {
      notify.error(NOTIFY_FAILED_TO_COPY_IMAGE_TO_CLIPBOARD);
      console.error("Copy error:", err);
    }
  }, [generatedImageBase64, generatedImageUrl]);

  const addManualReferences = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (!list.length) return;

    setIsPreparingReferences(true);
    setError(null);
    try {
      const prepared = await Promise.all(list.map((file) => prepareManualReference(file)));
      setManualReferences((prev) => [...prev, ...prepared]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to prepare reference image";
      setError(errorMessage);
    } finally {
      setIsPreparingReferences(false);
    }
  }, []);

  const removeManualReference = useCallback((id: string) => {
    setManualReferences((prev) => prev.filter((ref) => ref.id !== id));
  }, []);

  return {
    userPrompt,
    imageSourceMode,
    selectedSection,
    includeText,
    includePeople,
    includeAnimals,
    includeCars,
    isInfographic,
    aspectRatio,
    style,
    colorScheme,
    colorForeground,
    colorBackground,
    imageModel,
    isCustomModel,
    generatedImageUrl,
    generatedImageBase64,
    previewImageUrl,
    isGenerating,
    isGeneratingChecklist,
    imageChecklist,
    hasGeneratedChecklist,
    error,
    referenceResearch,
    manualReferences,
    isPreparingReferences,
    savedPrompts,
    saveDialogOpen,
    saveDialogName,
    availableSections,
    imageDisplayUrl,
    hasApiKey,
    options,
    setUserPrompt,
    setImageSourceMode,
    setSelectedSection,
    setIncludeText,
    setIncludePeople,
    setIncludeAnimals,
    setIncludeCars,
    setIsInfographic,
    setAspectRatio,
    setStyle,
    setColorScheme,
    setColorForeground,
    setColorBackground,
    setImageModel,
    setIsCustomModel,
    setSaveDialogOpen,
    setSaveDialogName,
    handleInsertShortcut,
    handleSaveCurrent,
    handleConfirmSave,
    handleGenerateChecklist,
    handleGenerateImage,
    handleDownload,
    handleCopy,
    handlePreviewError,
    addManualReferences,
    removeManualReference,
  };
}
