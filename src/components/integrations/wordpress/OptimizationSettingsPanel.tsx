import React, { useCallback, useMemo, useState } from "react";

import { RotateCcw, Save } from "lucide-react";
import { Button, Field, SelectField, Slider } from "@/ui";
import { type WordPressSite } from "../types";
import { IMAGE_MODEL_PRESETS } from "@/lib/image-model-defaults";
import {
  DEFAULT_SETTINGS,
  type OptimizationSettings,
} from "@/lib/optimization-settings-defaults";
import { TEXT_AGENT_MODEL_PRESETS } from "@/lib/global-agent-models";

export type { OptimizationSettings } from "@/lib/optimization-settings-defaults";

function buildModelOptions(
  presets: { value: string; label: string }[],
  customModels: string[],
  currentValue: string,
): { value: string; label: string }[] {
  const map = new Map<string, string>();
  for (const p of presets) {
    map.set(p.value, p.label);
  }
  for (const id of customModels) {
    if (!map.has(id)) {
      map.set(id, id);
    }
  }
  if (currentValue && !map.has(currentValue)) {
    map.set(currentValue, currentValue);
  }
  return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
}

type ModelFieldKey =
  | "model"
  | "researchModel"
  | "imageModel"
  | "metaModel"
  | "reportModel"
  | "adsModel";

interface OptimizationModelSelectProps {
  label: string;
  description?: string;
  value: string;
  presets: { value: string; label: string }[];
  customModels: string[];
  onSelect: (value: string) => void;
  onSaveCustom: (modelId: string) => void;
  disabled?: boolean;
}

const OptimizationModelSelect: React.FC<OptimizationModelSelectProps> = ({
  label,
  description,
  value,
  presets,
  customModels,
  onSelect,
  onSaveCustom,
  disabled = false,
}) => {
  const [draft, setDraft] = useState("");

  const options = useMemo(
    () => buildModelOptions(presets, customModels, value),
    [presets, customModels, value],
  );

  const commitDraft = useCallback(() => {
    const id = draft.trim();
    if (!id) return;
    onSaveCustom(id);
    setDraft("");
  }, [draft, onSaveCustom]);

  return (
    <div className="flex flex-col gap-1">
      <p className="text-base font-medium text-muted-foreground">{label}</p>
      {description ? <p className="text-base text-muted-foreground">{description}</p> : null}
      <SelectField
        placeholder={label}
        width="full"
        value={value}
        disabled={disabled}
        options={options}
        onValueChange={onSelect}
      />
      <div className="flex items-center gap-1.5">
        <Field
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitDraft();
            }
          }}
          placeholder="Custom OpenRouter model id"
          disabled={disabled}
        />
        <Button
          size="icon"
          icon={Save}
          aria-label="Save custom model"
          disabled={disabled || !draft.trim()}
          onClick={commitDraft}
        />
      </div>
    </div>
  );
};
interface OptimizationSettingsPanelProps {
  site: WordPressSite;
  settings: OptimizationSettings;
  onSettingsChange: (settings: OptimizationSettings) => void;
  disabled?: boolean;
}

export const OptimizationSettingsPanel: React.FC<OptimizationSettingsPanelProps> = ({
  site: _site,
  settings,
  onSettingsChange,
  disabled = false,
}) => {
  const customModels = settings.customModels ?? [];

  const saveCustomModelForField = (field: ModelFieldKey, rawId: string) => {
    const id = rawId.trim();
    if (!id) return;
    const nextCustom = customModels.includes(id) ? customModels : [...customModels, id];
    onSettingsChange({
      ...settings,
      customModels: nextCustom,
      [field]: id,
    });
  };

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
    const value = parseInt(e.target.value);
    if (!isNaN(value)) {
      onSettingsChange({ ...settings, maxTokens: value });
    }
  };

  const handleReset = () => {
    onSettingsChange(DEFAULT_SETTINGS);
  };

  const isDefault =
    settings.model === DEFAULT_SETTINGS.model &&
    settings.researchModel === DEFAULT_SETTINGS.researchModel &&
    settings.imageModel === DEFAULT_SETTINGS.imageModel &&
    settings.metaModel === DEFAULT_SETTINGS.metaModel &&
    settings.reportModel === DEFAULT_SETTINGS.reportModel &&
    settings.adsModel === DEFAULT_SETTINGS.adsModel &&
    customModels.length === 0 &&
    settings.temperature === DEFAULT_SETTINGS.temperature &&
    settings.maxTokens === DEFAULT_SETTINGS.maxTokens &&
    settings.topP === DEFAULT_SETTINGS.topP;

  const numberRow = (
    heading: string,
    note: string,
    props: { step: string; min: string; max?: string; value: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void },
    slider?: { min: number; max: number; value: number; onChange: (v: number) => void },
  ) => (
    <div className="flex flex-col gap-1">
      <p className="text-base font-medium text-muted-foreground">{heading}</p>
      {slider ? (
        <Slider
          min={slider.min}
          max={slider.max}
          step={0.01}
          value={[slider.value]}
          onValueChange={handleSliderChange(slider.onChange)}
          disabled={disabled}
          className="w-full"
        />
      ) : null}
      <Field
        type="number"
        step={props.step}
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={props.onChange}
        disabled={disabled}
        placeholder={heading}
      />
      <p className="text-base text-muted-foreground">{note}</p>
    </div>
  );

  return (
    <div className="mt-2 flex w-full flex-col gap-4 bg-ui-field p-3">
      <p className="text-base font-semibold uppercase tracking-wider">
        Optimization Settings
        {!isDefault ? <span className="ml-2 font-normal normal-case text-muted-foreground">(Custom)</span> : null}
      </p>
        <OptimizationModelSelect
          label="Research agent"
          description="Checklist, blueprint, briefs, and featured-image planning."
          value={settings.researchModel}
          presets={TEXT_AGENT_MODEL_PRESETS}
          customModels={customModels}
          onSelect={(v) => onSettingsChange({ ...settings, researchModel: v })}
          onSaveCustom={(id) => saveCustomModelForField("researchModel", id)}
          disabled={disabled}
        />

        <OptimizationModelSelect
          label="Blog agent"
          description="Harness sections, WordPress title, and meta description."
          value={settings.model}
          presets={TEXT_AGENT_MODEL_PRESETS}
          customModels={customModels}
          onSelect={(v) => onSettingsChange({ ...settings, model: v })}
          onSaveCustom={(id) => saveCustomModelForField("model", id)}
          disabled={disabled}
        />

        <OptimizationModelSelect
          label="Image agent"
          description="Generated featured and in-content images."
          value={settings.imageModel}
          presets={IMAGE_MODEL_PRESETS}
          customModels={customModels}
          onSelect={(v) => onSettingsChange({ ...settings, imageModel: v })}
          onSaveCustom={(id) => saveCustomModelForField("imageModel", id)}
          disabled={disabled}
        />

        <OptimizationModelSelect
          label="Meta agent"
          description="Overview SAP meta descriptions, titles, and FAQ copy."
          value={settings.metaModel}
          presets={TEXT_AGENT_MODEL_PRESETS}
          customModels={customModels}
          onSelect={(v) => onSettingsChange({ ...settings, metaModel: v })}
          onSaveCustom={(id) => saveCustomModelForField("metaModel", id)}
          disabled={disabled}
        />

        <OptimizationModelSelect
          label="Report agent"
          description="GSC reporting outline and section writers."
          value={settings.reportModel}
          presets={TEXT_AGENT_MODEL_PRESETS}
          customModels={customModels}
          onSelect={(v) => onSettingsChange({ ...settings, reportModel: v })}
          onSaveCustom={(id) => saveCustomModelForField("reportModel", id)}
          disabled={disabled}
        />

        <OptimizationModelSelect
          label="Ads agent"
          description="Google Ads and PPC reporting LLM steps."
          value={settings.adsModel}
          presets={TEXT_AGENT_MODEL_PRESETS}
          customModels={customModels}
          onSelect={(v) => onSettingsChange({ ...settings, adsModel: v })}
          onSaveCustom={(id) => saveCustomModelForField("adsModel", id)}
          disabled={disabled}
        />
      {numberRow(
        `Temperature: ${settings.temperature.toFixed(2)}`,
        "Controls randomness. Lower = more deterministic, Higher = more creative. (0.0 - 2.0)",
        {
          step: "0.01",
          min: "0.0",
          max: "2.0",
          value: settings.temperature,
          onChange: handleInputChange((value) => onSettingsChange({ ...settings, temperature: value })),
        },
        {
          min: 0,
          max: 2,
          value: settings.temperature,
          onChange: (value) => onSettingsChange({ ...settings, temperature: value }),
        },
      )}

      {numberRow(
        `Top P: ${settings.topP.toFixed(2)}`,
        "Controls diversity via nucleus sampling. Lower = more focused. (0.0 - 1.0)",
        {
          step: "0.01",
          min: "0.0",
          max: "1.0",
          value: settings.topP,
          onChange: handleInputChange((value) => onSettingsChange({ ...settings, topP: value })),
        },
        {
          min: 0,
          max: 1,
          value: settings.topP,
          onChange: (value) => onSettingsChange({ ...settings, topP: value }),
        },
      )}

      {numberRow(
        `Max Tokens: ${settings.maxTokens}`,
        "Maximum number of tokens to generate. Controls response length.",
        { step: "1", min: "1", value: settings.maxTokens, onChange: handleMaxTokensInputChange },
      )}

      <Button icon={RotateCcw} reserved={isDefault} disabled={disabled} onClick={handleReset}>
        Reset to Defaults
      </Button>
    </div>
  );
};