import React, { useEffect, useMemo, useState } from "react";

import { Field, Slider } from "@/ui";
import { DashboardAgentModelSelect } from "@/components/manager/DashboardAgentModelSelect";
import {
  DECISION_AGENT_MODEL_PRESETS,
  IMAGE_MODEL_PRESETS,
  TEXT_AGENT_MODEL_PRESETS,
  VIDEO_MODEL_PRESETS,
} from "@/lib/global-agent-models";
import type { OpenRouterModelCatalogEntry } from "@/lib/openrouter-app-api";
import { fetchOpenRouterModelsCatalog } from "@/lib/openrouter-models-catalog";
import {
  formatModelCatalogValidation,
  validateConfiguredModelsAgainstCatalog,
} from "@/lib/model-catalog-validation";
import {
  estimateAgentRunCostUsd,
  formatBlogTokenWorkloadHint,
  formatDecisionTokenWorkloadHint,
  formatResearchTokenWorkloadHint,
} from "@/lib/agent-pipeline-cost-estimates";

export interface LLMSettingsTabContentProps {
  researchModel: string;
  onResearchModelChange: (model: string) => void;
  blogModel: string;
  onBlogModelChange: (model: string) => void;
  imageModel: string;
  onImageModelChange: (model: string) => void;
  metaModel: string;
  onMetaModelChange: (model: string) => void;
  reportModel: string;
  onReportModelChange: (model: string) => void;
  adsModel: string;
  onAdsModelChange: (model: string) => void;
  videoModel: string;
  onVideoModelChange: (model: string) => void;
  decisionModel: string;
  onDecisionModelChange: (model: string) => void;
  temperature: number;
  onTemperatureChange: (value: number) => void;
  maxTokens: number;
  onMaxTokensChange: (value: number) => void;
  topP: number;
  onTopPChange: (value: number) => void;
}

export const LLMParameterControls: React.FC<{
  temperature: number;
  onTemperatureChange: (value: number) => void;
  maxTokens: number;
  onMaxTokensChange: (value: number) => void;
  topP: number;
  onTopPChange: (value: number) => void;
}> = (props) => {
  const handleSliderChange = (setter: (v: number) => void) => (values: number[]) => {
    setter(values[0]);
  };

  const handleInputChange = (setter: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      setter(value);
    }
  };

  const handleMaxTokensInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      props.onMaxTokensChange(value);
    }
  };

  const tileClass = "flex min-w-0 flex-col gap-2 bg-ui-field p-2";

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <div className={tileClass}>
        <p className="text-base font-semibold text-foreground">Temperature</p>
        <Slider
          min={0.0}
          max={2.0}
          step={0.01}
          value={[props.temperature]}
          onValueChange={handleSliderChange(props.onTemperatureChange)}
          className="w-full"
        />
        <div className="flex">
          <Field
            type="number"
            step="0.01"
            min="0.0"
            max="2.0"
            value={String(props.temperature)}
            onChange={handleInputChange(props.onTemperatureChange)}
            placeholder="Temperature"
          />
        </div>
      </div>

      <div className={tileClass}>
        <p className="text-base font-semibold text-foreground">Top P</p>
        <Slider
          min={0.0}
          max={1.0}
          step={0.01}
          value={[props.topP]}
          onValueChange={handleSliderChange(props.onTopPChange)}
          className="w-full"
        />
        <div className="flex">
          <Field
            type="number"
            step="0.01"
            min="0.0"
            max="1.0"
            value={String(props.topP)}
            onChange={handleInputChange(props.onTopPChange)}
            placeholder="Top P"
          />
        </div>
      </div>

      <div className={tileClass}>
        <p className="text-base font-semibold text-foreground">Max tokens</p>
        <div className="flex">
          <Field
            type="number"
            step="1"
            min="1"
            placeholder="Max tokens"
            value={String(props.maxTokens)}
            onChange={handleMaxTokensInputChange}
          />
        </div>
      </div>
    </div>
  );
};
/** Dashboard → AI & Models: six pipeline agents + sampling. */
export const LLMSettingsTabContent: React.FC<LLMSettingsTabContentProps> = ({
  researchModel,
  onResearchModelChange,
  blogModel,
  onBlogModelChange,
  imageModel,
  onImageModelChange,
  metaModel,
  onMetaModelChange,
  reportModel,
  onReportModelChange,
  adsModel,
  onAdsModelChange,
  videoModel,
  onVideoModelChange,
  decisionModel,
  onDecisionModelChange,
  temperature,
  onTemperatureChange,
  maxTokens,
  onMaxTokensChange,
  topP,
  onTopPChange,
}) => {
  const [catalog, setCatalog] = useState<OpenRouterModelCatalogEntry[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setCatalogLoading(true);
      const result = await fetchOpenRouterModelsCatalog();
      if (cancelled) return;
      setCatalog(result.models.length > 0 ? result.models : null);
      setCatalogError(result.error?.trim() || null);
      setCatalogLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const modelValidation = useMemo(() => {
    if (catalogLoading) return null;
    return validateConfiguredModelsAgainstCatalog(
      [
        { label: "Research agent", modelId: researchModel },
        { label: "Blog agent", modelId: blogModel },
        { label: "Image agent", modelId: imageModel },
        { label: "Meta agent", modelId: metaModel },
        { label: "Report agent", modelId: reportModel },
        { label: "Ads agent", modelId: adsModel },
        { label: "Video agent", modelId: videoModel },
        { label: "Decision agent", modelId: decisionModel },
      ],
      catalog,
      catalogError,
    );
  }, [
    catalog,
    catalogError,
    catalogLoading,
    researchModel,
    blogModel,
    imageModel,
    metaModel,
    reportModel,
    adsModel,
    videoModel,
    decisionModel,
  ]);
  const modelValidationMessage = modelValidation
    ? formatModelCatalogValidation(modelValidation)
    : null;

  const researchWorkloadHint = useMemo(
    () =>
      estimateAgentRunCostUsd({
        agent: "research",
        modelId: researchModel,
        catalog,
      }).label,
    [catalog, researchModel],
  );

  const blogWorkloadHint = useMemo(
    () =>
      `${formatBlogTokenWorkloadHint()} · ${estimateAgentRunCostUsd({
        agent: "blog",
        modelId: blogModel,
        catalog,
      }).label}`,
    [blogModel, catalog],
  );

  const imageWorkloadHint = useMemo(
    () =>
      estimateAgentRunCostUsd({
        agent: "image",
        modelId: imageModel,
        catalog,
      }).label,
    [catalog, imageModel],
  );

  const metaWorkloadHint = useMemo(
    () =>
      estimateAgentRunCostUsd({
        agent: "meta",
        modelId: metaModel,
        catalog,
      }).label,
    [catalog, metaModel],
  );

  const reportWorkloadHint = useMemo(
    () =>
      `${formatResearchTokenWorkloadHint()} · ${estimateAgentRunCostUsd({
        agent: "report",
        modelId: reportModel,
        catalog,
      }).label}`,
    [catalog, reportModel],
  );

  const adsWorkloadHint = useMemo(
    () =>
      estimateAgentRunCostUsd({
        agent: "ads",
        modelId: adsModel,
        catalog,
      }).label,
    [catalog, adsModel],
  );

  const videoWorkloadHint = useMemo(
    () =>
      estimateAgentRunCostUsd({
        agent: "video",
        modelId: videoModel,
        catalog,
      }).label,
    [catalog, videoModel],
  );

  const decisionWorkloadHint = useMemo(
    () =>
      estimateAgentRunCostUsd({
        agent: "decision",
        modelId: decisionModel,
        catalog,
      }).label,
    [catalog, decisionModel],
  );

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div>
          <p className="text-base font-semibold text-foreground">Pipeline agents</p>
          <p className="mt-1 text-base text-foreground">
            Pick a different OpenRouter model for each agent. Per-site Optimization Settings override these when set.
          </p>
          {catalogError ? (
            <p className="mt-2 text-base text-semantic-warning">
              OpenRouter catalog unavailable ({catalogError}). Presets still work; add an API key or retry.
            </p>
          ) : null}
          {modelValidationMessage ? (
            <p
              className={
                modelValidation?.status === "invalid"
                  ? "mt-2 text-base text-destructive"
                  : "mt-2 text-base text-semantic-warning"
              }
            >
              {modelValidationMessage}
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <DashboardAgentModelSelect
            tile
            label="Research agent"
            description="Checklist, blueprint, briefs, featured-image planning."
            value={researchModel}
            presets={TEXT_AGENT_MODEL_PRESETS}
            onChange={onResearchModelChange}
            agentKind="research"
            catalog={catalog}
            catalogLoading={catalogLoading}
            workloadHint={`${formatResearchTokenWorkloadHint()} · ${researchWorkloadHint}`}
          />
          <DashboardAgentModelSelect
            tile
            label="Blog agent"
            description="Harness sections, WordPress title, meta description."
            value={blogModel}
            presets={TEXT_AGENT_MODEL_PRESETS}
            onChange={onBlogModelChange}
            agentKind="blog"
            catalog={catalog}
            catalogLoading={catalogLoading}
            workloadHint={blogWorkloadHint}
          />
          <DashboardAgentModelSelect
            tile
            label="Image agent"
            description="Featured and in-content image generation."
            value={imageModel}
            presets={IMAGE_MODEL_PRESETS}
            onChange={onImageModelChange}
            agentKind="image"
            catalog={catalog}
            catalogLoading={catalogLoading}
            workloadHint={imageWorkloadHint}
          />
          <DashboardAgentModelSelect
            tile
            label="Meta agent"
            description="Overview SAP meta descriptions, titles, and FAQ copy."
            value={metaModel}
            presets={TEXT_AGENT_MODEL_PRESETS}
            onChange={onMetaModelChange}
            agentKind="meta"
            catalog={catalog}
            catalogLoading={catalogLoading}
            workloadHint={metaWorkloadHint}
          />
          <DashboardAgentModelSelect
            tile
            label="Report agent"
            description="GSC reporting outline and section writers."
            value={reportModel}
            presets={TEXT_AGENT_MODEL_PRESETS}
            onChange={onReportModelChange}
            agentKind="report"
            catalog={catalog}
            catalogLoading={catalogLoading}
            workloadHint={reportWorkloadHint}
          />
          <DashboardAgentModelSelect
            tile
            label="Ads agent"
            description="Google Ads and PPC reporting LLM steps."
            value={adsModel}
            presets={TEXT_AGENT_MODEL_PRESETS}
            onChange={onAdsModelChange}
            agentKind="ads"
            catalog={catalog}
            catalogLoading={catalogLoading}
            workloadHint={adsWorkloadHint}
          />
          <DashboardAgentModelSelect
            tile
            label="Video agent"
            description="Storyboard-to-video clips and narration (HeyGen Video + Voice) in the Video Generator."
            value={videoModel}
            presets={VIDEO_MODEL_PRESETS}
            onChange={onVideoModelChange}
            agentKind="video"
            catalog={catalog}
            catalogLoading={catalogLoading}
            workloadHint={videoWorkloadHint}
          />
          <DashboardAgentModelSelect
            tile
            label="Decision agent"
            description="Liquid d1.1 checker, quality gate batches, score rubrics, and fix routing."
            value={decisionModel}
            presets={DECISION_AGENT_MODEL_PRESETS}
            onChange={onDecisionModelChange}
            agentKind="decision"
            catalog={catalog}
            catalogLoading={catalogLoading}
            workloadHint={`${formatDecisionTokenWorkloadHint()} · ${decisionWorkloadHint}`}
          />
        </div>
      </div>

      <div className="space-y-4 pt-6">
        <div>
          <p className="text-base font-semibold text-foreground">Sampling defaults</p>
          <p className="mt-1 text-base text-foreground">Shared temperature, Top P, and max tokens.</p>
        </div>
        <LLMParameterControls
          temperature={temperature}
          onTemperatureChange={onTemperatureChange}
          maxTokens={maxTokens}
          onMaxTokensChange={onMaxTokensChange}
          topP={topP}
          onTopPChange={onTopPChange}
        />
      </div>
    </div>
  );
};
