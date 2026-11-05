import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, Mail, RefreshCw, Trash2 } from "lucide-react";
import { deleteTaskFile, fetchTaskDetail, fetchTaskFileText, taskFileDownloadUrl } from "@/lib/tasks-api";
import { groupTaskArchiveFilesByRun } from "@/lib/task-archive-run-groups";
import { sendArchiveRunEmail } from "@/lib/task-archive-email";
import type { TaskExecutionKind, TaskExecutionPayload, TaskFile } from "@/lib/tasks-types";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

export type TaskBuilderArchivePanelProps = {
  teamId: number | null;
  taskId: number | null;
  saveLocalArchive: boolean;
  executionPayload?: TaskExecutionPayload | null;
  executionKind?: TaskExecutionKind;
  automationTitle?: string;
  siteName?: string;
  disabled?: boolean;
};

function formatRunDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

type ArchiveRunRowProps = {
  teamId: number;
  taskId: number;
  label: string;
  createdAt: string;
  files: TaskFile[];
  expanded: boolean;
  disabled: boolean;
  deletingRun: boolean;
  deletingFileId: number | null;
  sendingEmail: boolean;
  emailDisabled: boolean;
  emailStatus: string | null;
  onToggle: () => void;
  onDeleteRun: () => void;
  onDeleteFile: (fileId: number) => void;
  onSendEmail: () => void;
};

function ArchiveRunRow({
  teamId,
  taskId,
  label,
  createdAt,
  files,
  expanded,
  disabled,
  deletingRun,
  deletingFileId,
  sendingEmail,
  emailDisabled,
  emailStatus,
  onToggle,
  onDeleteRun,
  onDeleteFile,
  onSendEmail,
}: ArchiveRunRowProps): React.ReactElement {
  const handleRowClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("a, button")) return;
    onToggle();
  };

  return (
    <div className="flex flex-col gap-1">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        className="flex h-9 cursor-pointer items-center gap-2 bg-black px-3 text-base text-white"
        onClick={handleRowClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
      >
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
          aria-hidden
        />
        <span className="min-w-0 break-words font-medium">{label}</span>
        <span className="shrink-0 text-muted-foreground">
          {files.length} file{files.length === 1 ? "" : "s"}
        </span>
        <span className="ml-auto shrink-0 text-muted-foreground">{formatRunDate(createdAt)}</span>
        <Button
          size="icon" icon={Mail}
          variant="quiet"
          aria-label={`Email ${label}`}
          disabled={disabled || emailDisabled || sendingEmail || deletingRun}
          title={emailDisabled ? "Set a recipient on the Then tab first." : undefined}
          onClick={(event) => {
            event.stopPropagation();
            onSendEmail();
          }}
        ></Button>
        <Button
          size="icon" icon={Trash2}
          variant="quiet"
          aria-label={`Delete ${label}`}
          disabled={disabled || deletingRun}
          onClick={(event) => {
            event.stopPropagation();
            onDeleteRun();
          }}
        ></Button>
      </div>

      {expanded ? (
        <ul className="flex flex-col gap-1 pl-6">
          {emailStatus ? (
            <li className="px-3 text-base text-muted-foreground">{emailStatus}</li>
          ) : null}
          {files.map((file) => (
            <li key={file.id} className="flex h-8 items-center gap-2 bg-black px-3 text-base text-white">
              <span className="min-w-0 flex-1 break-words text-muted-foreground">
                {file.fileName || file.keyword}
              </span>
              <a
                href={taskFileDownloadUrl(teamId, taskId, file.id)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-white hover:bg-primary/20"
                aria-label={`Download ${file.fileName || file.keyword}`}
                onClick={(event) => event.stopPropagation()}
              >
                <Download className="h-4 w-4" aria-hidden />
              </a>
              <Button
                size="icon" icon={Trash2}
                variant="quiet"
                aria-label={`Delete ${file.fileName || file.keyword}`}
                disabled={disabled || deletingFileId === file.id || deletingRun}
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteFile(file.id);
                }}
              ></Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function TaskBuilderArchivePanel({
  teamId,
  taskId,
  saveLocalArchive,
  executionPayload,
  executionKind,
  automationTitle,
  siteName,
  disabled = false,
}: TaskBuilderArchivePanelProps): React.ReactElement {
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [deletingRunKey, setDeletingRunKey] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<number | null>(null);
  const [sendingEmailRunKey, setSendingEmailRunKey] = useState<string | null>(null);
  const [emailStatusByRun, setEmailStatusByRun] = useState<Record<string, string>>({});

  const emailRecipient = (executionPayload?.automationEmailTo ?? "").trim();
  const emailDisabled = emailRecipient.length === 0;

  const loadFiles = useCallback(async () => {
    if (!teamId || !taskId) {
      setFiles([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const detail = await fetchTaskDetail(teamId, taskId);
      setFiles(detail.files);
    } catch {
      setError("Could not load archive files.");
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [teamId, taskId]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const runGroups = useMemo(() => groupTaskArchiveFilesByRun(files), [files]);

  const toggleRun = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleDeleteRun = useCallback(
    async (runKey: string, fileIds: number[]) => {
      if (!teamId || !taskId || disabled || fileIds.length === 0) return;
      setDeletingRunKey(runKey);
      setError(null);
      const results = await Promise.all(fileIds.map((fileId) => deleteTaskFile(teamId, taskId, fileId)));
      if (results.some((result) => !result.ok)) {
        setError("Could not delete archive run.");
      }
      setExpandedKeys((prev) => {
        const next = new Set(prev);
        next.delete(runKey);
        return next;
      });
      await loadFiles();
      setDeletingRunKey(null);
    },
    [disabled, loadFiles, taskId, teamId],
  );

  const handleDeleteFile = useCallback(
    async (fileId: number) => {
      if (!teamId || !taskId || disabled) return;
      setDeletingFileId(fileId);
      setError(null);
      const result = await deleteTaskFile(teamId, taskId, fileId);
      if (!result.ok) {
        setError("Could not delete archive file.");
      }
      await loadFiles();
      setDeletingFileId(null);
    },
    [disabled, loadFiles, taskId, teamId],
  );

  const handleSendEmail = useCallback(
    async (runKey: string, runFiles: TaskFile[]) => {
      if (!teamId || disabled || emailDisabled || !executionPayload) return;
      const markdown = runFiles.find((file) => file.fileName.toLowerCase().endsWith(".md"));
      if (!markdown) {
        setEmailStatusByRun((prev) => ({ ...prev, [runKey]: "No summary file found for this run." }));
        return;
      }

      setSendingEmailRunKey(runKey);
      setEmailStatusByRun((prev) => ({ ...prev, [runKey]: "Sending email…" }));

      const fileResult = await fetchTaskFileText(teamId, markdown.taskId, markdown.id);
      if (!fileResult.ok || !fileResult.text?.trim()) {
        setEmailStatusByRun((prev) => ({
          ...prev,
          [runKey]: fileResult.error ?? "Could not load summary file.",
        }));
        setSendingEmailRunKey(null);
        return;
      }

      const mailResult = await sendArchiveRunEmail({
        teamId,
        files: runFiles,
        summaryText: fileResult.text,
        executionPayload,
        executionKind,
        automationTitle,
        siteName,
      });

      setEmailStatusByRun((prev) => ({
        ...prev,
        [runKey]: mailResult.ok ? "Email sent." : mailResult.error ?? "Email send failed.",
      }));
      setSendingEmailRunKey(null);
    },
    [automationTitle, disabled, emailDisabled, executionKind, executionPayload, siteName, teamId],
  );

  return (
    <div className="flex flex-col gap-3 rounded-none bg-ui-field/50 p-4">
      <div className="flex items-center gap-2">
        <p className="text-base font-medium text-white">Archive</p>
        <p className="text-base text-muted-foreground">
          {saveLocalArchive
            ? "Local archive is enabled. Completed runs save files here."
            : "Enable Local archive on the Schedule tab to save each run on the server."}
        </p>
        {taskId ? (
          <Button
            type="button"
            disabled={disabled || loading || deletingRunKey != null || deletingFileId != null}
            onClick={() => void loadFiles()}
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
            Refresh
          </Button>
        ) : null}
      </div>

      {!taskId ? (
        <p className="text-base text-muted-foreground">Save this automation to view archived run files.</p>
      ) : null}

      {error ? <p className="text-base text-ui-danger-hover">{error}</p> : null}

      {taskId && !loading && files.length === 0 ? (
        <p className="text-base text-muted-foreground">No archived files yet.</p>
      ) : null}

      {runGroups.length > 0 ? (
        <div className="flex flex-col gap-1">
          {runGroups.map((group) =>
            teamId && taskId ? (
              <ArchiveRunRow
                key={group.key}
                teamId={teamId}
                taskId={taskId}
                label={group.label}
                createdAt={group.createdAt}
                files={group.files}
                expanded={expandedKeys.has(group.key)}
                disabled={disabled}
                deletingRun={deletingRunKey === group.key}
                deletingFileId={deletingFileId}
                sendingEmail={sendingEmailRunKey === group.key}
                emailDisabled={emailDisabled}
                emailStatus={emailStatusByRun[group.key] ?? null}
                onToggle={() => toggleRun(group.key)}
                onDeleteRun={() => void handleDeleteRun(group.key, group.files.map((file) => file.id))}
                onDeleteFile={(fileId) => void handleDeleteFile(fileId)}
                onSendEmail={() => void handleSendEmail(group.key, group.files)}
              />
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  );
}
