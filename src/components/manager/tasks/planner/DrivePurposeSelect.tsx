import React, { useEffect, useState } from "react";
import { Field, SelectField } from "@/ui";
import {
  CUSTOM_DRIVE_PURPOSE_SELECT_VALUE,
  listDrivePurposeSelectOptions,
  rememberCustomDrivePurposePreset,
} from "@/lib/google-drive/google-drive-folder-hierarchy";

export function DrivePurposeSelect({
  value,
  inferred,
  disabled,
  onSelect,
}: {
  value: string;
  inferred: string;
  disabled?: boolean;
  onSelect: (value: string) => void;
}): React.ReactElement {
  const [enteringCustom, setEnteringCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [options, setOptions] = useState(() => listDrivePurposeSelectOptions(value));

  useEffect(() => {
    setOptions(listDrivePurposeSelectOptions(value));
  }, [value]);

  const commitCustom = () => {
    const raw = customDraft.trim();
    setEnteringCustom(false);
    setCustomDraft("");
    if (!raw) return;
    const path = rememberCustomDrivePurposePreset(raw);
    if (!path) return;
    setOptions(listDrivePurposeSelectOptions(path));
    onSelect(path);
  };

  if (enteringCustom) {
    return (
      <Field
        placeholder="Custom folder"
        value={customDraft}
        disabled={disabled}
        autoFocus
        onChange={(event) => setCustomDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitCustom();
          }
          if (event.key === "Escape") {
            setEnteringCustom(false);
            setCustomDraft("");
          }
        }}
        onBlur={commitCustom}
      />
    );
  }

  return (
    <SelectField
      placeholder="Purpose"
      width="full"
      value={value || inferred}
      disabled={disabled}
      options={[...options, { value: CUSTOM_DRIVE_PURPOSE_SELECT_VALUE, label: "Custom" }]}
      onValueChange={(next) => {
        if (next === CUSTOM_DRIVE_PURPOSE_SELECT_VALUE) {
          setEnteringCustom(true);
          setCustomDraft("");
          return;
        }
        onSelect(next);
      }}
    />
  );
}
