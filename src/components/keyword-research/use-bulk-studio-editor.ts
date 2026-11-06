import { useCallback, useEffect, useState } from "react";
import {
  readStoredContentOptimizerSection,
  writeStoredContentOptimizerSection,
  type ContentOptimizerSectionId,
} from "@/components/content-optimizer/content-optimizer-sections";
import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";
import {
  blogGeneratorSectionForStudioMode,
  readStoredStudioEditorMode,
  writeStoredStudioEditorMode,
  type StudioEditorModeId,
} from "@/components/keyword-research/bulk/studio-editor-modes";

export function useBulkStudioEditor(
  activeSection: BlogGeneratorSectionId,
  onSectionChange: (id: BlogGeneratorSectionId) => void,
) {
  const [studioEditorMode, setStudioEditorModeState] = useState<StudioEditorModeId>(() =>
    readStoredStudioEditorMode(activeSection),
  );

  // Sync when the user clicks Studio, PR, or Research in the top Tools → SEO menu
  useEffect(() => {
    if (activeSection === "bulk-press-release" && studioEditorMode !== "press-release") {
      setStudioEditorModeState("press-release");
      writeStoredStudioEditorMode("press-release");
      return;
    }
    if (activeSection === "bulk-prompt" && studioEditorMode === "press-release") {
      setStudioEditorModeState("prompt");
      writeStoredStudioEditorMode("prompt");
    }
  }, [activeSection, studioEditorMode]);

  const handleStudioEditorModeChange = useCallback(
    (nextMode: StudioEditorModeId) => {
      setStudioEditorModeState(nextMode);
      writeStoredStudioEditorMode(nextMode);
      const nextSection = blogGeneratorSectionForStudioMode(nextMode);
      if (nextSection !== activeSection) {
        onSectionChange(nextSection);
      }
    },
    [activeSection, onSectionChange],
  );

  const [optimizerSection, setOptimizerSection] = useState<ContentOptimizerSectionId>(() =>
    readStoredContentOptimizerSection(),
  );

  const handleOptimizerSectionChange = useCallback((id: ContentOptimizerSectionId) => {
    setOptimizerSection(id);
    writeStoredContentOptimizerSection(id);
  }, []);

  const isPressRelease = studioEditorMode === "press-release";
  const isVerticalBenchmark = studioEditorMode === "vertical-benchmarks";

  return {
    studioEditorMode,
    handleStudioEditorModeChange,
    optimizerSection,
    handleOptimizerSectionChange,
    isPressRelease,
    isVerticalBenchmark,
  };
}
