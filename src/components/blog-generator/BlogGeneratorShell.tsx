import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BulkBlogGenerationTab } from "@/components/keyword-research/BulkBlogGenerationTab";
import { FlowGeneratorSection } from "@/components/generator/FlowGeneratorSection";
import type { GeneratorFreeFlowBindings } from "@/components/generator/generator-free-flow-bindings";
import { ContentOptimizerTabContent } from "@/components/content-optimizer/ContentOptimizerTabContent";
import { setRuntimeDataForSeoApiKey } from "@/lib/integration-api-keys-runtime";
import { loadDataForSEOApiKey } from "@/lib/api";
import {
  type BlogGeneratorSectionId,
  readStoredBlogGeneratorSection,
  registerBlogGeneratorSectionListener,
  unregisterBlogGeneratorSectionListener,
  writeStoredBlogGeneratorSection,
} from "./blog-generator-sections";

export interface BlogGeneratorShellProps {
  flowPurpose?: string;
  /** Bulk generator tabs (CSV, Prompt, Blog import) and Press release. */
  dataForSEOApiKey?: string;
  openRouterApiKey: string;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  freeFlowBindings?: GeneratorFreeFlowBindings;
  onResetBlueprint?: () => void;
}

export const BlogGeneratorShell: React.FC<BlogGeneratorShellProps> = ({
  flowPurpose,
  dataForSEOApiKey,
  openRouterApiKey,
  selectedModel,
  temperature,
  maxTokens,
  topP,
  freeFlowBindings,
  onResetBlueprint,
}) => {
  const [section, setSectionState] = useState<BlogGeneratorSectionId>(() =>
    readStoredBlogGeneratorSection(),
  );

  const setSection = useCallback((id: BlogGeneratorSectionId) => {
    setSectionState(id);
    writeStoredBlogGeneratorSection(id);
  }, []);

  useEffect(() => {
    const onExternalSection = (id: BlogGeneratorSectionId) => {
      setSectionState(id);
    };
    registerBlogGeneratorSectionListener(onExternalSection);
    return () => unregisterBlogGeneratorSectionListener(onExternalSection);
  }, []);

  useEffect(() => {
    const key = dataForSEOApiKey?.trim() || loadDataForSEOApiKey()?.trim() || "";
    setRuntimeDataForSeoApiKey(key);
  }, [dataForSEOApiKey]);

  const sharedTabProps = useMemo(
    () => ({
      openRouterApiKey,
      dataForSEOApiKey,
      pressReleaseDataForSeoApiKey: dataForSEOApiKey,
      selectedModel,
      temperature,
      maxTokens,
      topP,
      flowPurpose,
      activeSection: section,
      onSectionChange: setSection,
    }),
    [dataForSEOApiKey, openRouterApiKey, selectedModel, temperature, maxTokens, topP, flowPurpose, section, setSection],
  );

  if (section === "opt") {
    return (
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <ContentOptimizerTabContent
          apiKey={openRouterApiKey}
          selectedModel={selectedModel ?? ""}
          temperature={temperature ?? 0.7}
          maxTokens={maxTokens ?? 4096}
          topP={topP ?? 1}
          generatorChrome={{ activeSection: section, onSectionChange: setSection }}
        />
      </div>
    );
  }

  if (section === "flow") {
    if (!freeFlowBindings) return null;
    return (
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <FlowGeneratorSection
          activeSection={section}
          onSectionChange={setSection}
          bindings={freeFlowBindings}
          onResetBlueprint={onResetBlueprint}
        />
      </div>
    );
  }

  const variant =
    section === "bulk-press-release"
      ? "press-release"
      : "prompt";

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <BulkBlogGenerationTab variant={variant} {...sharedTabProps} />
    </div>
  );
};
