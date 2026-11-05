import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { CalendarClock } from "lucide-react";
import { WordPressScheduleFields } from "@/components/keyword-research/bulk/WordPressScheduleFields";
import { AutomationEmailDeliveryFields } from "@/components/manager/tasks/planner/AutomationEmailDeliveryFields";
import { AutomationGoogleDriveFields } from "@/components/manager/tasks/planner/AutomationGoogleDriveFields";
import { formatBulkScheduleSummary } from "@/lib/bulk/bulk-schedule-summary";
import {
  ensureExecutionSchedulePayload,
  postCreatorPayloadToScheduleState,
  scheduleStateToExecutionPayload,
  type PostCreatorScheduleUiState,
} from "@/lib/post-creator/post-creator-schedule-payload";
import {
  defaultSchedulePayloadForKind,
  scheduleDestinationModesForKind,
  scheduledDestinationLabelForKind,
  type ScheduleDestinationMode,
} from "@/lib/schedule-output-destination";
import { suggestPresetForSiteName } from "@/lib/google-drive/google-drive-folder-presets";
import { googleDriveFolderIsConfigured } from "@/lib/google-drive/resolve-google-drive-folder";
import type { TaskExecutionKind, TaskExecutionPayload } from "@/lib/tasks-types";

export type PulseForgePostSchedulePanelProps = {
  executionPayload?: TaskExecutionPayload | null;
  disabled?: boolean;
  heading?: string;
  executionKind?: TaskExecutionKind;
  siteName?: string;
  onChange: (payload: TaskExecutionPayload) => void;
};

function destinationModeFromState(state: PostCreatorScheduleUiState): ScheduleDestinationMode {
  if (state.wordpressDraftOnly) return "draft";
  if (state.automationEmailDelivery) return "email";
  if (state.googleDriveDelivery) return "google_drive";
  if (state.localArchive) return "local";
  return "scheduled";
}

function destinationModeFromPayload(
  payload: TaskExecutionPayload,
  state: PostCreatorScheduleUiState,
): ScheduleDestinationMode {
  if (payload.sendAutomationEmail === true) return "email";
  if (payload.saveToGoogleDrive === true) return "google_drive";
  return destinationModeFromState(state);
}

function applyDestinationFlags(
  mode: ScheduleDestinationMode,
  state: PostCreatorScheduleUiState,
): PostCreatorScheduleUiState {
  if (mode === "email") {
    return {
      ...state,
      automationEmailDelivery: true,
      googleDriveDelivery: false,
      localArchive: true,
      wordpressDraftOnly: false,
    };
  }
  if (mode === "google_drive") {
    return {
      ...state,
      automationEmailDelivery: false,
      googleDriveDelivery: true,
      localArchive: true,
      wordpressDraftOnly: false,
    };
  }
  if (mode === "local") {
    return {
      ...state,
      automationEmailDelivery: false,
      googleDriveDelivery: false,
      localArchive: true,
      wordpressDraftOnly: false,
    };
  }
  if (mode === "draft") {
    return {
      ...state,
      automationEmailDelivery: false,
      googleDriveDelivery: false,
      localArchive: false,
      wordpressDraftOnly: true,
    };
  }
  return {
    ...state,
    automationEmailDelivery: false,
    googleDriveDelivery: false,
    localArchive: false,
    wordpressDraftOnly: false,
  };
}

function resolveEmailState(
  state: PostCreatorScheduleUiState,
  base: TaskExecutionPayload,
): PostCreatorScheduleUiState {
  const emailActive =
    base.sendAutomationEmail === true ||
    state.automationEmailDelivery ||
    Boolean(String(base.automationEmailTo ?? "").trim());
  return emailActive ? applyDestinationFlags("email", state) : state;
}

function applyDestinationPayloadFlags(
  mode: ScheduleDestinationMode,
  payload: TaskExecutionPayload,
): TaskExecutionPayload {
  const next = { ...payload };
  if (mode === "email") {
    next.sendAutomationEmail = true;
    next.saveToGoogleDrive = false;
    next.saveLocalArchive = true;
    return next;
  }
  if (mode === "google_drive") {
    next.sendAutomationEmail = false;
    next.saveToGoogleDrive = true;
    next.saveLocalArchive = true;
    return next;
  }
  if (mode === "local") {
    next.sendAutomationEmail = false;
    next.saveToGoogleDrive = false;
    next.saveLocalArchive = true;
    return next;
  }
  if (mode === "draft") {
    next.sendAutomationEmail = false;
    next.saveToGoogleDrive = false;
    next.saveLocalArchive = false;
    return next;
  }
  next.sendAutomationEmail = false;
  next.saveToGoogleDrive = false;
  next.saveLocalArchive = false;
  return next;
}

export function PulseForgePostSchedulePanel({
  executionPayload,
  disabled = false,
  heading = "Schedule",
  executionKind,
  siteName = "",
  onChange,
}: PulseForgePostSchedulePanelProps): React.ReactElement {
  const kindDefaults = useMemo(
    () => defaultSchedulePayloadForKind(executionKind, executionPayload),
    [executionKind, executionPayload],
  );
  const payload = useMemo(() => ensureExecutionSchedulePayload(kindDefaults), [kindDefaults]);
  const state = useMemo(() => postCreatorPayloadToScheduleState(payload), [payload]);
  const payloadRef = useRef(payload);
  const stateRef = useRef(state);
  payloadRef.current = payload;
  stateRef.current = state;
  const destinationMode = useMemo(() => destinationModeFromPayload(payload, state), [payload, state]);
  const showEmailFields =
    destinationMode === "email" ||
    payload.sendAutomationEmail === true ||
    state.automationEmailDelivery ||
    Boolean(String(payload.automationEmailTo ?? "").trim());
  const showGoogleDriveFields = destinationMode === "google_drive" || payload.saveToGoogleDrive === true;

  const destinationModes = useMemo(
    () => scheduleDestinationModesForKind(executionKind),
    [executionKind],
  );

  useEffect(() => {
    if (
      executionKind !== "gsc_reporting" &&
      executionKind !== "ads_reporting" &&
      executionKind !== "local_dominator_export" &&
      executionKind !== "chatgpt_website_audit" &&
      executionKind !== "browser_automation"
    ) {
      return;
    }
    if (executionPayload?.saveLocalArchive !== undefined) return;
    onChange(defaultSchedulePayloadForKind(executionKind, ensureExecutionSchedulePayload(executionPayload)));
  }, [executionKind, executionPayload, onChange]);

  const pushPayload = useCallback(
    (nextState: PostCreatorScheduleUiState, patch: Partial<TaskExecutionPayload> = {}) => {
      stateRef.current = nextState;
      const mergedBase = { ...payloadRef.current, ...patch };
      const stateForPayload = resolveEmailState(nextState, mergedBase);
      const nextPayload = scheduleStateToExecutionPayload(stateForPayload, mergedBase);
      if (
        mergedBase.sendAutomationEmail === true ||
        stateForPayload.automationEmailDelivery ||
        Boolean(String(mergedBase.automationEmailTo ?? "").trim())
      ) {
        nextPayload.sendAutomationEmail = true;
        nextPayload.saveLocalArchive = true;
      }
      if (mergedBase.saveToGoogleDrive === true || stateForPayload.googleDriveDelivery) {
        nextPayload.saveToGoogleDrive = true;
        nextPayload.saveLocalArchive = true;
      }
      payloadRef.current = nextPayload;
      onChange(nextPayload);
    },
    [onChange],
  );

  const commit = useCallback(
    (updater: (prev: PostCreatorScheduleUiState) => PostCreatorScheduleUiState) => {
      pushPayload(updater(stateRef.current));
    },
    [pushPayload],
  );

  const setOutputDestinationMode = useCallback(
    (mode: ScheduleDestinationMode) => {
      const nextState = applyDestinationFlags(mode, state);
      let nextPayload = applyDestinationPayloadFlags(
        mode,
        scheduleStateToExecutionPayload(nextState, payload),
      );
      if (mode === "google_drive" && siteName.trim()) {
        const suggested = suggestPresetForSiteName(siteName);
        if (suggested && !String(nextPayload.googleDriveFolderId ?? "").trim()) {
          nextPayload = {
            ...nextPayload,
            googleDrivePresetKey: suggested.id,
            googleDriveFolderId: suggested.folderId,
            googleDriveFolderLabel: suggested.label,
          };
        }
      }
      onChange(nextPayload);
    },
    [onChange, payload, siteName, state],
  );

  const commitEmailFields = useCallback(
    (patch: Partial<TaskExecutionPayload>) => {
      const mergedBase = { ...payload, ...patch };
      const wantsEmail =
        destinationMode === "email" ||
        mergedBase.sendAutomationEmail === true ||
        Boolean(String(mergedBase.automationEmailTo ?? "").trim());
      const nextState = wantsEmail ? applyDestinationFlags("email", state) : state;
      pushPayload(nextState, {
        ...patch,
        ...(wantsEmail ? { sendAutomationEmail: true, saveLocalArchive: true, saveToGoogleDrive: false } : {}),
      });
    },
    [destinationMode, payload, pushPayload, state],
  );

  const commitGoogleDriveFields = useCallback(
    (patch: Partial<TaskExecutionPayload>) => {
      const nextState = applyDestinationFlags("google_drive", state);
      const merged = { ...payloadRef.current, ...patch };
      pushPayload(nextState, {
        ...patch,
        saveToGoogleDrive:
          patch.saveToGoogleDrive ?? googleDriveFolderIsConfigured(merged, siteName),
        saveLocalArchive: true,
        sendAutomationEmail: false,
      });
    },
    [pushPayload, siteName, state],
  );

  const summary = formatBulkScheduleSummary({
    scheduleFrequency: state.scheduleFrequency,
    customInterval: state.customInterval,
    dayOfWeek: state.dayOfWeek,
    startDateOption: state.startDateOption,
    customStartDate: state.customStartDate,
    startTime: state.startTime,
    draftOnly: state.wordpressDraftOnly,
    emailDelivery: payload.sendAutomationEmail === true || state.automationEmailDelivery,
    localArchive: state.localArchive || state.automationEmailDelivery || state.googleDriveDelivery,
  });

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 px-0.5">
        <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-base font-medium text-foreground">{heading}</p>
        <p className="ml-auto text-base text-muted-foreground">{summary}</p>
      </div>
      <WordPressScheduleFields
        layout="stack"
        scheduleFrequency={state.scheduleFrequency}
        setScheduleFrequency={(scheduleFrequency) => commit((prev) => ({ ...prev, scheduleFrequency }))}
        customInterval={state.customInterval}
        setCustomInterval={(customInterval) => commit((prev) => ({ ...prev, customInterval }))}
        dayOfWeek={state.dayOfWeek}
        setDayOfWeek={(dayOfWeek) => commit((prev) => ({ ...prev, dayOfWeek }))}
        startDateOption={state.startDateOption}
        setStartDateOption={(startDateOption) => commit((prev) => ({ ...prev, startDateOption }))}
        customStartDate={state.customStartDate}
        setCustomStartDate={(customStartDate) =>
          commit((prev) => ({
            ...prev,
            customStartDate:
              typeof customStartDate === "function"
                ? customStartDate(prev.customStartDate)
                : customStartDate,
          }))
        }
        startTime={state.startTime}
        setStartTime={(startTime) => commit((prev) => ({ ...prev, startTime }))}
        onApplySchedulePreset={(next) => pushPayload({ ...stateRef.current, ...next })}
        useCsvPublishDates={false}
        setUseCsvPublishDates={() => {}}
        wordpressDraftOnly={state.wordpressDraftOnly}
        setWordpressDraftOnly={(wordpressDraftOnly) =>
          commit((prev) => ({ ...prev, wordpressDraftOnly }))
        }
        localArchive={state.localArchive}
        setLocalArchive={(localArchive) => commit((prev) => ({ ...prev, localArchive }))}
        automationEmailDelivery={state.automationEmailDelivery}
        setAutomationEmailDelivery={(automationEmailDelivery) =>
          commit((prev) => ({ ...prev, automationEmailDelivery }))
        }
        googleDriveDelivery={state.googleDriveDelivery}
        destinationModes={destinationModes}
        emailDeliveryEnabled
        scheduledDestinationLabel={scheduledDestinationLabelForKind(executionKind)}
        setOutputDestinationMode={setOutputDestinationMode}
        outputDestinationMode={destinationMode}
        isDisabled={disabled}
      />
      {showGoogleDriveFields ? (
        <AutomationGoogleDriveFields
          payload={payload}
          disabled={disabled}
          siteName={siteName}
          onChange={commitGoogleDriveFields}
        />
      ) : null}
      {showEmailFields ? (
        <AutomationEmailDeliveryFields
          payload={payload}
          disabled={disabled}
          onChange={commitEmailFields}
        />
      ) : null}
    </div>
  );
}
