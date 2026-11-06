import React, { useEffect, useMemo, useRef, useState } from "react";
import { TaskFormInfieldSelect } from "@/components/manager/tasks/TaskFormLayout";
import {
  openGoogleDriveAuthorize,
  useGoogleDriveConnectionStatus,
} from "@/hooks/use-google-drive-connection-status";
import { Button, Field, Pill, SelectField } from "@/ui";
import { CheckCircle } from "lucide-react";
import {
  DRIVE_MONTH_SEGMENTS,
  GOOGLE_DRIVE_PATH_PRESETS,
  driveYearSelectOptions,
  formatDriveMonthSegment,
  formatDriveYearSegment,
  googleDrivePurposeFolderLabel,
  isDriveCalendarMonth,
  isDriveCalendarYear,
  presetPurposeValueFromName,
} from "@/lib/google-drive/google-drive-folder-hierarchy";
import {
  findGoogleDriveFolderPresetByFolderId,
  formatGoogleDriveFolderUrl,
  listGoogleDriveFolderPresets,
  parseGoogleDriveFolderId,
  resolveGoogleDriveFolderPreset,
  suggestPresetForSiteName,
} from "@/lib/google-drive/google-drive-folder-presets";
import { googleDriveFolderIsConfigured } from "@/lib/google-drive/resolve-google-drive-folder";
import type { GoogleDriveFolderSource, TaskExecutionPayload } from "@/lib/tasks-types";
import { cn } from "@/lib/utils";
import { DrivePurposeSelect } from "@/components/manager/tasks/planner/DrivePurposeSelect";
import { WorkflowDriveFolderPreview } from "@/components/manager/tasks/planner/WorkflowDriveFolderPreview";
import {
  CUSTOM_FOLDER,
  FOLDER_SOURCE_OPTIONS,
  folderPathFromPayload,
  resolveFolderSource,
  type AutomationGoogleDriveFieldsProps,
} from "@/components/manager/tasks/planner/automation-google-drive-fields-shared";

export function GoogleDriveConnectionInline(): React.ReactElement | null {
  const { connected, loading, email } = useGoogleDriveConnectionStatus();
  if (loading) return null;
  if (connected) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-base font-medium text-primary">
        <CheckCircle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="break-words">Google Drive connected{email ? ` (${email})` : ""}</span>
      </span>
    );
  }
  return <Button onClick={openGoogleDriveAuthorize}>Connect Google Drive</Button>;
}
export function AutomationGoogleDriveFields({
  payload,
  disabled = false,
  siteName = "",
  siteUrl = "",
  executionKind,
  layout = "stack",
  inferredFolderPath = "",
  folderVariableOptions = [],
  onChange,
}: AutomationGoogleDriveFieldsProps): React.ReactElement {
  const workflow = layout === "workflow";
  const { connected, loading, email } = useGoogleDriveConnectionStatus();
  const presets = useMemo(() => listGoogleDriveFolderPresets(), []);
  const presetKey = String(payload.googleDrivePresetKey ?? "").trim();
  const folderSource = resolveFolderSource(payload);
  const [folderPathInput, setFolderPathInput] = useState(() => folderPathFromPayload(payload));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const folderPathInputRef = useRef(folderPathInput);
  folderPathInputRef.current = folderPathInput;
  const payloadFolderPath = folderPathFromPayload(payload);

  useEffect(() => {
    if (payloadFolderPath && payloadFolderPath !== folderPathInputRef.current) {
      setFolderPathInput(payloadFolderPath);
    }
  }, [payloadFolderPath]);

  useEffect(() => {
    if (workflow) return;
    if (folderSource !== "manual") return;
    if (presetKey || payload.googleDriveFolderId || !siteName.trim()) return;
    const suggested = suggestPresetForSiteName(siteName);
    if (!suggested) return;
    onChangeRef.current({
      googleDriveFolderSource: "manual",
      googleDrivePresetKey: suggested.id,
      googleDriveFolderId: suggested.folderId,
      googleDriveFolderLabel: suggested.label,
      saveToGoogleDrive: true,
    });
    setFolderPathInput(formatGoogleDriveFolderUrl(suggested.folderId));
  }, [folderSource, payload.googleDriveFolderId, presetKey, siteName, workflow]);

  useEffect(() => {
    if (!workflow) return;
    const inferred = inferredFolderPath || "reporting";
    const year = String(payload.googleDriveFolderYear ?? "").trim();
    const month = String(payload.googleDriveFolderMonth ?? "").trim();
    const seededYear = isDriveCalendarYear(year) ? year : formatDriveYearSegment();
    const seededMonth = isDriveCalendarMonth(month) ? month : formatDriveMonthSegment();
    const calendarPatch =
      seededYear !== year || seededMonth !== month
        ? { googleDriveFolderYear: seededYear, googleDriveFolderMonth: seededMonth }
        : {};
    if (payload.googleDriveFolderPathManual === true) {
      if (
        payload.googleDriveFolderSource === "path" &&
        payload.saveToGoogleDrive === true &&
        Object.keys(calendarPatch).length === 0
      ) {
        return;
      }
      onChangeRef.current({
        googleDriveFolderSource: "path",
        saveToGoogleDrive: true,
        ...calendarPatch,
      });
      return;
    }
    if (
      payload.googleDriveFolderSource === "path" &&
      payload.googleDriveFolderPath === inferred &&
      payload.saveToGoogleDrive === true &&
      Object.keys(calendarPatch).length === 0
    ) {
      return;
    }
    onChangeRef.current({
      googleDriveFolderSource: "path",
      googleDriveFolderPath: inferred,
      googleDriveFolderPathManual: false,
      saveToGoogleDrive: true,
      ...calendarPatch,
    });
  }, [
    inferredFolderPath,
    payload.googleDriveFolderPath,
    payload.googleDriveFolderPathManual,
    payload.googleDriveFolderMonth,
    payload.googleDriveFolderSource,
    payload.googleDriveFolderYear,
    payload.saveToGoogleDrive,
    workflow,
  ]);

  const resolvedFolder =
    folderSource === "manual"
      ? resolveGoogleDriveFolderPreset(
          presetKey || CUSTOM_FOLDER,
          payload.googleDriveFolderId ?? parseGoogleDriveFolderId(folderPathInput),
        )
      : null;

  const patch = (partial: Partial<TaskExecutionPayload>) => {
    onChange(partial);
  };

  const patchFolderSource = (source: GoogleDriveFolderSource) => {
    if (source === "client_root") {
      patch({
        googleDriveFolderSource: source,
        saveToGoogleDrive: true,
      });
      return;
    }
    if (source === "path") {
      patch({
        googleDriveFolderSource: source,
        googleDriveFolderPath: payload.googleDriveFolderPath ?? GOOGLE_DRIVE_PATH_PRESETS[0]?.value ?? "reporting",
        saveToGoogleDrive: true,
      });
      return;
    }
    if (source === "variable") {
      patch({
        googleDriveFolderSource: source,
        googleDriveFolderVariable:
          payload.googleDriveFolderVariable ?? folderVariableOptions[0]?.key ?? "",
        saveToGoogleDrive: true,
      });
      return;
    }
    patch({ googleDriveFolderSource: source });
  };

  const applyPreset = (nextKey: string) => {
    if (nextKey === CUSTOM_FOLDER) {
      patch({
        googleDriveFolderSource: "manual",
        googleDrivePresetKey: CUSTOM_FOLDER,
        googleDriveFolderLabel: "Custom folder",
      });
      return;
    }
    const preset = presets.find((item) => item.id === nextKey);
    if (!preset) return;
    const folderUrl = formatGoogleDriveFolderUrl(preset.folderId);
    setFolderPathInput(folderUrl);
    patch({
      googleDriveFolderSource: "manual",
      googleDrivePresetKey: preset.id,
      googleDriveFolderId: preset.folderId,
      googleDriveFolderLabel: preset.label,
      saveToGoogleDrive: true,
    });
  };

  const applyFolderPath = (value: string) => {
    setFolderPathInput(value);
    const folderId = parseGoogleDriveFolderId(value);
    const matchedPreset = folderId ? findGoogleDriveFolderPresetByFolderId(folderId) : null;
    patch({
      googleDriveFolderSource: "manual",
      googleDrivePresetKey: matchedPreset?.id ?? CUSTOM_FOLDER,
      googleDriveFolderId: folderId,
      googleDriveFolderLabel: matchedPreset?.label ?? "Custom folder",
      saveToGoogleDrive: Boolean(folderId),
    });
  };

  const selectValue =
    presetKey && presetKey !== CUSTOM_FOLDER
      ? presetKey
      : parseGoogleDriveFolderId(folderPathInput)
        ? CUSTOM_FOLDER
        : undefined;

  const configured = googleDriveFolderIsConfigured(payload, siteName);
  const yearLabel = formatDriveYearSegment();
  const monthLabel = formatDriveMonthSegment();

  if (workflow) {
    const inferred = inferredFolderPath || "reporting";
    const savedPath = String(payload.googleDriveFolderPath ?? "").trim();
    const selected =
      payload.googleDriveFolderPathManual === true && savedPath
        ? (presetPurposeValueFromName(savedPath) ?? savedPath)
        : inferred;
    const selectedYear = isDriveCalendarYear(String(payload.googleDriveFolderYear ?? "").trim())
      ? String(payload.googleDriveFolderYear).trim()
      : yearLabel;
    const selectedMonth = isDriveCalendarMonth(String(payload.googleDriveFolderMonth ?? "").trim())
      ? String(payload.googleDriveFolderMonth).trim()
      : monthLabel;
    const yearOptions = driveYearSelectOptions();
    if (!yearOptions.includes(selectedYear)) yearOptions.unshift(selectedYear);
    return (
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-2">
          <DrivePurposeSelect
            value={selected}
            inferred={inferred}
            disabled={disabled}
            onSelect={(value) =>
              patch({
                googleDriveFolderSource: "path",
                googleDriveFolderPath: value,
                googleDriveFolderPathManual: value !== inferred,
                googleDriveFolderYear: selectedYear,
                googleDriveFolderMonth: selectedMonth,
                saveToGoogleDrive: true,
              })
            }
          />
          <SelectField
            placeholder="Year"
            width="full"
            value={selectedYear}
            disabled={disabled}
            options={yearOptions.map((year) => ({ value: year, label: year }))}
            onValueChange={(value) =>
              patch({
                googleDriveFolderSource: "path",
                googleDriveFolderYear: value,
                googleDriveFolderMonth: selectedMonth,
                saveToGoogleDrive: true,
              })
            }
          />
          <SelectField
            placeholder="Month"
            width="full"
            value={selectedMonth}
            disabled={disabled}
            options={DRIVE_MONTH_SEGMENTS.map((month) => ({ value: month, label: month }))}
            onValueChange={(value) =>
              patch({
                googleDriveFolderSource: "path",
                googleDriveFolderYear: selectedYear,
                googleDriveFolderMonth: value,
                saveToGoogleDrive: true,
              })
            }
          />
        </div>        <WorkflowDriveFolderPreview
          payload={payload}
          siteName={siteName}
          siteUrl={siteUrl}
          executionKind={executionKind}
          connected={connected}
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", !workflow && "pt-1")}>
      {!workflow && !loading && connected ? (
        <span className="inline-flex h-9 w-fit items-center gap-1.5 text-base font-medium text-primary">
          <CheckCircle className="h-4 w-4 shrink-0" aria-hidden />
          Google Drive connected{email ? ` (${email})` : ""}
        </span>
      ) : !workflow && !loading ? (
        <Button onClick={openGoogleDriveAuthorize}>Connect Google Drive</Button>
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-1" role="group" aria-label="Folder source">
        {FOLDER_SOURCE_OPTIONS.map((option) => (
          <Pill
            key={option.value}
            label={option.label}
            square
            tone={workflow ? "forge" : "default"}
            active={folderSource === option.value}
            disabled={disabled}
            onClick={() => patchFolderSource(option.value)}
          />
        ))}
      </div>

      {folderSource === "manual" ? (
        <>
          <Field
            placeholder="Folder path URL"
            value={folderPathInput}
            disabled={disabled}
            onChange={(event) => applyFolderPath(event.target.value)}
          />
          <SelectField
            placeholder="Saved folder (optional)"
            width="full"
            value={selectValue}
            disabled={disabled}
            options={[...presets.map((preset) => ({ value: preset.id, label: preset.label })), { value: CUSTOM_FOLDER, label: "Custom folder" }]}
            onValueChange={applyPreset}
          />
        </>
      ) : null}
      {folderSource === "client_root" ? (
        <p className="text-base text-muted-foreground">
          Auto-find the client folder under NEO Pulse.
          {siteName.trim() ? ` Client: ${siteName.trim()}.` : " Select a client to preview the match."}
        </p>
      ) : null}

      {folderSource === "path" ? (
        <div className="min-w-0">
          <DrivePurposeSelect
            value={payload.googleDriveFolderPath ?? GOOGLE_DRIVE_PATH_PRESETS[0]?.value ?? "reporting"}
            inferred={inferredFolderPath || "reporting"}
            disabled={disabled}

            onSelect={(value) =>
              patch({
                googleDriveFolderPath: value,
                googleDriveFolderPathManual: true,
                googleDriveFolderSource: "path",
                saveToGoogleDrive: true,
              })
            }
          />
        </div>
      ) : null}

      {folderSource === "variable" ? (
        <TaskFormInfieldSelect
          label="Folder variable"
          value={payload.googleDriveFolderVariable ?? ""}
          disabled={disabled || folderVariableOptions.length === 0}
          options={folderVariableOptions.map((option) => ({
            value: option.key,
            label: option.label || option.key,
          }))}
          onChange={(value) =>
            patch({ googleDriveFolderVariable: value, googleDriveFolderSource: "variable", saveToGoogleDrive: true })
          }
        />
      ) : null}

      {configured ? (
        <p className="text-base text-muted-foreground">
          {folderSource === "manual" && resolvedFolder
            ? `Saves to ${resolvedFolder.label} (${resolvedFolder.folderId.slice(0, 8)}…)`
            : folderSource === "client_root"
              ? "Saves to the client folder under NEO Pulse."
              : folderSource === "path"
                ? `Saves to ${googleDrivePurposeFolderLabel(payload.googleDriveFolderPath || "reporting")} / ${yearLabel} / ${monthLabel} under the client folder.`
                : "Saves to the folder from the selected upstream variable."}
        </p>
      ) : (
        <p className="text-base text-semantic-warning">
          {folderSource === "manual"
            ? "Folder path is required. Pick a saved folder or paste a URL."
            : folderSource === "variable" && folderVariableOptions.length === 0
              ? "Add an upstream step with a folder output before using a variable."
              : "Configure the folder source before running."}
        </p>
      )}
    </div>
  );
}
