import { TaskSubtaskList } from "@/components/manager/tasks/TaskSubtaskList";
import { TaskCommentComposer } from "@/components/manager/tasks/TaskCommentComposer";
import { TaskFileUpload } from "@/components/manager/tasks/TaskFileUpload";
import type { TaskDetailActivityPanelProps } from "@/components/manager/tasks/task-detail-pane-types";

function NoteBody({ body }: { body: string }) {
  const parts = body.split(/(@\S+(?:\s+\S+)?)/g);
  return (
    <p className="whitespace-pre-wrap text-base text-muted-foreground">
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span key={i} className="text-primary">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  );
}

export function TaskDetailActivityPanel({
  task,
  isAutomationContext,
  subtasks,
  onToggleSubtask,
  onAddSubtask,
  notes,
  memberNames,
  mentionMembers,
  saving,
  onAddNote,
  teamId,
  files,
  uploading,
  onUploadFile,
}: TaskDetailActivityPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      {isAutomationContext ? (
        <TaskSubtaskList subtasks={subtasks} onToggle={onToggleSubtask} onAdd={onAddSubtask} />
      ) : null}
      <div className="flex flex-col gap-2">
        <p className="text-base font-semibold text-white">Comments</p>
        {notes.length === 0 ? (
          <p className="text-base text-muted-foreground">No comments yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((note) => (
              <li key={note.id} className="flex flex-col gap-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-medium text-white">
                    {memberNames.get(note.authorId) ?? `User ${note.authorId}`}
                  </span>
                  <span className="text-base text-muted-foreground">{note.createdAt.slice(0, 10)}</span>
                </div>
                <NoteBody body={note.body} />
              </li>
            ))}
          </ul>
        )}
        <TaskCommentComposer members={mentionMembers} disabled={saving} onSubmit={onAddNote} />
      </div>
      {teamId ? (
        <TaskFileUpload
          teamId={teamId}
          taskId={task.id}
          files={files}
          uploading={uploading}
          onUpload={onUploadFile}
        />
      ) : null}
    </div>
  );
}
