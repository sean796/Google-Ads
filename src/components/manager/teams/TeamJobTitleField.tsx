import { useEffect, useMemo, useState } from "react";
import { FALLBACK_JOB_TITLE_PRESETS, type JobTitlePreset } from "@/lib/teams-types";
import { Field, SelectField } from "@/ui";

const CUSTOM_JOB_TITLE = "__custom__";

export type TeamJobTitleFieldProps = {
  value: string;
  onChange: (value: string) => void;
  presets: JobTitlePreset[];
  disabled?: boolean;
};

export function TeamJobTitleField({ value, onChange, presets, disabled }: TeamJobTitleFieldProps) {
  const presetTitles = useMemo(() => {
    const titles = presets.map((p) => p.title);
    return titles.length > 0 ? titles : [...FALLBACK_JOB_TITLE_PRESETS];
  }, [presets]);

  const [customMode, setCustomMode] = useState(() => value !== "" && !presetTitles.includes(value));

  useEffect(() => {
    setCustomMode(value !== "" && !presetTitles.includes(value));
  }, [value, presetTitles]);

  const selectValue = customMode ? CUSTOM_JOB_TITLE : presetTitles.includes(value) ? value : presetTitles[0];

  return (
    <div className="space-y-2">
      <SelectField
        placeholder="Job title"
        value={selectValue}
        onValueChange={(next) => {
          if (next === CUSTOM_JOB_TITLE) {
            setCustomMode(true);
            if (presetTitles.includes(value)) onChange("");
            return;
          }
          setCustomMode(false);
          onChange(next);
        }}
        options={[...presetTitles.map((title) => ({ value: title, label: title })), { value: CUSTOM_JOB_TITLE, label: "Custom" }]}
        width="full"
        disabled={disabled}
      />
      {customMode ? (
        <Field
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Custom job title"
          placeholder="Custom job title"
          disabled={disabled}
        />
      ) : null}
    </div>
  );
}
